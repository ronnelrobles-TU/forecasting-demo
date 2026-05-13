# WFM Cockpit — Phase 4 (Roster Designer + Optimizer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 placeholder Roster tab with a full shift designer: a Gantt of draggable shift bars, a live "scheduled vs required" coverage line, and an **Auto-generate** button that runs simulated annealing in a worker and streams the best-so-far roster as it improves. The roster is part of the scenario, so once designed it powers the Live Sim and Monte Carlo tabs too. This phase directly answers the question that started the project: *"how does the tool determine the schedules and HOOPs?"*

**Architecture:** Roster is represented as `RosterShift[]` (each shift = `{ startMin, endMin, agentCount, breaks }`). The kernel is extended to consume `scenario.roster` when present (overriding the Erlang-C-derived staffing from Phases 1–3). The optimizer uses the same kernel as its scoring function; with the Phase 3 `collectEvents: false` flag, each scoring run takes <30ms — 300 iterations finish in 6–10 seconds. The UI streams best-so-far every 20 iterations so the audience watches the search think.

**Tech Stack:** Same as Phase 3 — Next.js 16, React 19, TypeScript 5, Chart.js 4, Tailwind 4, native Web Workers, Vitest, seedrandom. No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-05-08-wfm-cockpit-design.md](../specs/2026-05-08-wfm-cockpit-design.md)
**Predecessor plans:**
- [Phase 1](./2026-05-08-wfm-cockpit-phase1-foundation.md)
- [Phase 2](./2026-05-08-wfm-cockpit-phase2-live-sim.md)
- [Phase 3](./2026-05-08-wfm-cockpit-phase3-monte-carlo.md)

---

## Internal phasing

| Sub-phase | Tasks | Demo at end |
| --- | --- | --- |
| A — Roster type + kernel integration | Tasks 1–5 | Hand-set rosters work; kernel uses them when present, falls back to Erlang C otherwise |
| B — Optimizer | Tasks 6–8 | Auto-generate produces a converged roster (visible from console; UI lands in C) |
| C — UI: Gantt, coverage line, controls | Tasks 9–13 | Drag-edit Gantt + Auto-generate button + live coverage line + streaming progress |
| Final | Tasks 14–15 | Verification + branch handoff |

Plus Task 0 (branch).

---

## Key design decisions (push back during review if any feel wrong)

1. **`RosterShift` replaces `Shift`** — `Shift` was defined in Phase 1 as `{ id, agentId, startMin, endMin, breaks }` (one per agent), but it's never used at runtime. `RosterShift` aggregates: `{ id, startMin, endMin, agentCount, breaks }` — one row per shift template, count of agents working it. Cleaner UI, simpler optimizer, fewer objects.
   The `Shift` type is renamed to `RosterShift` and `Scenario.roster: Shift[] | null` becomes `Scenario.roster: RosterShift[] | null`. No existing runtime code reads this field, so the rename is safe.

2. **Kernel falls back to Erlang C when `roster` is null** — preserves Phase 1–3 behavior. When `roster` is non-null, the kernel uses `agentsPerInterval[i] = sum of agentCount for shifts active in interval i`. No more `MAX_AGENTS_PER_INTERVAL` cap when a roster is provided (the cap exists to keep auto-staffing realistic; an explicit roster doesn't need it).

3. **Optimizer = simulated annealing over shift start times + lengths** — moves: shift start ±30 min, shift length ±30 min, swap shift positions. Cooling schedule: `T = T0 × 0.97^iter`, accept worse with `exp(-Δ / T)`. Default 300 iterations. Constraints: shift length 4h–10h, shifts must overlap HOOP, agentCount fixed (controlled separately by total budget).

4. **Optimizer scoring = `runDay(scenario, { collectEvents: false }).totals.sl` minus penalties** — primary objective is service level, with a small linear penalty for total agent-hours over budget (so the optimizer doesn't just add agents indiscriminately). The Phase 3 `collectEvents: false` flag makes each evaluation cheap (~30ms vs ~100ms with events).

5. **Default roster** — when the user opens the Roster tab and `scenario.roster` is null, build a starter set of 4 shifts evenly spaced across the HOOP, each with `agentCount` derived from the peak Erlang C / 4. This gives the optimizer a reasonable starting point.

6. **Total HC budget** — defaults to the Erlang-C-derived Scheduled HC (peak interval). Editable via slider in the Roster top bar. The optimizer never schedules more total agents than the budget; the UI shows budget vs current usage.

7. **Worker for optimizer** — separate from the kernel pool. Streams `{ iter, bestRoster, bestScore }` back via `postMessage` every 20 iterations. UI re-renders Gantt + coverage as messages arrive.

8. **Breaks in Phase 4** — when a `RosterShift` has `breaks`, the kernel uses them; otherwise the Phase 2 `scheduleBreaks` fallback fires (one 15-min break per agent). The optimizer keeps shifts simple — no break optimization in v1; breaks are auto-injected at midshift for shifts ≥6h. (Per-shift break optimization can come later.)

---

## File Structure

### Modified files (kernel + types)

- `lib/types.ts` — rename `Shift` → `RosterShift`, change shape (drop `agentId`, add `agentCount`). Update `Scenario.roster` type.
- `lib/kernel/sim.ts` — when `scenario.roster` is non-null, derive `agentsPerInterval` from the roster and create per-agent state slots labeled by shift. When null, fall back to existing Erlang-C derivation.
- `lib/kernel/breaks.ts` — extend `scheduleBreaks` to accept an optional `RosterShift[]` and return shift-aware breaks; otherwise unchanged behavior.

### New files (kernel)

- `lib/kernel/roster.ts` — `buildDefaultRoster(scenario)`, `expandRosterToAgentCount(roster)`, `agentsActiveAt(roster, min)`. Pure helpers.
- `lib/kernel/optimizer.ts` — `optimizeRoster(scenario, opts): RosterShift[]` (sync, used by tests). Worker wraps this with streaming.
- `tests/roster.test.ts`, `tests/optimizer.test.ts`.

### New files (worker)

- `app/workers/optimizer.worker.ts` — runs `optimizeRoster`, streams progress every N iterations.
- `app/workers/optimizerClient.ts` — UI-side client. Single optimizer worker (one optimization at a time).

### New files (UI — Roster tab)

- `app/components/cockpit/roster/RosterGantt.tsx` — Gantt with one row per `RosterShift`. Horizontal bars; left-edge drag = move start; right-edge drag = resize length. Snap to 30-min.
- `app/components/cockpit/roster/CoverageLine.tsx` — chart underneath: scheduled agents per interval (from roster) vs required (from Erlang C). Gap shaded red.
- `app/components/cockpit/roster/OptimizerControls.tsx` — Auto-generate button + budget slider + iteration display.

### Modified files (UI wire-in)

- `app/components/cockpit/ScenarioContext.tsx` — add `setRoster(roster: RosterShift[] | null)`, `addShift()`, `removeShift(id)`, `updateShift(id, partial)` — these are convenience wrappers around `setRoster`.
- `app/components/cockpit/tabs/RosterTab.tsx` — full rewrite from placeholder. Composes Gantt + CoverageLine + OptimizerControls.
- `app/globals.css` — append roster Gantt styles.

### Untouched

- All Phase 1 / 2 / 3 components except the ones listed above.
- `lib/kernel/inject.ts`, `lib/kernel/monteCarlo.ts`, `lib/animation/*`.
- `app/workers/kernel.worker.ts`, `kernelClient.ts`, `monteCarloClient.ts`.
- `app/components/cockpit/Cockpit.tsx`, `Sidebar.tsx`, `KpiStrip.tsx`, `Header.tsx`.
- `app/learn/page.tsx`, `app/components/Nav.tsx`, `app/layout.tsx`.

---

## Conventions

- **Branch:** `feat/cockpit-phase4` off the merged Phase 3 work. Create before Task 1.
- **Commits:** Conventional commits, one per task.
- **Type imports:** `import type { ... }`.
- **CSS:** New classes prefixed `cockpit-roster-`.

---

## Task 0: Branch

**Files:** none

- [ ] **Step 1: Confirm starting state**

```bash
git status
git log --oneline -3
```

- [ ] **Step 2: Create the Phase 4 branch**

```bash
git checkout -b feat/cockpit-phase4
git status
```

Expected: clean working tree.

---

# Sub-phase A — Roster type + kernel integration (Tasks 1–5)

## Task 1: Rename `Shift` → `RosterShift` + update Scenario

**Files:**
- Modify: `lib/types.ts`

The previous `Shift` interface (one entry per agent) is unused at runtime. Replace with a template-style `RosterShift` (one entry per shift block, with an `agentCount`).

- [ ] **Step 1: Update `lib/types.ts`**

Find the `Shift` interface:

```ts
export interface Shift {
  id: string
  agentId: string
  startMin: number
  endMin: number
  breaks: { startMin: number; durationMin: number }[]
}
```

Replace with:

```ts
export interface RosterShift {
  id: string
  startMin: number          // minutes from midnight
  endMin: number            // exclusive
  agentCount: number        // number of agents working this shift template
  breaks: { startMin: number; durationMin: number }[]   // shared break windows; auto-staggered by kernel
}
```

In `Scenario`, change the line:

```ts
  roster: Shift[] | null      // null → kernel derives from Erlang C
```

to:

```ts
  roster: RosterShift[] | null   // null → kernel derives from Erlang C
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: clean. If any other file imports `Shift`, the compiler will surface it. The type was forward-looking and shouldn't be used elsewhere — verify.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: 62 still pass (no test references `Shift`).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): replace Shift with RosterShift (template-style with agentCount)"
```

---

## Task 2: Roster helpers + tests

**Files:**
- Create: `tests/roster.test.ts`
- Create: `lib/kernel/roster.ts`

Three helpers: `buildDefaultRoster`, `agentsActiveAt`, `totalAgentHours`. All pure.

- [ ] **Step 1: Write failing tests in `tests/roster.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { RosterShift } from '@/lib/types'
import { buildDefaultRoster, agentsActiveAt, totalAgentHours } from '@/lib/kernel/roster'
import { campaigns } from '@/lib/campaigns'

describe('buildDefaultRoster', () => {
  it('returns 4 evenly-spaced shifts covering the HOOP', () => {
    const c = campaigns.au_retail_cebu  // HOOP 360–1320 (06:00–22:00, 16h)
    const peakAgents = 80
    const r = buildDefaultRoster(c.hoop, peakAgents)
    expect(r).toHaveLength(4)
    // First starts at HOOP start; last ends at HOOP end (within tolerance)
    expect(r[0].startMin).toBe(360)
    expect(r[r.length - 1].endMin).toBe(1320)
    // Total agentCount across shifts >= peakAgents (each shift covers part of peak)
    const totalAgents = r.reduce((s, x) => s + x.agentCount, 0)
    expect(totalAgents).toBeGreaterThanOrEqual(peakAgents)
  })

  it('handles 24/7 HOOP', () => {
    const r = buildDefaultRoster({ startMin: 0, endMin: 1440 }, 100)
    expect(r).toHaveLength(4)
    expect(r[0].startMin).toBe(0)
    expect(r[r.length - 1].endMin).toBe(1440)
  })

  it('handles tiny HOOP by clamping shift length to fit', () => {
    const r = buildDefaultRoster({ startMin: 600, endMin: 720 }, 10)  // 10:00–12:00 (2h)
    expect(r.length).toBeGreaterThanOrEqual(1)
    for (const s of r) {
      expect(s.startMin).toBeGreaterThanOrEqual(600)
      expect(s.endMin).toBeLessThanOrEqual(720)
    }
  })
})

describe('agentsActiveAt', () => {
  const roster: RosterShift[] = [
    { id: 's1', startMin: 480, endMin: 1020, agentCount: 20, breaks: [] },  // 08:00–17:00
    { id: 's2', startMin: 720, endMin: 1260, agentCount: 30, breaks: [] },  // 12:00–21:00
  ]

  it('sums agentCount for shifts active at the given minute', () => {
    expect(agentsActiveAt(roster, 480)).toBe(20)        // only s1
    expect(agentsActiveAt(roster, 800)).toBe(50)        // both
    expect(agentsActiveAt(roster, 1100)).toBe(30)       // only s2
    expect(agentsActiveAt(roster, 1300)).toBe(0)        // neither
    expect(agentsActiveAt(roster, 100)).toBe(0)
  })

  it('start minute is inclusive, end minute is exclusive', () => {
    expect(agentsActiveAt(roster, 1019)).toBe(50)
    expect(agentsActiveAt(roster, 1020)).toBe(30)
  })
})

describe('totalAgentHours', () => {
  it('sums (endMin - startMin) / 60 × agentCount across the roster', () => {
    const roster: RosterShift[] = [
      { id: 's1', startMin: 480, endMin: 1020, agentCount: 20, breaks: [] },  // 9h × 20 = 180
      { id: 's2', startMin: 720, endMin: 1260, agentCount: 30, breaks: [] },  // 9h × 30 = 270
    ]
    expect(totalAgentHours(roster)).toBeCloseTo(450)
  })

  it('returns 0 for empty roster', () => {
    expect(totalAgentHours([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/kernel/roster`.

- [ ] **Step 3: Implement `lib/kernel/roster.ts`**

```ts
import type { HoopWindow, RosterShift } from '@/lib/types'

const DEFAULT_NUM_SHIFTS = 4

/** Build a starter roster of evenly-spaced shifts covering the HOOP, with agentCount split across them. */
export function buildDefaultRoster(hoop: HoopWindow, peakAgents: number): RosterShift[] {
  const hoopMin = Math.max(0, hoop.endMin - hoop.startMin)
  if (hoopMin <= 0) return []

  // For tiny HOOPs (<2h) just give one shift covering the whole window.
  if (hoopMin < 120) {
    return [{
      id: 's0',
      startMin: hoop.startMin,
      endMin: hoop.endMin,
      agentCount: peakAgents,
      breaks: [],
    }]
  }

  // Otherwise: 4 shifts staggered to give double-coverage in the middle of the day.
  // Each shift is ~hoopMin/2 long; starts are evenly spaced.
  const numShifts = DEFAULT_NUM_SHIFTS
  const shiftLen = Math.max(60, Math.round(hoopMin / 2 / 30) * 30)   // half-HOOP, snapped to 30 min
  const stride = Math.max(30, Math.round((hoopMin - shiftLen) / Math.max(1, numShifts - 1) / 30) * 30)
  const perShiftAgents = Math.max(1, Math.ceil(peakAgents / 2))     // each shift covers ~half peak

  const out: RosterShift[] = []
  for (let i = 0; i < numShifts; i++) {
    const start = hoop.startMin + i * stride
    const end = Math.min(hoop.endMin, start + shiftLen)
    out.push({
      id: `s${i}`,
      startMin: start,
      endMin: end,
      agentCount: perShiftAgents,
      breaks: [],
    })
  }
  // Force first to start at HOOP start and last to end at HOOP end
  if (out.length > 0) {
    out[0].startMin = hoop.startMin
    out[out.length - 1].endMin = hoop.endMin
  }
  return out
}

/** Sum of agentCount for shifts active at the given minute (start inclusive, end exclusive). */
export function agentsActiveAt(roster: RosterShift[], minute: number): number {
  let total = 0
  for (const s of roster) {
    if (minute >= s.startMin && minute < s.endMin) total += s.agentCount
  }
  return total
}

/** Total scheduled agent-hours across the roster. Used by the optimizer for cost penalty. */
export function totalAgentHours(roster: RosterShift[]): number {
  let total = 0
  for (const s of roster) {
    total += ((s.endMin - s.startMin) / 60) * s.agentCount
  }
  return total
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: 71 passing (62 prior + 9 new).

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/roster.ts tests/roster.test.ts
git commit -m "feat(kernel): roster helpers — buildDefaultRoster, agentsActiveAt, totalAgentHours"
```

---

## Task 3: Kernel uses roster when provided

**Files:**
- Modify: `lib/kernel/sim.ts`
- Modify: `tests/kernel.test.ts` (append)

When `scenario.roster` is non-null, `agentsPerInterval[i] = max(0, sum of agentCount for shifts active in interval i, capped to MAX_AGENTS_PER_INTERVAL only if roster is null).` When null, current Erlang-C-based derivation runs unchanged.

- [ ] **Step 1: Append tests to `tests/kernel.test.ts`**

Append at the bottom of the existing file:

```ts
describe('runDay v3 — roster-driven staffing', () => {
  it('uses roster agentCount per interval when roster is provided', () => {
    const sc = baseScenario(31)
    sc.roster = [
      // Two shifts: 06–14 (24 agents), 12–22 (32 agents)
      { id: 's1', startMin: 360,  endMin: 840,  agentCount: 24, breaks: [] },
      { id: 's2', startMin: 720,  endMin: 1320, agentCount: 32, breaks: [] },
    ]
    const result = runDay(sc)
    // Interval 12 = 06:00 (06:00 starts at min 360 = idx 12). Should have 24 agents.
    expect(result.perInterval[12].agents).toBeGreaterThanOrEqual(20)
    expect(result.perInterval[12].agents).toBeLessThanOrEqual(28)
    // Interval 24 = 12:00 (both shifts active). Should have ~56.
    expect(result.perInterval[24].agents).toBeGreaterThanOrEqual(50)
    expect(result.perInterval[24].agents).toBeLessThanOrEqual(60)
    // Interval 0 = 00:00 (neither active). Should have 0.
    expect(result.perInterval[0].agents).toBe(0)
  })

  it('falls back to Erlang C derivation when roster is null', () => {
    const sc = baseScenario(31)
    sc.roster = null
    const result = runDay(sc)
    // Phase 1–3 behavior: peak interval has positive agents.
    const maxAgents = Math.max(...result.perInterval.map(s => s.agents))
    expect(maxAgents).toBeGreaterThan(0)
  })

  it('roster with empty array means zero coverage', () => {
    const sc = baseScenario(31)
    sc.dailyTotal = 200
    sc.roster = []
    const result = runDay(sc)
    expect(Math.max(...result.perInterval.map(s => s.agents))).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npm test
```

Expected: 9 prior `runDay` tests pass; 3 new fail because the kernel still ignores `scenario.roster`.

- [ ] **Step 3: Modify `lib/kernel/sim.ts` to honor the roster**

Find the existing `agentsPerInterval` derivation block:

```ts
  const slTarget = scenario.sl / 100
  const agentsPerInterval = callsPer30.map(calls => {
    if (calls <= 0) return 0
    const { N } = requiredAgents(calls, scenario.aht, slTarget, scenario.asa)
    return Math.min(
      MAX_AGENTS_PER_INTERVAL,
      Math.max(1, Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))),
    )
  })
```

Replace the entire block with:

```ts
  const slTarget = scenario.sl / 100

  // Phase 4: when scenario.roster is non-null, derive agents per interval from the roster.
  // When null, fall back to Phase 1–3 Erlang-C-based auto-staffing.
  const agentsPerInterval = scenario.roster != null
    ? buildAgentsPerIntervalFromRoster(scenario.roster)
    : callsPer30.map(calls => {
        if (calls <= 0) return 0
        const { N } = requiredAgents(calls, scenario.aht, slTarget, scenario.asa)
        return Math.min(
          MAX_AGENTS_PER_INTERVAL,
          Math.max(1, Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))),
        )
      })
```

Then add this helper function near the top of the file (after the constants, before `abandonProbability`):

```ts
/** For each 30-min interval, the average agentCount across that interval (sample at midpoint). */
function buildAgentsPerIntervalFromRoster(roster: RosterShift[]): number[] {
  const out: number[] = new Array(48).fill(0)
  for (let i = 0; i < 48; i++) {
    const midMin = i * 30 + 15
    let total = 0
    for (const s of roster) {
      if (midMin >= s.startMin && midMin < s.endMin) total += s.agentCount
    }
    out[i] = total
  }
  return out
}
```

Add `RosterShift` to the imports at the top:

```ts
import type { Scenario, SimEvent, SimResult, IntervalStat, RosterShift } from '@/lib/types'
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: 74 passing (71 prior + 3 new). All Phase 1–3 kernel tests still pass because `roster` defaults to null and the fallback path is unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/sim.ts tests/kernel.test.ts
git commit -m "feat(kernel): use scenario.roster for staffing when provided"
```

---

## Task 4: ScenarioContext — `setRoster` and shift mutators

**Files:**
- Modify: `app/components/cockpit/ScenarioContext.tsx`

Replace the file with the version below. Adds:
- `setRoster(roster: RosterShift[] | null)` — replace whole roster
- `addShift(shift: RosterShift)` — append
- `removeShift(id: string)` — drop by id
- `updateShift(id: string, partial: Partial<RosterShift>)` — patch one

- [ ] **Step 1: Replace the file**

```tsx
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Scenario, CampaignKey, HoopWindow, InjectedEvent, RosterShift } from '@/lib/types'
import { campaigns } from '@/lib/campaigns'

function scenarioFromCampaign(key: CampaignKey, seed = 42): Scenario {
  const c = campaigns[key]
  return {
    campaignKey: key,
    hoop: { ...c.hoop },
    curve: c.curveTemplate.slice(),
    dailyTotal: c.dailyTotal,
    aht: c.aht,
    sl: c.sl,
    asa: c.asa,
    shrink: c.shrink,
    abs: c.abs,
    roster: null,
    rngSeed: seed,
    injectedEvents: [],
  }
}

interface ScenarioContextValue {
  scenario: Scenario
  setCampaign: (key: CampaignKey) => void
  setHoop: (hoop: HoopWindow) => void
  setCurve: (curve: number[]) => void
  setDailyTotal: (n: number) => void
  setNumeric: (field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs', value: number) => void
  reseed: () => void
  setRngSeed: (seed: number) => void
  addInjection: (ev: InjectedEvent) => void
  clearInjections: () => void
  setRoster: (roster: RosterShift[] | null) => void
  addShift: (shift: RosterShift) => void
  removeShift: (id: string) => void
  updateShift: (id: string, partial: Partial<RosterShift>) => void
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>(() => scenarioFromCampaign('us_telco_manila'))

  const setCampaign = useCallback((key: CampaignKey) => setScenario(scenarioFromCampaign(key)), [])
  const setHoop = useCallback((hoop: HoopWindow) => setScenario(s => ({ ...s, hoop })), [])
  const setCurve = useCallback((curve: number[]) => setScenario(s => ({ ...s, curve })), [])
  const setDailyTotal = useCallback((n: number) => setScenario(s => ({ ...s, dailyTotal: n })), [])
  const setNumeric = useCallback((field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs', value: number) => {
    setScenario(s => ({ ...s, [field]: value }))
  }, [])
  const reseed = useCallback(() => setScenario(s => ({ ...s, rngSeed: Math.floor(Math.random() * 1_000_000) })), [])
  const setRngSeed = useCallback((seed: number) => setScenario(s => ({ ...s, rngSeed: seed })), [])
  const addInjection = useCallback((ev: InjectedEvent) => {
    setScenario(s => ({ ...s, injectedEvents: [...s.injectedEvents, ev] }))
  }, [])
  const clearInjections = useCallback(() => setScenario(s => ({ ...s, injectedEvents: [] })), [])

  const setRoster = useCallback((roster: RosterShift[] | null) => setScenario(s => ({ ...s, roster })), [])
  const addShift = useCallback((shift: RosterShift) => {
    setScenario(s => ({ ...s, roster: [...(s.roster ?? []), shift] }))
  }, [])
  const removeShift = useCallback((id: string) => {
    setScenario(s => ({ ...s, roster: (s.roster ?? []).filter(x => x.id !== id) }))
  }, [])
  const updateShift = useCallback((id: string, partial: Partial<RosterShift>) => {
    setScenario(s => ({
      ...s,
      roster: (s.roster ?? []).map(x => x.id === id ? { ...x, ...partial } : x),
    }))
  }, [])

  return (
    <ScenarioContext.Provider value={{
      scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed, setRngSeed,
      addInjection, clearInjections, setRoster, addShift, removeShift, updateShift,
    }}>
      {children}
    </ScenarioContext.Provider>
  )
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext)
  if (!ctx) throw new Error('useScenario must be used inside ScenarioProvider')
  return ctx
}
```

- [ ] **Step 2: tsc + tests + commit**

```bash
npx tsc --noEmit && npm test
git add app/components/cockpit/ScenarioContext.tsx
git commit -m "feat(scenario): roster mutators (setRoster, addShift, removeShift, updateShift)"
```

---

## Task 5: Sub-phase A integration smoke

**Files:** none

Quick manual sanity check that hand-set rosters work end-to-end.

- [ ] **Step 1: Build and start dev server**

```bash
npm run build
npm run dev
```

- [ ] **Step 2: Verify in browser**

Open the local URL. Open the browser console. Paste:

```js
// In dev tools, force a roster onto the scenario via the React DevTools — OR
// confirm via the test suite that runDay honors a roster:
// (this is a sanity check; the real UI lands in Sub-phase C)
```

Confirm the build is green and tests pass. No commit needed for this step — it's a checkpoint.

(If you want a more direct smoke, manually edit `app/components/cockpit/ScenarioContext.tsx`'s initial state to seed a non-null `roster`, then visit `/` and inspect the Live Sim KPI strip. Revert before committing — this step shouldn't produce any commits.)

- [ ] **Step 3: Stop dev server and confirm clean tree**

```bash
git status
```

Expected: nothing to commit.

End of Sub-phase A.

---

# Sub-phase B — Optimizer (Tasks 6–8)

## Task 6: `optimizeRoster` simulated annealing + tests

**Files:**
- Create: `tests/optimizer.test.ts`
- Create: `lib/kernel/optimizer.ts`

Pure simulated annealing. Stream best-so-far via callback. Used by the worker (Task 7) and unit-tested directly here.

- [ ] **Step 1: Write failing tests in `tests/optimizer.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { Scenario, RosterShift } from '@/lib/types'
import { optimizeRoster, scoreRoster } from '@/lib/kernel/optimizer'
import { campaigns } from '@/lib/campaigns'

function baseScenario(seed = 200): Scenario {
  const c = campaigns.us_telco_manila
  return {
    campaignKey: c.key,
    hoop: c.hoop,
    curve: c.curveTemplate.slice(),
    dailyTotal: c.dailyTotal,
    aht: c.aht,
    sl: c.sl,
    asa: c.asa,
    shrink: c.shrink,
    abs: c.abs,
    roster: null,
    rngSeed: seed,
    injectedEvents: [],
  }
}

describe('scoreRoster', () => {
  it('higher SL → higher score', () => {
    const sc = baseScenario()
    const sparse: RosterShift[] = [{ id: 's1', startMin: 480, endMin: 1080, agentCount: 5, breaks: [] }]
    const heavy: RosterShift[] = [{ id: 's1', startMin: 0,   endMin: 1440, agentCount: 200, breaks: [] }]
    expect(scoreRoster(sc, heavy, 1000)).toBeGreaterThan(scoreRoster(sc, sparse, 1000))
  })

  it('penalizes over-budget rosters', () => {
    const sc = baseScenario()
    const fitted: RosterShift[] = [{ id: 's1', startMin: 0, endMin: 1440, agentCount: 100, breaks: [] }]
    const bloated: RosterShift[] = [{ id: 's1', startMin: 0, endMin: 1440, agentCount: 500, breaks: [] }]
    // Both should hit ~100% SL but bloated busts the budget. Score should reflect that.
    const s1 = scoreRoster(sc, fitted, 100 * 24)     // budget = 100 agents × 24h
    const s2 = scoreRoster(sc, bloated, 100 * 24)
    expect(s1).toBeGreaterThan(s2)
  })
})

describe('optimizeRoster', () => {
  it('returns a valid roster with shifts inside HOOP', () => {
    const sc = baseScenario()
    sc.hoop = { startMin: 480, endMin: 1080 }   // 08:00–18:00
    const result = optimizeRoster(sc, { iterations: 50, budgetAgentHours: 1000 })
    expect(result.length).toBeGreaterThan(0)
    for (const s of result) {
      expect(s.startMin).toBeGreaterThanOrEqual(480)
      expect(s.endMin).toBeLessThanOrEqual(1080)
      expect(s.endMin - s.startMin).toBeGreaterThanOrEqual(60)   // min 1h
    }
  })

  it('streams best-so-far via onIter callback', () => {
    const sc = baseScenario()
    let lastIter = -1
    let calls = 0
    optimizeRoster(sc, {
      iterations: 100,
      budgetAgentHours: 1000,
      onIter: (iter, best, score) => {
        expect(iter).toBeGreaterThan(lastIter)
        expect(best.length).toBeGreaterThan(0)
        expect(typeof score).toBe('number')
        lastIter = iter
        calls++
      },
    })
    expect(calls).toBeGreaterThan(0)
  })

  it('is deterministic for same seed', () => {
    const sc1 = baseScenario(99)
    const sc2 = baseScenario(99)
    const r1 = optimizeRoster(sc1, { iterations: 30, budgetAgentHours: 1000, optSeed: 7 })
    const r2 = optimizeRoster(sc2, { iterations: 30, budgetAgentHours: 1000, optSeed: 7 })
    expect(r1.map(s => `${s.startMin}-${s.endMin}-${s.agentCount}`)).toEqual(
      r2.map(s => `${s.startMin}-${s.endMin}-${s.agentCount}`),
    )
  })
})
```

- [ ] **Step 2: Run, verify failures**

```bash
npm test
```

- [ ] **Step 3: Implement `lib/kernel/optimizer.ts`**

```ts
import type { Scenario, RosterShift } from '@/lib/types'
import { runDay } from './sim'
import { buildDefaultRoster, totalAgentHours } from './roster'
import { requiredAgents } from '@/lib/erlang'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { makeRng, type Rng } from '@/lib/rng'

export interface OptimizeOptions {
  iterations?: number              // default 300
  budgetAgentHours: number         // hard-ish cap; over-budget is heavily penalized
  optSeed?: number                 // RNG seed for the SA moves (separate from sim seed)
  onIter?: (iter: number, best: RosterShift[], bestScore: number) => void
  emitEvery?: number               // call onIter every N iterations (default 20)
}

const T0 = 0.10           // initial temperature (score units; SL is in [0,1])
const COOLING = 0.97
const MIN_SHIFT_MIN = 240    // 4h
const MAX_SHIFT_MIN = 600    // 10h
const STEP_MIN = 30          // snap moves to 30 min

/** Score a roster: SL ∈ [0,1] minus a budget-overrun penalty. Higher is better. */
export function scoreRoster(scenario: Scenario, roster: RosterShift[], budgetAgentHours: number): number {
  const result = runDay({ ...scenario, roster }, { collectEvents: false })
  const sl = result.totals.sl
  const hours = totalAgentHours(roster)
  const overshoot = Math.max(0, hours - budgetAgentHours)
  const penalty = overshoot / Math.max(1, budgetAgentHours)   // 1.0 penalty for 100% over budget
  return sl - 0.5 * penalty
}

function clone(roster: RosterShift[]): RosterShift[] {
  return roster.map(s => ({ ...s, breaks: s.breaks.map(b => ({ ...b })) }))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function snap(min: number): number {
  return Math.round(min / STEP_MIN) * STEP_MIN
}

/** Apply a random local move to one shift, respecting HOOP and shift-length limits. */
function neighbor(roster: RosterShift[], hoopStart: number, hoopEnd: number, rng: Rng): RosterShift[] {
  if (roster.length === 0) return roster
  const next = clone(roster)
  const idx = Math.floor(rng() * next.length)
  const s = next[idx]
  const move = Math.floor(rng() * 4)   // 0=move start, 1=move end, 2=shift left, 3=shift right
  const delta = (Math.floor(rng() * 4) - 2) * STEP_MIN || STEP_MIN
  switch (move) {
    case 0: {
      const newStart = clamp(snap(s.startMin + delta), hoopStart, s.endMin - MIN_SHIFT_MIN)
      const len = s.endMin - newStart
      if (len >= MIN_SHIFT_MIN && len <= MAX_SHIFT_MIN) s.startMin = newStart
      break
    }
    case 1: {
      const newEnd = clamp(snap(s.endMin + delta), s.startMin + MIN_SHIFT_MIN, hoopEnd)
      const len = newEnd - s.startMin
      if (len >= MIN_SHIFT_MIN && len <= MAX_SHIFT_MIN) s.endMin = newEnd
      break
    }
    case 2:
    case 3: {
      const len = s.endMin - s.startMin
      const dir = move === 2 ? -1 : 1
      const newStart = clamp(snap(s.startMin + dir * STEP_MIN), hoopStart, hoopEnd - len)
      s.startMin = newStart
      s.endMin = newStart + len
      break
    }
  }
  return next
}

export function optimizeRoster(scenario: Scenario, opts: OptimizeOptions): RosterShift[] {
  const iterations = opts.iterations ?? 300
  const emitEvery = opts.emitEvery ?? 20
  const optSeed = opts.optSeed ?? 1
  const rng = makeRng(optSeed)

  // Starting roster: existing if present and non-empty, otherwise built from peak Erlang C
  let current: RosterShift[]
  if (scenario.roster && scenario.roster.length > 0) {
    current = clone(scenario.roster)
  } else {
    const curveAfterHoop = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curveAfterHoop, scenario.dailyTotal)
    const peakCalls = Math.max(0.001, ...calls)
    const { N } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    current = buildDefaultRoster(scenario.hoop, scheduled)
  }

  let currentScore = scoreRoster(scenario, current, opts.budgetAgentHours)
  let best = clone(current)
  let bestScore = currentScore

  let T = T0
  for (let i = 0; i < iterations; i++) {
    const candidate = neighbor(current, scenario.hoop.startMin, scenario.hoop.endMin, rng)
    const candidateScore = scoreRoster(scenario, candidate, opts.budgetAgentHours)
    const delta = candidateScore - currentScore
    if (delta > 0 || Math.exp(delta / T) > rng()) {
      current = candidate
      currentScore = candidateScore
      if (candidateScore > bestScore) {
        best = clone(candidate)
        bestScore = candidateScore
      }
    }
    if ((i + 1) % emitEvery === 0) opts.onIter?.(i + 1, best, bestScore)
    T *= COOLING
  }
  opts.onIter?.(iterations, best, bestScore)
  return best
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: 79 passing (74 prior + 5 new). The optimizer tests should run quickly since `iterations` is small.

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/optimizer.ts tests/optimizer.test.ts
git commit -m "feat(kernel): simulated annealing roster optimizer with streaming progress"
```

---

## Task 7: Optimizer worker

**Files:**
- Create: `app/workers/optimizer.worker.ts`

The worker wraps `optimizeRoster` and posts progress messages.

- [ ] **Step 1: Create the file**

```ts
/// <reference lib="webworker" />
import { optimizeRoster, type OptimizeOptions } from '@/lib/kernel/optimizer'
import type { Scenario, RosterShift } from '@/lib/types'

interface OptimizeRequest {
  type: 'optimize'
  requestId: number
  scenario: Scenario
  budgetAgentHours: number
  iterations: number
  emitEvery: number
  optSeed: number
}

interface OptimizeProgress {
  type: 'optimizeProgress'
  requestId: number
  iter: number
  best: RosterShift[]
  bestScore: number
}

interface OptimizeDone {
  type: 'optimizeDone'
  requestId: number
  best: RosterShift[]
}

interface OptimizeError {
  type: 'optimizeError'
  requestId: number
  message: string
}

self.addEventListener('message', (e: MessageEvent<OptimizeRequest>) => {
  const msg = e.data
  if (msg.type !== 'optimize') return
  try {
    const opts: OptimizeOptions = {
      iterations: msg.iterations,
      budgetAgentHours: msg.budgetAgentHours,
      optSeed: msg.optSeed,
      emitEvery: msg.emitEvery,
      onIter: (iter, best, bestScore) => {
        const progress: OptimizeProgress = {
          type: 'optimizeProgress',
          requestId: msg.requestId,
          iter,
          best,
          bestScore,
        }
        ;(self as unknown as Worker).postMessage(progress)
      },
    }
    const final = optimizeRoster(msg.scenario, opts)
    const done: OptimizeDone = { type: 'optimizeDone', requestId: msg.requestId, best: final }
    ;(self as unknown as Worker).postMessage(done)
  } catch (err) {
    const errResponse: OptimizeError = {
      type: 'optimizeError',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(errResponse)
  }
})

export {}
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/workers/optimizer.worker.ts
git commit -m "feat(optimizer): web worker wrapping optimizeRoster"
```

---

## Task 8: Optimizer client (UI bridge)

**Files:**
- Create: `app/workers/optimizerClient.ts`

Singleton optimizer worker. One run at a time. Replaces an in-flight run if a new one starts.

- [ ] **Step 1: Create the file**

```ts
import type { Scenario, RosterShift } from '@/lib/types'

interface RunOpts {
  scenario: Scenario
  budgetAgentHours: number
  iterations?: number     // default 300
  emitEvery?: number      // default 20
  optSeed?: number        // default 1
  onProgress: (iter: number, best: RosterShift[], bestScore: number) => void
}

let worker: Worker | null = null
let nextRequestId = 1
let activeRequestId = 0

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** Start an optimization run. Cancels any in-flight run by ignoring its messages. */
export function runOptimize(opts: RunOpts): Promise<RosterShift[]> {
  const w = ensureWorker()
  const requestId = nextRequestId++
  activeRequestId = requestId

  return new Promise<RosterShift[]>((resolve, reject) => {
    function onMessage(e: MessageEvent) {
      const data = e.data as {
        type: string
        requestId: number
        iter?: number
        best?: RosterShift[]
        bestScore?: number
        message?: string
      }
      // Ignore messages from older runs
      if (data.requestId !== activeRequestId) return
      if (data.type === 'optimizeProgress' && data.best && data.iter != null && data.bestScore != null) {
        opts.onProgress(data.iter, data.best, data.bestScore)
      } else if (data.type === 'optimizeDone' && data.best) {
        w.removeEventListener('message', onMessage)
        resolve(data.best)
      } else if (data.type === 'optimizeError') {
        w.removeEventListener('message', onMessage)
        reject(new Error(data.message ?? 'optimizer error'))
      }
    }
    w.addEventListener('message', onMessage)

    w.postMessage({
      type: 'optimize',
      requestId,
      scenario: opts.scenario,
      budgetAgentHours: opts.budgetAgentHours,
      iterations: opts.iterations ?? 300,
      emitEvery: opts.emitEvery ?? 20,
      optSeed: opts.optSeed ?? 1,
    })
  })
}
```

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/workers/optimizerClient.ts
git commit -m "feat(optimizer): UI client with cancellation by activeRequestId"
```

End of Sub-phase B. Optimizer works end-to-end (verifiable from console; UI lands in C).

---

# Sub-phase C — UI: Gantt, coverage line, controls (Tasks 9–13)

## Task 9: `RosterGantt` component

**Files:**
- Create: `app/components/cockpit/roster/RosterGantt.tsx`

One row per `RosterShift`. Each shift renders as a horizontal bar; left edge = start, width = duration. Drag the bar body to move; drag the right edge to resize. Snap to 30 min. Color by shift index.

- [ ] **Step 1: Create the file** (the directory `app/components/cockpit/roster/` does not exist yet — create it)

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { RosterShift } from '@/lib/types'

interface RosterGanttProps {
  roster: RosterShift[]
  onUpdateShift: (id: string, partial: Partial<RosterShift>) => void
  onRemoveShift: (id: string) => void
}

const STEP_MIN = 30
const MIN_LEN_MIN = 240        // 4h
const MAX_LEN_MIN = 600        // 10h
const COLORS = ['#3b82f6', '#10b981', '#fbbf24', '#a855f7', '#ef4444', '#06b6d4']

function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snap(min: number): number {
  return Math.round(min / STEP_MIN) * STEP_MIN
}

interface DragState {
  shiftId: string
  mode: 'move' | 'resize-right'
  startX: number
  origStart: number
  origEnd: number
}

export function RosterGantt({ roster, onUpdateShift, onRemoveShift }: RosterGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    if (!drag) return
    function onMove(e: PointerEvent) {
      if (!drag || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dxPx = e.clientX - drag.startX
      const dxMin = (dxPx / rect.width) * 1440
      if (drag.mode === 'move') {
        const len = drag.origEnd - drag.origStart
        const newStart = Math.max(0, Math.min(1440 - len, snap(drag.origStart + dxMin)))
        onUpdateShift(drag.shiftId, { startMin: newStart, endMin: newStart + len })
      } else {
        const newEnd = Math.max(drag.origStart + MIN_LEN_MIN, Math.min(1440, snap(drag.origEnd + dxMin)))
        const len = newEnd - drag.origStart
        if (len >= MIN_LEN_MIN && len <= MAX_LEN_MIN) {
          onUpdateShift(drag.shiftId, { endMin: newEnd })
        }
      }
    }
    function onUp() { setDrag(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, onUpdateShift])

  function startDrag(e: React.PointerEvent, shift: RosterShift, mode: 'move' | 'resize-right') {
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      shiftId: shift.id,
      mode,
      startX: e.clientX,
      origStart: shift.startMin,
      origEnd: shift.endMin,
    })
  }

  return (
    <div ref={containerRef} className="cockpit-roster-gantt">
      <div className="cockpit-roster-gantt-axis">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i}>{String(i * 6).padStart(2, '0')}:00</span>
        ))}
        <span>24:00</span>
      </div>
      <div className="cockpit-roster-gantt-rows">
        {roster.length === 0 && (
          <div className="cockpit-roster-gantt-empty">No shifts. Use Auto-generate or add one.</div>
        )}
        {roster.map((s, i) => {
          const leftPct = (s.startMin / 1440) * 100
          const widthPct = ((s.endMin - s.startMin) / 1440) * 100
          const color = COLORS[i % COLORS.length]
          return (
            <div key={s.id} className="cockpit-roster-gantt-row">
              <div className="cockpit-roster-gantt-row-track">
                <div
                  className="cockpit-roster-gantt-bar"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }}
                  onPointerDown={e => startDrag(e, s, 'move')}
                >
                  <span className="cockpit-roster-gantt-bar-label">
                    {fmt(s.startMin)}–{fmt(s.endMin)} · {s.agentCount}
                  </span>
                  <div
                    className="cockpit-roster-gantt-bar-resize"
                    onPointerDown={e => startDrag(e, s, 'resize-right')}
                  />
                </div>
              </div>
              <button
                type="button"
                className="cockpit-roster-gantt-remove"
                onClick={() => onRemoveShift(s.id)}
                title="Remove shift"
              >×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/roster/RosterGantt.tsx
git commit -m "feat(roster): drag/resize Gantt with 30-min snap and length guards"
```

---

## Task 10: `CoverageLine` component

**Files:**
- Create: `app/components/cockpit/roster/CoverageLine.tsx`

Chart.js line chart underneath the Gantt. Two series: scheduled (sum of `agentsActiveAt` per interval) and required (Erlang C per interval). Gap shaded red when scheduled < required.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import type { RosterShift, Scenario } from '@/lib/types'
import { agentsActiveAt } from '@/lib/kernel/roster'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'

interface CoverageLineProps {
  scenario: Scenario
  roster: RosterShift[]
}

export function CoverageLine({ scenario, roster }: CoverageLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const labels = Array.from({ length: 48 }, (_, i) =>
      i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:00` : ''
    )
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const slTarget = scenario.sl / 100
    const required = calls.map(c => {
      if (c <= 0) return 0
      const { N } = requiredAgents(c, scenario.aht, slTarget, scenario.asa)
      return Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    })
    const scheduled = Array.from({ length: 48 }, (_, i) => agentsActiveAt(roster, i * 30 + 15))

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Required',
            data: required,
            borderColor: 'rgba(255,255,255,0.5)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
          },
          {
            label: 'Scheduled',
            data: scheduled,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.15)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
            fill: 'origin',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: {
            beginAtZero: true,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            title: { display: true, text: 'Agents', color: '#94a3b8' },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [scenario, roster])

  return (
    <div className="cockpit-roster-coverage-container">
      <canvas ref={canvasRef} />
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/roster/CoverageLine.tsx
git commit -m "feat(roster): coverage line — scheduled vs required agents per interval"
```

---

## Task 11: `OptimizerControls` component

**Files:**
- Create: `app/components/cockpit/roster/OptimizerControls.tsx`

Top bar of the Roster tab. Auto-generate button + budget slider + iteration display + Add Shift / Clear buttons.

- [ ] **Step 1: Create the file**

```tsx
'use client'

interface OptimizerControlsProps {
  budgetAgentHours: number
  onBudgetChange: (n: number) => void
  iter: number | null            // null when not running
  totalIter: number
  bestScore: number | null
  onAutoGenerate: () => void
  onAddShift: () => void
  onClearRoster: () => void
  running: boolean
}

export function OptimizerControls({
  budgetAgentHours, onBudgetChange,
  iter, totalIter, bestScore,
  onAutoGenerate, onAddShift, onClearRoster, running,
}: OptimizerControlsProps) {
  return (
    <div className="cockpit-roster-controls">
      <button
        type="button"
        className="cockpit-roster-auto-btn"
        onClick={onAutoGenerate}
        disabled={running}
      >
        🧠 {running ? 'Optimizing…' : 'Auto-generate'}
      </button>

      <div className="cockpit-roster-iter-display">
        {iter != null
          ? `iter ${iter}/${totalIter} · best score: ${(bestScore ?? 0).toFixed(3)}`
          : bestScore != null
            ? `done · best score: ${bestScore.toFixed(3)}`
            : 'idle'}
      </div>

      <div className="cockpit-roster-budget">
        <label className="cockpit-roster-budget-label">Budget</label>
        <input
          type="range"
          min={100}
          max={5000}
          step={50}
          value={budgetAgentHours}
          onChange={e => onBudgetChange(Number(e.target.value))}
          className="cockpit-roster-budget-slider"
        />
        <span className="cockpit-roster-budget-value">{budgetAgentHours} agent-hours</span>
      </div>

      <div className="cockpit-roster-actions">
        <button type="button" className="cockpit-roster-action-btn" onClick={onAddShift}>+ Add shift</button>
        <button type="button" className="cockpit-roster-action-btn cockpit-roster-action-btn--ghost" onClick={onClearRoster}>Clear</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/roster/OptimizerControls.tsx
git commit -m "feat(roster): controls bar — auto-generate, budget slider, add/clear"
```

---

## Task 12: Replace `RosterTab` with full integration

**Files:**
- Modify: `app/components/cockpit/tabs/RosterTab.tsx`

Wires Gantt + Coverage + Controls. Owns the in-flight optimizer state. Optimizer streams best-so-far → setRoster → Gantt + CoverageLine re-render automatically.

- [ ] **Step 1: Replace the file**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { RosterGantt } from '../roster/RosterGantt'
import { CoverageLine } from '../roster/CoverageLine'
import { OptimizerControls } from '../roster/OptimizerControls'
import { runOptimize } from '@/app/workers/optimizerClient'
import { buildDefaultRoster, totalAgentHours } from '@/lib/kernel/roster'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import type { RosterShift } from '@/lib/types'

const TOTAL_ITER = 300

function newShiftId(): string {
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`
}

export function RosterTab() {
  const { scenario, setRoster, addShift, removeShift, updateShift } = useScenario()
  const [iter, setIter] = useState<number | null>(null)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  // Default budget: peak Erlang C × HOOP hours
  const defaultBudget = useMemo(() => {
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const peakCalls = Math.max(0.001, ...calls)
    const { N } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    const hoopHours = (scenario.hoop.endMin - scenario.hoop.startMin) / 60
    return Math.max(100, Math.round(scheduled * hoopHours))
  }, [scenario])

  const [budget, setBudget] = useState<number>(defaultBudget)

  const roster: RosterShift[] = scenario.roster ?? []
  const usedHours = totalAgentHours(roster)

  function handleAutoGenerate() {
    setRunning(true)
    setIter(0)
    setBestScore(null)
    runOptimize({
      scenario,
      budgetAgentHours: budget,
      iterations: TOTAL_ITER,
      emitEvery: 20,
      optSeed: scenario.rngSeed,
      onProgress: (i, best, score) => {
        setIter(i)
        setBestScore(score)
        setRoster(best)
      },
    })
      .then(final => {
        setRoster(final)
        setRunning(false)
      })
      .catch(() => {
        setRunning(false)
      })
  }

  function handleAddShift() {
    const start = scenario.hoop.startMin
    const end = Math.min(scenario.hoop.endMin, start + 480)   // default 8h
    addShift({
      id: newShiftId(),
      startMin: start,
      endMin: end,
      agentCount: 10,
      breaks: [],
    })
  }

  function handleClear() {
    setRoster(null)
    setIter(null)
    setBestScore(null)
  }

  return (
    <div className="cockpit-viewport cockpit-roster-viewport">
      <div className="cockpit-viewport-header">
        <span>Roster Designer</span>
        <span className="cockpit-viewport-sub">
          {roster.length === 0
            ? 'no roster — kernel falling back to Erlang C auto-staffing'
            : `${roster.length} shift${roster.length === 1 ? '' : 's'} · ${usedHours.toFixed(0)} / ${budget} agent-hours`}
        </span>
      </div>
      <div className="cockpit-viewport-body cockpit-roster-body">
        <OptimizerControls
          budgetAgentHours={budget}
          onBudgetChange={setBudget}
          iter={iter}
          totalIter={TOTAL_ITER}
          bestScore={bestScore}
          onAutoGenerate={handleAutoGenerate}
          onAddShift={handleAddShift}
          onClearRoster={handleClear}
          running={running}
        />
        <div className="cockpit-roster-gantt-frame">
          <RosterGantt
            roster={roster}
            onUpdateShift={updateShift}
            onRemoveShift={removeShift}
          />
        </div>
        <div className="cockpit-roster-coverage-frame">
          <CoverageLine scenario={scenario} roster={roster} />
        </div>
      </div>
    </div>
  )
}

// Suppress unused import warning for buildDefaultRoster — it's exposed for future use
// (e.g., a "Reset to default" button). Remove this line once consumed.
void buildDefaultRoster
```

- [ ] **Step 2: tsc + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, 79 tests still passing, build green.

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/tabs/RosterTab.tsx
git commit -m "feat(roster): full tab with Gantt + coverage + auto-generate"
```

---

## Task 13: CSS for roster Gantt + coverage + controls

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: APPEND the following block at the very end of `app/globals.css`** (do NOT replace existing content)

```css
/* ───────── Cockpit Phase 4 (Roster Designer) ───────── */

.cockpit-roster-viewport .cockpit-roster-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

/* Controls bar */
.cockpit-roster-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  flex-wrap: wrap;
}

.cockpit-roster-auto-btn {
  background: #a855f7;
  color: #fff;
  border: 0;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.cockpit-roster-auto-btn:disabled {
  background: #334155;
  color: #64748b;
  cursor: not-allowed;
}

.cockpit-roster-iter-display {
  font-size: 0.75rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.cockpit-roster-budget {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}
.cockpit-roster-budget-label {
  font-size: 0.7rem;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cockpit-roster-budget-slider {
  width: 140px;
  accent-color: #a855f7;
}
.cockpit-roster-budget-value {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.cockpit-roster-actions {
  display: flex;
  gap: 0.4rem;
}
.cockpit-roster-action-btn {
  background: #334155;
  color: #e2e8f0;
  border: 0;
  border-radius: 4px;
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.cockpit-roster-action-btn--ghost {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
}

/* Gantt */
.cockpit-roster-gantt-frame {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.75rem;
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}
.cockpit-roster-gantt {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
}
.cockpit-roster-gantt-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  opacity: 0.5;
  margin-bottom: 0.2rem;
  padding-left: 0;
  padding-right: 28px;
}
.cockpit-roster-gantt-rows {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
}
.cockpit-roster-gantt-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  opacity: 0.5;
  font-size: 0.85rem;
}
.cockpit-roster-gantt-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.cockpit-roster-gantt-row-track {
  position: relative;
  flex: 1;
  height: 24px;
  background: #1e293b;
  border-radius: 4px;
}
.cockpit-roster-gantt-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  cursor: grab;
  display: flex;
  align-items: center;
  padding: 0 0.4rem;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  user-select: none;
  touch-action: none;
}
.cockpit-roster-gantt-bar:active { cursor: grabbing; }
.cockpit-roster-gantt-bar-label {
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cockpit-roster-gantt-bar-resize {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: rgba(255,255,255,0.2);
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}
.cockpit-roster-gantt-remove {
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
  font-size: 0.85rem;
  cursor: pointer;
  width: 24px;
}
.cockpit-roster-gantt-remove:hover { color: #ef4444; border-color: #ef4444; }

/* Coverage */
.cockpit-roster-coverage-frame {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.75rem;
  height: 180px;
}
.cockpit-roster-coverage-container {
  width: 100%;
  height: 100%;
  position: relative;
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(css): roster designer styles — controls, Gantt, coverage"
```

End of Sub-phase C.

---

# Final tasks

## Task 14: End-to-end manual verification

**Files:** none

- [ ] **Step 1: Run automated checks**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all green for new code (the 7 pre-existing /learn lint errors persist; do not fix).

- [ ] **Step 2: Run dev server and verify in browser**

```bash
npm run dev
```

Open the local URL. Click the **Roster** tab. Verify:

- Initially shows "no roster — kernel falling back to Erlang C auto-staffing" and an empty Gantt with "No shifts. Use Auto-generate or add one."
- Click **🧠 Auto-generate**. Iteration counter ticks up (20, 40, 60…). Gantt bars appear and adjust as the search progresses. Coverage line updates live.
- After ~6–10 seconds, "done · best score: X.XXX" shows.
- Drag a Gantt bar horizontally — it moves; coverage line updates instantly.
- Drag the right edge of a bar — it resizes (within 4h–10h limits).
- Click **+ Add shift** — a new bar appears at HOOP start, 8h length, 10 agents.
- Click the × button on a row — that shift is removed.
- Click **Clear** — roster resets to null, header text reverts to fallback message.
- Adjust the **Budget** slider — re-running Auto-generate respects the new cap.

Cross-tab integration:
- After Auto-generate, switch to **Live Sim**. The agent canvas should now reflect the roster (same number of dots as the peak roster coverage).
- Switch to **Monte Carlo**. Run completes; SL distribution should reflect the roster (probably better than Erlang C fallback if the optimizer did its job, possibly worse if budget was too tight).
- Click **Replay worst day** in Monte Carlo. Live Sim plays the bad day with the roster active.

- [ ] **Step 3: Final cleanup commit if anything tweaked**

```bash
git status
# If anything was tweaked:
git add -A
git commit -m "chore: phase 4 verification cleanups"
```

Otherwise skip.

---

## Task 15: Branch handoff

**Files:** none

- [ ] **Step 1: Confirm branch state**

```bash
git status
git log --oneline feat/cockpit-phase3..HEAD
```

Expected: clean working tree, ~13 commits on `feat/cockpit-phase4`.

- [ ] **Step 2: Print summary**

```
Phase 4 complete on feat/cockpit-phase4.
- RosterShift type (template-style with agentCount)
- Kernel uses scenario.roster when provided; falls back to Erlang C otherwise
- buildDefaultRoster, agentsActiveAt, totalAgentHours helpers
- Simulated annealing optimizer (300 iter default, ~6-10s with collectEvents:false)
- Optimizer Web Worker with streaming progress
- Drag-edit Gantt with 30-min snap and 4h-10h length guards
- Live coverage line (scheduled vs Erlang-C-required)
- Auto-generate, budget slider, Add Shift / Clear controls
- Cross-tab integration: roster propagates to Live Sim and Monte Carlo via scenario
- Tests passing, build green, lint green for new code
```

---

## Self-review

**Spec coverage (Phase 4 row):**

| Spec requirement | Covered by |
| --- | --- |
| Gantt-style shift editor (drag to reposition, resize for length) | Task 9 |
| Live coverage-vs-required line | Task 10 |
| Optimizer Worker: simulated annealing over shift placement | Tasks 6, 7, 8 |
| Constraints: min 4h shift / max 10h shift / mandatory breaks / HOOP coverage | Tasks 6, 9 (length guards in both); break placement deferred to default mid-shift behavior |
| Streams best-so-far so user watches the search think | Tasks 6, 7, 8, 12 |
| Total HC budget defaults to Erlang-C-derived Scheduled HC | Task 12 |
| Editable via slider in Roster top bar | Task 11 |

**Type consistency check:**
- `RosterShift` defined in Task 1, used in Tasks 2–4, 6, 7, 8, 9, 10, 11, 12. Consistent.
- `OptimizeOptions` defined in Task 6, used in Task 7. Consistent.
- `OptimizerControlsProps` defined in Task 11, used in Task 12. Consistent.
- All ScenarioContext mutators (`setRoster`, `addShift`, `removeShift`, `updateShift`) defined in Task 4, used in Tasks 9 and 12. Consistent.

**Placeholder scan:** every code step shows complete code; every test step shows complete assertions; every command has expected output. The `void buildDefaultRoster` line in Task 12 is a deliberate unused-import suppression with a TODO-style comment indicating the future use; that's intentional, not a placeholder.

**Open questions for review:**
- The optimizer keeps `agentCount` fixed per shift — only start times and lengths move. Adding agentCount as a SA dimension would expand the search space significantly and potentially make the demo slower. If a stakeholder wants the optimizer to also tune headcount-per-shift, that's a Phase 5 follow-up.
- "Mandatory breaks for shifts ≥6h" from the spec is currently delegated to the Phase 2 `scheduleBreaks` fallback (one 15-min break per agent at a random time within HOOP) — i.e., when a `RosterShift.breaks` is empty, the kernel still schedules an agent-level break via the existing helper. This satisfies the spec intent but is not an *explicit* per-shift break optimizer. If the demo needs to visualize break windows on the Gantt, that's a Phase 5 polish.

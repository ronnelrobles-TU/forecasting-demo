# WFM Cockpit — Phase 2 (Live Sim + Time Machine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 "pipe-prove" Live Sim tab with a full live-simulation viewport: a Canvas-based agent-dot grid that animates through a simulated day, a timeline scrubber, play/pause/speed controls, and an event-injection modal that lets a demo-driver perturb the day mid-flight (Surge / Outage / Typhoon / Flash absent / Custom). Underpinning all of this is **kernel v2** with abandons and breaks.

**Architecture:** Kernel stays one-shot (still <100ms per day) and now produces a richer event stream. Client-side animation engine plays the event log back at user-controlled speed via `requestAnimationFrame`. Per-agent state at any sim minute is derived from the event log, so scrubbing is just "set sim time, recompute current state, re-render the canvas." Event injection works by appending to `Scenario.injectedEvents` — the kernel re-runs (fast) and the animation continues from the same scrub position with the perturbation applied.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, native Web Workers, Canvas 2D, Vitest, seedrandom (all already installed in Phase 1).

**Spec reference:** [docs/superpowers/specs/2026-05-08-wfm-cockpit-design.md](../specs/2026-05-08-wfm-cockpit-design.md)
**Predecessor plan:** [docs/superpowers/plans/2026-05-08-wfm-cockpit-phase1-foundation.md](./2026-05-08-wfm-cockpit-phase1-foundation.md)

---

## Internal phasing

This plan ships in three internal sub-phases. Each ends demo-able.

| Sub-phase | Tasks | Demo at end |
| --- | --- | --- |
| A — Kernel v2 | Tasks 1–5 | Existing Phase 1 chart still works; abandons & breaks now reflected in totals; injection plumbing in place |
| B — Animation engine + agent dots | Tasks 6–14 | Press play, watch a day animate. Drag the scrubber. Switch speeds. KPI strip updates live. |
| C — Event injection UI | Tasks 15–19 | Mid-day "Typhoon" / "Surge" inject modal works end-to-end. Scrubber shows event markers. |

Plus Tasks 0 (branch), 20 (manual verification), 21 (handoff).

---

## Key design decisions (called out so the human can push back during review)

1. **One-shot kernel + client playback** (not streaming).
   The kernel produces a full event log up front (~25k events, <100ms). The animation engine plays events back via `requestAnimationFrame`. Rationale: scrubbing/seeking is trivial (just set sim time and re-derive state), event injection is a clean re-run rather than a stateful dance with the worker. Streaming kernels are harder to scrub.

2. **Time scale: sim minutes per real second.**
   - 1× → 24 sim-min/real-sec (a 24h day plays in 60 wall seconds)
   - 10× → 240 sim-min/real-sec (a day in 6 wall seconds)
   - 60× → 1440 sim-min/real-sec (a day in 1 wall second)
   These are demo-tuned, not real-time. We're showing operational shape, not real time.

3. **Per-agent timeline derivation.**
   We index the event log per-agent once (memoized off `events`). At any sim time T, we binary-search each agent's timeline for their state at T. ~158 agents × O(log events) per frame is comfortably 60fps.

4. **Inject = append to `Scenario.injectedEvents` and re-run.**
   Re-running the kernel is fast enough to be invisible in the demo. The scrubber position is preserved across re-runs.

5. **Phase 2 break model is approximate.**
   True roster-based break placement lands in Phase 4. For Phase 2, each agent gets one 15-minute break at a random offset within their active window. Good enough for the demo's animation; correct enough for the KPI math.

6. **Abandons subtract from SL denominator.**
   Industry-standard treatment: abandoned calls don't count in service level. They're surfaced separately as "abandons" in totals.

---

## File Structure

### New files (kernel v2)

- `lib/kernel/inject.ts` — pure helper: given current minute and `injectedEvents[]`, return the active perturbations (volume multiplier, AHT multiplier, agent reduction).
- `lib/kernel/breaks.ts` — pure helper: given peak agent count and seed, schedule one break per agent.

### Modified files (kernel v2)

- `lib/types.ts` — add `Scenario.injectedEvents`, add `Campaign.abandonThresholdSec` and `abandonCurveBeta` (with sensible defaults), extend `IntervalStat` with abandon counts already there.
- `lib/campaigns.ts` — populate `abandonThresholdSec` and `abandonCurveBeta` defaults per campaign.
- `lib/kernel/sim.ts` — add abandons, breaks, inject processing.
- `tests/kernel.test.ts` — append tests for abandons, breaks, injections.

### New files (animation engine — pure logic)

- `lib/animation/timeScale.ts` — `simMinutesPerSec(speed: 1 | 10 | 60): number`.
- `lib/animation/agentTimeline.ts` — `buildAgentTimelines(events, peakAgents)`, `agentStateAt(timeline, simTimeMin)`.
- `lib/animation/intervalAtTime.ts` — `intervalStatsAt(perInterval, simTimeMin)` for the live KPI strip.
- `tests/animation.test.ts` — unit tests for these helpers.

### New files (animation UI — React)

- `app/components/cockpit/timeline/PlayControls.tsx` — play/pause + 1×/10×/60× selector.
- `app/components/cockpit/timeline/TimelineScrubber.tsx` — drag-to-seek with demand curve underlay.
- `app/components/cockpit/timeline/useAnimation.ts` — rAF loop hook owning `simTimeMin`, `playing`, `speed`.
- `app/components/cockpit/agents/AgentDotCanvas.tsx` — Canvas 2D agent grid; draws dots colored by current state.

### New files (inject UI)

- `app/components/cockpit/inject/eventPresets.ts` — Surge / Outage / Typhoon / Flash-absent / Custom definitions.
- `app/components/cockpit/inject/InjectEventModal.tsx` — the modal triggered by the sidebar button.

### Modified files (UI wire-in)

- `app/components/cockpit/ScenarioContext.tsx` — add `addInjection(ev)`, `clearInjections()`.
- `app/components/cockpit/Sidebar.tsx` — wire up the inject button (no longer disabled).
- `app/components/cockpit/tabs/LiveSimTab.tsx` — full rewrite to use the new animation pipeline (replaces Phase 1's pipe-prove chart).
- `app/components/cockpit/KpiStrip.tsx` — accept an optional "live" override that pulls from current sim time.
- `app/globals.css` — append timeline, agent-canvas, modal styles.

### Untouched

- `app/learn/page.tsx`, `app/components/Nav.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/components/WFMDemo.tsx`.
- All Phase 4 work (Roster Designer + optimizer).

---

## Conventions used throughout

- **Branch:** `feat/cockpit-phase2` off the merged Phase 1 branch (or whatever main looks like when this lands). Create before Task 1.
- **Commits:** Conventional commits, one per task.
- **Type imports:** `import type { ... }` for type-only imports.
- **CSS:** New classes prefixed `cockpit-` (timeline, agents, inject sections).

---

## Task 0: Branch + workspace check

**Files:** none

- [ ] **Step 1: Confirm Phase 1 work is on `main`** (or note which branch this is layering on).

```bash
git status
git log --oneline -5
```

If Phase 1 is still on `feat/cockpit-phase1`, branch from there:

```bash
git checkout feat/cockpit-phase1
```

- [ ] **Step 2: Create the Phase 2 branch**

```bash
git checkout -b feat/cockpit-phase2
git status
```

Expected: `nothing to commit, working tree clean`.

---

# Sub-phase A — Kernel v2 (Tasks 1–5)

## Task 1: Add `injectedEvents` field and abandon config to types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Update `lib/types.ts`**

Add `injectedEvents` to `Scenario` and `abandonThresholdSec` + `abandonCurveBeta` to `Campaign`. Apply this diff:

In `Campaign` interface, after `rules: string`, add nothing — but add two optional config fields after `abs`:

```ts
export interface Campaign {
  key: CampaignKey
  label: string
  hoop: HoopWindow
  curveTemplate: number[]
  dailyTotal: number
  aht: number
  sl: number
  asa: number
  shrink: number
  abs: number
  abandonThresholdSec: number    // NEW: caller leaves if wait > this (default 60)
  abandonCurveBeta: number       // NEW: ramp steepness, P(abandon | wait) ≈ 1 - exp(-beta * (wait - threshold))
  rules: string
}
```

In `Scenario` interface, add `injectedEvents` after `rngSeed`:

```ts
export interface Scenario {
  campaignKey: CampaignKey
  hoop: HoopWindow
  curve: number[]
  dailyTotal: number
  aht: number
  sl: number
  asa: number
  shrink: number
  abs: number
  roster: Shift[] | null
  rngSeed: number
  injectedEvents: InjectedEvent[]   // NEW
}
```

- [ ] **Step 2: Verify it compiles (will fail until Task 2 fills in campaign defaults and ScenarioContext seeds the new field)**

```bash
npx tsc --noEmit
```

Expected: errors in `lib/campaigns.ts` (missing `abandonThresholdSec`/`abandonCurveBeta`) and in `app/components/cockpit/ScenarioContext.tsx` (missing `injectedEvents`). That's fine — Tasks 2 and 6 fix these. Don't commit yet — bundle into Task 2.

---

## Task 2: Populate campaign defaults and seed injectedEvents

**Files:**
- Modify: `lib/campaigns.ts`
- Modify: `app/components/cockpit/ScenarioContext.tsx`

- [ ] **Step 1: Update each of the 5 campaigns in `lib/campaigns.ts` to include the new fields**

For each campaign object, add the two fields immediately before `rules`. The defaults: `abandonThresholdSec: 60` (60 seconds), `abandonCurveBeta: 0.05` (gentle ramp). Vary by campaign:

```ts
us_telco_manila: {
  // ... existing fields up to abs: 9 ...
  abandonThresholdSec: 60,
  abandonCurveBeta: 0.05,
  rules: 'Voice inbound · Tier 1 troubleshoot · 24/7 follow-the-sun · ESL premium tagging',
},
au_retail_cebu: {
  // ... existing fields up to abs: 7 ...
  abandonThresholdSec: 90,        // chat is more patient
  abandonCurveBeta: 0.03,
  rules: '...',
},
uk_fintech_manila: {
  // ... existing fields up to abs: 8 ...
  abandonThresholdSec: 45,        // fintech callers are impatient
  abandonCurveBeta: 0.08,
  rules: '...',
},
us_healthcare_clark: {
  // ... existing fields up to abs: 10 ...
  abandonThresholdSec: 75,
  abandonCurveBeta: 0.04,
  rules: '...',
},
ph_telco_davao: {
  // ... existing fields up to abs: 12 ...
  abandonThresholdSec: 60,
  abandonCurveBeta: 0.06,
  rules: '...',
},
```

- [ ] **Step 2: Update `scenarioFromCampaign` in `app/components/cockpit/ScenarioContext.tsx`**

In the helper that builds a Scenario from a Campaign, add `injectedEvents: []` to the returned object. The function currently reads:

```ts
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
  }
}
```

Add `injectedEvents: []` after `rngSeed: seed,`:

```ts
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
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc clean. All 26 existing tests pass (kernel doesn't yet read `injectedEvents`, so no breakage).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/campaigns.ts app/components/cockpit/ScenarioContext.tsx
git commit -m "feat(types): add injectedEvents to Scenario and abandon config to Campaign"
```

---

## Task 3: Inject helper module + tests

**Files:**
- Create: `tests/inject.test.ts`
- Create: `lib/kernel/inject.ts`

The helper is the single source of truth for "what perturbations are active at this minute, given this list of injected events?"

- [ ] **Step 1: Write failing tests in `tests/inject.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { InjectedEvent } from '@/lib/types'
import { activePerturbations } from '@/lib/kernel/inject'

describe('activePerturbations', () => {
  it('returns identity when no events', () => {
    const p = activePerturbations([], 600)
    expect(p.volumeMultiplier).toBe(1)
    expect(p.ahtMultiplier).toBe(1)
    expect(p.agentReductionFraction).toBe(0)
    expect(p.flashAbsentJustFired).toBe(0)
  })

  it('applies volume_surge during its window', () => {
    const ev: InjectedEvent = { type: 'volume_surge', fireAtMin: 600, durationMin: 60, magnitude: 0.3 }
    expect(activePerturbations([ev], 599).volumeMultiplier).toBe(1)
    expect(activePerturbations([ev], 600).volumeMultiplier).toBeCloseTo(1.3)
    expect(activePerturbations([ev], 659).volumeMultiplier).toBeCloseTo(1.3)
    expect(activePerturbations([ev], 660).volumeMultiplier).toBe(1)
  })

  it('applies aht_spike during its window', () => {
    const ev: InjectedEvent = { type: 'aht_spike', fireAtMin: 700, durationMin: 30, magnitude: 1.0 }
    expect(activePerturbations([ev], 700).ahtMultiplier).toBeCloseTo(2.0)
    expect(activePerturbations([ev], 729).ahtMultiplier).toBeCloseTo(2.0)
    expect(activePerturbations([ev], 730).ahtMultiplier).toBe(1)
  })

  it('staff_drop persists past durationMin if undefined', () => {
    const ev: InjectedEvent = { type: 'staff_drop', fireAtMin: 800, magnitude: 0.25 }  // no durationMin → rest of day
    expect(activePerturbations([ev], 700).agentReductionFraction).toBe(0)
    expect(activePerturbations([ev], 800).agentReductionFraction).toBeCloseTo(0.25)
    expect(activePerturbations([ev], 1400).agentReductionFraction).toBeCloseTo(0.25)
  })

  it('flash_absent fires only at fireAtMin', () => {
    const ev: InjectedEvent = { type: 'flash_absent', fireAtMin: 850, magnitude: 15 }
    expect(activePerturbations([ev], 849).flashAbsentJustFired).toBe(0)
    expect(activePerturbations([ev], 850).flashAbsentJustFired).toBe(15)
    expect(activePerturbations([ev], 851).flashAbsentJustFired).toBe(0)
  })

  it('stacks multiple active events', () => {
    const evs: InjectedEvent[] = [
      { type: 'volume_surge', fireAtMin: 600, durationMin: 120, magnitude: 0.3 },
      { type: 'aht_spike',    fireAtMin: 600, durationMin: 60,  magnitude: 0.5 },
    ]
    const p = activePerturbations(evs, 600)
    expect(p.volumeMultiplier).toBeCloseTo(1.3)
    expect(p.ahtMultiplier).toBeCloseTo(1.5)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/kernel/inject`.

- [ ] **Step 3: Implement `lib/kernel/inject.ts`**

```ts
import type { InjectedEvent } from '@/lib/types'

export interface ActivePerturbations {
  volumeMultiplier: number
  ahtMultiplier: number
  agentReductionFraction: number    // e.g. 0.25 means -25% of active agents
  flashAbsentJustFired: number       // count of agents to remove permanently from this minute
}

function isActive(ev: InjectedEvent, currentMin: number): boolean {
  if (currentMin < ev.fireAtMin) return false
  if (ev.durationMin == null) return true
  return currentMin < ev.fireAtMin + ev.durationMin
}

export function activePerturbations(events: InjectedEvent[], currentMin: number): ActivePerturbations {
  const result: ActivePerturbations = {
    volumeMultiplier: 1,
    ahtMultiplier: 1,
    agentReductionFraction: 0,
    flashAbsentJustFired: 0,
  }
  for (const ev of events) {
    if (ev.type === 'flash_absent') {
      if (currentMin === ev.fireAtMin) result.flashAbsentJustFired += ev.magnitude
      continue
    }
    if (!isActive(ev, currentMin)) continue
    switch (ev.type) {
      case 'volume_surge': result.volumeMultiplier *= (1 + ev.magnitude); break
      case 'aht_spike':    result.ahtMultiplier *= (1 + ev.magnitude); break
      case 'staff_drop':   result.agentReductionFraction += ev.magnitude; break
      case 'custom':       /* no-op for v2; see Task 17 for preset list */ break
    }
  }
  return result
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all `activePerturbations` tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/inject.ts tests/inject.test.ts
git commit -m "feat(kernel): inject helper for active-perturbation lookup"
```

---

## Task 4: Breaks helper + tests

**Files:**
- Create: `tests/breaks.test.ts`
- Create: `lib/kernel/breaks.ts`

This computes per-agent break windows. For Phase 2, each agent gets one 15-minute break at a random time within the active window (HOOP).

- [ ] **Step 1: Write failing tests in `tests/breaks.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { scheduleBreaks } from '@/lib/kernel/breaks'

describe('scheduleBreaks', () => {
  it('produces one 15-min break per agent', () => {
    const breaks = scheduleBreaks(10, { startMin: 480, endMin: 1080 }, 42)
    expect(breaks).toHaveLength(10)
    for (const b of breaks) {
      expect(b.durationMin).toBe(15)
      expect(b.startMin).toBeGreaterThanOrEqual(480)
      expect(b.startMin + b.durationMin).toBeLessThanOrEqual(1080)
    }
  })

  it('is deterministic for same seed', () => {
    const a = scheduleBreaks(20, { startMin: 480, endMin: 1080 }, 7)
    const b = scheduleBreaks(20, { startMin: 480, endMin: 1080 }, 7)
    expect(a).toEqual(b)
  })

  it('returns empty when 0 agents', () => {
    expect(scheduleBreaks(0, { startMin: 0, endMin: 1440 }, 1)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/kernel/breaks`.

- [ ] **Step 3: Implement `lib/kernel/breaks.ts`**

```ts
import type { HoopWindow } from '@/lib/types'
import { makeRng } from '@/lib/rng'

export interface AgentBreak {
  agentId: string
  startMin: number
  durationMin: number
}

const BREAK_DURATION_MIN = 15
const BREAK_BUFFER_MIN = 30  // don't schedule a break in the first or last 30 min of HOOP

export function scheduleBreaks(numAgents: number, hoop: HoopWindow, seed: number): AgentBreak[] {
  if (numAgents <= 0) return []
  const rng = makeRng(seed * 1000 + 7)  // distinct stream from main sim
  const earliest = hoop.startMin + BREAK_BUFFER_MIN
  const latest = hoop.endMin - BREAK_DURATION_MIN - BREAK_BUFFER_MIN
  if (latest <= earliest) {
    // HOOP too short — give everyone a break right after start
    return Array.from({ length: numAgents }, (_, i) => ({
      agentId: `A${i}`,
      startMin: hoop.startMin,
      durationMin: BREAK_DURATION_MIN,
    }))
  }
  return Array.from({ length: numAgents }, (_, i) => ({
    agentId: `A${i}`,
    startMin: earliest + Math.floor(rng() * (latest - earliest)),
    durationMin: BREAK_DURATION_MIN,
  }))
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/breaks.ts tests/breaks.test.ts
git commit -m "feat(kernel): schedule one 15-min break per agent within HOOP"
```

---

## Task 5: Wire abandons + breaks + injection into the kernel

**Files:**
- Modify: `lib/kernel/sim.ts`
- Modify: `tests/kernel.test.ts`

This is the load-bearing kernel change. Walk carefully.

- [ ] **Step 1: Add new tests to `tests/kernel.test.ts`** (append to the existing file, do not replace)

Append this block at the bottom of the file:

```ts
describe('runDay v2 — abandons', () => {
  it('produces some abandons under heavy load', () => {
    const sc = baseScenario(7)
    sc.dailyTotal = 50000   // overload
    const result = runDay(sc)
    expect(result.totals.abandons).toBeGreaterThan(0)
  })

  it('produces zero abandons when overstaffed', () => {
    const sc = baseScenario(7)
    sc.dailyTotal = 200    // tiny load
    const result = runDay(sc)
    expect(result.totals.abandons).toBe(0)
  })
})

describe('runDay v2 — breaks', () => {
  it('emits agent_break_start and agent_break_end events', () => {
    const result = runDay(baseScenario(11))
    const starts = result.events.filter(e => e.type === 'agent_break_start')
    const ends = result.events.filter(e => e.type === 'agent_break_end')
    expect(starts.length).toBeGreaterThan(0)
    expect(starts.length).toBe(ends.length)
  })
})

describe('runDay v2 — injection', () => {
  it('volume_surge injection raises abandons', () => {
    const baseline = runDay(baseScenario(13))
    const surged = runDay({
      ...baseScenario(13),
      injectedEvents: [
        { type: 'volume_surge', fireAtMin: 600, durationMin: 120, magnitude: 0.5 },
      ],
    })
    expect(surged.totals.abandons).toBeGreaterThanOrEqual(baseline.totals.abandons)
  })

  it('staff_drop injection emits agent_shift_end events at fireAtMin', () => {
    const result = runDay({
      ...baseScenario(17),
      injectedEvents: [
        { type: 'staff_drop', fireAtMin: 700, magnitude: 0.25 },
      ],
    })
    const ends = result.events.filter(e => e.type === 'agent_shift_end' && e.timeMin >= 700 && e.timeMin <= 701)
    expect(ends.length).toBeGreaterThan(0)
  })

  it('flash_absent emits agent_shift_end events exactly at fireAtMin', () => {
    const result = runDay({
      ...baseScenario(19),
      injectedEvents: [
        { type: 'flash_absent', fireAtMin: 750, magnitude: 10 },
      ],
    })
    const ends = result.events.filter(e => e.type === 'agent_shift_end' && e.timeMin === 750)
    expect(ends.length).toBeGreaterThanOrEqual(10)
  })
})
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npm test
```

Expected: prior tests still pass; the new ones in "v2 — abandons", "v2 — breaks", "v2 — injection" fail with assertion errors (no abandons emitted, no break events, etc.).

- [ ] **Step 3: Replace `lib/kernel/sim.ts` with the v2 kernel**

The v2 kernel adds: abandon logic in queue handling, break events from the new helper, and injection processing. Replace the entire file contents:

```ts
import type { Scenario, SimEvent, SimResult, IntervalStat } from '@/lib/types'
import { applyHoop, callsPerInterval, intervalIndexForMinute } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import { makeRng, poisson, logNormal, type Rng } from '@/lib/rng'
import { activePerturbations } from './inject'
import { scheduleBreaks, type AgentBreak } from './breaks'
import { campaigns } from '@/lib/campaigns'

interface AgentState {
  id: string
  busyUntilMin: number     // 0 = idle now
  onBreakUntilMin: number  // 0 = not on break
  active: boolean          // false after staff_drop / flash_absent removed them
}

const ACW_SECONDS = 30
const SIGMA_AHT = 0.4

function abandonProbability(waitSec: number, thresholdSec: number, beta: number): number {
  if (waitSec <= thresholdSec) return 0
  return 1 - Math.exp(-beta * (waitSec - thresholdSec))
}

export function runDay(scenario: Scenario): SimResult {
  const rng = makeRng(scenario.rngSeed)
  const campaign = campaigns[scenario.campaignKey]
  const abandonThresholdSec = campaign.abandonThresholdSec
  const abandonBeta = campaign.abandonCurveBeta

  const curveAfterHoop = applyHoop(scenario.curve, scenario.hoop)
  const callsPer30 = callsPerInterval(curveAfterHoop, scenario.dailyTotal)

  const slTarget = scenario.sl / 100
  const agentsPerInterval = callsPer30.map(calls => {
    if (calls <= 0) return 0
    const { N } = requiredAgents(calls, scenario.aht, slTarget, scenario.asa)
    return Math.max(1, Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100)))
  })

  const peakAgents = Math.max(1, ...agentsPerInterval)
  const agents: AgentState[] = Array.from({ length: peakAgents }, (_, i) => ({
    id: `A${i}`,
    busyUntilMin: 0,
    onBreakUntilMin: 0,
    active: true,
  }))

  // Pre-schedule breaks
  const breaksByAgent = new Map<string, AgentBreak>()
  for (const br of scheduleBreaks(peakAgents, scenario.hoop, scenario.rngSeed)) {
    breaksByAgent.set(br.agentId, br)
  }

  const events: SimEvent[] = []
  const perInterval: IntervalStat[] = Array.from({ length: 48 }, () => ({
    sl: 0, agents: 0, queueLen: 0, abandons: 0, occ: 0,
  }))

  const callsAnswered = new Array(48).fill(0)
  const callsInThreshold = new Array(48).fill(0)
  const callsAbandoned = new Array(48).fill(0)
  const totalWaitMs = new Array(48).fill(0)
  const totalBusyMin = new Array(48).fill(0)

  let queue: { arriveMin: number; callId: string }[] = []
  let callCounter = 0

  for (let min = 0; min < 1440; min++) {
    const intervalIdx = intervalIndexForMinute(min)
    const pert = activePerturbations(scenario.injectedEvents, min)

    // Apply staff_drop / flash_absent
    if (pert.flashAbsentJustFired > 0) {
      let removed = 0
      for (const a of agents) {
        if (a.active && removed < pert.flashAbsentJustFired) {
          a.active = false
          events.push({ timeMin: min, type: 'agent_shift_end', agentId: a.id })
          removed++
        }
      }
    }

    // Compute effective active cap (interval staffing - staff_drop fraction)
    const intervalCap = agentsPerInterval[intervalIdx]
    const effectiveCap = Math.max(0, Math.floor(intervalCap * (1 - pert.agentReductionFraction)))
    // Emit shift_end for any active agents above the new cap
    let activeCount = 0
    for (const a of agents) {
      if (!a.active) continue
      if (activeCount >= effectiveCap) {
        a.active = false
        events.push({ timeMin: min, type: 'agent_shift_end', agentId: a.id })
        continue
      }
      activeCount++
    }
    // Re-activate agents above when cap goes back up (cap rises after surge ends, etc.)
    if (activeCount < effectiveCap) {
      for (const a of agents) {
        if (a.active) continue
        // Don't re-activate flash_absent victims — they stay out
        // (heuristic: only reactivate if their id is in the next-cap range)
        a.active = true
        activeCount++
        events.push({ timeMin: min, type: 'agent_shift_start', agentId: a.id })
        if (activeCount >= effectiveCap) break
      }
    }

    // Break entry/exit
    for (const a of agents) {
      const br = breaksByAgent.get(a.id)
      if (!br) continue
      if (a.onBreakUntilMin === 0 && min === br.startMin && a.active) {
        a.onBreakUntilMin = min + br.durationMin
        events.push({ timeMin: min, type: 'agent_break_start', agentId: a.id })
      }
      if (a.onBreakUntilMin > 0 && min >= a.onBreakUntilMin) {
        events.push({ timeMin: min, type: 'agent_break_end', agentId: a.id })
        a.onBreakUntilMin = 0
      }
    }

    // Arrivals (with volume perturbation)
    const arrivalRate = (callsPer30[intervalIdx] / 30) * pert.volumeMultiplier
    const callsThisMin = poisson(rng, arrivalRate)
    for (let c = 0; c < callsThisMin; c++) {
      const callId = `C${callCounter++}`
      events.push({ timeMin: min, type: 'call_arrive', callId })
      queue.push({ arriveMin: min, callId })
    }

    // Abandons — drop callers whose wait exceeds threshold (probabilistic ramp)
    const effectiveAht = scenario.aht * pert.ahtMultiplier
    const beforeQueue = queue
    queue = []
    for (const qc of beforeQueue) {
      const waitSec = (min - qc.arriveMin) * 60
      const pAbandon = abandonProbability(waitSec, abandonThresholdSec, abandonBeta)
      if (pAbandon > 0 && rng() < pAbandon) {
        events.push({ timeMin: min, type: 'call_abandon', callId: qc.callId, waitMs: waitSec * 1000 })
        callsAbandoned[intervalIdx]++
      } else {
        queue.push(qc)
      }
    }

    // Assign queued calls to free, active, non-break agents
    queue = queue.filter(qc => {
      const free = agents.find(a => a.active && a.busyUntilMin <= min && a.onBreakUntilMin === 0)
      if (!free) return true
      const waitMs = (min - qc.arriveMin) * 60_000
      const ahtSec = logNormal(rng, effectiveAht, SIGMA_AHT)
      free.busyUntilMin = min + (ahtSec + ACW_SECONDS) / 60
      events.push({ timeMin: min, type: 'call_answer', callId: qc.callId, agentId: free.id, waitMs })
      callsAnswered[intervalIdx]++
      totalWaitMs[intervalIdx] += waitMs
      if (waitMs / 1000 <= scenario.asa) callsInThreshold[intervalIdx]++
      return false
    })

    // Occupancy bookkeeping
    for (const a of agents) {
      if (!a.active || a.onBreakUntilMin > 0) continue
      if (a.busyUntilMin > min) totalBusyMin[intervalIdx]++
    }

    perInterval[intervalIdx].queueLen = Math.max(perInterval[intervalIdx].queueLen, queue.length)
    perInterval[intervalIdx].agents = effectiveCap
  }

  // Aggregate
  let totalSlNum = 0, totalSlDen = 0
  let totalWait = 0, totalAns = 0
  let totalBusy = 0, totalAvail = 0
  let totalAbandons = 0

  for (let i = 0; i < 48; i++) {
    const ans = callsAnswered[i]
    const ith = callsInThreshold[i]
    const aban = callsAbandoned[i]
    perInterval[i].sl = ans > 0 ? ith / ans : 1
    perInterval[i].abandons = aban
    perInterval[i].occ = perInterval[i].agents > 0 ? totalBusyMin[i] / (perInterval[i].agents * 30) : 0
    totalSlNum += ith
    totalSlDen += ans
    totalWait += totalWaitMs[i]
    totalAns += ans
    totalAbandons += aban
    totalBusy += totalBusyMin[i]
    totalAvail += perInterval[i].agents * 30
  }

  return {
    perInterval,
    events,
    totals: {
      sl: totalSlDen > 0 ? totalSlNum / totalSlDen : 1,
      occ: totalAvail > 0 ? totalBusy / totalAvail : 0,
      asa: totalAns > 0 ? totalWait / totalAns / 1000 : 0,
      abandons: totalAbandons,
      cost: 0,
    },
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all kernel v1 + v2 tests pass. If `runDay v2 — injection / staff_drop` fails to find `agent_shift_end` events at min=700, double-check the staff_drop branch: an agent above the new cap should be marked inactive AND emit `agent_shift_end` at the current minute.

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/sim.ts tests/kernel.test.ts
git commit -m "feat(kernel): v2 — abandons, breaks, injection processing"
```

End of Sub-phase A. The Phase 1 chart still works; abandons + breaks now flow through totals.

---

# Sub-phase B — Animation Engine + Agent Dots (Tasks 6–14)

## Task 6: Time-scale helper + tests

**Files:**
- Create: `tests/animation.test.ts`
- Create: `lib/animation/timeScale.ts`

- [ ] **Step 1: Write failing tests in `tests/animation.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { simMinutesPerSec, type Speed } from '@/lib/animation/timeScale'

describe('simMinutesPerSec', () => {
  it('returns 24 for 1×', () => { expect(simMinutesPerSec(1)).toBe(24) })
  it('returns 240 for 10×', () => { expect(simMinutesPerSec(10)).toBe(240) })
  it('returns 1440 for 60×', () => { expect(simMinutesPerSec(60)).toBe(1440) })
  it('Speed type accepts only allowed values (compile-time check, runtime no-op)', () => {
    const x: Speed = 1
    expect(x).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/animation/timeScale`.

- [ ] **Step 3: Implement `lib/animation/timeScale.ts`**

```ts
export type Speed = 1 | 10 | 60

const TABLE: Record<Speed, number> = {
  1: 24,      // 24h day in 60s wall
  10: 240,    // day in 6s wall
  60: 1440,   // day in 1s wall
}

export function simMinutesPerSec(speed: Speed): number {
  return TABLE[speed]
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add lib/animation/timeScale.ts tests/animation.test.ts
git commit -m "feat(animation): time-scale helper for 1×/10×/60× speeds"
```

---

## Task 7: Agent timeline derivation + tests

**Files:**
- Modify: `tests/animation.test.ts` (append)
- Create: `lib/animation/agentTimeline.ts`

This is the engine that, given the full event log, builds per-agent state timelines so we can ask "what's agent A12 doing at sim minute 873?" in O(log n).

- [ ] **Step 1: Append tests to `tests/animation.test.ts`**

Append at the bottom of the file:

```ts
import type { SimEvent } from '@/lib/types'
import { buildAgentTimelines, agentStateAt, type AgentVisualState } from '@/lib/animation/agentTimeline'

describe('buildAgentTimelines', () => {
  it('produces a timeline per agent ID', () => {
    const events: SimEvent[] = [
      { timeMin: 480, type: 'agent_shift_start', agentId: 'A0' },
      { timeMin: 600, type: 'call_answer', agentId: 'A0', callId: 'C1' },
      { timeMin: 605, type: 'call_end', agentId: 'A0' },
      { timeMin: 480, type: 'agent_shift_start', agentId: 'A1' },
    ]
    const timelines = buildAgentTimelines(events, 2)
    expect(timelines.A0.length).toBeGreaterThan(0)
    expect(timelines.A1.length).toBeGreaterThan(0)
  })
})

describe('agentStateAt', () => {
  const events: SimEvent[] = [
    { timeMin: 0,   type: 'agent_shift_start', agentId: 'A0' },
    { timeMin: 600, type: 'call_answer', agentId: 'A0', callId: 'C1' },
    { timeMin: 605, type: 'call_end', agentId: 'A0' },
    { timeMin: 700, type: 'agent_break_start', agentId: 'A0' },
    { timeMin: 715, type: 'agent_break_end', agentId: 'A0' },
    { timeMin: 900, type: 'agent_shift_end', agentId: 'A0' },
  ]
  const tl = buildAgentTimelines(events, 1).A0

  it('idle before any call', () => {
    expect(agentStateAt(tl, 100)).toBe<AgentVisualState>('idle')
  })
  it('on_call during a call', () => {
    expect(agentStateAt(tl, 602)).toBe<AgentVisualState>('on_call')
  })
  it('idle after call_end', () => {
    expect(agentStateAt(tl, 650)).toBe<AgentVisualState>('idle')
  })
  it('on_break during break', () => {
    expect(agentStateAt(tl, 710)).toBe<AgentVisualState>('on_break')
  })
  it('off_shift after shift_end', () => {
    expect(agentStateAt(tl, 1000)).toBe<AgentVisualState>('off_shift')
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/animation/agentTimeline`.

- [ ] **Step 3: Implement `lib/animation/agentTimeline.ts`**

```ts
import type { SimEvent, SimEventType } from '@/lib/types'

export type AgentVisualState = 'idle' | 'on_call' | 'on_break' | 'off_shift'

export interface AgentTimelineEntry {
  timeMin: number
  state: AgentVisualState
}

export type AgentTimelines = Record<string, AgentTimelineEntry[]>

const STATE_FOR: Partial<Record<SimEventType, AgentVisualState>> = {
  agent_shift_start: 'idle',
  agent_shift_end: 'off_shift',
  agent_break_start: 'on_break',
  agent_break_end: 'idle',
  call_answer: 'on_call',
  call_end: 'idle',
}

export function buildAgentTimelines(events: SimEvent[], peakAgents: number): AgentTimelines {
  const timelines: AgentTimelines = {}
  for (let i = 0; i < peakAgents; i++) {
    // Default: agents start idle at minute 0 (Phase 1 + 2 model: agent pool exists from start)
    timelines[`A${i}`] = [{ timeMin: 0, state: 'idle' }]
  }
  for (const ev of events) {
    if (!ev.agentId) continue
    const state = STATE_FOR[ev.type]
    if (!state) continue
    const tl = timelines[ev.agentId]
    if (!tl) continue
    tl.push({ timeMin: ev.timeMin, state })
  }
  // Sort each agent's timeline by time (events are usually mostly-sorted but not guaranteed)
  for (const key of Object.keys(timelines)) {
    timelines[key].sort((a, b) => a.timeMin - b.timeMin)
  }
  return timelines
}

// Binary search for last entry with timeMin <= t
export function agentStateAt(timeline: AgentTimelineEntry[], simTimeMin: number): AgentVisualState {
  if (timeline.length === 0) return 'idle'
  let lo = 0
  let hi = timeline.length - 1
  if (simTimeMin < timeline[0].timeMin) return timeline[0].state
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (timeline[mid].timeMin <= simTimeMin) lo = mid
    else hi = mid - 1
  }
  return timeline[lo].state
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add lib/animation/agentTimeline.ts tests/animation.test.ts
git commit -m "feat(animation): per-agent timelines with O(log n) state lookup"
```

---

## Task 8: Interval-stats-at-time helper + tests

**Files:**
- Modify: `tests/animation.test.ts` (append)
- Create: `lib/animation/intervalAtTime.ts`

This lets the live KPI strip pull the correct interval's stats based on current sim minute.

- [ ] **Step 1: Append to `tests/animation.test.ts`**

```ts
import { intervalStatsAt } from '@/lib/animation/intervalAtTime'
import type { IntervalStat } from '@/lib/types'

describe('intervalStatsAt', () => {
  const stats: IntervalStat[] = Array.from({ length: 48 }, (_, i) => ({
    sl: i / 47, agents: i, queueLen: 0, abandons: 0, occ: 0.5,
  }))

  it('picks interval 0 for minute 0', () => {
    expect(intervalStatsAt(stats, 0).agents).toBe(0)
  })
  it('picks interval 47 for minute 1439', () => {
    expect(intervalStatsAt(stats, 1439).agents).toBe(47)
  })
  it('picks interval 16 for minute 480 (08:00)', () => {
    expect(intervalStatsAt(stats, 480).agents).toBe(16)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement `lib/animation/intervalAtTime.ts`**

```ts
import type { IntervalStat } from '@/lib/types'
import { intervalIndexForMinute } from '@/lib/curve'

export function intervalStatsAt(perInterval: IntervalStat[], simTimeMin: number): IntervalStat {
  return perInterval[intervalIndexForMinute(simTimeMin)]
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add lib/animation/intervalAtTime.ts tests/animation.test.ts
git commit -m "feat(animation): intervalStatsAt helper for live KPI lookup"
```

---

## Task 9: `useAnimation` hook (rAF playback loop)

**Files:**
- Create: `app/components/cockpit/timeline/useAnimation.ts`

React hook that owns `simTimeMin`, `playing`, `speed`. Drives a `requestAnimationFrame` loop while playing.

- [ ] **Step 1: Create the file**

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { simMinutesPerSec, type Speed } from '@/lib/animation/timeScale'

interface UseAnimationReturn {
  simTimeMin: number
  setSimTimeMin: (n: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  speed: Speed
  setSpeed: (s: Speed) => void
}

export function useAnimation(): UseAnimationReturn {
  const [simTimeMin, setSimTimeMin] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(10)

  const lastFrameRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    if (!playing) {
      lastFrameRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    function tick(now: number) {
      const last = lastFrameRef.current
      lastFrameRef.current = now
      if (last != null) {
        const deltaSec = (now - last) / 1000
        const deltaSimMin = deltaSec * simMinutesPerSec(speedRef.current)
        setSimTimeMin(prev => {
          const next = prev + deltaSimMin
          if (next >= 1440) {
            setPlaying(false)
            return 1440
          }
          return next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing])

  const seek = useCallback((n: number) => {
    setSimTimeMin(Math.max(0, Math.min(1440, n)))
  }, [])

  return {
    simTimeMin,
    setSimTimeMin: seek,
    playing,
    setPlaying,
    speed,
    setSpeed,
  }
}
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/timeline/useAnimation.ts
git commit -m "feat(animation): useAnimation hook with rAF playback"
```

---

## Task 10: `PlayControls` component

**Files:**
- Create: `app/components/cockpit/timeline/PlayControls.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import type { Speed } from '@/lib/animation/timeScale'

interface PlayControlsProps {
  playing: boolean
  speed: Speed
  simTimeMin: number
  onPlayToggle: () => void
  onSpeedChange: (s: Speed) => void
  onReset: () => void
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function PlayControls({ playing, speed, simTimeMin, onPlayToggle, onSpeedChange, onReset }: PlayControlsProps) {
  return (
    <div className="cockpit-play-controls">
      <button type="button" className="cockpit-play-btn" onClick={onPlayToggle}>
        {playing ? '⏸' : '▶'}
      </button>
      <button type="button" className="cockpit-play-btn cockpit-play-btn--small" onClick={onReset} title="Reset to 00:00">
        ⏮
      </button>
      <div className="cockpit-play-time">{fmtTime(simTimeMin)}</div>
      <div className="cockpit-play-speed">
        {([1, 10, 60] as Speed[]).map(s => (
          <button
            key={s}
            type="button"
            className={`cockpit-play-speed-btn ${speed === s ? 'cockpit-play-speed-btn--active' : ''}`}
            onClick={() => onSpeedChange(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/timeline/PlayControls.tsx
git commit -m "feat(timeline): play/pause + speed controls"
```

---

## Task 11: `TimelineScrubber` component

**Files:**
- Create: `app/components/cockpit/timeline/TimelineScrubber.tsx`

A draggable horizontal bar with the demand curve underneath. Drag-or-click to seek.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import type { InjectedEvent } from '@/lib/types'

interface TimelineScrubberProps {
  simTimeMin: number
  curve: number[]                    // length 48, normalized weights
  injectedEvents: InjectedEvent[]
  onSeek: (n: number) => void
}

export function TimelineScrubber({ simTimeMin, curve, injectedEvents, onSeek }: TimelineScrubberProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      onSeek((x / rect.width) * 1440)
    }
    function onUp() { draggingRef.current = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onSeek])

  const max = Math.max(0.001, ...curve)
  const path = curve.map((v, i) => {
    const x = (i / 47) * 600
    const y = 40 - (v / max) * 35
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`
  }).join(' ')
  const cursorX = (simTimeMin / 1440) * 600

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    draggingRef.current = true
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    onSeek((x / rect.width) * 1440)
  }

  return (
    <div className="cockpit-scrubber">
      <svg
        ref={svgRef}
        viewBox="0 0 600 50"
        style={{ width: '100%', height: 50, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
      >
        <path d={path} stroke="#3b82f6" strokeWidth={1.5} fill="none" opacity={0.5} />
        {injectedEvents.map((ev, i) => {
          const x = (ev.fireAtMin / 1440) * 600
          return <line key={i} x1={x} y1={0} x2={x} y2={50} stroke="#ef4444" strokeWidth={1} strokeDasharray="2,2" />
        })}
        <line x1={cursorX} y1={0} x2={cursorX} y2={50} stroke="#fff" strokeWidth={2} />
        <circle cx={cursorX} cy={5} r={4} fill="#fff" />
      </svg>
      <div className="cockpit-scrubber-axis">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/timeline/TimelineScrubber.tsx
git commit -m "feat(timeline): draggable scrubber with demand-curve underlay and event markers"
```

---

## Task 12: `AgentDotCanvas` component

**Files:**
- Create: `app/components/cockpit/agents/AgentDotCanvas.tsx`

Canvas 2D component that renders a grid of dots colored per agent state at the current sim minute.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { SimEvent } from '@/lib/types'
import { agentStateAt, buildAgentTimelines, type AgentVisualState } from '@/lib/animation/agentTimeline'

interface AgentDotCanvasProps {
  events: SimEvent[]
  peakAgents: number
  simTimeMin: number
}

const COLOR: Record<AgentVisualState, string> = {
  idle: '#10b981',     // green
  on_call: '#ef4444',  // red
  on_break: '#64748b', // grey
  off_shift: '#1e293b',// near-bg dim
}

export function AgentDotCanvas({ events, peakAgents, simTimeMin }: AgentDotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const timelines = useMemo(() => buildAgentTimelines(events, peakAgents), [events, peakAgents])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const cssWidth = container.clientWidth
    const cssHeight = container.clientHeight
    canvas.width = cssWidth * dpr
    canvas.height = cssHeight * dpr
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Compute grid layout that fits peakAgents into the canvas with roughly square cells
    const aspect = cssWidth / cssHeight
    const cols = Math.max(1, Math.ceil(Math.sqrt(peakAgents * aspect)))
    const rows = Math.max(1, Math.ceil(peakAgents / cols))
    const cellW = cssWidth / cols
    const cellH = cssHeight / rows
    const radius = Math.max(2, Math.min(cellW, cellH) * 0.35)

    ctx.clearRect(0, 0, cssWidth, cssHeight)
    for (let i = 0; i < peakAgents; i++) {
      const tl = timelines[`A${i}`]
      const state = tl ? agentStateAt(tl, simTimeMin) : 'idle'
      ctx.fillStyle = COLOR[state]
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = (col + 0.5) * cellW
      const cy = (row + 0.5) * cellH
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [timelines, peakAgents, simTimeMin])

  return (
    <div ref={containerRef} className="cockpit-agent-canvas-container">
      <canvas ref={canvasRef} />
    </div>
  )
}
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/agents/AgentDotCanvas.tsx
git commit -m "feat(agents): canvas-rendered agent-dot grid driven by sim time"
```

---

## Task 13: Live KPI strip variant

**Files:**
- Modify: `app/components/cockpit/KpiStrip.tsx`

Extend `KpiStrip` to optionally accept a "live" override that replaces the peak-interval Erlang C calc with stats from the current sim minute. Phase 1 behavior remains the default when no override is passed.

- [ ] **Step 1: Replace `app/components/cockpit/KpiStrip.tsx`** with the version below (preserves Phase 1 default; adds optional `live` prop)

```tsx
'use client'

import { useMemo } from 'react'
import { useScenario } from './ScenarioContext'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents, serviceLevel, avgWait } from '@/lib/erlang'
import type { IntervalStat } from '@/lib/types'

interface KpiStripProps {
  /** When provided, KPIs reflect the live sim at the given moment instead of peak Erlang C. */
  live?: { stats: IntervalStat; abandons: number } | null
}

export function KpiStrip({ live = null }: KpiStripProps = {}) {
  const { scenario } = useScenario()

  const kpis = useMemo(() => {
    if (live) {
      return {
        N: live.stats.agents,
        scheduled: live.stats.agents,
        sl: live.stats.sl,
        occ: live.stats.occ,
        asa: 0,
        abandons: live.abandons,
      }
    }
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const peakIdx = calls.indexOf(Math.max(...calls))
    const peakCalls = calls[peakIdx]
    if (peakCalls <= 0) return { N: 0, scheduled: 0, sl: 1, occ: 0, asa: 0, abandons: 0 }
    const { N, A } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    const sl = serviceLevel(N, A, scenario.aht, scenario.asa)
    const occ = Math.min(1, A / N)
    const asa = avgWait(N, A, scenario.aht)
    return { N, scheduled, sl, occ, asa, abandons: 0 }
  }, [scenario, live])

  return (
    <div className="cockpit-kpi-strip">
      <Kpi label={live ? 'Active agents' : 'Erlang C agents'} value={String(kpis.N)} />
      <Kpi label="Scheduled HC"    value={String(kpis.scheduled)} />
      <Kpi label="Service Level"   value={`${(kpis.sl * 100).toFixed(1)}%`} accent="green" />
      <Kpi label="Occupancy"       value={`${(kpis.occ * 100).toFixed(1)}%`} accent="amber" />
      <Kpi label={live ? 'Abandons' : 'Avg ASA'} value={live ? String(kpis.abandons) : `${Math.round(kpis.asa)}s`} />
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'amber' }) {
  return (
    <div className="cockpit-kpi">
      <div className="cockpit-kpi-label">{label}</div>
      <div className={`cockpit-kpi-value cockpit-kpi-${accent ?? 'neutral'}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify tsc + tests**

```bash
npx tsc --noEmit && npm test
```

Expected: all green. The Phase 1 callsite (`<KpiStrip />`) still works because `live` defaults to null.

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/KpiStrip.tsx
git commit -m "feat(kpi): optional live override for sim-time KPIs"
```

---

## Task 14: Replace `LiveSimTab` with the full live sim

**Files:**
- Modify: `app/components/cockpit/tabs/LiveSimTab.tsx`
- Modify: `app/components/cockpit/Cockpit.tsx` (pass live KPI through)

Replace the Phase 1 pipe-prove placeholder with the full animated experience.

- [ ] **Step 1: Replace `app/components/cockpit/tabs/LiveSimTab.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runDayInWorker } from '@/app/workers/kernelClient'
import type { IntervalStat, Scenario, SimResult } from '@/lib/types'
import { useAnimation } from '../timeline/useAnimation'
import { PlayControls } from '../timeline/PlayControls'
import { TimelineScrubber } from '../timeline/TimelineScrubber'
import { AgentDotCanvas } from '../agents/AgentDotCanvas'
import { intervalStatsAt } from '@/lib/animation/intervalAtTime'

interface LiveData {
  stats: IntervalStat
  abandons: number
}

export interface LiveSimTabProps {
  onLiveChange?: (live: LiveData | null) => void
}

export function LiveSimTab({ onLiveChange }: LiveSimTabProps = {}) {
  const { scenario } = useScenario()
  const [result, setResult] = useState<SimResult | null>(null)
  const [shownScenario, setShownScenario] = useState<Scenario | null>(null)
  const { simTimeMin, setSimTimeMin, playing, setPlaying, speed, setSpeed } = useAnimation()

  const running = scenario !== shownScenario

  // Re-run kernel when scenario changes (incl. injectedEvents)
  useEffect(() => {
    let cancelled = false
    runDayInWorker(scenario).then(r => {
      if (cancelled) return
      setResult(r)
      setShownScenario(scenario)
    })
    return () => { cancelled = true }
  }, [scenario])

  // Compute live stats and bubble up so KpiStrip in the cockpit can show them
  useEffect(() => {
    if (!result || !onLiveChange) return
    const stats = intervalStatsAt(result.perInterval, simTimeMin)
    let abandons = 0
    for (const e of result.events) {
      if (e.type === 'call_abandon' && e.timeMin <= simTimeMin) abandons++
    }
    onLiveChange({ stats, abandons })
    return () => onLiveChange(null)
  }, [result, simTimeMin, onLiveChange])

  const peakAgents = result ? Math.max(1, ...result.perInterval.map(s => s.agents)) : 1

  return (
    <div className="cockpit-viewport cockpit-live-viewport">
      <div className="cockpit-viewport-header">
        <span>Live Sim · time machine</span>
        <span className="cockpit-viewport-sub">
          {running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}% · abandons: ${result?.totals.abandons ?? 0}`}
        </span>
      </div>

      <div className="cockpit-viewport-body">
        <div className="cockpit-agent-canvas-frame">
          {result
            ? <AgentDotCanvas events={result.events} peakAgents={peakAgents} simTimeMin={simTimeMin} />
            : <div className="cockpit-placeholder"><p>Loading sim…</p></div>}
        </div>

        <div className="cockpit-timeline">
          <PlayControls
            playing={playing}
            speed={speed}
            simTimeMin={simTimeMin}
            onPlayToggle={() => setPlaying(!playing)}
            onSpeedChange={setSpeed}
            onReset={() => setSimTimeMin(0)}
          />
          <TimelineScrubber
            simTimeMin={simTimeMin}
            curve={scenario.curve}
            injectedEvents={scenario.injectedEvents}
            onSeek={setSimTimeMin}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `app/components/cockpit/Cockpit.tsx` to thread the live KPI through**

Replace the file with:

```tsx
'use client'

import { useState } from 'react'
import { ScenarioProvider } from './ScenarioContext'
import { Header, type TabKey } from './Header'
import { Sidebar } from './Sidebar'
import { KpiStrip } from './KpiStrip'
import { LiveSimTab, type LiveSimTabProps } from './tabs/LiveSimTab'
import { MonteCarloTab } from './tabs/MonteCarloTab'
import { RosterTab } from './tabs/RosterTab'
import { ClassicTab } from './tabs/ClassicTab'
import type { IntervalStat } from '@/lib/types'

export function Cockpit() {
  const [tab, setTab] = useState<TabKey>('live')
  const [live, setLive] = useState<{ stats: IntervalStat; abandons: number } | null>(null)

  const liveProps: LiveSimTabProps = { onLiveChange: setLive }

  return (
    <ScenarioProvider>
      <div className="cockpit">
        <Header active={tab} onChange={setTab} />
        <div className="cockpit-body">
          <Sidebar />
          <main className="cockpit-main">
            {tab === 'live'    && <LiveSimTab {...liveProps} />}
            {tab === 'monte'   && <MonteCarloTab />}
            {tab === 'roster'  && <RosterTab />}
            {tab === 'classic' && <ClassicTab />}
          </main>
        </div>
        <KpiStrip live={tab === 'live' ? live : null} />
      </div>
    </ScenarioProvider>
  )
}
```

- [ ] **Step 3: Run tests + build + dev**

```bash
npm test           # 26 tests + new ones from this phase, all passing
npm run build      # succeeds
npm run dev        # check the live sim manually
```

Manually verify in browser:
- Live Sim tab shows the agent-dot canvas
- Press play — dots flicker red/green/grey as the sim plays
- Speed buttons switch (1× ~60s/day, 10× ~6s, 60× ~1s)
- Scrubber drags
- KPI strip on Live tab shows "Active agents" / "Abandons" labels (live mode); other tabs show Phase 1 labels

- [ ] **Step 4: Commit**

```bash
git add app/components/cockpit/tabs/LiveSimTab.tsx app/components/cockpit/Cockpit.tsx
git commit -m "feat(live-sim): replace pipe-prove with animated agent grid + scrubber"
```

End of Sub-phase B. The full live sim works.

---

# Sub-phase C — Event Injection (Tasks 15–19)

## Task 15: Add inject methods to ScenarioContext

**Files:**
- Modify: `app/components/cockpit/ScenarioContext.tsx`

- [ ] **Step 1: Replace `app/components/cockpit/ScenarioContext.tsx`** with the version below

```tsx
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Scenario, CampaignKey, HoopWindow, InjectedEvent } from '@/lib/types'
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
  addInjection: (ev: InjectedEvent) => void
  clearInjections: () => void
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
  const addInjection = useCallback((ev: InjectedEvent) => {
    setScenario(s => ({ ...s, injectedEvents: [...s.injectedEvents, ev] }))
  }, [])
  const clearInjections = useCallback(() => setScenario(s => ({ ...s, injectedEvents: [] })), [])

  return (
    <ScenarioContext.Provider value={{
      scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed,
      addInjection, clearInjections,
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

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/ScenarioContext.tsx
git commit -m "feat(scenario): addInjection / clearInjections methods"
```

---

## Task 16: Event preset definitions

**Files:**
- Create: `app/components/cockpit/inject/eventPresets.ts`

- [ ] **Step 1: Create the file**

```ts
import type { InjectedEvent } from '@/lib/types'

export interface EventPreset {
  id: 'surge' | 'outage' | 'typhoon' | 'flash_absent'
  label: string
  emoji: string
  description: string
  build: (fireAtMin: number) => InjectedEvent
}

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'surge',
    label: 'Surge',
    emoji: '🌪',
    description: '+30% volume for 2 hours',
    build: fireAtMin => ({ type: 'volume_surge', fireAtMin, durationMin: 120, magnitude: 0.3 }),
  },
  {
    id: 'outage',
    label: 'Outage',
    emoji: '📞',
    description: 'AHT doubles for 1 hour',
    build: fireAtMin => ({ type: 'aht_spike', fireAtMin, durationMin: 60, magnitude: 1.0 }),
  },
  {
    id: 'typhoon',
    label: 'Typhoon',
    emoji: '🌀',
    description: '−25% staff for the rest of the day',
    build: fireAtMin => ({ type: 'staff_drop', fireAtMin, magnitude: 0.25 }),
  },
  {
    id: 'flash_absent',
    label: 'Flash absent',
    emoji: '🚨',
    description: '−15 agents instantly',
    build: fireAtMin => ({ type: 'flash_absent', fireAtMin, magnitude: 15 }),
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/inject/eventPresets.ts
git commit -m "feat(inject): four preset event definitions"
```

---

## Task 17: `InjectEventModal` component

**Files:**
- Create: `app/components/cockpit/inject/InjectEventModal.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect } from 'react'
import { EVENT_PRESETS } from './eventPresets'

interface InjectEventModalProps {
  open: boolean
  fireAtMin: number
  onClose: () => void
  onPick: (preset: typeof EVENT_PRESETS[number]) => void
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function InjectEventModal({ open, fireAtMin, onClose, onPick }: InjectEventModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="cockpit-modal-backdrop" onClick={onClose}>
      <div className="cockpit-modal" onClick={e => e.stopPropagation()}>
        <div className="cockpit-modal-title">Inject event at {fmtTime(fireAtMin)}</div>
        <div className="cockpit-modal-list">
          {EVENT_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className="cockpit-modal-item"
              onClick={() => { onPick(p); onClose() }}
            >
              <span className="cockpit-modal-item-emoji">{p.emoji}</span>
              <span className="cockpit-modal-item-label">{p.label}</span>
              <span className="cockpit-modal-item-desc">{p.description}</span>
            </button>
          ))}
        </div>
        <button type="button" className="cockpit-modal-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/inject/InjectEventModal.tsx
git commit -m "feat(inject): event modal with preset picker"
```

---

## Task 18: Wire inject modal into Sidebar + bridge to LiveSimTab's current sim time

**Files:**
- Modify: `app/components/cockpit/Sidebar.tsx`
- Modify: `app/components/cockpit/Cockpit.tsx`
- Modify: `app/components/cockpit/tabs/LiveSimTab.tsx`

The sidebar opens the modal. The modal needs the current sim time (so injection fires at the time the user is at on the scrubber). We pass current sim time up via the same `onLiveChange` callback that already bubbles live KPI data.

- [ ] **Step 1: Extend the live-data callback to include `simTimeMin`**

In `app/components/cockpit/tabs/LiveSimTab.tsx`, change the `LiveData` shape and the call:

Find:

```ts
interface LiveData {
  stats: IntervalStat
  abandons: number
}

export interface LiveSimTabProps {
  onLiveChange?: (live: LiveData | null) => void
}
```

Replace with:

```ts
interface LiveData {
  stats: IntervalStat
  abandons: number
  simTimeMin: number
}

export interface LiveSimTabProps {
  onLiveChange?: (live: LiveData | null) => void
}
```

Then in the effect that bubbles up live data, include `simTimeMin`:

```tsx
useEffect(() => {
  if (!result || !onLiveChange) return
  const stats = intervalStatsAt(result.perInterval, simTimeMin)
  let abandons = 0
  for (const e of result.events) {
    if (e.type === 'call_abandon' && e.timeMin <= simTimeMin) abandons++
  }
  onLiveChange({ stats, abandons, simTimeMin })
  return () => onLiveChange(null)
}, [result, simTimeMin, onLiveChange])
```

- [ ] **Step 2: Update `app/components/cockpit/Cockpit.tsx`** to also pass `simTimeMin` down through context-of-component-state to the Sidebar.

The cleanest approach is to lift the live state into Cockpit and pass `liveSimTimeMin` to the Sidebar via a ref or prop. Use a prop:

```tsx
'use client'

import { useState } from 'react'
import { ScenarioProvider } from './ScenarioContext'
import { Header, type TabKey } from './Header'
import { Sidebar } from './Sidebar'
import { KpiStrip } from './KpiStrip'
import { LiveSimTab, type LiveSimTabProps } from './tabs/LiveSimTab'
import { MonteCarloTab } from './tabs/MonteCarloTab'
import { RosterTab } from './tabs/RosterTab'
import { ClassicTab } from './tabs/ClassicTab'
import type { IntervalStat } from '@/lib/types'

interface LiveData {
  stats: IntervalStat
  abandons: number
  simTimeMin: number
}

export function Cockpit() {
  const [tab, setTab] = useState<TabKey>('live')
  const [live, setLive] = useState<LiveData | null>(null)

  const liveProps: LiveSimTabProps = { onLiveChange: setLive }
  const simTimeMin = live?.simTimeMin ?? 0

  return (
    <ScenarioProvider>
      <div className="cockpit">
        <Header active={tab} onChange={setTab} />
        <div className="cockpit-body">
          <Sidebar currentSimTimeMin={tab === 'live' ? simTimeMin : 0} />
          <main className="cockpit-main">
            {tab === 'live'    && <LiveSimTab {...liveProps} />}
            {tab === 'monte'   && <MonteCarloTab />}
            {tab === 'roster'  && <RosterTab />}
            {tab === 'classic' && <ClassicTab />}
          </main>
        </div>
        <KpiStrip live={tab === 'live' && live ? { stats: live.stats, abandons: live.abandons } : null} />
      </div>
    </ScenarioProvider>
  )
}
```

- [ ] **Step 3: Update `app/components/cockpit/Sidebar.tsx`**

Replace the file with the version below. Adds the modal state, accepts `currentSimTimeMin`, wires the inject button to open the modal, and dispatches the chosen preset to `addInjection`.

```tsx
'use client'

import { useState } from 'react'
import { useScenario } from './ScenarioContext'
import { campaigns } from '@/lib/campaigns'
import { HoopSlider } from './controls/HoopSlider'
import { CurveEditor } from './controls/CurveEditor'
import { DailyTotalInput } from './controls/DailyTotalInput'
import { SliderRow } from './controls/SliderRow'
import { InjectEventModal } from './inject/InjectEventModal'
import type { CampaignKey } from '@/lib/types'

interface SidebarProps {
  currentSimTimeMin: number
}

export function Sidebar({ currentSimTimeMin }: SidebarProps) {
  const { scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, addInjection, clearInjections } = useScenario()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <aside className="cockpit-sidebar">

      <div className="cockpit-section">
        <div className="cockpit-section-label">Scenario</div>
        <select
          className="cockpit-select"
          value={scenario.campaignKey}
          onChange={e => setCampaign(e.target.value as CampaignKey)}
        >
          {Object.values(campaigns).map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">HOOP</div>
        <HoopSlider value={scenario.hoop} onChange={setHoop} />
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">Intraday curve</div>
        <DailyTotalInput value={scenario.dailyTotal} onChange={setDailyTotal} />
        <CurveEditor curve={scenario.curve} hoop={scenario.hoop} onChange={setCurve} />
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">Inputs</div>
        <SliderRow label="AHT (s)"        value={scenario.aht}    min={120} max={900}  step={10} onChange={v => setNumeric('aht', v)} />
        <SliderRow label="SL target (%)"  value={scenario.sl}     min={60}  max={95}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('sl', v)} />
        <SliderRow label="SL threshold"   value={scenario.asa}    min={10}  max={60}   step={1}  format={v => `${v}s`}   onChange={v => setNumeric('asa', v)} />
        <SliderRow label="Shrinkage (%)"  value={scenario.shrink} min={10}  max={45}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('shrink', v)} />
        <SliderRow label="Absent. (%)"    value={scenario.abs}    min={0}   max={20}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('abs', v)} />
      </div>

      {scenario.injectedEvents.length > 0 && (
        <div className="cockpit-section">
          <div className="cockpit-section-label">Active injections ({scenario.injectedEvents.length})</div>
          <button type="button" className="cockpit-clear-injections" onClick={clearInjections}>Clear all</button>
        </div>
      )}

      <button
        type="button"
        className="cockpit-inject-btn"
        onClick={() => setModalOpen(true)}
      >
        ⚡ Inject event…
      </button>

      <InjectEventModal
        open={modalOpen}
        fireAtMin={currentSimTimeMin}
        onClose={() => setModalOpen(false)}
        onPick={preset => addInjection(preset.build(currentSimTimeMin))}
      />

    </aside>
  )
}
```

- [ ] **Step 4: tsc + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/Sidebar.tsx app/components/cockpit/Cockpit.tsx app/components/cockpit/tabs/LiveSimTab.tsx
git commit -m "feat(inject): wire sidebar button → modal → addInjection"
```

---

## Task 19: CSS for timeline + agent canvas + modal

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append to `app/globals.css`** at the very end of the file

```css
/* ───────── Cockpit Phase 2 ───────── */

/* Live viewport layout */
.cockpit-live-viewport .cockpit-viewport-body {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.75rem;
  min-height: 0;
}

.cockpit-agent-canvas-frame {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.75rem;
  min-height: 240px;
  overflow: hidden;
}
.cockpit-agent-canvas-container {
  width: 100%;
  height: 100%;
  min-height: 220px;
}

/* Timeline */
.cockpit-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}

.cockpit-play-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.cockpit-play-btn {
  background: #3b82f6;
  border: 0;
  color: #fff;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 600;
}
.cockpit-play-btn--small { background: #334155; }
.cockpit-play-time { font-variant-numeric: tabular-nums; opacity: 0.85; }
.cockpit-play-speed { display: flex; gap: 0.2rem; margin-left: auto; }
.cockpit-play-speed-btn {
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.cockpit-play-speed-btn--active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.cockpit-scrubber svg { display: block; cursor: ew-resize; }
.cockpit-scrubber-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  opacity: 0.5;
  margin-top: 0.25rem;
}

/* Inject modal */
.cockpit-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.cockpit-modal {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 1rem;
  width: min(440px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cockpit-modal-title { font-weight: 700; }
.cockpit-modal-list { display: flex; flex-direction: column; gap: 0.4rem; }
.cockpit-modal-item {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  text-align: left;
  cursor: pointer;
  color: #e2e8f0;
}
.cockpit-modal-item:hover { background: #15233a; }
.cockpit-modal-item-emoji { font-size: 1.1rem; }
.cockpit-modal-item-label { font-weight: 600; }
.cockpit-modal-item-desc { opacity: 0.6; font-size: 0.8rem; }
.cockpit-modal-cancel {
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  align-self: flex-end;
}

/* Clear-injections button */
.cockpit-clear-injections {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  font-size: 0.7rem;
  cursor: pointer;
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(css): timeline, agent canvas, and inject modal styles"
```

End of Sub-phase C.

---

# Final tasks

## Task 20: End-to-end manual verification

**Files:** none

- [ ] **Step 1: Run automated checks**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all green for new code (the 7 pre-existing `/learn` lint errors persist; do not fix them in this PR).

- [ ] **Step 2: Run dev server, verify in a browser**

```bash
npm run dev
```

Open the local URL. Verify:

- Live Sim tab is the default. Agent dot canvas renders (mostly idle/green at 00:00).
- Press play. Dots animate. After a few wall seconds, lots of red. KPI strip updates ("Active agents", "Service Level", "Abandons").
- Switch speed to 60×. Day completes in ~1 second.
- Press reset (⏮). Time goes back to 00:00.
- Drag the scrubber. Dots and KPI strip jump to that time.
- Click "⚡ Inject event…". Modal opens. Pick "🌪 Surge". Modal closes.
- Curve scrubber shows a red dashed marker at the inject time. Resume play. After the marker, queue grows and you see more red dots.
- Switch to Classic tab. Original WFMDemo intact.
- Switch to Monte Carlo / Roster tabs. Phase 3/4 placeholders.
- /learn unchanged.

- [ ] **Step 3: Final cleanup commit if any tweaks happened**

```bash
git status
# If anything was tweaked:
git add -A
git commit -m "chore: phase 2 verification cleanups"
```

Otherwise skip.

## Task 21: Branch handoff

**Files:** none

This is the wrap step — equivalent of the Phase 1 "open the PR" step but, per project preferences, we are NOT pushing automatically. Just confirm the branch is clean and ready for the human to push when they want.

- [ ] **Step 1: Confirm branch state**

```bash
git status
git log --oneline feat/cockpit-phase1..HEAD
```

Expected output: clean working tree, ~21 commits on `feat/cockpit-phase2` since branching from Phase 1.

- [ ] **Step 2: Print summary**

Print this to the terminal so the human has a record:

```
Phase 2 complete on feat/cockpit-phase2.
- Kernel v2: abandons + breaks + injection
- Animation engine: rAF playback, scrubber, speed, agent-dot canvas
- Event injection: 4 presets via sidebar modal
- Tests passing, build green, lint green for new code
```

---

## Self-review

**Spec coverage (Phase 2 row):**

| Spec requirement | Covered by |
| --- | --- |
| Canvas-based agent-dot grid | Task 12 |
| Play / pause / speed controls | Tasks 9, 10 |
| Timeline scrubber synced to event log | Task 11 |
| Live KPI strip pulled from streaming sim events | Task 13, 14 |
| Event injection (Surge/Outage/Typhoon/Flash absent/Custom) | Tasks 15–18 |
| Kernel v2: abandons, breaks, ACW | Tasks 3–5 (ACW already in Phase 1 v1 kernel) |

The spec mentions "Custom" as a preset. Phase 2 does not implement a "Custom" generic event in `eventPresets.ts`; users use the four presets above. A "Custom" event-builder is left for a future iteration — flagged here as a deliberate scope cut. If pushback during review, add a fifth preset that opens a sub-modal with magnitude/duration sliders.

**Type consistency check:**
- `Scenario.injectedEvents: InjectedEvent[]` defined in Task 1, used in Tasks 5 (kernel), 11 (scrubber markers), 15 (context), 18 (sidebar). All consistent.
- `Speed` type defined in Task 6, used in Tasks 9, 10. Consistent.
- `LiveData` shape defined in Task 14 (`{stats, abandons}`), extended in Task 18 (`{stats, abandons, simTimeMin}`). The Task 14 shape is changed to the Task 18 shape inline; nothing references the old shape.
- `EventPreset` defined in Task 16, used in Tasks 17, 18. Consistent.

**Placeholder scan:** every code step has full code; every test step has full test code; every command has expected output where relevant.

**Open question for review:** the breaks model is approximate (one 15-min break per agent at a random time within HOOP, ignoring per-shift mechanics). When Phase 4 lands real rosters, this scheduling moves into the optimizer and `lib/kernel/breaks.ts` becomes obsolete or migrates to a fallback. Worth noting in the Phase 4 plan.

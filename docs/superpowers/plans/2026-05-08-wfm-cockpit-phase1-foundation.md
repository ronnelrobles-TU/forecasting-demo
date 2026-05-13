# WFM Cockpit — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing single-page WFM demo with the cockpit shell — header + tabs + sidebar (campaign / HOOP / draggable curve / sliders) + KPI strip — wired to a tested Erlang C math module and the existing chart preserved as the "Classic" tab. Lay the groundwork (types, campaigns, kernel scaffold) for Phases 2–4.

**Architecture:** Next.js 16 static export (no backend). React 19 + TypeScript 5. Scenario state in a single React context. Pure-TS math/kernel modules in `lib/` with no DOM deps. Web Worker scaffold prepared (kernel runs on it from Phase 1 onward, even though full live animation lands in Phase 2). Vitest for unit tests on math/kernel modules.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, Chart.js 4, Vitest (new), seedrandom (new), native Web Workers (no library).

**Spec reference:** [docs/superpowers/specs/2026-05-08-wfm-cockpit-design.md](../specs/2026-05-08-wfm-cockpit-design.md)

---

## File Structure

This phase creates and modifies these files. Each file has one focused responsibility.

**New `lib/` (pure TS, no React/DOM):**
- `lib/types.ts` — All shared types (`Campaign`, `Scenario`, `Shift`, `SimEvent`, `SimResult`, `InjectedEvent`)
- `lib/campaigns.ts` — Five campaign presets, each with `hoop` + `curveTemplate` + existing fields
- `lib/erlang.ts` — `erlangC`, `serviceLevel`, `avgWait`, `requiredAgents` ported from current `WFMDemo.tsx` with tests
- `lib/curve.ts` — Curve utilities (HOOP truncation, normalization, calls-per-interval)
- `lib/rng.ts` — Seeded RNG wrapper around `seedrandom`
- `lib/kernel/index.ts` — Public API (`runDay`, eventually `runMonteCarlo`, `optimizeRoster`)
- `lib/kernel/sim.ts` — DES kernel v1 (Poisson arrivals, log-normal AHT, simple FSM, NO abandons/breaks yet — those come in Phase 2)

**New `app/components/cockpit/`:**
- `Cockpit.tsx` — Top-level container; owns `ScenarioProvider` + tab state
- `Header.tsx` — Title + 4 tabs + Learn link
- `Sidebar.tsx` — Composes the campaign picker + HOOP + curve + sliders + inject-event button (button is disabled in Phase 1)
- `KpiStrip.tsx` — Bottom strip; reads from scenario, computes via Erlang C
- `ScenarioContext.tsx` — Context + provider + `useScenario()` hook
- `controls/HoopSlider.tsx` — Dual-thumb range
- `controls/CurveEditor.tsx` — SVG with draggable handles
- `controls/DailyTotalInput.tsx` — Numeric input
- `controls/SliderRow.tsx` — Generic labeled slider (DRY for AHT/SL/asa/shrink/abs)
- `tabs/LiveSimTab.tsx` — Placeholder ("Live simulation arrives in Phase 2") — but **runs the kernel once via the Worker** and shows the resulting per-interval SL chart, proving the pipe works
- `tabs/MonteCarloTab.tsx` — Placeholder
- `tabs/RosterTab.tsx` — Placeholder
- `tabs/ClassicTab.tsx` — Renders existing `WFMDemo` (kept intact)

**New `app/workers/`:**
- `kernel.worker.ts` — Web Worker wrapping `lib/kernel`
- `kernelClient.ts` — UI-side helper that posts a Scenario to the worker and resolves with `SimResult`

**New `tests/`:**
- `tests/erlang.test.ts`
- `tests/curve.test.ts`
- `tests/kernel.test.ts`

**Modified:**
- `app/page.tsx` — Now renders `<Cockpit />` instead of `<WFMDemo />`
- `app/components/WFMDemo.tsx` — Untouched (it's the Classic tab content)
- `app/globals.css` — Add cockpit dark theme classes
- `package.json` — Add `vitest`, `@vitest/ui`, `jsdom`, `seedrandom`, `@types/seedrandom` and a `test` script
- `next.config.ts` — May need a small tweak for Worker support (verified against `node_modules/next/dist/docs/`)

**Untouched:**
- `app/learn/page.tsx`
- `app/components/Nav.tsx`
- `app/layout.tsx`

---

## Conventions used throughout

- **Branch:** Work on a feature branch `feat/cockpit-phase1`. Create it before Task 1.
- **Commits:** Conventional commits (`feat:`, `test:`, `refactor:`, `chore:`). One commit per task end.
- **Type imports:** Use `import type { ... }` for types-only imports.
- **Path alias:** Use `@/` for project-root-relative imports per existing `tsconfig.json` (already configured).
- **Dark theme classes:** Use the `cockpit-` prefix (e.g. `cockpit-sidebar`, `cockpit-tab`).

---

## Task 0: Branch + branch hygiene

**Files:**
- None

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/cockpit-phase1
```

- [ ] **Step 2: Confirm clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

---

## Task 1: Install Vitest, seedrandom, and configure tests

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add devDeps + scripts)
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev vitest @vitest/ui jsdom @types/seedrandom
npm install seedrandom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [ ] **Step 3: Add scripts to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 4: Write a smoke test**

`tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "chore: add vitest + seedrandom"
```

---

## Task 2: Define shared types in `lib/types.ts`

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create `lib/types.ts`**

```ts
export type CampaignKey =
  | 'us_telco_manila'
  | 'au_retail_cebu'
  | 'uk_fintech_manila'
  | 'us_healthcare_clark'
  | 'ph_telco_davao'

export interface HoopWindow {
  startMin: number  // minutes from midnight (0..1440)
  endMin: number    // exclusive; e.g. 1320 = 22:00
}

export interface Campaign {
  key: CampaignKey
  label: string
  hoop: HoopWindow
  curveTemplate: number[]  // length 48; relative weights per 30-min interval
  dailyTotal: number       // total calls/day
  aht: number              // seconds
  sl: number               // 0..100 target percent
  asa: number              // SL threshold seconds
  shrink: number           // 0..100
  abs: number              // 0..100
  rules: string
}

export interface Shift {
  id: string
  agentId: string
  startMin: number
  endMin: number
  breaks: { startMin: number; durationMin: number }[]
}

export interface Scenario {
  campaignKey: CampaignKey
  hoop: HoopWindow
  curve: number[]             // length 48; intervals outside HOOP forced to 0
  dailyTotal: number
  aht: number
  sl: number
  asa: number
  shrink: number
  abs: number
  roster: Shift[] | null      // null → kernel derives from Erlang C
  rngSeed: number
}

export type SimEventType =
  | 'call_arrive'
  | 'call_answer'
  | 'call_end'
  | 'call_abandon'
  | 'agent_break_start'
  | 'agent_break_end'
  | 'agent_shift_start'
  | 'agent_shift_end'
  | 'event_inject'

export interface SimEvent {
  timeMin: number
  type: SimEventType
  agentId?: string
  callId?: string
  waitMs?: number
  payload?: Record<string, unknown>
}

export interface IntervalStat {
  sl: number
  agents: number
  queueLen: number
  abandons: number
  occ: number
}

export interface SimResult {
  perInterval: IntervalStat[]   // length 48
  events: SimEvent[]
  totals: {
    sl: number
    occ: number
    asa: number
    abandons: number
    cost: number
  }
}

export interface InjectedEvent {
  fireAtMin: number
  type: 'volume_surge' | 'aht_spike' | 'staff_drop' | 'flash_absent' | 'custom'
  durationMin?: number
  magnitude: number
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared types for cockpit data model"
```

---

## Task 3: Port + extend campaign presets

**Files:**
- Create: `lib/campaigns.ts`

- [ ] **Step 1: Create `lib/campaigns.ts`**

```ts
import type { Campaign, CampaignKey } from './types'

// Build a 48-interval curve from three Gaussian peaks with given weights/positions.
// Returns relative weights (not normalized) — the kernel normalizes at use time.
function makeCurve(peaks: { hour: number; sigma: number; weight: number }[]): number[] {
  return Array.from({ length: 48 }, (_, i) => {
    const h = i / 2
    return peaks.reduce((acc, p) => acc + p.weight * Math.exp(-Math.pow((h - p.hour) / p.sigma, 2)), 0.05)
  })
}

export const campaigns: Record<CampaignKey, Campaign> = {
  us_telco_manila: {
    key: 'us_telco_manila',
    label: 'US Telco Inbound – Manila',
    hoop: { startMin: 0, endMin: 1440 },                                  // 24/7
    curveTemplate: makeCurve([
      { hour: 10, sigma: 2.2, weight: 1.0 },
      { hour: 15, sigma: 2.4, weight: 0.85 },
      { hour: 20, sigma: 2.0, weight: 0.45 },
    ]),
    dailyTotal: 12400,
    aht: 420, sl: 80, asa: 20, shrink: 32, abs: 9,
    rules: 'Voice inbound · Tier 1 troubleshoot · 24/7 follow-the-sun · ESL premium tagging',
  },
  au_retail_cebu: {
    key: 'au_retail_cebu',
    label: 'AU Retail Chat – Cebu',
    hoop: { startMin: 360, endMin: 1320 },                                // 06:00–22:00
    curveTemplate: makeCurve([
      { hour: 11, sigma: 2.0, weight: 1.0 },
      { hour: 17, sigma: 2.0, weight: 0.9 },
    ]),
    dailyTotal: 5800,
    aht: 240, sl: 85, asa: 30, shrink: 28, abs: 7,
    rules: 'Chat (2 concurrent) · AEST coverage · holiday surge model · post-sales focus',
  },
  uk_fintech_manila: {
    key: 'uk_fintech_manila',
    label: 'UK Fintech Voice – Manila',
    hoop: { startMin: 540, endMin: 1080 },                                // 09:00–18:00
    curveTemplate: makeCurve([
      { hour: 11, sigma: 1.8, weight: 1.0 },
      { hour: 14, sigma: 1.8, weight: 0.95 },
    ]),
    dailyTotal: 7600,
    aht: 540, sl: 90, asa: 15, shrink: 35, abs: 8,
    rules: 'Voice · KYC compliance · GMT coverage · senior-tier only · strict QA',
  },
  us_healthcare_clark: {
    key: 'us_healthcare_clark',
    label: 'US Healthcare – Clark',
    hoop: { startMin: 480, endMin: 1260 },                                // 08:00–21:00 (split EST/CST coverage)
    curveTemplate: makeCurve([
      { hour: 10, sigma: 2.2, weight: 1.0 },
      { hour: 14, sigma: 2.2, weight: 0.95 },
      { hour: 18, sigma: 2.0, weight: 0.7 },
    ]),
    dailyTotal: 4400,
    aht: 600, sl: 90, asa: 30, shrink: 38, abs: 10,
    rules: 'Voice · HIPAA · EST/CST split · seasonal Q4 enrollment surge',
  },
  ph_telco_davao: {
    key: 'ph_telco_davao',
    label: 'PH Telco Local – Davao',
    hoop: { startMin: 360, endMin: 1320 },                                // 06:00–22:00
    curveTemplate: makeCurve([
      { hour: 9, sigma: 1.8, weight: 1.0 },
      { hour: 16, sigma: 2.4, weight: 0.85 },
    ]),
    dailyTotal: 14800,
    aht: 300, sl: 75, asa: 25, shrink: 30, abs: 12,
    rules: 'Voice · Bisaya/Tagalog dual · local hours · weather-event flex (typhoon)',
  },
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/campaigns.ts
git commit -m "feat: add campaign presets with HOOP and curve templates"
```

---

## Task 4: Port Erlang C math with tests

**Files:**
- Create: `tests/erlang.test.ts`
- Create: `lib/erlang.ts`

- [ ] **Step 1: Write failing tests in `tests/erlang.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { erlangC, serviceLevel, avgWait, requiredAgents } from '@/lib/erlang'

describe('erlangC', () => {
  it('returns 1 when N <= A (saturated)', () => {
    expect(erlangC(5, 5)).toBe(1)
    expect(erlangC(3, 8)).toBe(1)
  })

  it('drops as N grows above A', () => {
    const a = erlangC(10, 8)
    const b = erlangC(15, 8)
    expect(b).toBeLessThan(a)
    expect(b).toBeGreaterThan(0)
  })

  it('produces a probability between 0 and 1', () => {
    const p = erlangC(20, 12)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThanOrEqual(1)
  })
})

describe('serviceLevel', () => {
  it('returns 0 when undermanned', () => {
    expect(serviceLevel(5, 8, 360, 20)).toBe(0)
  })

  it('approaches 1 as agents grow', () => {
    const lo = serviceLevel(10, 8, 360, 20)
    const hi = serviceLevel(40, 8, 360, 20)
    expect(hi).toBeGreaterThan(lo)
    expect(hi).toBeLessThanOrEqual(1)
  })
})

describe('avgWait', () => {
  it('returns large sentinel when undermanned', () => {
    expect(avgWait(5, 8, 360)).toBe(999)
  })

  it('shrinks as agents grow', () => {
    const lo = avgWait(10, 8, 360)
    const hi = avgWait(30, 8, 360)
    expect(hi).toBeLessThan(lo)
  })
})

describe('requiredAgents', () => {
  // 450 calls/30min, AHT 360s, SL 80%/20s → spec example, expect ~97 agents
  it('matches the spec worked example (within 1)', () => {
    const { N, A } = requiredAgents(450, 360, 0.8, 20)
    expect(A).toBeCloseTo(90, 1)
    expect(N).toBeGreaterThanOrEqual(96)
    expect(N).toBeLessThanOrEqual(98)
  })

  it('caps at 5000 to avoid infinite loops', () => {
    const { N } = requiredAgents(50000, 360, 0.99, 5)
    expect(N).toBeLessThanOrEqual(5000)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures with `Cannot find module '@/lib/erlang'`.

- [ ] **Step 3: Implement `lib/erlang.ts`**

```ts
export function erlangC(N: number, A: number): number {
  if (N <= A) return 1
  let sum = 0
  let term = 1
  for (let k = 0; k < N; k++) {
    if (k > 0) term = (term * A) / k
    sum += term
  }
  const lastTerm = (term * A) / N
  const numerator = (lastTerm * N) / (N - A)
  return numerator / (sum + numerator)
}

export function serviceLevel(N: number, A: number, ahtSec: number, thresholdSec: number): number {
  if (N <= A) return 0
  const pw = erlangC(N, A)
  return 1 - pw * Math.exp((-(N - A) * thresholdSec) / ahtSec)
}

export function avgWait(N: number, A: number, ahtSec: number): number {
  if (N <= A) return 999
  const pw = erlangC(N, A)
  return (pw * ahtSec) / (N - A)
}

export function requiredAgents(
  callsPerHalfHour: number,
  ahtSec: number,
  slTarget: number,
  thresholdSec: number,
): { N: number; A: number } {
  const lambda = callsPerHalfHour / 1800
  const A = lambda * ahtSec
  let N = Math.max(1, Math.ceil(A) + 1)
  while (serviceLevel(N, A, ahtSec, thresholdSec) < slTarget && N < 5000) N++
  return { N, A }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: all `erlang` tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/erlang.ts tests/erlang.test.ts
git commit -m "feat: extract erlang C math into tested lib module"
```

---

## Task 5: Curve utilities

**Files:**
- Create: `tests/curve.test.ts`
- Create: `lib/curve.ts`

- [ ] **Step 1: Write failing tests in `tests/curve.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { applyHoop, normalize, callsPerInterval, intervalIndexForMinute } from '@/lib/curve'

describe('applyHoop', () => {
  it('zeroes intervals outside HOOP', () => {
    const curve = Array.from({ length: 48 }, () => 1)
    const result = applyHoop(curve, { startMin: 480, endMin: 1080 }) // 08:00–18:00
    // 08:00 = interval 16; 18:00 = interval 36
    expect(result[15]).toBe(0)
    expect(result[16]).toBe(1)
    expect(result[35]).toBe(1)
    expect(result[36]).toBe(0)
  })

  it('keeps full curve when HOOP covers all 24h', () => {
    const curve = Array.from({ length: 48 }, () => 1)
    const result = applyHoop(curve, { startMin: 0, endMin: 1440 })
    expect(result.every(v => v === 1)).toBe(true)
  })
})

describe('normalize', () => {
  it('makes weights sum to 1', () => {
    const result = normalize([2, 3, 5])
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(result).toEqual([0.2, 0.3, 0.5])
  })

  it('returns zeros when input is all zeros', () => {
    const result = normalize([0, 0, 0])
    expect(result).toEqual([0, 0, 0])
  })
})

describe('callsPerInterval', () => {
  it('distributes total calls per normalized weights', () => {
    const curve = [0, 1, 1, 0]
    const out = callsPerInterval(curve, 100)
    expect(out).toEqual([0, 50, 50, 0])
  })
})

describe('intervalIndexForMinute', () => {
  it('rounds 30-min minutes to interval indices', () => {
    expect(intervalIndexForMinute(0)).toBe(0)
    expect(intervalIndexForMinute(29)).toBe(0)
    expect(intervalIndexForMinute(30)).toBe(1)
    expect(intervalIndexForMinute(1439)).toBe(47)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/curve`.

- [ ] **Step 3: Implement `lib/curve.ts`**

```ts
import type { HoopWindow } from './types'

export function intervalIndexForMinute(min: number): number {
  return Math.min(47, Math.max(0, Math.floor(min / 30)))
}

export function applyHoop(curve: number[], hoop: HoopWindow): number[] {
  const startIdx = intervalIndexForMinute(hoop.startMin)
  const endIdx = intervalIndexForMinute(hoop.endMin)
  return curve.map((v, i) => (i >= startIdx && i < endIdx ? v : 0))
}

export function normalize(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return weights.map(() => 0)
  return weights.map(v => v / sum)
}

export function callsPerInterval(curve: number[], dailyTotal: number): number[] {
  return normalize(curve).map(w => w * dailyTotal)
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: all `curve` tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/curve.ts tests/curve.test.ts
git commit -m "feat: add curve utilities for HOOP truncation and normalization"
```

---

## Task 6: Seeded RNG

**Files:**
- Create: `lib/rng.ts`
- Create: `tests/rng.test.ts`

- [ ] **Step 1: Write failing tests in `tests/rng.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { makeRng, poisson, logNormal } from '@/lib/rng'

describe('makeRng', () => {
  it('produces deterministic sequences for the same seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect(a()).toBe(b())
    expect(a()).toBe(b())
  })

  it('produces different sequences for different seeds', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    expect(a()).not.toBe(b())
  })
})

describe('poisson', () => {
  it('returns non-negative integers', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 50; i++) {
      const k = poisson(rng, 5)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(k)).toBe(true)
    }
  })

  it('mean over many draws is close to lambda', () => {
    const rng = makeRng(100)
    const N = 5000
    let sum = 0
    for (let i = 0; i < N; i++) sum += poisson(rng, 8)
    expect(sum / N).toBeGreaterThan(7.6)
    expect(sum / N).toBeLessThan(8.4)
  })
})

describe('logNormal', () => {
  it('returns positive values', () => {
    const rng = makeRng(11)
    for (let i = 0; i < 50; i++) {
      expect(logNormal(rng, 360, 0.4)).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/rng`.

- [ ] **Step 3: Implement `lib/rng.ts`**

```ts
import seedrandom from 'seedrandom'

export type Rng = () => number  // returns uniform in [0, 1)

export function makeRng(seed: number): Rng {
  return seedrandom(String(seed))
}

// Knuth's algorithm — fine for typical lambdas <100
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0
  // Use the inverse-transform / multiplication method
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

// Box-Muller standard normal
function standardNormal(rng: Rng): number {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

// Log-normal sample with mean ≈ `mean` (in same units as `mean`) and shape σ.
export function logNormal(rng: Rng, mean: number, sigma: number): number {
  // Convert desired arithmetic mean to mu (location) of the underlying normal.
  const mu = Math.log(mean) - (sigma * sigma) / 2
  return Math.exp(mu + sigma * standardNormal(rng))
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: all `rng` tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/rng.ts tests/rng.test.ts
git commit -m "feat: add seeded RNG with poisson and log-normal"
```

---

## Task 7: Kernel v1 — `runDay` (no abandons, no breaks)

**Files:**
- Create: `lib/kernel/sim.ts`
- Create: `lib/kernel/index.ts`
- Create: `tests/kernel.test.ts`

Phase 1 kernel scope: arrivals, agent FSM (idle/on_call/ACW/idle), service-level per interval. NO abandons, NO breaks, NO shrinkage variability. These land in Phase 2.

- [ ] **Step 1: Write failing tests in `tests/kernel.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { Scenario } from '@/lib/types'
import { runDay } from '@/lib/kernel'
import { campaigns } from '@/lib/campaigns'

function baseScenario(seed = 42): Scenario {
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
  }
}

describe('runDay', () => {
  it('produces 48 interval stats', () => {
    const result = runDay(baseScenario())
    expect(result.perInterval).toHaveLength(48)
  })

  it('is deterministic for the same seed', () => {
    const a = runDay(baseScenario(7))
    const b = runDay(baseScenario(7))
    expect(a.totals.sl).toBe(b.totals.sl)
    expect(a.events.length).toBe(b.events.length)
  })

  it('produces different results for different seeds', () => {
    const a = runDay(baseScenario(1))
    const b = runDay(baseScenario(2))
    expect(a.events.length).not.toBe(b.events.length)
  })

  it('returns SL between 0 and 1 for the totals', () => {
    const result = runDay(baseScenario())
    expect(result.totals.sl).toBeGreaterThanOrEqual(0)
    expect(result.totals.sl).toBeLessThanOrEqual(1)
  })

  it('emits call_arrive events only inside HOOP', () => {
    const sc = baseScenario()
    sc.hoop = { startMin: 600, endMin: 720 }  // 10:00–12:00 only
    const result = runDay(sc)
    const arrivals = result.events.filter(e => e.type === 'call_arrive')
    expect(arrivals.length).toBeGreaterThan(0)
    for (const e of arrivals) {
      expect(e.timeMin).toBeGreaterThanOrEqual(600)
      expect(e.timeMin).toBeLessThan(720)
    }
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/kernel`.

- [ ] **Step 3: Implement `lib/kernel/sim.ts`**

```ts
import type { Scenario, SimEvent, SimResult, IntervalStat } from '@/lib/types'
import { applyHoop, callsPerInterval, intervalIndexForMinute } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import { makeRng, poisson, logNormal } from '@/lib/rng'

interface AgentState {
  id: string
  busyUntilMin: number   // 0 = idle now
}

const ACW_SECONDS = 30      // wrap-up after each call
const SIGMA_AHT = 0.4       // log-normal shape parameter

export function runDay(scenario: Scenario): SimResult {
  const rng = makeRng(scenario.rngSeed)
  const curveAfterHoop = applyHoop(scenario.curve, scenario.hoop)
  const callsPer30 = callsPerInterval(curveAfterHoop, scenario.dailyTotal)

  // Determine agent count per interval via Erlang C (Phase 1 staffing source)
  const slTarget = scenario.sl / 100
  const agentsPerInterval = callsPer30.map(calls => {
    if (calls <= 0) return 0
    const { N } = requiredAgents(calls, scenario.aht, slTarget, scenario.asa)
    return Math.max(1, Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100)))
  })

  // Build agent pool sized to the peak interval; agents simulated as state machine slots.
  const peakAgents = Math.max(1, ...agentsPerInterval)
  const agents: AgentState[] = Array.from({ length: peakAgents }, (_, i) => ({
    id: `A${i}`,
    busyUntilMin: 0,
  }))

  const events: SimEvent[] = []
  const perInterval: IntervalStat[] = Array.from({ length: 48 }, () => ({
    sl: 0, agents: 0, queueLen: 0, abandons: 0, occ: 0,
  }))

  // Per-interval counters
  const callsAnswered = new Array(48).fill(0)
  const callsInThreshold = new Array(48).fill(0)
  const totalWaitMs = new Array(48).fill(0)
  const totalBusyMin = new Array(48).fill(0)

  let queue: { arriveMin: number; callId: string }[] = []
  let callCounter = 0

  // Step minute-by-minute. 1440 minutes/day.
  for (let min = 0; min < 1440; min++) {
    const intervalIdx = intervalIndexForMinute(min)
    const callsThisMin = poisson(rng, callsPer30[intervalIdx] / 30)

    for (let c = 0; c < callsThisMin; c++) {
      const callId = `C${callCounter++}`
      events.push({ timeMin: min, type: 'call_arrive', callId })
      queue.push({ arriveMin: min, callId })
    }

    // How many agents are "active" right now (within an active interval cap)?
    const activeAgentCap = agentsPerInterval[intervalIdx]
    const activeAgents = agents.slice(0, activeAgentCap)

    // Assign queued calls to free agents
    queue = queue.filter(qc => {
      const free = activeAgents.find(a => a.busyUntilMin <= min)
      if (!free) return true  // still queued
      const waitMs = (min - qc.arriveMin) * 60_000
      const ahtSec = logNormal(rng, scenario.aht, SIGMA_AHT)
      free.busyUntilMin = min + (ahtSec + ACW_SECONDS) / 60
      events.push({ timeMin: min, type: 'call_answer', callId: qc.callId, agentId: free.id, waitMs })
      callsAnswered[intervalIdx]++
      totalWaitMs[intervalIdx] += waitMs
      if (waitMs / 1000 <= scenario.asa) callsInThreshold[intervalIdx]++
      return false
    })

    // Emit call_end events for any agent finishing this minute
    for (const a of activeAgents) {
      if (a.busyUntilMin > min - 1 && a.busyUntilMin <= min) {
        events.push({ timeMin: min, type: 'call_end', agentId: a.id })
      }
      if (a.busyUntilMin > min) totalBusyMin[intervalIdx]++  // counts toward occupancy
    }

    perInterval[intervalIdx].queueLen = Math.max(perInterval[intervalIdx].queueLen, queue.length)
    perInterval[intervalIdx].agents = activeAgentCap
  }

  // Aggregate per-interval stats
  let totalSlNum = 0, totalSlDen = 0
  let totalWait = 0, totalAns = 0
  let totalBusy = 0, totalAvail = 0

  for (let i = 0; i < 48; i++) {
    const ans = callsAnswered[i]
    const ith = callsInThreshold[i]
    perInterval[i].sl = ans > 0 ? ith / ans : 1
    perInterval[i].occ = perInterval[i].agents > 0 ? totalBusyMin[i] / (perInterval[i].agents * 30) : 0
    totalSlNum += ith
    totalSlDen += ans
    totalWait += totalWaitMs[i]
    totalAns += ans
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
      abandons: 0,  // Phase 2
      cost: 0,      // Phase 4
    },
  }
}
```

- [ ] **Step 4: Implement `lib/kernel/index.ts`**

```ts
export { runDay } from './sim'
export type { SimResult, SimEvent } from '@/lib/types'
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm test
```

Expected: all `kernel` tests passing. If any fail, inspect the failure — DO NOT relax the test, fix the implementation.

- [ ] **Step 6: Commit**

```bash
git add lib/kernel tests/kernel.test.ts
git commit -m "feat: kernel v1 — DES day simulation (no abandons/breaks yet)"
```

---

## Task 8: Web Worker scaffold for the kernel

**Files:**
- Create: `app/workers/kernel.worker.ts`
- Create: `app/workers/kernelClient.ts`
- Modify: `next.config.ts` (only if Worker support requires it)

Before writing the Worker, **check Next.js 16 Worker integration**: read `node_modules/next/dist/docs/` for the current pattern. Per `AGENTS.md` this is non-optional.

- [ ] **Step 1: Read Next.js 16 Worker docs**

```bash
ls node_modules/next/dist/docs/ 2>/dev/null | head -30
```

Look for any file containing "worker" in its name. Read the relevant doc and apply its pattern. The pattern below assumes the standard Web Worker via `new Worker(new URL('./...', import.meta.url))` — adjust if the doc says otherwise.

- [ ] **Step 2: Create `app/workers/kernel.worker.ts`**

```ts
import { runDay } from '@/lib/kernel'
import type { Scenario, SimResult } from '@/lib/types'

interface RunDayMessage {
  type: 'runDay'
  requestId: number
  scenario: Scenario
}

interface RunDayResponse {
  type: 'runDayResult'
  requestId: number
  result: SimResult
}

self.addEventListener('message', (e: MessageEvent<RunDayMessage>) => {
  const msg = e.data
  if (msg.type === 'runDay') {
    const result = runDay(msg.scenario)
    const response: RunDayResponse = { type: 'runDayResult', requestId: msg.requestId, result }
    ;(self as unknown as Worker).postMessage(response)
  }
})

export {}  // make this a module
```

- [ ] **Step 3: Create `app/workers/kernelClient.ts`**

```ts
import type { Scenario, SimResult } from '@/lib/types'

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, (r: SimResult) => void>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type: string; requestId: number; result: SimResult }
    if (data.type === 'runDayResult') {
      const resolve = pending.get(data.requestId)
      if (resolve) {
        resolve(data.result)
        pending.delete(data.requestId)
      }
    }
  })
  return worker
}

export function runDayInWorker(scenario: Scenario): Promise<SimResult> {
  const w = ensureWorker()
  const requestId = nextRequestId++
  return new Promise(resolve => {
    pending.set(requestId, resolve)
    w.postMessage({ type: 'runDay', requestId, scenario })
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If TS complains about `self` typing, add a triple-slash directive at top of `kernel.worker.ts`:

```ts
/// <reference lib="webworker" />
```

- [ ] **Step 5: Commit**

```bash
git add app/workers next.config.ts
git commit -m "feat: web worker scaffold wrapping the kernel"
```

---

## Task 9: ScenarioContext

**Files:**
- Create: `app/components/cockpit/ScenarioContext.tsx`

- [ ] **Step 1: Create `app/components/cockpit/ScenarioContext.tsx`**

```tsx
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Scenario, CampaignKey, HoopWindow } from '@/lib/types'
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
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>(() => scenarioFromCampaign('us_telco_manila'))

  const setCampaign = useCallback((key: CampaignKey) => {
    setScenario(scenarioFromCampaign(key))
  }, [])

  const setHoop = useCallback((hoop: HoopWindow) => {
    setScenario(s => ({ ...s, hoop }))
  }, [])

  const setCurve = useCallback((curve: number[]) => {
    setScenario(s => ({ ...s, curve }))
  }, [])

  const setDailyTotal = useCallback((n: number) => {
    setScenario(s => ({ ...s, dailyTotal: n }))
  }, [])

  const setNumeric = useCallback((field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs', value: number) => {
    setScenario(s => ({ ...s, [field]: value }))
  }, [])

  const reseed = useCallback(() => {
    setScenario(s => ({ ...s, rngSeed: Math.floor(Math.random() * 1_000_000) }))
  }, [])

  return (
    <ScenarioContext.Provider value={{ scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed }}>
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

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/ScenarioContext.tsx
git commit -m "feat: scenario context for shared cockpit state"
```

---

## Task 10: Sidebar control — `SliderRow` (DRY base)

**Files:**
- Create: `app/components/cockpit/controls/SliderRow.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}

export function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div className="cockpit-slider-row">
      <div className="cockpit-slider-header">
        <span className="cockpit-slider-label">{label}</span>
        <span className="cockpit-slider-value">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="cockpit-range"
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/controls/SliderRow.tsx
git commit -m "feat: sidebar SliderRow control"
```

---

## Task 11: Sidebar control — `HoopSlider` (dual-thumb)

**Files:**
- Create: `app/components/cockpit/controls/HoopSlider.tsx`

A dual-thumb range is implemented as two overlaid `<input type="range">` elements with care taken so the thumbs don't trap each other.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import type { HoopWindow } from '@/lib/types'

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface HoopSliderProps {
  value: HoopWindow
  onChange: (v: HoopWindow) => void
}

export function HoopSlider({ value, onChange }: HoopSliderProps) {
  const { startMin, endMin } = value

  function setStart(v: number) {
    const next = Math.min(v, endMin - 30)
    onChange({ startMin: Math.round(next / 30) * 30, endMin })
  }

  function setEnd(v: number) {
    const next = Math.max(v, startMin + 30)
    onChange({ startMin, endMin: Math.round(next / 30) * 30 })
  }

  return (
    <div className="cockpit-hoop">
      <div className="cockpit-hoop-display">{fmt(startMin)} — {fmt(endMin)}</div>
      <div className="cockpit-hoop-track">
        <div
          className="cockpit-hoop-fill"
          style={{ left: `${(startMin / 1440) * 100}%`, right: `${100 - (endMin / 1440) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={1440}
          step={30}
          value={startMin}
          onChange={e => setStart(Number(e.target.value))}
          aria-label="HOOP start"
          className="cockpit-hoop-thumb cockpit-hoop-thumb-start"
        />
        <input
          type="range"
          min={0}
          max={1440}
          step={30}
          value={endMin}
          onChange={e => setEnd(Number(e.target.value))}
          aria-label="HOOP end"
          className="cockpit-hoop-thumb cockpit-hoop-thumb-end"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/controls/HoopSlider.tsx
git commit -m "feat: dual-thumb HoopSlider control"
```

---

## Task 12: Sidebar control — `CurveEditor` (draggable SVG handles)

**Files:**
- Create: `app/components/cockpit/controls/CurveEditor.tsx`

48 draggable handles is too many for sidebar UX; show a smoothed curve with **6 control handles** at fixed hour positions (3, 7, 11, 15, 19, 23). Drag a handle to reshape the curve; intervals interpolate. Intervals outside HOOP are visually dimmed and forced to 0 (the kernel zeroes them anyway, but we mirror it visually).

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import type { HoopWindow } from '@/lib/types'

const HANDLE_HOURS = [3, 7, 11, 15, 19, 23]
const HANDLE_INDICES = HANDLE_HOURS.map(h => h * 2)  // each handle sits on a 30-min interval

interface CurveEditorProps {
  curve: number[]
  hoop: HoopWindow
  onChange: (curve: number[]) => void
}

export function CurveEditor({ curve, hoop, onChange }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  // Reshape: when a handle is dragged, set its interval to the new value and smooth-interpolate
  // adjacent intervals via cosine interpolation.
  function reshape(handleIdx: number, newValue: number) {
    const next = curve.slice()
    next[HANDLE_INDICES[handleIdx]] = Math.max(0, newValue)
    // Interpolate between adjacent handles
    for (let h = 0; h < HANDLE_INDICES.length - 1; h++) {
      const i0 = HANDLE_INDICES[h]
      const i1 = HANDLE_INDICES[h + 1]
      const v0 = next[i0]
      const v1 = next[i1]
      for (let i = i0 + 1; i < i1; i++) {
        const t = (i - i0) / (i1 - i0)
        const ct = (1 - Math.cos(Math.PI * t)) / 2  // cosine ease
        next[i] = v0 * (1 - ct) + v1 * ct
      }
    }
    onChange(next)
  }

  useEffect(() => {
    if (dragging === null) return
    function onMove(e: PointerEvent) {
      if (!svgRef.current || dragging === null) return
      const rect = svgRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const v = Math.max(0, 1 - y / rect.height) * 1.2  // map 0..top → 1.2; floor → 0
      reshape(dragging, v)
    }
    function onUp() { setDragging(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, curve])

  const max = Math.max(0.001, ...curve)
  const startIdx = Math.floor(hoop.startMin / 30)
  const endIdx = Math.floor(hoop.endMin / 30)

  // Build the polyline path
  const d = curve.map((v, i) => {
    const x = (i / 47) * 200
    const y = 50 - (v / max) * 45
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`
  }).join(' ')

  return (
    <div className="cockpit-curve">
      <svg ref={svgRef} viewBox="0 0 200 50" className="cockpit-curve-svg" style={{ width: '100%', height: 50, touchAction: 'none' }}>
        {/* HOOP shading: dim outside */}
        <rect x={0} y={0} width={(startIdx / 47) * 200} height={50} fill="rgba(0,0,0,0.4)" />
        <rect x={(endIdx / 47) * 200} y={0} width={200 - (endIdx / 47) * 200} height={50} fill="rgba(0,0,0,0.4)" />
        <path d={d} stroke="#3b82f6" strokeWidth={1.5} fill="none" />
        {HANDLE_INDICES.map((intervalIdx, h) => {
          const x = (intervalIdx / 47) * 200
          const v = curve[intervalIdx]
          const y = 50 - (v / max) * 45
          const insideHoop = intervalIdx >= startIdx && intervalIdx < endIdx
          return (
            <circle
              key={h}
              cx={x}
              cy={y}
              r={4}
              fill={insideHoop ? '#fff' : '#64748b'}
              stroke="#3b82f6"
              strokeWidth={1.5}
              style={{ cursor: 'ns-resize' }}
              onPointerDown={e => { e.preventDefault(); setDragging(h) }}
            />
          )
        })}
      </svg>
      <div className="cockpit-curve-hint">Drag handles · {hoop.endMin - hoop.startMin > 0 ? `${Math.round((hoop.endMin - hoop.startMin) / 60)}h HOOP` : 'closed'}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/controls/CurveEditor.tsx
git commit -m "feat: draggable curve editor with 6 control handles"
```

---

## Task 13: Sidebar control — `DailyTotalInput`

**Files:**
- Create: `app/components/cockpit/controls/DailyTotalInput.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

interface DailyTotalInputProps {
  value: number
  onChange: (v: number) => void
}

export function DailyTotalInput({ value, onChange }: DailyTotalInputProps) {
  return (
    <div className="cockpit-daily-total">
      <label className="cockpit-daily-total-label">Daily total</label>
      <input
        type="number"
        min={100}
        max={100000}
        step={100}
        value={value}
        onChange={e => onChange(Math.max(100, Number(e.target.value) || 0))}
        className="cockpit-daily-total-input"
      />
      <span className="cockpit-daily-total-suffix">calls/day</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/controls/DailyTotalInput.tsx
git commit -m "feat: daily-total numeric input"
```

---

## Task 14: Sidebar composition

**Files:**
- Create: `app/components/cockpit/Sidebar.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useScenario } from './ScenarioContext'
import { campaigns } from '@/lib/campaigns'
import { HoopSlider } from './controls/HoopSlider'
import { CurveEditor } from './controls/CurveEditor'
import { DailyTotalInput } from './controls/DailyTotalInput'
import { SliderRow } from './controls/SliderRow'
import type { CampaignKey } from '@/lib/types'

export function Sidebar() {
  const { scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric } = useScenario()

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

      <button type="button" className="cockpit-inject-btn" disabled>
        ⚡ Inject event… <span className="cockpit-inject-soon">(Phase 2)</span>
      </button>

    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/Sidebar.tsx
git commit -m "feat: cockpit sidebar composing all input controls"
```

---

## Task 15: KPI strip (uses Erlang C derived numbers)

**Files:**
- Create: `app/components/cockpit/KpiStrip.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useMemo } from 'react'
import { useScenario } from './ScenarioContext'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents, serviceLevel, avgWait } from '@/lib/erlang'

export function KpiStrip() {
  const { scenario } = useScenario()

  const kpis = useMemo(() => {
    // Use the peak interval as the headline KPI (matches industry convention)
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const peakIdx = calls.indexOf(Math.max(...calls))
    const peakCalls = calls[peakIdx]
    if (peakCalls <= 0) {
      return { N: 0, scheduled: 0, sl: 1, occ: 0, asa: 0 }
    }
    const { N, A } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    const sl = serviceLevel(N, A, scenario.aht, scenario.asa)
    const occ = Math.min(1, A / N)
    const asa = avgWait(N, A, scenario.aht)
    return { N, scheduled, sl, occ, asa }
  }, [scenario])

  return (
    <div className="cockpit-kpi-strip">
      <Kpi label="Erlang C agents" value={String(kpis.N)} />
      <Kpi label="Scheduled HC"    value={String(kpis.scheduled)} />
      <Kpi label="Service Level"   value={`${(kpis.sl * 100).toFixed(1)}%`} accent="green" />
      <Kpi label="Occupancy"       value={`${(kpis.occ * 100).toFixed(1)}%`} accent="amber" />
      <Kpi label="Avg ASA"         value={`${Math.round(kpis.asa)}s`} />
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

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/KpiStrip.tsx
git commit -m "feat: KPI strip computing peak-interval Erlang C live"
```

---

## Task 16: Header with tabs

**Files:**
- Create: `app/components/cockpit/Header.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import Link from 'next/link'

export type TabKey = 'live' | 'monte' | 'roster' | 'classic'

interface HeaderProps {
  active: TabKey
  onChange: (tab: TabKey) => void
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'live',    label: '▶ Live Sim' },
  { key: 'monte',   label: '⚡ Monte Carlo' },
  { key: 'roster',  label: '📋 Roster' },
  { key: 'classic', label: '📊 Classic' },
]

export function Header({ active, onChange }: HeaderProps) {
  return (
    <header className="cockpit-header">
      <div className="cockpit-title">
        <span className="cockpit-title-name">WFM Cockpit</span>
        <span className="cockpit-title-sub">Erlang C · DES kernel · live</span>
      </div>
      <nav className="cockpit-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`cockpit-tab ${active === t.key ? 'cockpit-tab--active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
        <Link href="/learn" className="cockpit-tab cockpit-tab--link">📚 Learn</Link>
      </nav>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/Header.tsx
git commit -m "feat: cockpit header with tab switcher"
```

---

## Task 17: Tab placeholders + Live Sim "pipe-prove" tab

**Files:**
- Create: `app/components/cockpit/tabs/LiveSimTab.tsx`
- Create: `app/components/cockpit/tabs/MonteCarloTab.tsx`
- Create: `app/components/cockpit/tabs/RosterTab.tsx`
- Create: `app/components/cockpit/tabs/ClassicTab.tsx`

The Live Sim tab in Phase 1 is a "pipe-prove": it runs a single day on the worker when scenario changes and shows a basic per-interval SL chart, validating that the Worker pipeline is wired end-to-end. Full live animation arrives in Phase 2.

- [ ] **Step 1: Create `LiveSimTab.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runDayInWorker } from '@/app/workers/kernelClient'
import type { SimResult } from '@/lib/types'
import Chart from 'chart.js/auto'

export function LiveSimTab() {
  const { scenario } = useScenario()
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    setRunning(true)
    runDayInWorker(scenario).then(r => {
      setResult(r)
      setRunning(false)
    })
  }, [scenario])

  useEffect(() => {
    if (!canvasRef.current || !result) return
    if (chartRef.current) chartRef.current.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: Array.from({ length: 48 }, (_, i) => i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}` : ''),
        datasets: [
          {
            label: 'Service Level (%)',
            data: result.perInterval.map(s => s.sl * 100),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { min: 0, max: 100, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [result])

  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header">
        <span>Live Sim — Phase 1 preview</span>
        <span className="cockpit-viewport-sub">{running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}%`}</span>
      </div>
      <div className="cockpit-viewport-body">
        <p className="cockpit-viewport-note">Full live animation arrives in Phase 2. This view runs the kernel once per scenario change to verify the pipeline.</p>
        <div className="cockpit-chart-container">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `MonteCarloTab.tsx`**

```tsx
export function MonteCarloTab() {
  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header"><span>Monte Carlo</span></div>
      <div className="cockpit-viewport-body cockpit-placeholder">
        <p>Monte Carlo arrives in Phase 3.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `RosterTab.tsx`**

```tsx
export function RosterTab() {
  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header"><span>Roster Designer</span></div>
      <div className="cockpit-viewport-body cockpit-placeholder">
        <p>Roster Designer + Optimizer arrives in Phase 4.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `ClassicTab.tsx`**

```tsx
import WFMDemo from '@/app/components/WFMDemo'

export function ClassicTab() {
  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header"><span>Classic view</span></div>
      <div className="cockpit-viewport-body">
        <WFMDemo />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/tabs
git commit -m "feat: tab views — Live (pipe-prove), MC/Roster placeholders, Classic port"
```

---

## Task 18: Cockpit container

**Files:**
- Create: `app/components/cockpit/Cockpit.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState } from 'react'
import { ScenarioProvider } from './ScenarioContext'
import { Header, type TabKey } from './Header'
import { Sidebar } from './Sidebar'
import { KpiStrip } from './KpiStrip'
import { LiveSimTab } from './tabs/LiveSimTab'
import { MonteCarloTab } from './tabs/MonteCarloTab'
import { RosterTab } from './tabs/RosterTab'
import { ClassicTab } from './tabs/ClassicTab'

export function Cockpit() {
  const [tab, setTab] = useState<TabKey>('live')

  return (
    <ScenarioProvider>
      <div className="cockpit">
        <Header active={tab} onChange={setTab} />
        <div className="cockpit-body">
          <Sidebar />
          <main className="cockpit-main">
            {tab === 'live'    && <LiveSimTab />}
            {tab === 'monte'   && <MonteCarloTab />}
            {tab === 'roster'  && <RosterTab />}
            {tab === 'classic' && <ClassicTab />}
          </main>
        </div>
        <KpiStrip />
      </div>
    </ScenarioProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/cockpit/Cockpit.tsx
git commit -m "feat: cockpit container composing header/sidebar/main/kpi"
```

---

## Task 19: Replace the page entry

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace contents of `app/page.tsx`**

```tsx
import { Cockpit } from './components/cockpit/Cockpit'

export default function Home() {
  return (
    <main className="wfm-page">
      <Cockpit />
    </main>
  )
}
```

- [ ] **Step 2: Verify the build still passes**

```bash
npx tsc --noEmit
npm run build
```

Expected: build succeeds. If the worker URL pattern needs Next.js config tweaks, address them now.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: route / to the cockpit"
```

---

## Task 20: Cockpit dark-theme CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append cockpit theme styles to `app/globals.css`**

Add this block at the end of the file:

```css
/* ───────── Cockpit (Phase 1) ───────── */

.cockpit {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #0f172a;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
}

.cockpit-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #334155;
  background: #1e293b;
}

.cockpit-title-name { font-weight: 700; font-size: 1rem; }
.cockpit-title-sub { opacity: 0.5; font-size: 0.75rem; margin-left: 0.5rem; }

.cockpit-tabs { display: flex; gap: 0.25rem; margin-left: auto; }
.cockpit-tab {
  background: transparent;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: none;
}
.cockpit-tab:hover { color: #e2e8f0; }
.cockpit-tab--active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
  font-weight: 600;
}
.cockpit-tab--link { color: #94a3b8; }

.cockpit-body { display: flex; flex: 1; min-height: 0; }

.cockpit-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid #334155;
  padding: 1rem;
  background: #1e293b;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.cockpit-section { display: flex; flex-direction: column; gap: 0.4rem; }
.cockpit-section-label {
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.65rem;
}

.cockpit-select {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: #e2e8f0;
  font-size: 0.85rem;
}

/* HOOP */
.cockpit-hoop { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.6rem 0.75rem; }
.cockpit-hoop-display { font-weight: 600; margin-bottom: 0.5rem; font-size: 0.85rem; }
.cockpit-hoop-track { position: relative; height: 24px; }
.cockpit-hoop-fill { position: absolute; top: 9px; height: 6px; background: #3b82f6; border-radius: 9999px; pointer-events: none; }
.cockpit-hoop-thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  background: transparent;
  pointer-events: none;
  appearance: none;
  -webkit-appearance: none;
}
.cockpit-hoop-thumb::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  pointer-events: auto;
  cursor: ew-resize;
}
.cockpit-hoop-thumb::-moz-range-thumb {
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  pointer-events: auto;
  cursor: ew-resize;
  border: 0;
}

/* Curve */
.cockpit-curve { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.5rem; }
.cockpit-curve-svg { display: block; }
.cockpit-curve-hint { opacity: 0.5; font-size: 0.65rem; margin-top: 0.25rem; }

/* Daily total */
.cockpit-daily-total { display: flex; align-items: center; gap: 0.5rem; }
.cockpit-daily-total-label { opacity: 0.7; font-size: 0.75rem; flex: 1; }
.cockpit-daily-total-input {
  width: 100px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  color: #e2e8f0;
  font-size: 0.85rem;
}
.cockpit-daily-total-suffix { opacity: 0.5; font-size: 0.7rem; }

/* Sliders */
.cockpit-slider-row { display: flex; flex-direction: column; gap: 0.2rem; }
.cockpit-slider-header { display: flex; justify-content: space-between; font-size: 0.75rem; }
.cockpit-slider-label { opacity: 0.7; }
.cockpit-slider-value { font-weight: 600; }
.cockpit-range {
  appearance: none; -webkit-appearance: none;
  width: 100%; height: 4px;
  background: #334155; border-radius: 9999px;
}
.cockpit-range::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 12px; height: 12px;
  background: #3b82f6; border-radius: 50%; cursor: pointer;
}
.cockpit-range::-moz-range-thumb {
  width: 12px; height: 12px;
  background: #3b82f6; border-radius: 50%; cursor: pointer; border: 0;
}

/* Inject button */
.cockpit-inject-btn {
  background: #ef4444;
  color: #fff;
  border: 0;
  border-radius: 6px;
  padding: 0.5rem;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
  margin-top: auto;
}
.cockpit-inject-btn:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
.cockpit-inject-soon { opacity: 0.6; font-weight: 400; }

/* Main viewport */
.cockpit-main { flex: 1; padding: 1rem; overflow: auto; min-width: 0; }
.cockpit-viewport { display: flex; flex-direction: column; gap: 0.75rem; height: 100%; }
.cockpit-viewport-header { display: flex; justify-content: space-between; font-weight: 600; }
.cockpit-viewport-sub { opacity: 0.6; font-weight: 400; }
.cockpit-viewport-body { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
.cockpit-viewport-note { opacity: 0.6; font-size: 0.85rem; }
.cockpit-placeholder {
  display: flex; align-items: center; justify-content: center;
  border: 1px dashed #334155; border-radius: 8px; opacity: 0.6;
}
.cockpit-chart-container { flex: 1; min-height: 240px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 0.75rem; }

/* KPI strip */
.cockpit-kpi-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
  border-top: 1px solid #334155;
  padding: 0.6rem 1rem;
  background: #1e293b;
}
.cockpit-kpi-label { opacity: 0.5; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; }
.cockpit-kpi-value { font-weight: 700; font-size: 1.1rem; }
.cockpit-kpi-green { color: #10b981; }
.cockpit-kpi-amber { color: #fbbf24; }
.cockpit-kpi-neutral { color: #e2e8f0; }
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: cockpit dark theme styles"
```

---

## Task 21: End-to-end manual verification

**Files:**
- None

- [ ] **Step 1: Run unit tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 2: Run typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: both clean. Address any errors before proceeding.

- [ ] **Step 3: Start the dev server and verify the cockpit in a browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Verify:

- Header shows 4 tabs + Learn link. Live Sim is active by default.
- Sidebar shows campaign picker, HOOP slider (04:00–22:00 ish for some campaigns, 24/7 for US Telco), draggable curve with 6 handles, sliders for AHT/SL/threshold/shrink/abs, disabled "Inject event" button.
- Changing the campaign picker updates HOOP, curve, and all sliders.
- Dragging a HOOP thumb shrinks the active window — the curve dims outside it.
- Dragging a curve handle reshapes the curve smoothly.
- KPI strip at the bottom updates as sliders change.
- Live Sim tab shows a per-interval SL chart that re-renders when scenario changes (proves the worker pipe).
- Monte Carlo and Roster tabs show "arrives in Phase X" placeholders.
- Classic tab renders the original WFMDemo, fully functional.
- `/learn` is unchanged.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no errors. Fix anything that surfaces.

- [ ] **Step 5: Final commit (only if any cleanups happened)**

If anything was tweaked during verification:

```bash
git add -A
git commit -m "chore: phase 1 verification cleanups"
```

Otherwise skip.

---

## Task 22: Open the PR

**Files:**
- None

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/cockpit-phase1
```

- [ ] **Step 2: Open a PR**

```bash
gh pr create --title "feat: WFM Cockpit Phase 1 (foundation)" --body "$(cat <<'EOF'
## Summary
- Cockpit shell replaces single-page demo at `/`
- Sidebar: campaign picker, HOOP dual-thumb slider, draggable curve, daily total, sliders
- KPI strip pinned to bottom (peak-interval Erlang C)
- Tested `lib/erlang.ts`, `lib/curve.ts`, `lib/rng.ts`, `lib/kernel/sim.ts`
- Web Worker scaffold (kernel runs off the UI thread)
- Classic tab preserves original WFMDemo
- `/learn` untouched

## Out of scope (later phases)
- Live agent-dot animation, scrubber, event injection (Phase 2)
- Monte Carlo (Phase 3)
- Roster Designer + Optimizer (Phase 4)

## Test plan
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual: each tab loads, sidebar controls update KPI strip live
- [ ] Manual: HOOP truncation visibly dims the curve
- [ ] Manual: Classic tab renders the original demo unchanged
- [ ] Manual: `/learn` still works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

The plan above implements the spec's Phase 1 row exactly:

| Spec requirement (Phase 1) | Covered by |
| --- | --- |
| Cockpit shell: dark theme, sidebar, top tabs, KPI strip | Tasks 14, 15, 16, 18, 20 |
| Data model: Campaign, Scenario, Shift, SimResult | Task 2 |
| HOOP slider + draggable curve (preset + drag) | Tasks 11, 12 |
| Kernel v1 — Poisson + log-normal AHT, basic FSM, no abandons | Task 7 |
| "Classic" tab port | Task 17 |
| Demo-able output: cockpit + new HOOP/curve controls feeding the math | Task 21 |

Phases 2–4 are out of scope for this plan and will get their own plan files.

**Type consistency check:** `Scenario`, `Shift`, `SimEvent`, `SimResult`, `IntervalStat` defined in Task 2 are used consistently in Tasks 7, 8, 9, 14, 15, 17. `runDay` signature in Task 7 matches the call in Task 8 (`kernel.worker.ts`) and Task 17 (`LiveSimTab.tsx` via `runDayInWorker`). Tab keys (`live`, `monte`, `roster`, `classic`) used in Task 16 (`Header`) match Task 18 (`Cockpit`).

**No placeholders:** every code step shows the full code; every test step shows the full test; every command is exact and the expected output is named.

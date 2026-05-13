# WFM Cockpit — Phase 3 (Monte Carlo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 placeholder Monte Carlo tab with a worker-pool–driven 1,000-day stress test. Show a P10/P50/P90 fan chart of service level across the day, headline stats ("days below SL", "P50", "P10"), and a "Replay worst day" button that loads that day's RNG seed into the Live Sim tab so the demo-driver can watch the disaster unfold.

**Architecture:** A new `monteCarloClient.ts` manages a pool of 4 Web Workers, each running the same pure `runDay` kernel from Phase 2. Days are sliced across workers; results stream back as they complete. The UI renders the fan chart with `Chart.js` area datasets (lower bound + filled span) plus a worst-day overlay. "Replay worst day" plumbs the bad day's `rngSeed` through the existing `ScenarioContext` (new method) and switches tabs from `Cockpit`. Each Monte Carlo run is deterministic from a single base seed, so the same scenario always produces the same fan.

**Tech Stack:** Same as Phase 2 — Next.js 16, React 19, TypeScript 5, Chart.js 4, Tailwind 4, native Web Workers, Vitest, seedrandom. No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-05-08-wfm-cockpit-design.md](../specs/2026-05-08-wfm-cockpit-design.md)
**Predecessor plans:**
- [Phase 1](./2026-05-08-wfm-cockpit-phase1-foundation.md)
- [Phase 2](./2026-05-08-wfm-cockpit-phase2-live-sim.md)

---

## Key design decisions (push back during review if any feel wrong)

1. **Pool of 4 workers, not parallel `Promise.all` on a single worker.**
   The existing `kernelClient` is single-worker and serializes work. Monte Carlo needs real parallelism. A separate `monteCarloClient.ts` owns 4 worker instances and round-robins jobs across them. The single-worker `kernelClient` stays untouched (it's used by the Live Sim tab).

2. **Seeding: deterministic per-day from a single base seed.**
   For day `i ∈ [0, 999]`, the seed is `baseSeed * 1000 + i`. The base seed comes from the user's current `scenario.rngSeed`. Same scenario → same fan chart, every time. The "worst day" replay is just `setRngSeed(baseSeed * 1000 + worstDayIdx)`.

3. **1,000 days is the default, 4 workers split into 250 each.**
   Each worker run takes <100ms per day (verified in Phase 1). 250 days × 100ms = 25 wall-seconds per worker, 4 workers in parallel ≈ 6–8 seconds total. Streaming progress keeps the UI responsive.

4. **Fan-chart math: per-interval percentiles, not per-minute.**
   Each completed `SimResult` gives 48 interval SL values. To build the fan, we collect 1,000 SL samples per interval, then compute P10 / P50 / P90 per interval. Final shape: 3 series of length 48. Cheap.

5. **Worst day = lowest `totals.sl` across runs.** Tie-break by lowest `dayIndex`.

6. **Cross-tab replay.** The `Cockpit` component already controls the `tab` state. Add a `replayWorstDay(seed)` callback that (a) calls `setRngSeed(seed)` via the scenario context and (b) flips `tab` to `'live'`. The `useAnimation` hook in Live Sim already starts at min 0 and can be auto-played by the new logic. Phase 3 will *not* auto-play — leave the user to press play themselves so they're in control of the moment.

7. **Stream progress, render the fan as it fills.**
   The Monte Carlo tab subscribes to `monteCarloClient.runMany(...)` which emits an `onProgress` callback with the cumulative results. The fan chart re-renders every ~200ms (debounced) until completion.

---

## File Structure

### New files (kernel)

- `lib/kernel/monteCarlo.ts` — pure helper. `runManyDays(scenario, n, baseSeed): SimResult[]` runs sequentially (used in unit tests; production parallelizes via the worker pool but the per-day result is identical).
- `tests/monteCarlo.test.ts` — unit tests for `runManyDays`.

### New files (animation/aggregation)

- `lib/animation/fanStats.ts` — `summarizeRuns(results: SimResult[]): { perInterval: { p10, p50, p90, worstDay }[]; worstDayIdx: number; daysBelowSl: number; targetSl: number }`. Pure aggregation. Tested.
- `tests/fanStats.test.ts`

### New files (worker client)

- `app/workers/monteCarloClient.ts` — manages a pool of 4 workers (each running `kernel.worker.ts`). `runMany(scenario, n, onProgress, onDone)`.

### New files (UI)

- `app/components/cockpit/monte/MonteCarloFanChart.tsx` — Chart.js area chart, P10–P90 band, P50 line, target line, worst-day overlay.
- `app/components/cockpit/monte/MonteCarloStats.tsx` — stats column ("Days below SL", "P50 SL", "P10 SL", Replay button).

### Modified files

- `app/components/cockpit/ScenarioContext.tsx` — add `setRngSeed(seed: number)` method.
- `app/components/cockpit/tabs/MonteCarloTab.tsx` — full rewrite from placeholder to integrated viewport.
- `app/components/cockpit/Cockpit.tsx` — add `replayWorstDay` callback that lifts seed + switches tab. Pass to MonteCarloTab.
- `app/globals.css` — append fan chart + stats styles.

### Untouched

- `lib/kernel/sim.ts` (Phase 2 kernel v2 is sufficient).
- `lib/kernel/inject.ts`, `lib/kernel/breaks.ts`.
- `app/workers/kernel.worker.ts`, `app/workers/kernelClient.ts` (Live Sim still uses the single-worker client).
- All other Phase 2 components.

---

## Conventions

- **Branch:** `feat/cockpit-phase3` off the merged Phase 2 work (currently `feat/cockpit-phase2`). Create before Task 1.
- **Commits:** Conventional commits, one per task.
- **Type imports:** `import type { ... }` for type-only.
- **CSS:** New classes prefixed `cockpit-monte-`.

---

## Task 0: Branch

**Files:** none

- [ ] **Step 1: Confirm starting state** (Phase 2 should be complete)

```bash
git status
git log --oneline -3
```

- [ ] **Step 2: Create the Phase 3 branch**

```bash
git checkout -b feat/cockpit-phase3
git status
```

Expected: `nothing to commit, working tree clean`.

---

## Task 1: `runManyDays` helper + tests

**Files:**
- Create: `tests/monteCarlo.test.ts`
- Create: `lib/kernel/monteCarlo.ts`

This is the pure sequential helper. Production uses the worker pool for parallelism; tests use this for determinism checks.

- [ ] **Step 1: Write failing tests in `tests/monteCarlo.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { Scenario } from '@/lib/types'
import { runManyDays } from '@/lib/kernel/monteCarlo'
import { campaigns } from '@/lib/campaigns'

function baseScenario(seed = 100): Scenario {
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

describe('runManyDays', () => {
  it('returns the requested number of results', () => {
    const results = runManyDays(baseScenario(7), 5, 42)
    expect(results).toHaveLength(5)
  })

  it('is deterministic for same base seed', () => {
    const a = runManyDays(baseScenario(11), 3, 99)
    const b = runManyDays(baseScenario(11), 3, 99)
    expect(a.map(r => r.totals.sl)).toEqual(b.map(r => r.totals.sl))
  })

  it('produces variation across days', () => {
    const results = runManyDays(baseScenario(13), 10, 1)
    const sls = results.map(r => r.totals.sl)
    const allSame = sls.every(v => v === sls[0])
    expect(allSame).toBe(false)
  })

  it('each day i uses seed baseSeed*1000+i', () => {
    const baseSeed = 7
    const results = runManyDays(baseScenario(13), 3, baseSeed)
    // Same scenario but explicitly seeded with baseSeed*1000+0 should match results[0]
    const explicit0 = runManyDays({ ...baseScenario(13), rngSeed: baseSeed * 1000 + 0 }, 1, 0)
    expect(results[0].totals.sl).toBe(explicit0[0].totals.sl)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/kernel/monteCarlo`.

- [ ] **Step 3: Implement `lib/kernel/monteCarlo.ts`**

```ts
import type { Scenario, SimResult } from '@/lib/types'
import { runDay } from './sim'

export function dayRngSeed(baseSeed: number, dayIndex: number): number {
  return baseSeed * 1000 + dayIndex
}

export function runManyDays(scenario: Scenario, days: number, baseSeed: number): SimResult[] {
  const out: SimResult[] = new Array(days)
  for (let i = 0; i < days; i++) {
    out[i] = runDay({ ...scenario, rngSeed: dayRngSeed(baseSeed, i) })
  }
  return out
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: 58 passing (54 prior + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/kernel/monteCarlo.ts tests/monteCarlo.test.ts
git commit -m "feat(kernel): runManyDays helper for deterministic Monte Carlo"
```

---

## Task 2: `summarizeRuns` aggregation + tests

**Files:**
- Create: `tests/fanStats.test.ts`
- Create: `lib/animation/fanStats.ts`

Per-interval percentiles + worst-day index + days-below-SL count.

- [ ] **Step 1: Write failing tests in `tests/fanStats.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { SimResult, IntervalStat } from '@/lib/types'
import { summarizeRuns } from '@/lib/animation/fanStats'

function fakeRun(perIntervalSls: number[], totalSl: number): SimResult {
  const perInterval: IntervalStat[] = perIntervalSls.map(sl => ({
    sl, agents: 100, queueLen: 0, abandons: 0, occ: 0.85,
  }))
  return {
    perInterval,
    events: [],
    totals: { sl: totalSl, occ: 0.85, asa: 10, abandons: 0, cost: 0 },
  }
}

describe('summarizeRuns', () => {
  it('handles empty input', () => {
    const s = summarizeRuns([], 0.8)
    expect(s.perInterval).toHaveLength(0)
    expect(s.worstDayIdx).toBe(-1)
    expect(s.daysBelowSl).toBe(0)
    expect(s.targetSl).toBe(0.8)
  })

  it('computes per-interval P10/P50/P90', () => {
    const runs: SimResult[] = []
    for (let i = 0; i < 100; i++) {
      const sls = [i / 99, 1, 1].slice(0, 3)
      runs.push(fakeRun(sls, 0.85))
    }
    const s = summarizeRuns(runs, 0.8)
    expect(s.perInterval).toHaveLength(3)
    // For interval 0, values are 0/99..99/99 — P50 ≈ 0.5
    expect(s.perInterval[0].p50).toBeGreaterThan(0.45)
    expect(s.perInterval[0].p50).toBeLessThan(0.55)
    expect(s.perInterval[0].p10).toBeLessThan(s.perInterval[0].p50)
    expect(s.perInterval[0].p90).toBeGreaterThan(s.perInterval[0].p50)
  })

  it('finds the worst day by totals.sl', () => {
    const runs = [
      fakeRun([0.9, 0.9], 0.92),
      fakeRun([0.5, 0.5], 0.55),  // worst
      fakeRun([0.85, 0.85], 0.88),
    ]
    const s = summarizeRuns(runs, 0.8)
    expect(s.worstDayIdx).toBe(1)
    expect(s.perInterval[0].worstDay).toBe(0.5)
  })

  it('counts days below target SL', () => {
    const runs = [
      fakeRun([1, 1], 0.9),
      fakeRun([1, 1], 0.85),
      fakeRun([1, 1], 0.7),
      fakeRun([1, 1], 0.65),
    ]
    const s = summarizeRuns(runs, 0.8)
    expect(s.daysBelowSl).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test
```

- [ ] **Step 3: Implement `lib/animation/fanStats.ts`**

```ts
import type { SimResult } from '@/lib/types'

export interface FanIntervalStat {
  p10: number
  p50: number
  p90: number
  worstDay: number   // SL value for that interval on the worst day
}

export interface RunsSummary {
  perInterval: FanIntervalStat[]
  worstDayIdx: number
  daysBelowSl: number
  targetSl: number
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * sortedAsc.length)))
  return sortedAsc[idx]
}

export function summarizeRuns(results: SimResult[], targetSl: number): RunsSummary {
  if (results.length === 0) {
    return { perInterval: [], worstDayIdx: -1, daysBelowSl: 0, targetSl }
  }

  // Find worst day
  let worstDayIdx = 0
  for (let i = 1; i < results.length; i++) {
    if (results[i].totals.sl < results[worstDayIdx].totals.sl) worstDayIdx = i
  }

  // Per-interval percentiles
  const intervalCount = results[0].perInterval.length
  const perInterval: FanIntervalStat[] = []
  for (let i = 0; i < intervalCount; i++) {
    const samples = results.map(r => r.perInterval[i].sl).sort((a, b) => a - b)
    perInterval.push({
      p10: percentile(samples, 0.10),
      p50: percentile(samples, 0.50),
      p90: percentile(samples, 0.90),
      worstDay: results[worstDayIdx].perInterval[i].sl,
    })
  }

  const daysBelowSl = results.filter(r => r.totals.sl < targetSl).length

  return { perInterval, worstDayIdx, daysBelowSl, targetSl }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test
```

Expected: 62 passing (58 prior + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/animation/fanStats.ts tests/fanStats.test.ts
git commit -m "feat(animation): summarizeRuns — per-interval percentiles + worst day"
```

---

## Task 3: Monte Carlo worker pool client

**Files:**
- Create: `app/workers/monteCarloClient.ts`

The pool wraps the existing `kernel.worker.ts` (no kernel changes needed). 4 instances; round-robin distribution.

- [ ] **Step 1: Create the file**

```ts
import type { Scenario, SimResult } from '@/lib/types'
import { dayRngSeed } from '@/lib/kernel/monteCarlo'

const POOL_SIZE = 4

interface Job {
  dayIndex: number
  resolve: (r: SimResult) => void
  reject: (e: Error) => void
}

interface PoolWorker {
  worker: Worker
  pending: Map<number, Job>
}

let pool: PoolWorker[] | null = null
let nextRequestId = 1

function ensurePool(): PoolWorker[] {
  if (pool) return pool
  pool = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })
    const pending = new Map<number, Job>()
    w.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as { type: string; requestId: number; result?: SimResult; message?: string }
      const job = pending.get(data.requestId)
      if (!job) return
      pending.delete(data.requestId)
      if (data.type === 'runDayResult' && data.result) {
        job.resolve(data.result)
      } else if (data.type === 'runDayError') {
        job.reject(new Error(data.message ?? 'kernel worker error'))
      }
    })
    w.addEventListener('error', () => {
      for (const job of pending.values()) job.reject(new Error('worker crashed'))
      pending.clear()
    })
    pool.push({ worker: w, pending })
  }
  return pool
}

export interface RunManyOptions {
  days: number
  baseSeed: number
  onProgress?: (completed: number, total: number) => void
}

/** Runs `days` simulations across the worker pool. Returns the array of results in dayIndex order. */
export async function runManyInPool(scenario: Scenario, opts: RunManyOptions): Promise<SimResult[]> {
  const { days, baseSeed, onProgress } = opts
  const workers = ensurePool()
  const results: SimResult[] = new Array(days)
  let completed = 0

  const promises: Promise<void>[] = []
  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const slot = workers[dayIndex % POOL_SIZE]
    const requestId = nextRequestId++
    const seededScenario: Scenario = { ...scenario, rngSeed: dayRngSeed(baseSeed, dayIndex) }
    const p = new Promise<void>((resolve, reject) => {
      slot.pending.set(requestId, {
        dayIndex,
        resolve: r => {
          results[dayIndex] = r
          completed++
          onProgress?.(completed, days)
          resolve()
        },
        reject,
      })
      slot.worker.postMessage({ type: 'runDay', requestId, scenario: seededScenario })
    })
    promises.push(p)
  }

  await Promise.all(promises)
  return results
}
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/workers/monteCarloClient.ts
git commit -m "feat(monte-carlo): worker pool client with progress callback"
```

---

## Task 4: `setRngSeed` on ScenarioContext

**Files:**
- Modify: `app/components/cockpit/ScenarioContext.tsx`

The "Replay worst day" button needs to lift a specific seed into the scenario.

- [ ] **Step 1: Update the file**

In the `ScenarioContextValue` interface, add (alphabetically alongside the other setters; place after `reseed`):

```ts
  setRngSeed: (seed: number) => void
```

In `ScenarioProvider`, add the implementation:

```ts
  const setRngSeed = useCallback((seed: number) => setScenario(s => ({ ...s, rngSeed: seed })), [])
```

And include `setRngSeed` in the provider value object.

The full file should now read:

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
  setRngSeed: (seed: number) => void
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
  const setRngSeed = useCallback((seed: number) => setScenario(s => ({ ...s, rngSeed: seed })), [])
  const addInjection = useCallback((ev: InjectedEvent) => {
    setScenario(s => ({ ...s, injectedEvents: [...s.injectedEvents, ev] }))
  }, [])
  const clearInjections = useCallback(() => setScenario(s => ({ ...s, injectedEvents: [] })), [])

  return (
    <ScenarioContext.Provider value={{
      scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed, setRngSeed,
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
git commit -m "feat(scenario): expose setRngSeed for worst-day replay"
```

---

## Task 5: `MonteCarloFanChart` component

**Files:**
- Create: `app/components/cockpit/monte/MonteCarloFanChart.tsx`

Chart.js area chart with three series: P10–P90 band (filled), P50 line, optional worst-day overlay. Plus a horizontal target line.

- [ ] **Step 1: Create the file** (the directory `app/components/cockpit/monte/` does not exist yet — create it)

```tsx
'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import type { FanIntervalStat } from '@/lib/animation/fanStats'

interface MonteCarloFanChartProps {
  perInterval: FanIntervalStat[]
  targetSl: number
  showWorstDay: boolean
}

export function MonteCarloFanChart({ perInterval, targetSl, showWorstDay }: MonteCarloFanChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const labels = Array.from({ length: perInterval.length }, (_, i) =>
      i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}` : ''
    )

    const p10 = perInterval.map(s => s.p10 * 100)
    const p50 = perInterval.map(s => s.p50 * 100)
    const p90 = perInterval.map(s => s.p90 * 100)
    const worst = perInterval.map(s => s.worstDay * 100)

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'P10',
            data: p10,
            borderColor: 'rgba(59,130,246,0.4)',
            backgroundColor: 'rgba(59,130,246,0.0)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'P10–P90 band',
            data: p90,
            borderColor: 'rgba(59,130,246,0.4)',
            backgroundColor: 'rgba(59,130,246,0.18)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.3,
            fill: '-1',
          },
          {
            label: 'P50 (median)',
            data: p50,
            borderColor: '#fff',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          ...(showWorstDay ? [{
            label: 'Worst day',
            data: worst,
            borderColor: '#ef4444',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 3],
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          }] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: {
            min: 0, max: 100,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            title: { display: true, text: 'Service Level (%)', color: '#94a3b8' },
          },
        },
      },
      plugins: [
        {
          id: 'targetLine',
          afterDraw(chart) {
            const { ctx, chartArea, scales } = chart
            const yScale = scales.y
            const y = yScale.getPixelForValue(targetSl * 100)
            ctx.save()
            ctx.strokeStyle = '#10b981'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            ctx.moveTo(chartArea.left, y)
            ctx.lineTo(chartArea.right, y)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.fillStyle = '#10b981'
            ctx.font = '10px system-ui'
            ctx.fillText(`SL target ${(targetSl * 100).toFixed(0)}%`, chartArea.left + 4, y - 4)
            ctx.restore()
          },
        },
      ],
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [perInterval, targetSl, showWorstDay])

  return (
    <div className="cockpit-monte-fan-container">
      <canvas ref={canvasRef} />
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/monte/MonteCarloFanChart.tsx
git commit -m "feat(monte-carlo): fan chart with P10/P50/P90 bands and target line"
```

---

## Task 6: `MonteCarloStats` component

**Files:**
- Create: `app/components/cockpit/monte/MonteCarloStats.tsx`

Right-column stats: days below SL count, P50 SL, P10 SL ("bad day"), and the Replay-worst-day button.

- [ ] **Step 1: Create the file**

```tsx
'use client'

interface MonteCarloStatsProps {
  daysBelowSl: number
  totalDays: number
  p50Sl: number       // 0..1
  p10Sl: number       // 0..1
  onReplayWorstDay: () => void
  replayDisabled: boolean
}

export function MonteCarloStats({
  daysBelowSl, totalDays, p50Sl, p10Sl, onReplayWorstDay, replayDisabled,
}: MonteCarloStatsProps) {
  const pctBelow = totalDays > 0 ? (daysBelowSl / totalDays) * 100 : 0
  return (
    <div className="cockpit-monte-stats">
      <div className="cockpit-monte-stat">
        <div className="cockpit-monte-stat-label">Days below SL</div>
        <div className="cockpit-monte-stat-value cockpit-monte-stat-value--red">
          {pctBelow.toFixed(1)}%
        </div>
        <div className="cockpit-monte-stat-sub">{daysBelowSl} of {totalDays}</div>
      </div>
      <div className="cockpit-monte-stat">
        <div className="cockpit-monte-stat-label">P50 SL</div>
        <div className="cockpit-monte-stat-value cockpit-monte-stat-value--green">
          {(p50Sl * 100).toFixed(1)}%
        </div>
      </div>
      <div className="cockpit-monte-stat">
        <div className="cockpit-monte-stat-label">P10 SL · "bad day"</div>
        <div className="cockpit-monte-stat-value cockpit-monte-stat-value--amber">
          {(p10Sl * 100).toFixed(1)}%
        </div>
      </div>
      <button
        type="button"
        className="cockpit-monte-replay-btn"
        disabled={replayDisabled}
        onClick={onReplayWorstDay}
      >
        ▶ Replay worst day
      </button>
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/monte/MonteCarloStats.tsx
git commit -m "feat(monte-carlo): stats column with replay-worst-day button"
```

---

## Task 7: Replace `MonteCarloTab` with the full integration

**Files:**
- Modify: `app/components/cockpit/tabs/MonteCarloTab.tsx`

Wire the kernel pool, summarize streaming results, render the fan + stats. Calls a parent-provided `onReplayWorstDay(seed)` to switch tabs.

- [ ] **Step 1: Replace the file**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runManyInPool } from '@/app/workers/monteCarloClient'
import { summarizeRuns, type RunsSummary } from '@/lib/animation/fanStats'
import { MonteCarloFanChart } from '../monte/MonteCarloFanChart'
import { MonteCarloStats } from '../monte/MonteCarloStats'
import type { SimResult } from '@/lib/types'
import { dayRngSeed } from '@/lib/kernel/monteCarlo'

const TOTAL_DAYS = 1000

export interface MonteCarloTabProps {
  onReplayWorstDay?: (seed: number) => void
}

export function MonteCarloTab({ onReplayWorstDay }: MonteCarloTabProps = {}) {
  const { scenario } = useScenario()
  const [progress, setProgress] = useState({ completed: 0, total: TOTAL_DAYS })
  const [summary, setSummary] = useState<RunsSummary | null>(null)
  const [running, setRunning] = useState(false)
  const [resultsRef, setResultsRef] = useState<SimResult[]>([])

  useEffect(() => {
    let cancelled = false
    setRunning(true)
    setSummary(null)
    setResultsRef([])
    setProgress({ completed: 0, total: TOTAL_DAYS })

    const collected: SimResult[] = []
    let lastSummaryAt = 0

    runManyInPool(scenario, {
      days: TOTAL_DAYS,
      baseSeed: scenario.rngSeed,
      onProgress: (completed, total) => {
        if (cancelled) return
        setProgress({ completed, total })
      },
    })
      .then(results => {
        if (cancelled) return
        // Final summarization once everything is done
        const s = summarizeRuns(results, scenario.sl / 100)
        setSummary(s)
        setResultsRef(results)
        setRunning(false)
      })
      .catch(() => {
        if (cancelled) return
        setRunning(false)
      })

    // Note: we deliberately summarize once at the end (instead of streaming) for Phase 3 simplicity;
    // 1k days × 4 workers finishes in ~6-8s. Streaming partial fans is a Phase 5 polish.
    // Suppress unused-warning by referencing the throttle anchor.
    void lastSummaryAt
    void collected

    return () => { cancelled = true }
  }, [scenario])

  function handleReplay() {
    if (!summary || summary.worstDayIdx < 0 || !onReplayWorstDay) return
    const seed = dayRngSeed(scenario.rngSeed, summary.worstDayIdx)
    onReplayWorstDay(seed)
  }

  return (
    <div className="cockpit-viewport cockpit-monte-viewport">
      <div className="cockpit-viewport-header">
        <span>Monte Carlo · 1,000 simulated days</span>
        <span className="cockpit-viewport-sub">
          {running
            ? `running ${progress.completed}/${progress.total}…`
            : summary
              ? `worst day: idx ${summary.worstDayIdx} · seed ${dayRngSeed(scenario.rngSeed, summary.worstDayIdx)}`
              : ''}
        </span>
      </div>
      <div className="cockpit-viewport-body cockpit-monte-body">
        <div className="cockpit-monte-chart-frame">
          {summary
            ? <MonteCarloFanChart
                perInterval={summary.perInterval}
                targetSl={summary.targetSl}
                showWorstDay
              />
            : <div className="cockpit-placeholder"><p>{running ? 'Running 1,000 simulations…' : 'Waiting…'}</p></div>}
        </div>
        <MonteCarloStats
          daysBelowSl={summary?.daysBelowSl ?? 0}
          totalDays={TOTAL_DAYS}
          p50Sl={summary && summary.perInterval.length
            ? summary.perInterval[Math.floor(summary.perInterval.length / 2)].p50
            : 0}
          p10Sl={summary && summary.perInterval.length
            ? summary.perInterval[Math.floor(summary.perInterval.length / 2)].p10
            : 0}
          onReplayWorstDay={handleReplay}
          replayDisabled={!summary || summary.worstDayIdx < 0}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: tsc clean, 62 tests still passing, build green.

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/tabs/MonteCarloTab.tsx
git commit -m "feat(monte-carlo): full tab with worker pool + fan + stats"
```

---

## Task 8: Wire `replayWorstDay` through `Cockpit`

**Files:**
- Modify: `app/components/cockpit/Cockpit.tsx`

Add the cross-tab callback that flips to Live and updates the seed.

- [ ] **Step 1: Replace the file**

```tsx
'use client'

import { useState } from 'react'
import { ScenarioProvider, useScenario } from './ScenarioContext'
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

function CockpitInner() {
  const [tab, setTab] = useState<TabKey>('live')
  const [live, setLive] = useState<LiveData | null>(null)
  const { setRngSeed } = useScenario()

  const liveProps: LiveSimTabProps = { onLiveChange: setLive }
  const simTimeMin = live?.simTimeMin ?? 0

  function handleReplayWorstDay(seed: number) {
    setRngSeed(seed)
    setTab('live')
  }

  return (
    <div className="cockpit">
      <Header active={tab} onChange={setTab} />
      <div className="cockpit-body">
        <Sidebar currentSimTimeMin={tab === 'live' ? simTimeMin : 0} />
        <main className="cockpit-main">
          {tab === 'live'    && <LiveSimTab {...liveProps} />}
          {tab === 'monte'   && <MonteCarloTab onReplayWorstDay={handleReplayWorstDay} />}
          {tab === 'roster'  && <RosterTab />}
          {tab === 'classic' && <ClassicTab />}
        </main>
      </div>
      <KpiStrip live={tab === 'live' && live ? { stats: live.stats, abandons: live.abandons } : null} />
    </div>
  )
}

export function Cockpit() {
  return (
    <ScenarioProvider>
      <CockpitInner />
    </ScenarioProvider>
  )
}
```

The split is necessary because `useScenario` requires being inside `ScenarioProvider`. `Cockpit` provides; `CockpitInner` consumes.

- [ ] **Step 2: tsc + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/Cockpit.tsx
git commit -m "feat(cockpit): replay-worst-day cross-tab handoff"
```

---

## Task 9: CSS for fan chart + stats column

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: APPEND the following block to `app/globals.css`**

```css
/* ───────── Cockpit Phase 3 (Monte Carlo) ───────── */

.cockpit-monte-viewport .cockpit-monte-body {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

.cockpit-monte-chart-frame {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.75rem;
  min-height: 280px;
  display: flex;
  flex-direction: column;
}
.cockpit-monte-fan-container {
  flex: 1;
  position: relative;
  min-height: 240px;
}

.cockpit-monte-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.cockpit-monte-stat {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}
.cockpit-monte-stat-label {
  opacity: 0.6;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cockpit-monte-stat-value {
  font-weight: 700;
  font-size: 1.4rem;
  margin-top: 0.2rem;
}
.cockpit-monte-stat-value--red { color: #ef4444; }
.cockpit-monte-stat-value--green { color: #10b981; }
.cockpit-monte-stat-value--amber { color: #fbbf24; }
.cockpit-monte-stat-sub {
  opacity: 0.6;
  font-size: 0.65rem;
  margin-top: 0.1rem;
}
.cockpit-monte-replay-btn {
  background: #ef4444;
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 0.6rem;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  margin-top: 0.5rem;
}
.cockpit-monte-replay-btn:disabled {
  background: #334155;
  color: #64748b;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add app/globals.css
git commit -m "feat(css): monte carlo fan + stats styles"
```

---

## Task 10: End-to-end manual verification

**Files:** none

- [ ] **Step 1: Run automated checks**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all green for new code (the 7 pre-existing `/learn` lint errors persist; do not fix them in this PR).

- [ ] **Step 2: Run dev server and verify in browser**

```bash
npm run dev
```

Open the local URL. Verify:

- Click the **Monte Carlo** tab. Status text shows "running 0/1000…" then progresses. Within ~10 seconds, the fan chart appears.
- Fan shape: light blue P10–P90 band, white P50 median line, red dashed worst-day overlay, green dashed target SL line at the user's SL target.
- Stats column shows three values (Days below SL %, P50 SL %, P10 SL %) plus an enabled "▶ Replay worst day" button.
- Click "▶ Replay worst day" — tab switches to Live Sim, the agent canvas loads with that day's seed (sub-header may show a different total SL than before).
- Press play. Watch the bad day animate.
- Switch back to Monte Carlo — same fan re-renders quickly (results are cached per scenario, will re-run because state was lost; that's OK for Phase 3, can be cached in Phase 4 if needed).
- Adjust a slider in the sidebar (e.g. AHT). Monte Carlo tab triggers a new run.

- [ ] **Step 3: Final cleanup commit if anything tweaked**

```bash
git status
# If anything was tweaked:
git add -A
git commit -m "chore: phase 3 verification cleanups"
```

Otherwise skip.

---

## Task 11: Branch handoff

**Files:** none

- [ ] **Step 1: Confirm branch state**

```bash
git status
git log --oneline feat/cockpit-phase2..HEAD
```

Expected: clean working tree, ~10 commits on `feat/cockpit-phase3` since branching from Phase 2.

- [ ] **Step 2: Print summary**

```
Phase 3 complete on feat/cockpit-phase3.
- runManyDays helper (deterministic) + tests
- summarizeRuns aggregation + tests
- Worker pool of 4 workers
- Fan chart (P10/P50/P90 + target line + worst day)
- Stats column with replay-worst-day button
- Cross-tab replay seeds Live Sim
- Tests passing, build green, lint green for new code
```

---

## Self-review

**Spec coverage (Phase 3 row):**

| Spec requirement | Covered by |
| --- | --- |
| Worker pool ×4 running 1,000 days | Task 3 |
| Fan chart (P10/P50/P90) with target line | Task 5 |
| Worst-day overlay | Task 5 |
| "Days below SL" + "P10 SL" stats | Task 6 |
| "Replay worst day" → seed Live + switch tab | Tasks 4, 7, 8 |

All clauses addressed.

**Type consistency check:**
- `RunsSummary` and `FanIntervalStat` defined in Task 2, used in Tasks 5, 6, 7. Consistent.
- `setRngSeed` defined in Task 4, used in Task 8. Consistent.
- `dayRngSeed` defined in Task 1, used in Tasks 3, 7. Consistent.
- `MonteCarloTabProps` defined in Task 7, used in Task 8.

**Placeholder scan:** every code step shows full code; every test step has full assertions; every command has expected output where relevant.

**Open question for review:** the Monte Carlo run discards intermediate fan-chart updates — only the final summary renders. For Phase 3 (1,000 days finishes in ~6–8s) this feels fine; if a stakeholder wants the chart filling in live, that's a small follow-up (debounced re-summarize in `onProgress`). Worth flagging in the design conversation.

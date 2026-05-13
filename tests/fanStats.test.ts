import { describe, it, expect } from 'vitest'
import type { SimResult, IntervalStat } from '@/lib/types'
import { summarizeRuns } from '@/lib/animation/fanStats'
import { computeVerdict } from '@/app/components/cockpit/monte/RiskVerdict'

interface FakeRunOpts {
  perIntervalSls: number[]
  totalSl: number
  abandons?: number[]
  occ?: number[]
  asa?: number[]
  totalsAbandons?: number
  totalsAsa?: number
  agents?: number[]
}

function fakeRun(opts: FakeRunOpts): SimResult {
  const perInterval: IntervalStat[] = opts.perIntervalSls.map((sl, i) => ({
    sl,
    agents: opts.agents?.[i] ?? 100,
    queueLen: 0,
    abandons: opts.abandons?.[i] ?? 0,
    occ: opts.occ?.[i] ?? 0.85,
    asa: opts.asa?.[i] ?? 5,
  }))
  return {
    perInterval,
    events: [],
    totals: {
      sl: opts.totalSl,
      occ: 0.85,
      asa: opts.totalsAsa ?? 5,
      abandons: opts.totalsAbandons ?? (opts.abandons ? opts.abandons.reduce((a, b) => a + b, 0) : 0),
      cost: 0,
    },
  }
}

// Convenience for the legacy 2-arg shape
function fakeRunSimple(perIntervalSls: number[], totalSl: number): SimResult {
  return fakeRun({ perIntervalSls, totalSl })
}

describe('summarizeRuns', () => {
  it('handles empty input', () => {
    const s = summarizeRuns([], 0.8)
    expect(s.perInterval).toHaveLength(0)
    expect(s.fanStats.sl.perInterval).toHaveLength(0)
    expect(s.fanStats.abandons.perInterval).toHaveLength(0)
    expect(s.fanStats.occupancy.perInterval).toHaveLength(0)
    expect(s.fanStats.asa.perInterval).toHaveLength(0)
    expect(s.dailyTotals).toEqual([])
    expect(s.worstDayIdx).toBe(-1)
    expect(s.bestDayIdx).toBe(-1)
    expect(s.medianDayIdx).toBe(-1)
    expect(s.daysBelowSl).toBe(0)
    expect(s.targetSl).toBe(0.8)
    expect(s.spaghettiSamples).toEqual([])
  })

  it('computes per-interval P10/P50/P90 for SL', () => {
    const runs: SimResult[] = []
    for (let i = 0; i < 100; i++) {
      const sls = [i / 99, 1, 1].slice(0, 3)
      runs.push(fakeRunSimple(sls, 0.85))
    }
    const s = summarizeRuns(runs, 0.8)
    expect(s.fanStats.sl.perInterval).toHaveLength(3)
    expect(s.fanStats.sl.perInterval[0].p50).toBeGreaterThan(0.45)
    expect(s.fanStats.sl.perInterval[0].p50).toBeLessThan(0.55)
    expect(s.fanStats.sl.perInterval[0].p10).toBeLessThan(s.fanStats.sl.perInterval[0].p50)
    expect(s.fanStats.sl.perInterval[0].p90).toBeGreaterThan(s.fanStats.sl.perInterval[0].p50)
    // Backwards-compat alias
    expect(s.perInterval).toBe(s.fanStats.sl.perInterval)
  })

  it('finds the worst, best, and median days by totals.sl', () => {
    const runs = [
      fakeRunSimple([0.9, 0.9], 0.92),  // best
      fakeRunSimple([0.5, 0.5], 0.55),  // worst
      fakeRunSimple([0.85, 0.85], 0.88),
      fakeRunSimple([0.8, 0.8], 0.80),
      fakeRunSimple([0.78, 0.78], 0.78),
    ]
    const s = summarizeRuns(runs, 0.8)
    expect(s.worstDayIdx).toBe(1)
    expect(s.bestDayIdx).toBe(0)
    // sorted-by-sl: [1(0.55), 4(0.78), 3(0.80), 2(0.88), 0(0.92)] → middle is idx 3
    expect(s.medianDayIdx).toBe(3)
    expect(s.fanStats.sl.perInterval[0].worstDay).toBe(0.5)
  })

  it('counts days below target SL', () => {
    const runs = [
      fakeRunSimple([1, 1], 0.9),
      fakeRunSimple([1, 1], 0.85),
      fakeRunSimple([1, 1], 0.7),
      fakeRunSimple([1, 1], 0.65),
    ]
    const s = summarizeRuns(runs, 0.8)
    expect(s.daysBelowSl).toBe(2)
  })

  it('computes per-metric fans for abandons, occupancy, asa', () => {
    const runs: SimResult[] = []
    for (let i = 0; i < 50; i++) {
      runs.push(fakeRun({
        perIntervalSls: [0.9, 0.9],
        totalSl: 0.9,
        abandons: [i, 2 * i],
        occ: [0.5 + i / 200, 0.6],
        asa: [i, 10],
        agents: [100, 100],
      }))
    }
    const s = summarizeRuns(runs, 0.8)
    expect(s.fanStats.abandons.perInterval).toHaveLength(2)
    expect(s.fanStats.occupancy.perInterval).toHaveLength(2)
    expect(s.fanStats.asa.perInterval).toHaveLength(2)
    // Abandons interval 0: values 0..49 → P10 < P50 < P90
    expect(s.fanStats.abandons.perInterval[0].p10).toBeLessThan(
      s.fanStats.abandons.perInterval[0].p50
    )
    expect(s.fanStats.abandons.perInterval[0].p90).toBeGreaterThan(
      s.fanStats.abandons.perInterval[0].p50
    )
    expect(s.fanStats.asa.perInterval[1].p50).toBe(10)  // constant
  })

  it('computes daily totals including weighted occupancy', () => {
    const runs = [
      fakeRun({
        perIntervalSls: [1, 1],
        totalSl: 1,
        agents: [200, 0],   // all weight on first interval
        occ: [0.9, 0.1],
        abandons: [3, 5],
        totalsAbandons: 8,
        totalsAsa: 12,
      }),
    ]
    const s = summarizeRuns(runs, 0.8)
    expect(s.dailyTotals).toHaveLength(1)
    expect(s.dailyTotals[0].abandons).toBe(8)
    expect(s.dailyTotals[0].asa).toBe(12)
    // Weighted occupancy = 0.9*200 / 200 = 0.9
    expect(s.dailyTotals[0].occupancy).toBeCloseTo(0.9, 5)
  })

  it('caps spaghetti samples at 200', () => {
    const runs: SimResult[] = []
    for (let i = 0; i < 1000; i++) {
      runs.push(fakeRunSimple([i / 1000, 0.9, 0.95], 0.9))
    }
    const s = summarizeRuns(runs, 0.8)
    expect(s.spaghettiSamples.length).toBeLessThanOrEqual(200)
    expect(s.spaghettiSamples.length).toBeGreaterThan(0)
    expect(s.spaghettiSamples[0]).toHaveLength(3)
  })

  it('uses all samples when fewer than 200 days', () => {
    const runs: SimResult[] = []
    for (let i = 0; i < 50; i++) {
      runs.push(fakeRunSimple([0.9, 0.9, 0.9], 0.9))
    }
    const s = summarizeRuns(runs, 0.8)
    expect(s.spaghettiSamples).toHaveLength(50)
  })
})

describe('computeVerdict', () => {
  it('returns robust when P10 meets or exceeds target', () => {
    expect(computeVerdict(0.85, 0.80)).toBe('robust')
    expect(computeVerdict(0.80, 0.80)).toBe('robust')
  })

  it('returns healthy when P10 is within 5pp below target', () => {
    expect(computeVerdict(0.78, 0.80)).toBe('healthy')
    expect(computeVerdict(0.76, 0.80)).toBe('healthy')
  })

  it('returns fragile when P10 is 5-15pp below target', () => {
    expect(computeVerdict(0.70, 0.80)).toBe('fragile')
    expect(computeVerdict(0.66, 0.80)).toBe('fragile')
  })

  it('returns risky when P10 is more than 15pp below target', () => {
    expect(computeVerdict(0.60, 0.80)).toBe('risky')
    expect(computeVerdict(0.40, 0.80)).toBe('risky')
  })
})

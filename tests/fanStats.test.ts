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

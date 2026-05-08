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

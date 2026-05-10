import type { SimResult } from '@/lib/types'

export interface FanIntervalStat {
  p10: number
  p50: number
  p90: number
  worstDay: number   // metric value for that interval on the worst day (by SL)
}

export interface MetricFanStats {
  perInterval: FanIntervalStat[]
}

export type MetricKey = 'sl' | 'abandons' | 'occupancy' | 'asa'

export interface DailyTotals {
  sl: number          // 0..1
  abandons: number    // count
  occupancy: number   // 0..1 — average across intervals weighted by call volume
  asa: number         // seconds — average across day (use totals.asa)
}

export interface RunsSummary {
  fanStats: {
    sl: MetricFanStats
    abandons: MetricFanStats
    occupancy: MetricFanStats
    asa: MetricFanStats
  }
  /** Backwards-compatible alias for fanStats.sl.perInterval */
  perInterval: FanIntervalStat[]
  dailyTotals: DailyTotals[]
  worstDayIdx: number    // by SL (lowest)
  bestDayIdx: number     // by SL (highest)
  medianDayIdx: number   // P50 day by SL
  daysBelowSl: number
  targetSl: number
  /** Up to 200 representative full-day SL curves (per-interval SL 0..1). */
  spaghettiSamples: number[][]
}

const SPAGHETTI_MAX = 200

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * sortedAsc.length)))
  return sortedAsc[idx]
}

function emptyMetric(): MetricFanStats {
  return { perInterval: [] }
}

function computeMetricFan(
  results: SimResult[],
  intervalCount: number,
  worstDayIdx: number,
  pick: (i: number, k: number) => number,
): MetricFanStats {
  const perInterval: FanIntervalStat[] = []
  for (let i = 0; i < intervalCount; i++) {
    const samples = results.map((_, k) => pick(i, k)).sort((a, b) => a - b)
    perInterval.push({
      p10: percentile(samples, 0.10),
      p50: percentile(samples, 0.50),
      p90: percentile(samples, 0.90),
      worstDay: pick(i, worstDayIdx),
    })
  }
  return { perInterval }
}

export function summarizeRuns(results: SimResult[], targetSl: number): RunsSummary {
  if (results.length === 0) {
    return {
      fanStats: {
        sl: emptyMetric(),
        abandons: emptyMetric(),
        occupancy: emptyMetric(),
        asa: emptyMetric(),
      },
      perInterval: [],
      dailyTotals: [],
      worstDayIdx: -1,
      bestDayIdx: -1,
      medianDayIdx: -1,
      daysBelowSl: 0,
      targetSl,
      spaghettiSamples: [],
    }
  }

  // Find worst (lowest SL) and best (highest SL) days
  let worstDayIdx = 0
  let bestDayIdx = 0
  for (let i = 1; i < results.length; i++) {
    if (results[i].totals.sl < results[worstDayIdx].totals.sl) worstDayIdx = i
    if (results[i].totals.sl > results[bestDayIdx].totals.sl) bestDayIdx = i
  }

  // Median day by SL: sort indices by SL, take middle
  const orderedBySl = results
    .map((r, idx) => ({ idx, sl: r.totals.sl }))
    .sort((a, b) => a.sl - b.sl)
  const medianDayIdx = orderedBySl[Math.floor(orderedBySl.length / 2)].idx

  // Daily totals
  const dailyTotals: DailyTotals[] = results.map(r => {
    let weightedOccNum = 0
    let weightedOccDen = 0
    for (const iv of r.perInterval) {
      const w = iv.agents
      weightedOccNum += iv.occ * w
      weightedOccDen += w
    }
    return {
      sl: r.totals.sl,
      abandons: r.totals.abandons,
      occupancy: weightedOccDen > 0 ? weightedOccNum / weightedOccDen : 0,
      asa: r.totals.asa,
    }
  })

  // Per-metric per-interval fan stats
  const intervalCount = results[0].perInterval.length
  const sl = computeMetricFan(results, intervalCount, worstDayIdx,
    (i, k) => results[k].perInterval[i].sl)
  const abandons = computeMetricFan(results, intervalCount, worstDayIdx,
    (i, k) => results[k].perInterval[i].abandons)
  const occupancy = computeMetricFan(results, intervalCount, worstDayIdx,
    (i, k) => results[k].perInterval[i].occ)
  const asa = computeMetricFan(results, intervalCount, worstDayIdx,
    (i, k) => results[k].perInterval[i].asa)

  // Spaghetti samples — stride-pick up to SPAGHETTI_MAX days of per-interval SL
  const spaghettiSamples: number[][] = []
  const stride = Math.max(1, Math.floor(results.length / SPAGHETTI_MAX))
  for (let k = 0; k < results.length && spaghettiSamples.length < SPAGHETTI_MAX; k += stride) {
    spaghettiSamples.push(results[k].perInterval.map(s => s.sl))
  }

  const daysBelowSl = results.filter(r => r.totals.sl < targetSl).length

  return {
    fanStats: { sl, abandons, occupancy, asa },
    perInterval: sl.perInterval,
    dailyTotals,
    worstDayIdx,
    bestDayIdx,
    medianDayIdx,
    daysBelowSl,
    targetSl,
    spaghettiSamples,
  }
}

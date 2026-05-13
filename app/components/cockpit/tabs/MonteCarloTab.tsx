'use client'

import { useEffect, useMemo, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runManyInPool } from '@/app/workers/monteCarloClient'
import { summarizeRuns, type RunsSummary, type MetricKey } from '@/lib/animation/fanStats'
import { MonteCarloFanChart } from '../monte/MonteCarloFanChart'
import { MonteCarloStats, type ReplayKind } from '../monte/MonteCarloStats'
import { RiskVerdict } from '../monte/RiskVerdict'
import { MetricTabs } from '../monte/MetricTabs'
import { DailyHistogram } from '../monte/DailyHistogram'
import type { Scenario } from '@/lib/types'
import { dayRngSeed } from '@/lib/kernel/monteCarlo'
import { TabIntroStrip } from '../onboarding/TabIntroStrip'
import { TabIntroReopenLink } from '../onboarding/TabIntroReopenLink'

const TOTAL_DAYS = 1000

export interface MonteCarloTabProps {
  /** Backwards-compatible: parent passes a seed of any chosen day to replay. */
  onReplayWorstDay?: (seed: number) => void
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor(p * sortedAsc.length)))
  return sortedAsc[idx]
}

function dailyValuesFor(summary: RunsSummary, metric: MetricKey): number[] {
  switch (metric) {
    case 'sl':        return summary.dailyTotals.map(d => d.sl)
    case 'abandons':  return summary.dailyTotals.map(d => d.abandons)
    case 'occupancy': return summary.dailyTotals.map(d => d.occupancy)
    case 'asa':       return summary.dailyTotals.map(d => d.asa)
  }
}

export function MonteCarloTab({ onReplayWorstDay }: MonteCarloTabProps = {}) {
  const { scenario } = useScenario()
  const [progress, setProgress] = useState({ completed: 0, total: TOTAL_DAYS })
  const [summary, setSummary] = useState<RunsSummary | null>(null)
  const [shownScenario, setShownScenario] = useState<Scenario | null>(null)
  const [metric, setMetric] = useState<MetricKey>('sl')

  const running = scenario !== shownScenario

  useEffect(() => {
    let cancelled = false

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
        setSummary(summarizeRuns(results, scenario.sl / 100))
        setShownScenario(scenario)
      })
      .catch(() => {
        if (cancelled) return
        setShownScenario(scenario)  // unblock the running flag even on failure
      })

    return () => { cancelled = true }
  }, [scenario])

  function handleReplay(kind: ReplayKind) {
    if (!summary || !onReplayWorstDay) return
    let idx = -1
    if (kind === 'worst') idx = summary.worstDayIdx
    else if (kind === 'best') idx = summary.bestDayIdx
    else if (kind === 'median') idx = summary.medianDayIdx
    if (idx < 0) return
    onReplayWorstDay(dayRngSeed(scenario.rngSeed, idx))
  }

  const fanData = summary?.fanStats[metric]
  const dailyValues = useMemo(() => summary ? dailyValuesFor(summary, metric) : [], [summary, metric])
  const sortedDaily = useMemo(() => [...dailyValues].sort((a, b) => a - b), [dailyValues])
  const dailyP10 = percentile(sortedDaily, 0.10)
  const dailyP50 = percentile(sortedDaily, 0.50)
  const dailyP90 = percentile(sortedDaily, 0.90)

  // P10 of daily SL totals (used by verdict + bad-day chip).
  const sortedDailySl = useMemo(
    () => summary ? [...summary.dailyTotals.map(d => d.sl)].sort((a, b) => a - b) : [],
    [summary]
  )
  const p10SlDaily = percentile(sortedDailySl, 0.10)
  const p50SlDaily = percentile(sortedDailySl, 0.50)

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
          {' '}<TabIntroReopenLink tab="monte" />
        </span>
      </div>
      <TabIntroStrip tab="monte" />
      <div className="cockpit-viewport-body cockpit-monte-body">
        {summary && !running ? (
          <RiskVerdict
            p10Sl={p10SlDaily}
            targetSl={summary.targetSl}
            daysBelowSl={summary.daysBelowSl}
            totalDays={summary.dailyTotals.length}
          />
        ) : null}

        <div className="cockpit-monte-grid">
          <div className="cockpit-monte-chart-frame">
            <MetricTabs active={metric} onChange={setMetric} />
            {summary && !running && fanData
              ? <MonteCarloFanChart
                  perInterval={fanData.perInterval}
                  spaghettiSamples={metric === 'sl' ? summary.spaghettiSamples : undefined}
                  targetSl={summary.targetSl}
                  showWorstDay
                  metric={metric}
                />
              : <div className="cockpit-placeholder"><p>{running ? 'Running 1,000 simulations…' : 'Waiting…'}</p></div>}
          </div>
          <div className="cockpit-monte-side">
            {summary && !running ? (
              <DailyHistogram
                values={dailyValues}
                metric={metric}
                targetSl={summary.targetSl}
                p10={dailyP10}
                p50={dailyP50}
                p90={dailyP90}
              />
            ) : (
              <div className="cockpit-placeholder cockpit-monte-side-placeholder"><p>, </p></div>
            )}
          </div>
        </div>

        <MonteCarloStats
          daysBelowSl={summary?.daysBelowSl ?? 0}
          totalDays={summary?.dailyTotals.length ?? TOTAL_DAYS}
          p50Sl={p50SlDaily}
          p10Sl={p10SlDaily}
          onReplay={handleReplay}
          replayDisabled={!summary || running}
        />
      </div>
    </div>
  )
}

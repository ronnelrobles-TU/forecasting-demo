'use client'

import { useEffect, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runManyInPool } from '@/app/workers/monteCarloClient'
import { summarizeRuns, type RunsSummary } from '@/lib/animation/fanStats'
import { MonteCarloFanChart } from '../monte/MonteCarloFanChart'
import { MonteCarloStats } from '../monte/MonteCarloStats'
import type { Scenario } from '@/lib/types'
import { dayRngSeed } from '@/lib/kernel/monteCarlo'

const TOTAL_DAYS = 1000

export interface MonteCarloTabProps {
  onReplayWorstDay?: (seed: number) => void
}

export function MonteCarloTab({ onReplayWorstDay }: MonteCarloTabProps = {}) {
  const { scenario } = useScenario()
  const [progress, setProgress] = useState({ completed: 0, total: TOTAL_DAYS })
  const [summary, setSummary] = useState<RunsSummary | null>(null)
  const [shownScenario, setShownScenario] = useState<Scenario | null>(null)

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
          {summary && !running
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
          replayDisabled={!summary || summary.worstDayIdx < 0 || running}
        />
      </div>
    </div>
  )
}

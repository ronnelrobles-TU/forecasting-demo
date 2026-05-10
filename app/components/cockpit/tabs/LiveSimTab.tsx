'use client'

import { useEffect, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runDayInWorker } from '@/app/workers/kernelClient'
import type { IntervalStat, Scenario, SimResult } from '@/lib/types'
import { useAnimation } from '../timeline/useAnimation'
import { PlayControls } from '../timeline/PlayControls'
import { TimelineScrubber } from '../timeline/TimelineScrubber'
import { AgentScene } from '../agents/AgentScene'
import { intervalStatsAt } from '@/lib/animation/intervalAtTime'
import { TabIntroStrip } from '../onboarding/TabIntroStrip'
import { TabIntroReopenLink } from '../onboarding/TabIntroReopenLink'

interface LiveData {
  stats: IntervalStat
  abandons: number
  simTimeMin: number
  /** Round 5.7: scheduled headcount at this sim time, derived from
   *  stats.agents (Erlang productive count) by dividing out shrinkage
   *  and absenteeism. Used by the LIVE row of the KPI strip so the
   *  "Scheduled HC" cell is no longer blank. */
  scheduledHC: number
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

  useEffect(() => {
    let cancelled = false
    runDayInWorker(scenario).then(r => {
      if (cancelled) return
      setResult(r)
      setShownScenario(scenario)
    })
    return () => { cancelled = true }
  }, [scenario])

  useEffect(() => {
    if (!result || !onLiveChange) return
    const stats = intervalStatsAt(result.perInterval, simTimeMin)
    let abandons = 0
    for (const e of result.events) {
      if (e.type === 'call_abandon' && e.timeMin <= simTimeMin) abandons++
    }
    // Live Scheduled HC: same formula as the PLAN row but applied to the
    // current interval's productive count. Clamp shrink/abs to <95% so we
    // don't blow the denominator if the user dials extreme values.
    const shrinkFactor = 1 - Math.min(95, Math.max(0, scenario.shrink)) / 100
    const absFactor = 1 - Math.min(95, Math.max(0, scenario.abs)) / 100
    const scheduledHC = Math.ceil(stats.agents / shrinkFactor / absFactor)
    onLiveChange({ stats, abandons, simTimeMin, scheduledHC })
    // NOTE: do NOT clear `live` in the cleanup. The effect re-runs on every
    // simTimeMin tick, so a cleanup that nulls live would race with the new
    // value and leave the KPI strip blank (root cause of the missing strip).
    // We only want to clear when this tab unmounts, which is handled below.
  }, [result, simTimeMin, onLiveChange, scenario.shrink, scenario.abs])

  useEffect(() => {
    return () => { onLiveChange?.(null) }
  }, [onLiveChange])

  // Round 5.7: peakAgents is the *scheduled HC* (not the productive Erlang
  // count). Without this scaling, the agents-array passed into the office
  // viz was capped at the Erlang requirement, so at peak the floor looked
  // ~38% empty. We size the array to the full scheduled headcount so:
  //   • shrinkage activities (training/gym/break) can be filled
  //   • the absentee fraction (~9% by default) remains visible as empty
  //     desks marked with the AbsentMarker
  const peakErlang = result ? Math.max(1, ...result.perInterval.map(s => s.agents)) : 1
  const peakAgents = result
    ? Math.ceil(peakErlang / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    : 1

  return (
    <div className="cockpit-viewport cockpit-live-viewport">
      <div className="cockpit-viewport-header">
        <span>Live Sim · time machine</span>
        <span className="cockpit-viewport-sub">
          {running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}% · abandons: ${result?.totals.abandons ?? 0}`}
          {' '}<TabIntroReopenLink tab="live" />
        </span>
      </div>

      <TabIntroStrip tab="live" />

      <div className="cockpit-viewport-body">
        <div className="cockpit-agent-canvas-frame">
          {result
            ? <AgentScene
                events={result.events}
                peakAgents={peakAgents}
                simTimeMin={simTimeMin}
                deskCapacity={scenario.deskCapacity}
                absenteeismPct={scenario.abs}
                shrinkPct={scenario.shrink}
                perInterval={result.perInterval}
                simSpeed={speed}
              />
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

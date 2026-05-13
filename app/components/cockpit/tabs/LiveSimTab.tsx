'use client'

import { useEffect, useRef, useState } from 'react'
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

  // Throttle the live KPI push to 20 Hz. simTimeMin updates at the rAF rate
  // (60 Hz during playback), and each setLive in Cockpit cascades into a full
  // re-render of the cockpit chrome (Sidebar, KpiStrip, etc). React 19 trips
  // "Maximum update depth exceeded" when those renders take longer than a
  // frame because the update-depth counter doesn't reset between rAF ticks.
  // 20 Hz is plenty for visual KPI feedback and decouples render cost from
  // simTimeMin's update rate.
  const liveLastFireRef = useRef(0)
  const liveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const livePayloadRef = useRef<LiveData | null>(null)

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
    livePayloadRef.current = { stats, abandons, simTimeMin, scheduledHC }

    const THROTTLE_MS = 50
    const now = performance.now()
    const elapsed = now - liveLastFireRef.current

    if (elapsed >= THROTTLE_MS) {
      if (liveTimeoutRef.current !== null) {
        clearTimeout(liveTimeoutRef.current)
        liveTimeoutRef.current = null
      }
      liveLastFireRef.current = now
      onLiveChange(livePayloadRef.current)
    } else if (liveTimeoutRef.current === null) {
      // Schedule a trailing-edge call so the final simTimeMin (e.g. when the
      // user stops scrubbing or playback hits 24:00) still gets reported.
      liveTimeoutRef.current = setTimeout(() => {
        liveTimeoutRef.current = null
        liveLastFireRef.current = performance.now()
        const p = livePayloadRef.current
        if (p && onLiveChange) onLiveChange(p)
      }, THROTTLE_MS - elapsed)
    }
  }, [result, simTimeMin, onLiveChange, scenario.shrink, scenario.abs])

  useEffect(() => {
    return () => {
      if (liveTimeoutRef.current !== null) {
        clearTimeout(liveTimeoutRef.current)
        liveTimeoutRef.current = null
      }
    }
  }, [])

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
          {running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : ', '}% · abandons: ${result?.totals.abandons ?? 0}`}
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
                injectedEvents={scenario.injectedEvents}
                roster={scenario.roster}
                playing={playing}
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

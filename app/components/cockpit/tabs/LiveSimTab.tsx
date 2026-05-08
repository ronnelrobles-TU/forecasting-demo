'use client'

import { useEffect, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runDayInWorker } from '@/app/workers/kernelClient'
import type { IntervalStat, Scenario, SimResult } from '@/lib/types'
import { useAnimation } from '../timeline/useAnimation'
import { PlayControls } from '../timeline/PlayControls'
import { TimelineScrubber } from '../timeline/TimelineScrubber'
import { AgentDotCanvas } from '../agents/AgentDotCanvas'
import { intervalStatsAt } from '@/lib/animation/intervalAtTime'

interface LiveData {
  stats: IntervalStat
  abandons: number
  simTimeMin: number
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
    onLiveChange({ stats, abandons, simTimeMin })
    return () => onLiveChange(null)
  }, [result, simTimeMin, onLiveChange])

  const peakAgents = result ? Math.max(1, ...result.perInterval.map(s => s.agents)) : 1

  return (
    <div className="cockpit-viewport cockpit-live-viewport">
      <div className="cockpit-viewport-header">
        <span>Live Sim · time machine</span>
        <span className="cockpit-viewport-sub">
          {running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}% · abandons: ${result?.totals.abandons ?? 0}`}
        </span>
      </div>

      <div className="cockpit-viewport-body">
        <div className="cockpit-agent-canvas-frame">
          {result
            ? <AgentDotCanvas events={result.events} peakAgents={peakAgents} simTimeMin={simTimeMin} />
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

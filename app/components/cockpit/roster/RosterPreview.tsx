'use client'

// Round 11: mini Office preview embedded inside the Roster tab.
//
// Re-runs the sim in the kernel worker whenever the scenario (typically the
// roster) changes, then auto-plays through the day at a fixed speed so the
// user can immediately see the effect of dragging a shift on the Gantt:
// a 7am shift causes those agents to walk in through the door at 7am.
//
// Deliberately stripped down vs. the full LiveSimTab — no theme picker, no
// scrubber, no injected-event banners. Just the office viz + a clock.

import { useEffect, useMemo, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runDayInWorker } from '@/app/workers/kernelClient'
import { AgentScene } from '../agents/AgentScene'
import type { SimResult } from '@/lib/types'

// 12 sim minutes per real second ≈ 0.5× of the Live Sim's 1× preset
// (which advances 24 sim min per real second). Slow enough that morning
// arrivals are easy to follow without clicking play.
const PREVIEW_SIM_MIN_PER_REAL_SEC = 12

function formatHHMM(simMin: number): string {
  const h = Math.floor(simMin / 60).toString().padStart(2, '0')
  const m = Math.floor(simMin % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export function RosterPreview() {
  const { scenario } = useScenario()
  const [result, setResult] = useState<SimResult | null>(null)
  // Start at 6am — past midnight so most morning shifts are visibly ramping
  // shortly after the loop wraps.
  const [simTimeMin, setSimTimeMin] = useState(360)

  // Re-run the sim whenever the scenario changes. The worker keeps the UI
  // responsive even on big rosters.
  useEffect(() => {
    let cancelled = false
    runDayInWorker(scenario).then(r => {
      if (cancelled) return
      setResult(r)
    })
    return () => { cancelled = true }
  }, [scenario])

  // Auto-play loop. Wraps at 24h.
  useEffect(() => {
    let raf = 0
    let lastT = performance.now()
    function tick(now: number) {
      const dt = (now - lastT) / 1000
      lastT = now
      setSimTimeMin(t => (t + dt * PREVIEW_SIM_MIN_PER_REAL_SEC) % 1440)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // peakAgents must match the Live Sim sizing so the renderer's index-
  // based allocation stays consistent (otherwise a 50-agent roster would
  // render with a different in-office target than Live Sim shows).
  const peakAgents = useMemo(() => {
    if (!result) return 1
    const peakErlang = Math.max(1, ...result.perInterval.map(s => s.agents))
    return Math.ceil(peakErlang / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
  }, [result, scenario.shrink, scenario.abs])

  if (!result) {
    return (
      <div className="cockpit-roster-preview-frame">
        <div className="cockpit-roster-preview-loading">Loading preview…</div>
      </div>
    )
  }

  return (
    <div className="cockpit-roster-preview-frame">
      <div className="cockpit-roster-preview-header">
        <span className="cockpit-roster-preview-title">Live preview</span>
        <span className="cockpit-roster-preview-time">{formatHHMM(simTimeMin)}</span>
      </div>
      <div className="cockpit-roster-preview-canvas">
        <AgentScene
          events={result.events}
          peakAgents={peakAgents}
          simTimeMin={simTimeMin}
          deskCapacity={scenario.deskCapacity}
          absenteeismPct={scenario.abs}
          shrinkPct={scenario.shrink}
          perInterval={result.perInterval}
          roster={scenario.roster}
          injectedEvents={[]}
          showThemePicker={false}
        />
      </div>
      <div className="cockpit-roster-preview-help">
        Auto-plays at 0.5×. Edit shifts above to see arrivals shift through the door.
      </div>
    </div>
  )
}

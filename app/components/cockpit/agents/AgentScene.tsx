'use client'

import { useMemo } from 'react'
import type { InjectedEvent, IntervalStat, RosterShift, SimEvent } from '@/lib/types'
import type { Speed } from '@/lib/animation/timeScale'
import { agentStateAt, buildAgentTimelines } from '@/lib/animation/agentTimeline'
import { useScenario } from '../ScenarioContext'
import { THEME_REGISTRY } from './themes/AgentRenderer'
import { ThemePicker } from './ThemePicker'

interface AgentSceneProps {
  events: SimEvent[]
  peakAgents: number
  simTimeMin: number
  deskCapacity?: number
  absenteeismPct?: number
  shrinkPct?: number
  perInterval?: IntervalStat[]
  simSpeed?: Speed
  injectedEvents?: InjectedEvent[]
  /** Round 11: roster from the active scenario; renderer uses this to snap
   *  shift windows to the exact start/end the user dragged on the Gantt.
   *  Null → renderer falls back to interval-curve activation. */
  roster?: RosterShift[] | null
  /** When false, the embedded ThemePicker is not rendered (e.g., the mini
   *  Roster preview pins to one theme). */
  showThemePicker?: boolean
  /** Whether the parent timeline is currently playing. The Iso renderers use
   *  this to switch between video-playback "snap" (paused / scrubbing) and
   *  normal journey animations (playing). Optional — defaults to `true` so
   *  callers that don't pass it preserve the legacy always-animating
   *  behavior. */
  playing?: boolean
}

export function AgentScene({ events, peakAgents, simTimeMin, deskCapacity, absenteeismPct, shrinkPct, perInterval, simSpeed, injectedEvents, roster, showThemePicker = true, playing }: AgentSceneProps) {
  const { theme } = useScenario()

  const timelines = useMemo(
    () => buildAgentTimelines(events, peakAgents),
    [events, peakAgents],
  )

  const agents = useMemo(() => {
    const out: Array<{ id: string; state: ReturnType<typeof agentStateAt> }> = []
    for (let i = 0; i < peakAgents; i++) {
      const id = `A${i}`
      const tl = timelines[id]
      out.push({ id, state: tl ? agentStateAt(tl, simTimeMin) : 'idle' })
    }
    return out
  }, [timelines, peakAgents, simTimeMin])

  const Renderer = THEME_REGISTRY[theme]

  return (
    <div className="cockpit-agent-scene" data-theme={theme}>
      <Renderer
        agents={agents}
        peakAgents={peakAgents}
        simTimeMin={simTimeMin}
        events={events}
        deskCapacity={deskCapacity}
        absenteeismPct={absenteeismPct}
        shrinkPct={shrinkPct}
        perInterval={perInterval}
        simSpeed={simSpeed}
        injectedEvents={injectedEvents}
        roster={roster}
        playing={playing}
      />
      {showThemePicker && <ThemePicker />}
    </div>
  )
}

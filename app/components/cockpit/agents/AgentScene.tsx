'use client'

import { useMemo } from 'react'
import type { IntervalStat, SimEvent } from '@/lib/types'
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
}

export function AgentScene({ events, peakAgents, simTimeMin, deskCapacity, absenteeismPct, shrinkPct, perInterval, simSpeed }: AgentSceneProps) {
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
    <div className="cockpit-agent-scene">
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
      />
      <ThemePicker />
    </div>
  )
}

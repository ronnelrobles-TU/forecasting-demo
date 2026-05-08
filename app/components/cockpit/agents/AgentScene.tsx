'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimEvent } from '@/lib/types'
import { agentStateAt, buildAgentTimelines } from '@/lib/animation/agentTimeline'
import { useScenario } from '../ScenarioContext'
import { THEME_REGISTRY } from './themes/AgentRenderer'
import { ThemePicker } from './ThemePicker'
import { MAX_AGENTS_OFFICE } from './themes/isoOffice/geometry'

interface AgentSceneProps {
  events: SimEvent[]
  peakAgents: number
  simTimeMin: number
}

export function AgentScene({ events, peakAgents, simTimeMin }: AgentSceneProps) {
  const { theme } = useScenario()
  const [showFallbackToast, setShowFallbackToast] = useState(false)

  const overCapacity = peakAgents > MAX_AGENTS_OFFICE
  const effectiveTheme = overCapacity && theme === 'office' ? 'dots' : theme
  const prevFallbackRef = useRef(false)

  // Effect 1: decide whether toast should be shown (rising/falling edge detection)
  useEffect(() => {
    const fallbackEngaged = overCapacity && theme === 'office'
    const wasEngaged = prevFallbackRef.current
    prevFallbackRef.current = fallbackEngaged

    if (!wasEngaged && fallbackEngaged) {
      setShowFallbackToast(true)
    } else if (wasEngaged && !fallbackEngaged) {
      setShowFallbackToast(false)
    }
  }, [overCapacity, theme])

  // Effect 2: auto-dismiss the toast 4 seconds after it appears
  useEffect(() => {
    if (!showFallbackToast) return
    const t = setTimeout(() => setShowFallbackToast(false), 4000)
    return () => clearTimeout(t)
  }, [showFallbackToast])

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

  const Renderer = THEME_REGISTRY[effectiveTheme]

  return (
    <div className="cockpit-agent-scene">
      <Renderer agents={agents} peakAgents={peakAgents} simTimeMin={simTimeMin} />
      <ThemePicker />
      {showFallbackToast && (
        <div className="cockpit-theme-toast" role="status">
          Switched to Dots view — too many agents for the office layout.
        </div>
      )}
    </div>
  )
}

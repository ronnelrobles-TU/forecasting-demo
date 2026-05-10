import type { ComponentType } from 'react'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { SimEvent } from '@/lib/types'
import type { ThemeKey } from '@/app/components/cockpit/ScenarioContext'
import { DotsRenderer } from './DotsRenderer'
import { IsoRenderer } from './IsoRenderer'

export interface AgentRendererProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  peakAgents: number
  simTimeMin: number
  // Optional raw event stream — used by IsoRenderer for break-duration
  // lookahead (lunch detection) and shift_end pre-walks. DotsRenderer ignores.
  events?: SimEvent[]
  // Optional explicit desk capacity. When set and > peakAgents, IsoRenderer
  // draws extra empty desks (chair-pushed-in, no agent) so users can see
  // morning ramp. DotsRenderer ignores.
  deskCapacity?: number
  // Absenteeism % (0..100). Used by IsoRenderer to mark a fraction of empty
  // desks as "absent" with a subtle bag icon. DotsRenderer ignores.
  absenteeismPct?: number
}

export type AgentRendererComponent = ComponentType<AgentRendererProps>

export const THEME_REGISTRY: Record<ThemeKey, AgentRendererComponent> = {
  dots: DotsRenderer,
  office: IsoRenderer,
}

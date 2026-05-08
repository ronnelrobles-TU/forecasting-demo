import type { ComponentType } from 'react'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { ThemeKey } from '@/app/components/cockpit/ScenarioContext'
import { DotsRenderer } from './DotsRenderer'
import { IsoRenderer } from './IsoRenderer'

export interface AgentRendererProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  peakAgents: number
  simTimeMin: number
}

export type AgentRendererComponent = ComponentType<AgentRendererProps>

export const THEME_REGISTRY: Record<ThemeKey, AgentRendererComponent> = {
  dots: DotsRenderer,
  office: IsoRenderer,
}

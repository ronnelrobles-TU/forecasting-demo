import type { ComponentType } from 'react'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { InjectedEvent, IntervalStat, RosterShift, SimEvent } from '@/lib/types'
import type { ThemeKey } from '@/app/components/cockpit/ScenarioContext'
import type { Speed } from '@/lib/animation/timeScale'
import { DotsRenderer } from './DotsRenderer'
import { IsoRenderer } from './IsoRenderer'
import { IsoRendererHD } from './IsoRendererHD'

export interface AgentRendererProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  peakAgents: number
  simTimeMin: number
  // Optional raw event stream — used by IsoRenderer for break-duration
  // lookahead (lunch detection) and shift_end pre-walks. DotsRenderer ignores.
  events?: SimEvent[]
  // User-injected events from the scenario — surge, outage, staff drop,
  // flash absent. IsoRenderer renders banner toasts + visual cues at the
  // active sim time. DotsRenderer ignores.
  injectedEvents?: InjectedEvent[]
  // Optional explicit desk capacity. When set and > peakAgents, IsoRenderer
  // draws extra empty desks (chair-pushed-in, no agent) so users can see
  // morning ramp. DotsRenderer ignores.
  deskCapacity?: number
  // Absenteeism % (0..100). Used by IsoRenderer to mark a fraction of empty
  // desks as "absent" with a subtle bag icon. DotsRenderer ignores.
  absenteeismPct?: number
  // Shrinkage % (0..100). Round 5.7: IsoRenderer uses this to scale up the
  // per-interval Erlang headcount to the in-office headcount, so shrinkage
  // activities (training, gym, breaks) can be filled with bodies that are
  // not actively taking calls. Without this scaling the office looked
  // 30%+ empty at peak. DotsRenderer ignores.
  shrinkPct?: number
  // Per-15-min Erlang-scheduled agent count (length 96, sim's perInterval).
  // IsoRenderer uses this to decide how many agents are "on shift" at the
  // current minute — at midnight only the night skeleton is visible, the
  // floor ramps up through morning, and the rest leave in the evening.
  // DotsRenderer ignores.
  perInterval?: IntervalStat[]
  // Current playback speed. IsoRenderer drops to a "fast mode" at speeds
  // > 1× — agents appear at desks with sim-state shirt colors, no journeys,
  // no activity scatter — so the visualization tracks the sim accurately
  // when a day is blasting by in seconds. DotsRenderer ignores.
  simSpeed?: Speed
  // Round 11: when the user has authored a roster, it's piped through here
  // so the renderer can snap each agent's shift window to the exact
  // start/end the user dragged on the Gantt — instead of inferring shift
  // boundaries from the smoothed Erlang curve. Null/empty → fall back to
  // the legacy interval-curve activation (`activeAgentIndicesAllocated`).
  roster?: RosterShift[] | null
  // Video-playback fix: whether the timeline is currently playing. When
  // false the IsoRenderer treats new sim-state changes as scrub events —
  // it snaps each agent to the deterministic position for `simTimeMin`
  // (no in-flight walks). When true, normal journey animations run.
  // Renderers that don't have stateful animations (Dots) can ignore.
  playing?: boolean
}

export type AgentRendererComponent = ComponentType<AgentRendererProps>

export const THEME_REGISTRY: Record<ThemeKey, AgentRendererComponent> = {
  dots: DotsRenderer,
  office: IsoRenderer,
  'office-hd': IsoRendererHD,
}

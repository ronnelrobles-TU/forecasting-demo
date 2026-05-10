// Bubble selection helpers for the HD theme. Mirrors the SVG StatusBubble
// logic — the bubble is a pure function of the journey phase (the source of
// truth for "what is this agent currently doing"), with sim-state used only
// as a fallback when the agent is at-desk.
//
// Previously this picked from the activity-assignment lookup, which can
// churn frame-to-frame at productive/shrinkage allocation boundaries — that
// produced the breakroom flicker (☕ ↔ 💧 ↔ 💬 every frame during play).
// Reading from the phase keeps the bubble locked to whatever the journey
// state machine says the agent is actually doing right now.

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { JourneyPhase } from '../isoOffice/journey'

export interface BubbleSpec {
  emoji: string
  strokeColor: number
}

const STATE_BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, BubbleSpec> = {
  idle:    { emoji: '💤', strokeColor: 0x22c55e },
  on_call: { emoji: '📞', strokeColor: 0xdc2626 },
  on_break:{ emoji: '☕', strokeColor: 0xd97706 },
}

export function pickBubble(
  state: AgentVisualState,
  phase: JourneyPhase | undefined,
): BubbleSpec | null {
  if (state === 'off_shift') return null
  if (!phase) {
    if (state === 'idle' || state === 'on_call' || state === 'on_break') {
      return STATE_BUBBLE[state]
    }
    return null
  }
  switch (phase.kind) {
    case 'at_desk':
      return STATE_BUBBLE[state] ?? null
    case 'on_call_at_desk':
      return STATE_BUBBLE.on_call
    case 'at_break_table':
      return { emoji: '☕', strokeColor: 0xd97706 }
    case 'at_chat_spot':
      return { emoji: '💬', strokeColor: 0x3b82f6 }
    case 'in_room':
      switch (phase.targetRoom) {
        case 'gym':          return { emoji: '💪', strokeColor: 0xdc2626 }
        case 'training':     return { emoji: '📚', strokeColor: 0x22c55e }
        case 'water_cooler': return { emoji: '💧', strokeColor: 0x06b6d4 }
        case 'patio':        return { emoji: '💬', strokeColor: 0x3b82f6 }
        case 'chat':         return { emoji: '💬', strokeColor: 0x3b82f6 }
        case 'restroom':     return null
        default:             return null
      }
    case 'inside_restroom':
    case 'entering_restroom':
    case 'exiting_restroom':
    case 'gone':
    case 'outside_for_lunch':
    case 'arriving_at_door':
    case 'walking_to_break':
    case 'walking_back_to_desk':
    case 'walking_to_door_for_lunch':
    case 'walking_back_from_lunch':
    case 'walking_to_door_for_shift_end':
    case 'walking_to_room':
    case 'walking_back_from_room':
    case 'walking_to_restroom_door':
    case 'walking_back_from_restroom':
    case 'walking_to_chat_spot':
    case 'walking_back_from_chat':
    case 'urgent_relocate_to_desk':
      return null
  }
}

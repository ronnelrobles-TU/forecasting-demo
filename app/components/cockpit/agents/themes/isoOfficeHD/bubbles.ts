// Bubble selection helpers for the HD theme. Mirrors the SVG StatusBubble
// logic — activity wins over sim state when the agent is in a recognizable
// room — but exposes the result as a `(emoji, strokeColor)` tuple instead of
// a JSX node, since the HD theme renders via Pixi.

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { DisplayActivity } from '../isoOffice/activity'

export interface BubbleSpec {
  emoji: string
  strokeColor: number
}

const ACTIVITY_BUBBLE: Partial<Record<DisplayActivity, BubbleSpec>> = {
  in_training:     { emoji: '📚', strokeColor: 0x22c55e },
  in_gym:          { emoji: '💪', strokeColor: 0xdc2626 },
  chatting:        { emoji: '💬', strokeColor: 0x3b82f6 },
  at_water_cooler: { emoji: '💧', strokeColor: 0x06b6d4 },
  at_break_table:  { emoji: '☕', strokeColor: 0xd97706 },
}

const STATE_BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, BubbleSpec> = {
  idle:    { emoji: '💤', strokeColor: 0x22c55e },
  on_call: { emoji: '📞', strokeColor: 0xdc2626 },
  on_break:{ emoji: '☕', strokeColor: 0xd97706 },
}

const ROOM_ACTIVITIES: ReadonlySet<DisplayActivity> = new Set([
  'in_training',
  'in_gym',
  'chatting',
  'at_water_cooler',
  'at_break_table',
  'in_restroom',
])

export function pickBubble(
  state: AgentVisualState,
  activity: DisplayActivity | undefined,
): BubbleSpec | null {
  if (state === 'off_shift') return null
  if (activity === 'in_restroom') return null
  if (activity && ROOM_ACTIVITIES.has(activity)) {
    const a = ACTIVITY_BUBBLE[activity]
    if (a) return a
  }
  if (state === 'idle' || state === 'on_call' || state === 'on_break') {
    return STATE_BUBBLE[state]
  }
  return null
}

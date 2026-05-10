'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { DisplayActivity } from './activity'

interface StatusBubbleProps {
  x: number
  y: number
  state: AgentVisualState
  activity?: DisplayActivity
}

interface BubbleStyle { emoji: string; stroke: string }

// Activity bubbles. When an activity is present and it's a "room" activity
// (gym/training/chat/water cooler), the activity bubble ALWAYS wins over the
// sim-state bubble — the agent is visibly in that room, so showing "on break"
// here would be confusing. Round 5.5 fix: previously this rule only applied
// for idle agents, which broke when sim state flipped to on_break while the
// journey was still in_room (the agent in the gym would suddenly show ☕).
const ACTIVITY_BUBBLE: Partial<Record<DisplayActivity, BubbleStyle>> = {
  in_training:     { emoji: '📚', stroke: '#22c55e' },
  in_gym:          { emoji: '💪', stroke: '#dc2626' },
  chatting:        { emoji: '💬', stroke: '#3b82f6' },
  at_water_cooler: { emoji: '💧', stroke: '#06b6d4' },
  at_break_table:  { emoji: '☕', stroke: '#d97706' },
  // in_restroom: agent is hidden; no bubble.
}

const STATE_BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, BubbleStyle> = {
  idle:    { emoji: '💤', stroke: '#22c55e' },
  on_call: { emoji: '📞', stroke: '#dc2626' },
  on_break:{ emoji: '☕', stroke: '#d97706' },
}

// Activities that place the agent in a recognizable room/spot. When we render
// from one of those rooms, the bubble must reflect the room — never the raw
// sim state, which may have shifted to `on_break` underneath us.
const ROOM_ACTIVITIES: ReadonlySet<DisplayActivity> = new Set([
  'in_training',
  'in_gym',
  'chatting',
  'at_water_cooler',
  'at_break_table',
  'in_restroom',
])

export function StatusBubble({ x, y, state, activity }: StatusBubbleProps) {
  if (state === 'off_shift') return null
  // in_restroom: agent is hidden; suppress bubble entirely.
  if (activity === 'in_restroom') return null

  let style: BubbleStyle | undefined
  // ROOM activity wins over sim state. The room component owns the visual —
  // the agent is sitting at the gym, so the bubble must say 💪 even if the
  // kernel has flipped them to on_break in the meantime.
  if (activity && ROOM_ACTIVITIES.has(activity)) {
    style = ACTIVITY_BUBBLE[activity]
  }
  // Fallback: sim-state bubble (at-desk renderings, idle agents on the floor).
  if (!style) {
    style = STATE_BUBBLE[state]
  }
  if (!style) return null
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={0} cy={-15} r={5} fill="#fff" stroke={style.stroke} strokeWidth={1}/>
      <text x={0} y={-12} textAnchor="middle" fontSize={6}>{style.emoji}</text>
    </g>
  )
}

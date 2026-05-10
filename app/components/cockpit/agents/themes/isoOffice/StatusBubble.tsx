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

// Activity bubbles take precedence over sim-state bubbles for IDLE agents
// (an idle agent in the gym shows the gym bubble, not 'idle'). Sim-state
// bubbles still apply for on_call/on_break/etc.
const ACTIVITY_BUBBLE: Partial<Record<DisplayActivity, BubbleStyle>> = {
  in_training:     { emoji: '📚', stroke: '#22c55e' },
  in_gym:          { emoji: '💪', stroke: '#dc2626' },
  chatting:        { emoji: '💬', stroke: '#3b82f6' },
  at_water_cooler: { emoji: '💧', stroke: '#06b6d4' },
  // in_restroom: agent is hidden; no bubble.
}

const STATE_BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, BubbleStyle> = {
  idle:    { emoji: '💤', stroke: '#22c55e' },
  on_call: { emoji: '📞', stroke: '#dc2626' },
  on_break:{ emoji: '☕', stroke: '#d97706' },
}

export function StatusBubble({ x, y, state, activity }: StatusBubbleProps) {
  if (state === 'off_shift') return null
  // For idle agents at a non-desk activity, show the activity bubble.
  let style: BubbleStyle | undefined
  if (state === 'idle' && activity && activity !== 'at_desk') {
    style = ACTIVITY_BUBBLE[activity]
    // in_restroom intentionally returns null below (agent hidden).
    if (activity === 'in_restroom') return null
  }
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

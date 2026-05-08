'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'

interface StatusBubbleProps {
  x: number
  y: number
  state: AgentVisualState
}

const BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, { emoji: string; stroke: string }> = {
  idle:    { emoji: '💤', stroke: '#22c55e' },
  on_call: { emoji: '📞', stroke: '#dc2626' },
  on_break:{ emoji: '☕', stroke: '#d97706' },
}

export function StatusBubble({ x, y, state }: StatusBubbleProps) {
  if (state === 'off_shift') return null
  const { emoji, stroke } = BUBBLE[state]
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={0} cy={-15} r={5} fill="#fff" stroke={stroke} strokeWidth={1}/>
      <text x={0} y={-12} textAnchor="middle" fontSize={6}>{emoji}</text>
    </g>
  )
}

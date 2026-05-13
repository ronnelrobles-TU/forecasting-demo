'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'

interface TileGlowProps {
  x: number
  y: number
  state: AgentVisualState
}

const FILL: Record<AgentVisualState, string | null> = {
  idle: 'url(#vO-glow-idle)',
  on_call: 'url(#vO-glow-call)',
  on_break: null,
  off_shift: null,
}

export function TileGlow({ x, y, state }: TileGlowProps) {
  const fill = FILL[state]
  if (!fill) return null
  return <ellipse cx={x} cy={y} rx={20} ry={10} fill={fill}/>
}

export function TileGlowDefs() {
  return (
    <>
      <radialGradient id="vO-glow-call" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.55}/>
        <stop offset="100%" stopColor="#dc2626" stopOpacity={0}/>
      </radialGradient>
      <radialGradient id="vO-glow-idle" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45}/>
        <stop offset="100%" stopColor="#22c55e" stopOpacity={0}/>
      </radialGradient>
    </>
  )
}

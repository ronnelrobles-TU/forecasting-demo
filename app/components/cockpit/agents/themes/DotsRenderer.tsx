'use client'

import type { AgentRendererProps } from './AgentRenderer'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

const EMOJI: Record<AgentVisualState, string | null> = {
  idle: '😊',
  on_call: '📞',
  on_break: '☕',
  off_shift: null,
}

const FILL: Record<AgentVisualState, string> = {
  idle: 'url(#dA-idle)',
  on_call: 'url(#dA-call)',
  on_break: 'url(#dA-brk)',
  off_shift: 'url(#dA-off)',
}

export function DotsRenderer({ agents, peakAgents }: AgentRendererProps) {
  // Layout: roughly square grid sized for peakAgents.
  // Width=320 viewBox; rows determined by aspect ~16:9.
  const W = 320
  const H = 180
  const aspect = W / H
  const cols = Math.max(1, Math.ceil(Math.sqrt(peakAgents * aspect)))
  const rows = Math.max(1, Math.ceil(peakAgents / cols))
  const cellW = W / cols
  const cellH = H / rows
  const r = Math.max(3, Math.min(cellW, cellH) * 0.32)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <radialGradient id="dA-idle" cx="35%" cy="35%"><stop offset="0%" stopColor="#86efac"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
        <radialGradient id="dA-call" cx="35%" cy="35%"><stop offset="0%" stopColor="#fca5a5"/><stop offset="100%" stopColor="#dc2626"/></radialGradient>
        <radialGradient id="dA-brk" cx="35%" cy="35%"><stop offset="0%" stopColor="#fde68a"/><stop offset="100%" stopColor="#d97706"/></radialGradient>
        <radialGradient id="dA-off" cx="35%" cy="35%"><stop offset="0%" stopColor="#475569"/><stop offset="100%" stopColor="#1e293b"/></radialGradient>
      </defs>
      {agents.map((a, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const cx = (col + 0.5) * cellW
        const cy = (row + 0.5) * cellH
        const emoji = EMOJI[a.state]
        const opacity = a.state === 'off_shift' ? '0.5' : '1'
        return (
          <g key={a.id}>
            <circle cx={cx} cy={cy} r={r} fill={FILL[a.state]} opacity={opacity}/>
            {emoji && (
              <text x={cx} y={cy + r * 0.35} textAnchor="middle" fontSize={r} fill="#fff">
                {emoji}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

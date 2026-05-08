'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { DESK_POSITIONS, MAX_AGENTS_OFFICE } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'

interface DesksProps {
  agents: Array<{ id: string; state: AgentVisualState }>
}

const SHIRT_COLOR: Record<AgentVisualState, string> = {
  idle: '#22c55e',
  on_call: '#dc2626',
  on_break: '#d97706',
  off_shift: '#475569',
}

function Chair({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      <polygon points="-5,2 5,2 4,5 -4,5" fill="#1e293b"/>
      <rect x={-4.5} y={-3} width={9} height={5} fill="#334155" stroke="#1e293b" strokeWidth={0.3} rx={0.5}/>
      <rect x={-4} y={-4.5} width={8} height={1.5} fill="#475569"/>
    </g>
  )
}

function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon points="0,-3 16,5 0,13 -16,5" fill="#64748b" stroke="#1e293b" strokeWidth={0.5}/>
      <polygon points="-16,5 -16,8 0,16 0,13" fill="#475569"/>
      <polygon points="16,5 16,8 0,16 0,13" fill="#334155"/>
      <rect x={-2.5} y={0} width={5} height={3.5} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <polygon points="-3,3.5 3,3.5 1.5,5 -1.5,5" fill="#475569"/>
      <rect x={-7} y={3} width={2.5} height={2} fill="#cbd5e1" rx={0.3}/>
    </g>
  )
}

export function Desks({ agents }: DesksProps) {
  // Visible desks = min(agents.length, MAX_AGENTS_OFFICE).
  // Each desk index 0..5 maps to a fixed home position; agent[i] sits at desk[i].
  // off_shift -> desk shown empty (chair pushed in, no agent or bubble or glow).
  // on_break  -> desk shown vacated (chair tilted, no agent at desk; the agent will be rendered in BreakRoom).
  return (
    <g>
      {DESK_POSITIONS.map((pos, i) => {
        const agent = agents[i]
        if (!agent) {
          // No agent for this seat at all: hide the entire desk for cleanliness
          return null
        }
        const atDesk = agent.state === 'idle' || agent.state === 'on_call'
        const offShift = agent.state === 'off_shift'

        return (
          <g key={`desk-${i}`}>
            {atDesk && <TileGlow x={pos.x} y={pos.y - 5} state={agent.state}/>}
            <Chair
              x={pos.x}
              y={pos.y - 7}
              opacity={offShift ? 0.6 : 1}
            />
            {atDesk && <AgentSprite x={pos.x} y={pos.y - 1} shirtColor={SHIRT_COLOR[agent.state]}/>}
            <Desk x={pos.x} y={pos.y}/>
            {atDesk && <StatusBubble x={pos.x} y={pos.y - 1} state={agent.state}/>}
          </g>
        )
      })}
    </g>
  )
}

// Constant re-exported for use in fallback decision in AgentScene.
export { MAX_AGENTS_OFFICE }

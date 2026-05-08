'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { DESK_POSITIONS, MAX_AGENTS_OFFICE, BREAK_SEAT_POSITIONS } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'
import type { AnimState } from './animation'

interface DesksProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
  bobPhase?: number
}

const SHIRT_COLOR: Record<AgentVisualState, string> = {
  idle: '#22c55e',
  on_call: '#dc2626',
  on_break: '#d97706',
  off_shift: '#475569',
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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

export function Desks({ agents, anim = {}, bobPhase = 0 }: DesksProps) {
  return (
    <g>
      {DESK_POSITIONS.map((pos, i) => {
        const agent = agents[i]
        if (!agent) return null
        const a = anim[agent.id]
        const atDesk = agent.state === 'idle' || agent.state === 'on_call'
        const offShift = agent.state === 'off_shift'
        const seat = BREAK_SEAT_POSITIONS[i % BREAK_SEAT_POSITIONS.length]

        // Animation overrides
        let agentX = pos.x
        let agentY = pos.y - 1
        let agentOpacity = 1
        let renderAgentAtDesk = atDesk
        let bobOffset = 0

        if (a?.kind === 'desk_to_break') {
          // Walking out: agent slides from desk to break seat
          agentX = lerp(pos.x, seat.x, a.progress)
          agentY = lerp(pos.y - 1, seat.y, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'break_to_desk') {
          // Walking back: agent slides from break seat to desk
          agentX = lerp(seat.x, pos.x, a.progress)
          agentY = lerp(seat.y, pos.y - 1, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'fade_in') {
          agentOpacity = a.progress
          renderAgentAtDesk = true
        } else if (a?.kind === 'fade_out') {
          agentOpacity = 1 - a.progress
          renderAgentAtDesk = true
        }

        if (atDesk && agent.state === 'on_call') {
          bobOffset = Math.sin(bobPhase) * 1
        }

        const shirtColor = SHIRT_COLOR[agent.state]

        return (
          <g key={`desk-${i}`}>
            {atDesk && <TileGlow x={pos.x} y={pos.y - 5} state={agent.state}/>}
            <Chair
              x={pos.x}
              y={pos.y - 7}
              opacity={offShift ? 0.6 : (a?.kind === 'desk_to_break' || a?.kind === 'break_to_desk' || agent.state === 'on_break' ? 0.7 : 1)}
            />
            {renderAgentAtDesk && (
              <AgentSprite
                x={agentX}
                y={agentY}
                shirtColor={shirtColor}
                bobOffset={bobOffset}
                opacity={agentOpacity}
              />
            )}
            <Desk x={pos.x} y={pos.y}/>
            {renderAgentAtDesk && agentOpacity > 0.2 && (
              <StatusBubble x={agentX} y={agentY} state={agent.state}/>
            )}
          </g>
        )
      })}
    </g>
  )
}

export { MAX_AGENTS_OFFICE }

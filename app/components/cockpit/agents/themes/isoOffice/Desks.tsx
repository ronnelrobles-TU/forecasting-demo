'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { computeDeskLayout, computeBreakSeatPositions } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'
import type { AnimState } from './animation'

interface DesksProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
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

function Chair({ x, y, opacity = 1, scale = 1 }: { x: number; y: number; opacity?: number; scale?: number }) {
  const transform = scale === 1 ? `translate(${x}, ${y})` : `translate(${x}, ${y}) scale(${scale})`
  return (
    <g transform={transform} opacity={opacity}>
      <polygon points="-5,2 5,2 4,5 -4,5" fill="#1e293b"/>
      <rect x={-4.5} y={-3} width={9} height={5} fill="#334155" stroke="#1e293b" strokeWidth={0.3} rx={0.5}/>
      <rect x={-4} y={-4.5} width={8} height={1.5} fill="#475569"/>
    </g>
  )
}

function Desk({ x, y, scale = 1, withMonitor = true }: { x: number; y: number; scale?: number; withMonitor?: boolean }) {
  const transform = scale === 1 ? `translate(${x}, ${y})` : `translate(${x}, ${y}) scale(${scale})`
  return (
    <g transform={transform}>
      <polygon points="0,-3 16,5 0,13 -16,5" fill="#64748b" stroke="#1e293b" strokeWidth={0.5}/>
      <polygon points="-16,5 -16,8 0,16 0,13" fill="#475569"/>
      <polygon points="16,5 16,8 0,16 0,13" fill="#334155"/>
      {withMonitor && (
        <>
          <rect x={-2.5} y={0} width={5} height={3.5} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
          <polygon points="-3,3.5 3,3.5 1.5,5 -1.5,5" fill="#475569"/>
          <rect x={-7} y={3} width={2.5} height={2} fill="#cbd5e1" rx={0.3}/>
        </>
      )}
    </g>
  )
}

export function Desks({ agents, anim = {} }: DesksProps) {
  const layout = computeDeskLayout(agents.length)
  const { positions, tier, spriteScale } = layout
  const breakSeats = computeBreakSeatPositions(Math.max(8, Math.ceil(agents.length * 0.25)))

  return (
    <g>
      {positions.map((pos, i) => {
        const agent = agents[i]
        if (!agent) return null
        const a = anim[agent.id]
        const atDesk = agent.state === 'idle' || agent.state === 'on_call'
        const offShift = agent.state === 'off_shift'
        const seat = breakSeats[i % breakSeats.length]

        let agentX = pos.x
        let agentY = pos.y - 1
        let agentOpacity = 1
        let renderAgentAtDesk = atDesk

        if (a?.kind === 'desk_to_break') {
          agentX = lerp(pos.x, seat.x, a.progress)
          agentY = lerp(pos.y - 1, seat.y, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'break_to_desk') {
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

        // Idle bob is now CSS-driven (cockpit-iso-bob class). Only on_call agents
        // actually at their desk should bob — agents in transition do not.
        const isOnCall = atDesk && agent.state === 'on_call'

        const shirtColor = SHIRT_COLOR[agent.state]

        // Tier 3: tiny sprite only — no chair, no glow, no bubble, no desk.
        if (tier === 3) {
          if (!renderAgentAtDesk) return null
          return (
            <g key={`desk-${i}`}>
              <AgentSprite
                x={agentX}
                y={agentY}
                shirtColor={shirtColor}
                bob={isOnCall}
                opacity={agentOpacity}
                scale={spriteScale}
              />
            </g>
          )
        }

        // Tier 2: tile glow + chair + sprite + simplified desk (no monitor, no bubble).
        // Tier 1: full detail (current behavior).
        const showBubble = tier === 1
        const monitorOnDesk = tier === 1
        const chairOpacity = offShift
          ? 0.6
          : (a?.kind === 'desk_to_break' || a?.kind === 'break_to_desk' || agent.state === 'on_break' ? 0.7 : 1)

        return (
          <g key={`desk-${i}`}>
            {atDesk && <TileGlow x={pos.x} y={pos.y - 5} state={agent.state}/>}
            <Chair x={pos.x} y={pos.y - 7 * spriteScale} opacity={chairOpacity} scale={spriteScale}/>
            {renderAgentAtDesk && (
              <AgentSprite
                x={agentX}
                y={agentY}
                shirtColor={shirtColor}
                bob={isOnCall}
                opacity={agentOpacity}
                scale={spriteScale}
              />
            )}
            <Desk x={pos.x} y={pos.y} scale={spriteScale} withMonitor={monitorOnDesk}/>
            {showBubble && renderAgentAtDesk && agentOpacity > 0.2 && (
              <StatusBubble x={agentX} y={agentY} state={agent.state}/>
            )}
          </g>
        )
      })}
    </g>
  )
}

'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'
import type { AnimState } from './animation'
import type { ActivityAssignment } from './activity'

interface AgentFloorProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
  layout: BuildingLayout
  activities?: Record<string, ActivityAssignment>
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

const ptsStr = (pts: ReadonlyArray<ScreenPoint>) => pts.map(p => `${p.x},${p.y}`).join(' ')

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
      <polygon points="0,-3 12,4 0,11 -12,4" fill="#64748b" stroke="#1e293b" strokeWidth={0.5}/>
      <polygon points="-12,4 -12,7 0,14 0,11" fill="#475569"/>
      <polygon points="12,4 12,7 0,14 0,11" fill="#334155"/>
      <rect x={-2.5} y={0} width={5} height={3.2} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <polygon points="-3,3.2 3,3.2 1.5,4.5 -1.5,4.5" fill="#475569"/>
      <rect x={-6} y={2.5} width={2.2} height={1.8} fill="#cbd5e1" rx={0.3}/>
    </g>
  )
}

function PartitionWall(p1: ScreenPoint, p2: ScreenPoint) {
  // Cubicle partition wall: ~10px-tall low wall extruded upward in screen y.
  return [
    p1,
    p2,
    { x: p2.x, y: p2.y - 10 },
    { x: p1.x, y: p1.y - 10 },
  ]
}

export function AgentFloor({ agents, anim = {}, layout, activities }: AgentFloorProps) {
  const deskPositions = layout.deskPositions
  const seatPositions = layout.rooms.breakRoom.seatPositions
  const pods = layout.rooms.agentFloor.pods
  const doorPosition = layout.rooms.reception.doorPosition

  return (
    <g>
      {/* Cubicle partition walls (one set per pod). Drawn FIRST so desks/agents
          render above them. */}
      {pods.map((pod, pi) => (
        <g key={`pod-${pi}`}>
          {pod.partitionWalls.map(([p1, p2], wi) => (
            <polygon
              key={`pod-${pi}-w${wi}`}
              points={ptsStr(PartitionWall(p1, p2))}
              fill="#cbd5e1"
              stroke="#64748b"
              strokeWidth={0.3}
              opacity={0.85}
            />
          ))}
        </g>
      ))}

      {/* Desks + agents (one per agent, stable order). */}
      {deskPositions.map((pos, i) => {
        const agent = agents[i]
        if (!agent) return null
        const a = anim[agent.id]
        const seat = seatPositions[i % seatPositions.length]
        const activity = activities?.[agent.id]?.activity

        // Compute whether the agent should currently be DRAWN at the desk.
        // Default for all states: agent is at-desk unless their activity sends
        // them elsewhere (in_training/in_gym/at_water_cooler/in_restroom/chatting)
        // in which case the room component owns the rendering — except DURING
        // a desk_to_room/room_to_desk walk, when AgentFloor draws the lerping
        // sprite (covering the lobby/aisles between rooms).
        const offShift = agent.state === 'off_shift'
        const onBreak = agent.state === 'on_break'
        const atDeskActivity = !activity || activity === 'at_desk'

        let agentX = pos.x
        let agentY = pos.y - 1
        let agentOpacity = 1
        let renderAgentAtDesk = false

        if (a?.kind === 'desk_to_break') {
          agentX = lerp(pos.x, seat.x, a.progress)
          agentY = lerp(pos.y - 1, seat.y, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'break_to_desk') {
          agentX = lerp(seat.x, pos.x, a.progress)
          agentY = lerp(seat.y, pos.y - 1, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'desk_to_room') {
          const target = a.targetPosition ?? pos
          agentX = lerp(pos.x, target.x, a.progress)
          agentY = lerp(pos.y - 1, target.y, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'room_to_desk') {
          const source = a.targetPosition ?? pos
          agentX = lerp(source.x, pos.x, a.progress)
          agentY = lerp(source.y, pos.y - 1, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'door_to_desk') {
          const source = a.targetPosition ?? doorPosition
          agentX = lerp(source.x, pos.x, a.progress)
          agentY = lerp(source.y, pos.y - 1, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'desk_to_door') {
          const target = a.targetPosition ?? doorPosition
          agentX = lerp(pos.x, target.x, a.progress)
          agentY = lerp(pos.y - 1, target.y, a.progress)
          // Fade out across the second half of the walk.
          agentOpacity = a.progress < 0.7 ? 1 : 1 - (a.progress - 0.7) / 0.3
          renderAgentAtDesk = true
        } else if (a?.kind === 'fade_in') {
          agentOpacity = a.progress
          renderAgentAtDesk = true
        } else if (a?.kind === 'fade_out') {
          agentOpacity = 1 - a.progress
          renderAgentAtDesk = true
        } else {
          // No animation in flight: render at desk if state is active AND
          // activity says at_desk. Off-shift / on-break / room-bound activity
          // -> hide here (other components own that rendering).
          renderAgentAtDesk = !offShift && !onBreak && atDeskActivity
        }

        const isOnCall = renderAgentAtDesk && agent.state === 'on_call' && !a
        const shirtColor = SHIRT_COLOR[agent.state]
        const chairOpacity = offShift
          ? 0.6
          : (a?.kind === 'desk_to_break' || a?.kind === 'break_to_desk' || onBreak
              || activity === 'in_training' || activity === 'in_gym'
              || activity === 'in_restroom' || activity === 'at_water_cooler'
              || activity === 'chatting'
              ? 0.7 : 1)

        return (
          <g key={`desk-${i}`}>
            {renderAgentAtDesk && agent.state !== 'off_shift' && !a && (
              <TileGlow x={pos.x} y={pos.y - 5} state={agent.state}/>
            )}
            <Chair x={pos.x} y={pos.y - 7} opacity={chairOpacity}/>
            {renderAgentAtDesk && (
              <AgentSprite
                x={agentX}
                y={agentY}
                shirtColor={shirtColor}
                bob={isOnCall}
                opacity={agentOpacity}
              />
            )}
            <Desk x={pos.x} y={pos.y}/>
            {renderAgentAtDesk && agentOpacity > 0.2 && !a && (
              <StatusBubble x={agentX} y={agentY} state={agent.state}/>
            )}
          </g>
        )
      })}

      {/* Chatting agents standing in aisles between pods. */}
      {activities && agents.map(a => {
        const act = activities[a.id]
        if (!act || act.activity !== 'chatting') return null
        const animEntry = anim[a.id]
        // Hide while walking — the desk_to_room lerp above draws the sprite.
        if (animEntry?.kind === 'desk_to_room' || animEntry?.kind === 'room_to_desk') return null
        return (
          <g key={`chat-${a.id}`}>
            <AgentSprite x={act.position.x} y={act.position.y} shirtColor="#22c55e"/>
          </g>
        )
      })}
    </g>
  )
}

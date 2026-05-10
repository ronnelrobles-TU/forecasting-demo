'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'
import type { ActivityAssignment } from './activity'
import { isWalkingPhase, type VisualJourney } from './journey'

interface RenderedPosition { pos: ScreenPoint; opacity: number; visible: boolean }

interface AgentFloorProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  journeys?: Record<string, VisualJourney>
  positions?: Record<string, RenderedPosition>
  layout: BuildingLayout
  activities?: Record<string, ActivityAssignment>
}

const SHIRT_COLOR: Record<AgentVisualState, string> = {
  idle: '#22c55e',
  on_call: '#dc2626',
  on_break: '#d97706',
  off_shift: '#475569',
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
  return [
    p1,
    p2,
    { x: p2.x, y: p2.y - 10 },
    { x: p1.x, y: p1.y - 10 },
  ]
}

export function AgentFloor({ agents, journeys = {}, positions = {}, layout, activities }: AgentFloorProps) {
  const deskPositions = layout.deskPositions
  const pods = layout.rooms.agentFloor.pods

  return (
    <g>
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

      {deskPositions.map((deskPos, i) => {
        const agent = agents[i]
        if (!agent) return null
        const journey = journeys[agent.id]
        const activity = activities?.[agent.id]?.activity
        const resolved = positions[agent.id]

        let agentX = deskPos.x
        let agentY = deskPos.y - 1
        let agentOpacity = 1
        let renderAgentHere = false
        const phaseKind = journey?.phase.kind

        if (journey) {
          if (phaseKind === 'at_desk') {
            renderAgentHere = true
          } else if (phaseKind === 'on_call_at_desk') {
            renderAgentHere = true
          } else if (isWalkingPhase(journey.phase) && resolved) {
            agentX = resolved.pos.x
            agentY = resolved.pos.y - 1
            agentOpacity = resolved.opacity
            renderAgentHere = resolved.visible
          } else {
            renderAgentHere = false
          }
        } else {
          // Defensive fallback for the very first render before journeys hydrate.
          const offShift = agent.state === 'off_shift'
          const onBreak = agent.state === 'on_break'
          const atDeskActivity = !activity || activity === 'at_desk'
          renderAgentHere = !offShift && !onBreak && atDeskActivity
        }

        const isOnCall = renderAgentHere && phaseKind === 'on_call_at_desk'
        const shirtColor = SHIRT_COLOR[agent.state]
        const chairOpacity = (phaseKind === 'gone' || agent.state === 'off_shift')
          ? 0.6
          : (phaseKind && phaseKind !== 'at_desk' && phaseKind !== 'on_call_at_desk' ? 0.7 : 1)
        const showStatus = renderAgentHere
          && agentOpacity > 0.2
          && (phaseKind === 'at_desk' || phaseKind === 'on_call_at_desk')
          && agent.state !== 'off_shift'
        const showGlow = renderAgentHere
          && (phaseKind === 'at_desk' || phaseKind === 'on_call_at_desk')
          && agent.state !== 'off_shift'

        return (
          <g key={`desk-${i}`}>
            {showGlow && (
              <TileGlow x={deskPos.x} y={deskPos.y - 5} state={agent.state}/>
            )}
            <Chair x={deskPos.x} y={deskPos.y - 7} opacity={chairOpacity}/>
            {renderAgentHere && (
              <AgentSprite
                x={agentX}
                y={agentY}
                shirtColor={shirtColor}
                bob={isOnCall}
                opacity={agentOpacity}
              />
            )}
            <Desk x={deskPos.x} y={deskPos.y}/>
            {showStatus && (
              <StatusBubble x={agentX} y={agentY} state={agent.state}/>
            )}
          </g>
        )
      })}
    </g>
  )
}

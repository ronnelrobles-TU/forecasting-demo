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
  /** 0..100, fraction of empty desks to mark as "absent" (subtle coffee-cup
   *  icon left behind). Visualization-only; sim kernel ignores absenteeism
   *  per-agent. */
  absenteeismPct?: number
  /** Round 5.7: indices [absentTailStart, agents.length) belong to agents
   *  who are "absent for the day", they never come on shift, and their
   *  desks render with the AbsentMarker. */
  absentTailStart?: number
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

// Subtle "absent" indicator left on the desk, a small coffee mug + name tag,
// telling the user "this agent didn't come in today" without looking like a
// rendering bug. Painted on top of the desk.
function AbsentMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} opacity={0.85}>
      {/* Mug body */}
      <rect x={-1.4} y={-1.5} width={2.8} height={2.6} fill="#f8fafc" stroke="#475569" strokeWidth={0.25} rx={0.3}/>
      {/* Mug handle */}
      <path d="M1.4,-0.8 Q2.5,-0.5 2.5,0.4 Q2.5,1 1.4,0.8" fill="none" stroke="#475569" strokeWidth={0.3}/>
      {/* Steam wisp */}
      <path d="M-0.5,-2.2 Q-0.2,-3 0.4,-2.6" fill="none" stroke="#cbd5e1" strokeWidth={0.25} opacity={0.7}/>
      {/* Sticky-note "OUT" tag tucked beside the mug */}
      <rect x={2.6} y={-0.3} width={2.4} height={1.8} fill="#fde68a" stroke="#a16207" strokeWidth={0.2}/>
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

export function AgentFloor({ agents, journeys = {}, positions = {}, layout, activities, absenteeismPct, absentTailStart }: AgentFloorProps) {
  const deskPositions = layout.deskPositions
  const pods = layout.rooms.agentFloor.pods

  // Pre-compute which empty-desk indices should display the "absent" marker.
  // Picks a deterministic stride across the empty desks so the layout looks
  // stable across renders. Empty desks are at indices [agents.length .. end).
  const emptyStart = agents.length
  const emptyCount = Math.max(0, deskPositions.length - emptyStart)
  const absentTarget = Math.round(emptyCount * Math.max(0, Math.min(100, absenteeismPct ?? 0)) / 100)
  const absentDeskIdx = new Set<number>()
  if (absentTarget > 0 && emptyCount > 0) {
    // Even spacing across the empty range so absent desks don't cluster.
    const stride = emptyCount / absentTarget
    for (let k = 0; k < absentTarget; k++) {
      const idx = emptyStart + Math.floor(k * stride + stride / 2)
      if (idx < deskPositions.length) absentDeskIdx.add(idx)
    }
  }

  // Round 5.7: agents in [absentTailStart, agents.length) are today's
  // absentees, never on shift. Mark their desks too.
  const tailStart = Math.max(0, Math.min(agents.length, absentTailStart ?? agents.length))
  for (let i = tailStart; i < agents.length; i++) {
    if (i < deskPositions.length) absentDeskIdx.add(i)
  }

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
        // Empty desk (i >= agents.length): render chair pushed in + desk only.
        // No agent, no glow, no status bubble. Optionally with an "absent"
        // marker on a deterministic subset.
        if (!agent) {
          const isAbsent = absentDeskIdx.has(i)
          return (
            <g key={`desk-empty-${i}`}>
              <Chair x={deskPos.x} y={deskPos.y - 7} opacity={0.55}/>
              <Desk x={deskPos.x} y={deskPos.y}/>
              {isAbsent && <AbsentMarker x={deskPos.x - 1} y={deskPos.y + 1}/>}
            </g>
          )
        }
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
              <StatusBubble x={agentX} y={agentY} state={agent.state} phase={journey?.phase}/>
            )}
            {/* Round 5.7: tail-agent absent marker (agent is in the array but
                never on shift today, desk should look empty + flagged). */}
            {!renderAgentHere && i >= tailStart && (
              <AbsentMarker x={deskPos.x - 1} y={deskPos.y + 1}/>
            )}
          </g>
        )
      })}
    </g>
  )
}

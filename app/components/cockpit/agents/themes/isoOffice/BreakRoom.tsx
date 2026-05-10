'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import type { ActivityAssignment } from './activity'
import { isAtBreakTable, type VisualJourney } from './journey'

interface RenderedPosition { pos: ScreenPoint; opacity: number; visible: boolean }

interface BreakRoomProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  journeys?: Record<string, VisualJourney>
  // positions is currently unused inside BreakRoom (sitting agents use the
  // phase's static seat pos), but accepted for symmetry with AgentFloor and
  // future need (e.g., animating agents arriving at the table).
  positions?: Record<string, RenderedPosition>
  layout: BuildingLayout
  activities?: Record<string, ActivityAssignment>
  walkingIds?: Set<string>
}

function Table({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y + 4})`}>
      <ellipse cx={0} cy={3} rx={18} ry={6} fill="#1e293b" opacity={0.35}/>
      <ellipse cx={0} cy={0} rx={17} ry={6.5} fill="#451a03"/>
      <ellipse cx={0} cy={-1.5} rx={16} ry={6} fill="#b45309"/>
      <ellipse cx={0} cy={-2} rx={15} ry={5.6} fill="#d97706"/>
      <rect x={-8} y={-2.5} width={3} height={2.5} fill="#fff" stroke="#475569" strokeWidth={0.3} rx={0.3}/>
      <rect x={3} y={-3} width={3} height={2.5} fill="#fff" stroke="#475569" strokeWidth={0.3} rx={0.3}/>
    </g>
  )
}

function WaterCooler({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 22})`}>
      <ellipse cx={0} cy={9} rx={5} ry={1.5} fill="#1e293b" opacity={0.4}/>
      <rect x={-4} y={-2} width={8} height={11} fill="#cbd5e1" stroke="#1e293b" strokeWidth={0.4} rx={0.5}/>
      <ellipse cx={0} cy={-2} rx={4} ry={1.3} fill="#3b82f6"/>
      <path d="M-3.5,-2 L-3.5,-9 Q-3.5,-10.5 -2,-10.5 L2,-10.5 Q3.5,-10.5 3.5,-9 L3.5,-2" fill="#bfdbfe" stroke="#1e293b" strokeWidth={0.4}/>
      <rect x={-1.2} y={3} width={2.4} height={2} fill="#1e40af"/>
    </g>
  )
}

function VendingMachine({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 26})`}>
      <ellipse cx={0} cy={13} rx={7} ry={2} fill="#1e293b" opacity={0.4}/>
      <rect x={-6} y={-3} width={12} height={16} fill="#dc2626" stroke="#7f1d1d" strokeWidth={0.5} rx={0.5}/>
      <rect x={-5} y={-2} width={10} height={11} fill="#1e293b" opacity={0.55} stroke="#7f1d1d" strokeWidth={0.3}/>
      <line x1={-5} y1={1} x2={5} y2={1} stroke="#fbbf24" strokeWidth={0.3} opacity={0.7}/>
      <line x1={-5} y1={4} x2={5} y2={4} stroke="#fbbf24" strokeWidth={0.3} opacity={0.7}/>
      <line x1={-5} y1={7} x2={5} y2={7} stroke="#fbbf24" strokeWidth={0.3} opacity={0.7}/>
      <rect x={-4.5} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={-3} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={-1.5} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={0} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={3} y={10} width={2.5} height={1} fill="#fbbf24"/>
    </g>
  )
}

export function BreakRoom({ agents, journeys = {}, positions, layout, activities, walkingIds }: BreakRoomProps) {
  void positions
  const r = layout.rooms.breakRoom

  // Sitting-at-break-table agents are owned by the journey state machine.
  const sittingBreakAgents = agents.filter(a => {
    const j = journeys[a.id]
    return j && isAtBreakTable(j.phase)
  })

  // Water-cooler hangouts (idle agents informally chatting near the cooler).
  // Render only agents who have ARRIVED at the cooler (journey in_room or
  // walking has finished). Falls back to activity if no journey present.
  const waterCoolerAgents = agents.filter(a => {
    const j = journeys[a.id]
    if (j) return j.phase.kind === 'in_room' && j.phase.targetRoom === 'water_cooler'
    return activities?.[a.id]?.activity === 'at_water_cooler' && !walkingIds?.has(a.id)
  })

  return (
    <g>
      <WaterCooler x={r.waterCoolerPosition.x} y={r.waterCoolerPosition.y}/>
      <VendingMachine x={r.vendingMachinePosition.x} y={r.vendingMachinePosition.y}/>
      <Table x={r.tableCenter.x} y={r.tableCenter.y}/>
      {sittingBreakAgents.map(a => {
        const j = journeys[a.id]
        if (!j || j.phase.kind !== 'at_break_table') return null
        const seat = j.phase.pos
        return (
          <g key={`break-${a.id}`}>
            <AgentSprite x={seat.x} y={seat.y} shirtColor="#d97706"/>
            <StatusBubble x={seat.x} y={seat.y} state={a.state} phase={j.phase}/>
          </g>
        )
      })}
      {waterCoolerAgents.map(a => {
        const j = journeys[a.id]
        const pos = (j?.phase.kind === 'in_room'
          ? (j.phase as { pos: { x: number; y: number } }).pos
          : activities![a.id].position)
        return (
          <g key={`wc-${a.id}`}>
            <AgentSprite x={pos.x} y={pos.y} shirtColor="#22c55e"/>
            <StatusBubble x={pos.x} y={pos.y} state={a.state} phase={j?.phase}/>
          </g>
        )
      })}
    </g>
  )
}

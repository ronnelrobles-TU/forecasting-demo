'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import type { AnimState } from './animation'
import type { ActivityAssignment } from './activity'

interface BreakRoomProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
  layout: BuildingLayout
  // Activity assignments (computed by IsoRenderer). BreakRoom uses this to
  // render water-cooler agents in addition to on_break agents.
  activities?: Record<string, ActivityAssignment>
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
      {/* Shadow */}
      <ellipse cx={0} cy={13} rx={7} ry={2} fill="#1e293b" opacity={0.4}/>
      {/* Body */}
      <rect x={-6} y={-3} width={12} height={16} fill="#dc2626" stroke="#7f1d1d" strokeWidth={0.5} rx={0.5}/>
      {/* Glass front */}
      <rect x={-5} y={-2} width={10} height={11} fill="#1e293b" opacity={0.55} stroke="#7f1d1d" strokeWidth={0.3}/>
      {/* Snack rows */}
      <line x1={-5} y1={1} x2={5} y2={1} stroke="#fbbf24" strokeWidth={0.3} opacity={0.7}/>
      <line x1={-5} y1={4} x2={5} y2={4} stroke="#fbbf24" strokeWidth={0.3} opacity={0.7}/>
      <line x1={-5} y1={7} x2={5} y2={7} stroke="#fbbf24" strokeWidth={0.3} opacity={0.7}/>
      {/* Buttons / coin slot */}
      <rect x={-4.5} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={-3} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={-1.5} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={0} y={10} width={1} height={2} fill="#0f172a"/>
      <rect x={3} y={10} width={2.5} height={1} fill="#fbbf24"/>
    </g>
  )
}

export function BreakRoom({ agents, anim, layout, activities }: BreakRoomProps) {
  const r = layout.rooms.breakRoom
  const seatPositions = r.seatPositions

  // Stable seat assignment for on_break agents: map by their position in the
  // ON-BREAK subset (not the original agents array). This avoids two agents
  // landing on the same seat just because their indices in `agents` happen
  // to alias under modulo.
  const breakAgents = agents.filter(a => a.state === 'on_break')
  const waterCoolerAgents = activities
    ? agents.filter(a => activities[a.id]?.activity === 'at_water_cooler')
    : []

  return (
    <g>
      <WaterCooler x={r.waterCoolerPosition.x} y={r.waterCoolerPosition.y}/>
      <VendingMachine x={r.vendingMachinePosition.x} y={r.vendingMachinePosition.y}/>
      <Table x={r.tableCenter.x} y={r.tableCenter.y}/>
      {/* On_break agents at their assigned table seats. */}
      {breakAgents.map((a, idx) => {
        const animEntry = anim?.[a.id]
        // Don't double-render: the AgentFloor handles the desk_to_break /
        // break_to_desk lerp in its own pass. Skip here while the walk is in
        // flight.
        if (animEntry?.kind === 'desk_to_break' || animEntry?.kind === 'break_to_desk') return null
        const seat = seatPositions[idx % seatPositions.length]
        return (
          <g key={`break-${a.id}`}>
            <AgentSprite x={seat.x} y={seat.y} shirtColor="#d97706"/>
            <StatusBubble x={seat.x} y={seat.y} state="on_break"/>
          </g>
        )
      })}
      {/* Water-cooler hangouts (idle agents informally chatting near the cooler). */}
      {waterCoolerAgents.map(a => {
        const animEntry = anim?.[a.id]
        // Hide while walking — AgentFloor draws the lerp.
        if (animEntry?.kind === 'desk_to_room' || animEntry?.kind === 'room_to_desk') return null
        const pos = activities![a.id].position
        return (
          <g key={`wc-${a.id}`}>
            <AgentSprite x={pos.x} y={pos.y} shirtColor="#22c55e"/>
          </g>
        )
      })}
    </g>
  )
}

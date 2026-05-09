'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { OfficeLayout } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import type { AnimState } from './animation'

interface BreakRoomProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
  layout: OfficeLayout
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

export function BreakRoom({ agents, anim, layout }: BreakRoomProps) {
  const breakAgents = agents.map((a, i) => ({ a, i })).filter(({ a }) => a.state === 'on_break')
  const seatPositions = layout.breakRoom.seatPositions

  return (
    <g>
      <WaterCooler x={layout.breakRoom.waterCoolerPosition.x} y={layout.breakRoom.waterCoolerPosition.y}/>
      <Table x={layout.breakRoom.tableCenter.x} y={layout.breakRoom.tableCenter.y}/>
      {breakAgents.map(({ a, i }) => {
        const inTransit = anim?.[a.id]?.kind === 'desk_to_break' || anim?.[a.id]?.kind === 'break_to_desk'
        if (inTransit) return null
        const seat = seatPositions[i % seatPositions.length]
        return (
          <g key={`break-${a.id}`}>
            <AgentSprite x={seat.x} y={seat.y} shirtColor="#d97706"/>
            <StatusBubble x={seat.x} y={seat.y} state="on_break"/>
          </g>
        )
      })}
    </g>
  )
}

'use client'

import type { BuildingLayout } from './geometry'
import { AgentSprite } from './AgentSprite'

interface ManagerOfficesProps { layout: BuildingLayout }

function ExecChair({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 9})`}>
      <polygon points="-6,3 6,3 5,7 -5,7" fill="#0f172a"/>
      <rect x={-5.5} y={-4} width={11} height={7} fill="#1e293b" stroke="#020617" strokeWidth={0.3} rx={1}/>
      <rect x={-5} y={-6} width={10} height={2} fill="#334155"/>
    </g>
  )
}

function ExecDesk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon points="0,-4 18,6 0,14 -18,6" fill="#1e293b" stroke="#0f172a" strokeWidth={0.6}/>
      <polygon points="-18,6 -18,9 0,17 0,14" fill="#0f172a"/>
      <polygon points="18,6 18,9 0,17 0,14" fill="#020617"/>
      <rect x={-3.5} y={0} width={7} height={4.2} fill="#0f172a" stroke="#334155" strokeWidth={0.3}/>
      <polygon points="-4,4.2 4,4.2 2,5.8 -2,5.8" fill="#334155"/>
      <rect x={6} y={3.5} width={3} height={2} fill="#fbbf24" rx={0.2}/>
    </g>
  )
}

function Whiteboard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-7} y={-12} width={14} height={9} fill="#f8fafc" stroke="#1e293b" strokeWidth={0.5}/>
      <line x1={-5} y1={-9} x2={-1} y2={-9} stroke="#3b82f6" strokeWidth={0.5}/>
      <line x1={-5} y1={-7} x2={2} y2={-7} stroke="#3b82f6" strokeWidth={0.5}/>
      <line x1={-5} y1={-5} x2={1} y2={-5} stroke="#dc2626" strokeWidth={0.5}/>
      <rect x={-7.5} y={-3} width={15} height={1.2} fill="#94a3b8"/>
    </g>
  )
}

function Door({ x, y }: { x: number; y: number }) {
  // Door drawn as a small rectangle on a wall, with a darker handle.
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-3} y={-12} width={6} height={12} fill="#7c2d12" stroke="#1e293b" strokeWidth={0.4}/>
      <circle cx={2} cy={-6} r={0.6} fill="#fbbf24"/>
    </g>
  )
}

export function ManagerOffices({ layout }: ManagerOfficesProps) {
  return (
    <g>
      {layout.rooms.managerOffices.map((office, i) => (
        <g key={`mgroffice-${i}`}>
          {/* Whiteboard at the back wall */}
          <Whiteboard x={office.whiteboardPosition.x} y={office.whiteboardPosition.y}/>
          {/* Exec chair behind the desk */}
          <ExecChair x={office.deskPosition.x - 4} y={office.deskPosition.y}/>
          {/* Manager sprite (purple shirt) */}
          <AgentSprite x={office.managerPosition.x} y={office.managerPosition.y} shirtColor="#a855f7"/>
          {/* Exec desk */}
          <ExecDesk x={office.deskPosition.x} y={office.deskPosition.y}/>
          {/* Door on the west wall opening to agent floor */}
          <Door x={office.doorPosition.x} y={office.doorPosition.y}/>
        </g>
      ))}
    </g>
  )
}

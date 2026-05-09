'use client'

import type { OfficeLayout } from './geometry'
import { AgentSprite } from './AgentSprite'

interface ManagerProps { layout: OfficeLayout }

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
      <polygon points="0,-4 22,7 0,16 -22,7" fill="#1e293b" stroke="#0f172a" strokeWidth={0.6}/>
      <polygon points="-22,7 -22,10 0,19 0,16" fill="#0f172a"/>
      <polygon points="22,7 22,10 0,19 0,16" fill="#020617"/>
      <rect x={-3.5} y={0} width={7} height={4.5} fill="#0f172a" stroke="#334155" strokeWidth={0.3}/>
      <polygon points="-4,4.5 4,4.5 2,6 -2,6" fill="#334155"/>
      <rect x={6} y={4} width={3} height={2} fill="#fbbf24" rx={0.2}/>
    </g>
  )
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 2})`}>
      <ellipse cx={0} cy={9} rx={5} ry={1.5} fill="#1e293b" opacity={0.4}/>
      <polygon points="-3,3 3,3 2.5,8 -2.5,8" fill="#92400e" stroke="#451a03" strokeWidth={0.3}/>
      <ellipse cx={0} cy={0} rx={6} ry={5} fill="#16a34a"/>
      <ellipse cx={-2.5} cy={-3} rx={3} ry={3} fill="#22c55e"/>
      <ellipse cx={2.5} cy={-3} rx={3} ry={3} fill="#22c55e"/>
      <ellipse cx={0} cy={-5} rx={2.8} ry={2.8} fill="#4ade80"/>
    </g>
  )
}

export function Manager({ layout }: ManagerProps) {
  const desk = layout.manager.deskPosition
  const plant = layout.manager.plantPosition
  return (
    <g>
      <ExecChair x={desk.x} y={desk.y}/>
      <AgentSprite x={desk.x} y={desk.y - 2} shirtColor="#a855f7"/>
      <ExecDesk x={desk.x} y={desk.y}/>
      <Plant x={plant.x} y={plant.y}/>
    </g>
  )
}

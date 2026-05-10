'use client'

import type { BuildingLayout } from './geometry'

interface GymProps { layout: BuildingLayout }

function Treadmill({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Shadow */}
      <ellipse cx={0} cy={6} rx={11} ry={2.5} fill="#1e293b" opacity={0.35}/>
      {/* Belt platform (angled iso-style) */}
      <polygon points="-10,4 8,-2 12,2 -6,8" fill="#1e293b" stroke="#0f172a" strokeWidth={0.5}/>
      <polygon points="-10,4 -10,5.5 -6,9.5 -6,8" fill="#0f172a"/>
      <polygon points="12,2 12,3.5 -6,9.5 -6,8" fill="#0f172a"/>
      {/* Belt rollers */}
      <ellipse cx={-8} cy={5.5} rx={2} ry={0.6} fill="#475569"/>
      <ellipse cx={10} cy={0} rx={2} ry={0.6} fill="#475569"/>
      {/* Console + handlebars */}
      <line x1={-9} y1={4} x2={-12} y2={-4} stroke="#475569" strokeWidth={0.7}/>
      <line x1={-3} y1={1.5} x2={-6} y2={-6} stroke="#475569" strokeWidth={0.7}/>
      <rect x={-12} y={-9} width={9} height={4} fill="#0f172a" stroke="#475569" strokeWidth={0.4} rx={0.4}/>
      <rect x={-11} y={-8} width={7} height={2.4} fill="#22c55e" opacity={0.7}/>
      {/* Handle */}
      <line x1={-12} y1={-5} x2={-3} y2={-5} stroke="#cbd5e1" strokeWidth={0.6}/>
    </g>
  )
}

function Weights({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Shadow */}
      <ellipse cx={0} cy={5} rx={9} ry={2} fill="#1e293b" opacity={0.35}/>
      {/* Barbell */}
      <rect x={-7} y={1} width={14} height={1} fill="#475569"/>
      {/* Plates */}
      <ellipse cx={-7} cy={1.5} rx={1.4} ry={3} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <ellipse cx={-5.5} cy={1.5} rx={1.4} ry={3.5} fill="#1e293b"/>
      <ellipse cx={7} cy={1.5} rx={1.4} ry={3} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <ellipse cx={5.5} cy={1.5} rx={1.4} ry={3.5} fill="#1e293b"/>
      {/* A pair of dumbbells next to it */}
      <g transform="translate(0, 7)">
        <rect x={-3} y={0} width={6} height={0.8} fill="#475569"/>
        <ellipse cx={-3} cy={0.4} rx={0.9} ry={1.6} fill="#1e293b"/>
        <ellipse cx={3} cy={0.4} rx={0.9} ry={1.6} fill="#1e293b"/>
      </g>
    </g>
  )
}

export function Gym({ layout }: GymProps) {
  const g = layout.rooms.gym
  return (
    <g>
      <Treadmill x={g.treadmillPosition.x} y={g.treadmillPosition.y}/>
      <Weights x={g.weightsPosition.x} y={g.weightsPosition.y}/>
    </g>
  )
}

'use client'

import type { BuildingLayout } from './geometry'

interface RestroomsProps { layout: BuildingLayout }

function RestroomDoor({ x, y, label }: { x: number; y: number; label: 'M' | 'F' }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Door body */}
      <rect x={-3} y={-12} width={6} height={12} fill="#475569" stroke="#1e293b" strokeWidth={0.4}/>
      {/* Sign plaque */}
      <rect x={-2.5} y={-11} width={5} height={3.5} fill="#f8fafc" stroke="#1e293b" strokeWidth={0.3}/>
      <text
        x={0}
        y={-8.2}
        textAnchor="middle"
        fontSize={3}
        fontWeight="bold"
        fill={label === 'M' ? '#1e40af' : '#be185d'}
      >
        {label}
      </text>
      {/* Handle */}
      <circle cx={2} cy={-5} r={0.6} fill="#fbbf24"/>
    </g>
  )
}

export function Restrooms({ layout }: RestroomsProps) {
  const r = layout.rooms.restrooms
  const labels: Array<'M' | 'F'> = ['M', 'F']
  return (
    <g>
      {r.doorPositions.map((p, i) => (
        <RestroomDoor key={`rd${i}`} x={p.x} y={p.y} label={labels[i] ?? 'M'}/>
      ))}
    </g>
  )
}

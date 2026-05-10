'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from './geometry'
import { AgentSprite } from './AgentSprite'
import type { ActivityAssignment } from './activity'

interface SmokingPatioProps {
  layout: BuildingLayout
  agents?: Array<{ id: string; state: AgentVisualState }>
  activities?: Record<string, ActivityAssignment>
}

const ptsStr = (pts: ReadonlyArray<ScreenPoint>) => pts.map(p => `${p.x},${p.y}`).join(' ')

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-14} y={-1.5} width={28} height={3} fill="#92400e" stroke="#451a03" strokeWidth={0.4} rx={0.5}/>
      {/* Legs */}
      <rect x={-12} y={1.5} width={1.5} height={3.5} fill="#451a03"/>
      <rect x={10.5} y={1.5} width={1.5} height={3.5} fill="#451a03"/>
    </g>
  )
}

function Ashtray({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Pedestal */}
      <rect x={-1.2} y={-2} width={2.4} height={6} fill="#475569" stroke="#1e293b" strokeWidth={0.3}/>
      {/* Bowl */}
      <ellipse cx={0} cy={-2.5} rx={3} ry={1.2} fill="#1e293b" stroke="#0f172a" strokeWidth={0.3}/>
      {/* A faint smoke wisp */}
      <ellipse cx={0.8} cy={-5} rx={0.6} ry={1.2} fill="#cbd5e1" opacity={0.5}/>
    </g>
  )
}

// A small column of grey ellipses curling upward — the smoke / chat indicator
// rendered next to each agent on the patio.
function SmokeCurl({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} opacity={0.6}>
      <ellipse cx={0}    cy={-2} rx={1.4} ry={1.1} fill="#cbd5e1"/>
      <ellipse cx={0.8}  cy={-5} rx={1.2} ry={1.0} fill="#94a3b8"/>
      <ellipse cx={-0.4} cy={-7.5} rx={1.0} ry={0.9} fill="#cbd5e1"/>
    </g>
  )
}

export function SmokingPatio({ layout, agents = [], activities }: SmokingPatioProps) {
  const p = layout.rooms.smokingPatio

  // Chatters are routed here by activity.ts. They get assigned a position
  // from p.standingPositions in chatting order.
  const chatters = activities
    ? agents.filter(a => activities[a.id]?.activity === 'chatting')
    : []

  return (
    <g>
      {/* Patio deck — wood-tone polygon outside the SW wall. */}
      <polygon
        points={ptsStr(p.zonePoints)}
        fill="#a16207"
        stroke="#451a03"
        strokeWidth={0.6}
        opacity={0.85}
      />
      {/* Wood plank lines — faint horizontal streaks across the deck. */}
      {[0.25, 0.5, 0.75].map((t, i) => {
        const a = p.zonePoints[0]
        const b = p.zonePoints[1]
        const c = p.zonePoints[2]
        const d = p.zonePoints[3]
        const left = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t }
        const right = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t }
        return (
          <line
            key={`plank-${i}`}
            x1={left.x} y1={left.y} x2={right.x} y2={right.y}
            stroke="#78350f" strokeWidth={0.4} opacity={0.45}
          />
        )
      })}

      {/* Railing — thin lines forming a low fence on 3 sides. */}
      {p.railingSegments.map(([s, e], i) => (
        <g key={`rail-${i}`}>
          <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#1e293b" strokeWidth={0.7}/>
          {/* Posts */}
          <rect x={s.x - 0.4} y={s.y - 4} width={0.8} height={4} fill="#1e293b"/>
          <rect x={e.x - 0.4} y={e.y - 4} width={0.8} height={4} fill="#1e293b"/>
          {/* Top rail above */}
          <line x1={s.x} y1={s.y - 4} x2={e.x} y2={e.y - 4} stroke="#334155" strokeWidth={0.6}/>
        </g>
      ))}

      <Bench x={p.bench.x} y={p.bench.y}/>
      <Ashtray x={p.ashtray.x} y={p.ashtray.y}/>

      {/* Smokers / chatters. */}
      {chatters.map(a => {
        const pos = activities![a.id].position
        return (
          <g key={`smoke-${a.id}`}>
            <AgentSprite x={pos.x} y={pos.y} shirtColor="#22c55e"/>
            <SmokeCurl x={pos.x + 5} y={pos.y - 6}/>
          </g>
        )
      })}
    </g>
  )
}

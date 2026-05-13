'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import type { ActivityAssignment } from './activity'
import type { VisualJourney } from './journey'

interface SmokingPatioProps {
  layout: BuildingLayout
  agents?: Array<{ id: string; state: AgentVisualState }>
  activities?: Record<string, ActivityAssignment>
  journeys?: Record<string, VisualJourney>
}

const ptsStr = (pts: ReadonlyArray<ScreenPoint>) => pts.map(p => `${p.x},${p.y}`).join(' ')

function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-14} y={-1.5} width={28} height={3} fill="#92400e" stroke="#451a03" strokeWidth={0.4} rx={0.5}/>
      <rect x={-12} y={1.5} width={1.5} height={3.5} fill="#451a03"/>
      <rect x={10.5} y={1.5} width={1.5} height={3.5} fill="#451a03"/>
    </g>
  )
}

function Ashtray({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-1.2} y={-2} width={2.4} height={6} fill="#475569" stroke="#1e293b" strokeWidth={0.3}/>
      <ellipse cx={0} cy={-2.5} rx={3} ry={1.2} fill="#1e293b" stroke="#0f172a" strokeWidth={0.3}/>
    </g>
  )
}

// CSS-animated smoke curl: 3 grey circles drifting up + fading out, staggered.
function SmokeCurl({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g className="cockpit-smoke-curl">
        <circle r={1.2} cx={0} cy={0} fill="#cbd5e1" opacity={0.6}/>
      </g>
      <g className="cockpit-smoke-curl cockpit-smoke-curl--delay">
        <circle r={1.0} cx={0.6} cy={-1} fill="#94a3b8" opacity={0.55}/>
      </g>
      <g className="cockpit-smoke-curl cockpit-smoke-curl--delay2">
        <circle r={0.9} cx={-0.4} cy={-2} fill="#cbd5e1" opacity={0.5}/>
      </g>
    </g>
  )
}

export function SmokingPatio({ layout, agents = [], activities, journeys }: SmokingPatioProps) {
  const p = layout.rooms.smokingPatio

  // Render only agents who have arrived (journey at_chat_spot). Falls back to
  // activity-only when no journey is present.
  const chatters = agents.filter(a => {
    const j = journeys?.[a.id]
    if (j) return j.phase.kind === 'at_chat_spot'
    return activities?.[a.id]?.activity === 'chatting'
  })

  return (
    <g>
      <polygon
        points={ptsStr(p.zonePoints)}
        fill="#a16207"
        stroke="#451a03"
        strokeWidth={0.6}
        opacity={0.85}
      />
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

      {p.railingSegments.map(([s, e], i) => (
        <g key={`rail-${i}`}>
          <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#1e293b" strokeWidth={0.7}/>
          <rect x={s.x - 0.4} y={s.y - 4} width={0.8} height={4} fill="#1e293b"/>
          <rect x={e.x - 0.4} y={e.y - 4} width={0.8} height={4} fill="#1e293b"/>
          <line x1={s.x} y1={s.y - 4} x2={e.x} y2={e.y - 4} stroke="#334155" strokeWidth={0.6}/>
        </g>
      ))}

      <Bench x={p.bench.x} y={p.bench.y}/>
      <Ashtray x={p.ashtray.x} y={p.ashtray.y}/>

      {/* Chatters/smokers. Pair members face each other — mirror odd-indexed
          chatters across the X axis. Each gets a CSS smoke curl. */}
      {chatters.map((a, idx) => {
        const j = journeys?.[a.id]
        const pos = j?.phase.kind === 'at_chat_spot'
          ? (j.phase as { pos: ScreenPoint }).pos
          : (activities?.[a.id]?.position ?? p.standingPositions[0])
        const mirror = idx % 2 === 1
        return (
          <g key={`smoke-${a.id}`}>
            <g transform={mirror ? `translate(${pos.x * 2}, 0) scale(-1, 1)` : ''}>
              <AgentSprite x={mirror ? pos.x : pos.x} y={pos.y} shirtColor="#22c55e"/>
            </g>
            <SmokeCurl x={pos.x + (mirror ? -5 : 5)} y={pos.y - 6}/>
            <StatusBubble x={pos.x} y={pos.y} state={a.state} phase={j?.phase}/>
          </g>
        )
      })}
    </g>
  )
}

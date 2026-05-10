'use client'

// Janitor NPC — walks a slow perimeter loop along the agent floor. Position is
// derived from simTimeMin so the path replays deterministically as the user
// scrubs the time machine. Loop length = LOOP_MIN sim minutes per full loop.

import type { BuildingLayout, ScreenPoint } from './geometry'

interface JanitorProps {
  layout: BuildingLayout
  simTimeMin: number
}

const LOOP_MIN = 30  // one full loop every 30 sim minutes

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function janitorPositionAt(path: ScreenPoint[], simTimeMin: number): { pos: ScreenPoint; angle: number } {
  if (path.length === 0) return { pos: { x: 0, y: 0 }, angle: 0 }
  const u = ((simTimeMin % LOOP_MIN) + LOOP_MIN) % LOOP_MIN / LOOP_MIN  // 0..1
  const segCount = path.length
  const segIndex = Math.floor(u * segCount)
  const segT = (u * segCount) - segIndex
  const a = path[segIndex]
  const b = path[(segIndex + 1) % segCount]
  return {
    pos: { x: lerp(a.x, b.x, segT), y: lerp(a.y, b.y, segT) },
    angle: 0,
  }
}

export function Janitor({ layout, simTimeMin }: JanitorProps) {
  const path = layout.rooms.agentFloor.janitorPath
  const { pos } = janitorPositionAt(path, simTimeMin)
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      {/* Shadow */}
      <ellipse cx={0} cy={6} rx={4.5} ry={1.4} fill="#1e293b" opacity={0.35}/>
      {/* Body — teal uniform */}
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill="#0d9488" stroke="#0f172a" strokeWidth={0.4}/>
      {/* Orange chest stripe */}
      <rect x={-3.3} y={-1} width={6.6} height={1.2} fill="#f97316"/>
      {/* Head */}
      <ellipse cx={0} cy={-5} rx={2.5} ry={2.3} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      {/* Cap */}
      <path d="M-2.6,-7 Q0,-9 2.6,-7 L2.4,-5.5 L-2.4,-5.5 Z" fill="#0d9488" stroke="#0f172a" strokeWidth={0.3}/>
      {/* Eyes */}
      <circle cx={2.6} cy={-5.3} r={0.8} fill="#1e293b"/>
      {/* Mop handle slung over shoulder */}
      <line x1={3.5} y1={-2} x2={9} y2={-9} stroke="#92400e" strokeWidth={0.7}/>
      {/* Mop head */}
      <ellipse cx={9} cy={-9.5} rx={2.2} ry={1.2} fill="#fbbf24" stroke="#92400e" strokeWidth={0.3}/>
      <line x1={7.5} y1={-9} x2={10.5} y2={-10.5} stroke="#92400e" strokeWidth={0.2}/>
    </g>
  )
}

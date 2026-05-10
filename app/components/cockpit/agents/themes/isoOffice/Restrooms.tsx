'use client'

import { isoToScreen, type BuildingLayout } from './geometry'

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

// Iso-style stall partition: small vertical wall + door indicator.
function Stall({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Floor footprint */}
      <polygon points="-5,1 5,1 6,3 -4,3" fill="#cbd5e1" opacity={0.5}/>
      {/* Side walls (extruded) */}
      <polygon points="-5,1 -5,-6 5,-6 5,1" fill="#e2e8f0" stroke="#64748b" strokeWidth={0.3} opacity={0.85}/>
      <polygon points="-5,1 5,1 6,3 -4,3" fill="none" stroke="#64748b" strokeWidth={0.3}/>
      {/* Stall door (slightly ajar — single dark slit) */}
      <rect x={-1} y={-4} width={2} height={4.5} fill="#475569" stroke="#1e293b" strokeWidth={0.2}/>
      {/* Toilet hint */}
      <ellipse cx={0} cy={0} rx={1.4} ry={0.7} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.2}/>
    </g>
  )
}

// Sink with mini faucet.
function Sink({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-2.8} y={-1.2} width={5.6} height={2.6} fill="#f1f5f9" stroke="#64748b" strokeWidth={0.3} rx={0.6}/>
      <ellipse cx={0} cy={0} rx={2} ry={0.9} fill="#94a3b8" opacity={0.6}/>
      {/* Faucet spout */}
      <rect x={-0.4} y={-2.6} width={0.8} height={1.6} fill="#94a3b8"/>
      <circle cx={0} cy={-2.7} r={0.4} fill="#cbd5e1"/>
    </g>
  )
}

// Mirror — long horizontal panel with darker frame.
function Mirror({ x, y, width = 14 }: { x: number; y: number; width?: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-width / 2} y={-4.5} width={width} height={3.5} fill="#cbd5e1" stroke="#334155" strokeWidth={0.5}/>
      <rect x={-width / 2 + 0.5} y={-4.2} width={width - 1} height={2.9} fill="#bae6fd" opacity={0.7}/>
    </g>
  )
}

// Wall-mounted urinal — small basin, very iso-simple.
function Urinal({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <ellipse cx={0} cy={0} rx={1.6} ry={0.9} fill="#f1f5f9" stroke="#64748b" strokeWidth={0.3}/>
      <rect x={-1.4} y={-2} width={2.8} height={2} fill="#f1f5f9" stroke="#64748b" strokeWidth={0.3} rx={0.4}/>
    </g>
  )
}

export function Restrooms({ layout }: RestroomsProps) {
  const r = layout.rooms.restrooms
  const labels: Array<'M' | 'F'> = ['M', 'F']
  const b = r.isoBounds
  const ox = layout.origin.x
  const oy = layout.origin.y

  // Anchor the interior props to iso coordinates inside the room. The room
  // runs i: [iMin, iMax]=[0,6], j: [jMin, jMax]=[12,16]. We split it into two
  // halves (M on the upper half, F on the lower half).
  const midJ = (b.jMin + b.jMax) / 2
  // M-side (upper): two stalls + one urinal + sink/mirror.
  const mStall1 = isoToScreen(b.iMin + 1.0, b.jMin + 0.6, ox, oy)
  const mStall2 = isoToScreen(b.iMin + 2.6, b.jMin + 0.6, ox, oy)
  const mUrinal = isoToScreen(b.iMin + 4.2, b.jMin + 0.5, ox, oy)
  const mSink1  = isoToScreen(b.iMin + 1.5, midJ - 0.4, ox, oy)
  const mSink2  = isoToScreen(b.iMin + 3.0, midJ - 0.4, ox, oy)
  const mMirror = isoToScreen(b.iMin + 2.25, midJ - 0.45, ox, oy)
  // F-side (lower): three stalls + two sinks + mirror.
  const fStall1 = isoToScreen(b.iMin + 1.0, midJ + 0.6, ox, oy)
  const fStall2 = isoToScreen(b.iMin + 2.6, midJ + 0.6, ox, oy)
  const fStall3 = isoToScreen(b.iMin + 4.2, midJ + 0.6, ox, oy)
  const fSink1  = isoToScreen(b.iMin + 1.5, b.jMax - 0.5, ox, oy)
  const fSink2  = isoToScreen(b.iMin + 3.0, b.jMax - 0.5, ox, oy)
  const fMirror = isoToScreen(b.iMin + 2.25, b.jMax - 0.55, ox, oy)

  return (
    <g>
      {/* Tile divider between M and F halves */}
      <line
        x1={isoToScreen(b.iMin, midJ, ox, oy).x}
        y1={isoToScreen(b.iMin, midJ, ox, oy).y}
        x2={isoToScreen(b.iMax, midJ, ox, oy).x}
        y2={isoToScreen(b.iMax, midJ, ox, oy).y}
        stroke="#94a3b8"
        strokeWidth={0.6}
        opacity={0.6}
      />
      {/* M-side fixtures */}
      <Stall x={mStall1.x} y={mStall1.y}/>
      <Stall x={mStall2.x} y={mStall2.y}/>
      <Urinal x={mUrinal.x} y={mUrinal.y}/>
      <Mirror x={mMirror.x} y={mMirror.y - 2} width={12}/>
      <Sink x={mSink1.x} y={mSink1.y}/>
      <Sink x={mSink2.x} y={mSink2.y}/>
      {/* F-side fixtures */}
      <Stall x={fStall1.x} y={fStall1.y}/>
      <Stall x={fStall2.x} y={fStall2.y}/>
      <Stall x={fStall3.x} y={fStall3.y}/>
      <Mirror x={fMirror.x} y={fMirror.y - 2} width={12}/>
      <Sink x={fSink1.x} y={fSink1.y}/>
      <Sink x={fSink2.x} y={fSink2.y}/>
      {/* Doors */}
      {r.doorPositions.map((p, i) => (
        <RestroomDoor key={`rd${i}`} x={p.x} y={p.y} label={labels[i] ?? 'M'}/>
      ))}
    </g>
  )
}

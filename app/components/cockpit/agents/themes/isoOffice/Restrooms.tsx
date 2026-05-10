'use client'

import { isoToScreen, type BuildingLayout, type ScreenPoint } from './geometry'

interface RestroomsProps { layout: BuildingLayout }

const ptsStr = (pts: ReadonlyArray<ScreenPoint>) => pts.map(p => `${p.x},${p.y}`).join(' ')

// Top-down toilet icon: oval bowl, rectangular tank behind, lid lines.
// Sized to read clearly at the iso scale — the previous tiny ellipse hint
// was too subtle (Round 5.5).
function Toilet({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Drop shadow */}
      <ellipse cx={0} cy={2.4} rx={3.2} ry={1.0} fill="#1e293b" opacity={0.25}/>
      {/* Tank (back) */}
      <rect x={-2.5} y={-3.6} width={5} height={2.0} fill="#f8fafc" stroke="#475569" strokeWidth={0.35} rx={0.4}/>
      {/* Tank top trim */}
      <rect x={-2.5} y={-3.6} width={5} height={0.5} fill="#cbd5e1"/>
      {/* Bowl — oval seat */}
      <ellipse cx={0} cy={0.2} rx={2.7} ry={1.8} fill="#f8fafc" stroke="#475569" strokeWidth={0.35}/>
      {/* Bowl interior (inside hole) */}
      <ellipse cx={0} cy={0.2} rx={1.7} ry={1.0} fill="#bae6fd" opacity={0.7}/>
      {/* Seat lid hinge dots */}
      <circle cx={-0.9} cy={-1.2} r={0.25} fill="#94a3b8"/>
      <circle cx={0.9} cy={-1.2} r={0.25} fill="#94a3b8"/>
      {/* Flush handle */}
      <rect x={1.5} y={-3.0} width={0.8} height={0.4} fill="#cbd5e1" stroke="#64748b" strokeWidth={0.2}/>
    </g>
  )
}

// Top-down sink with faucet. Round basin, chrome spout, tap handles.
function Sink({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Counter slab */}
      <rect x={-3.5} y={-1.8} width={7} height={3.6} fill="#e2e8f0" stroke="#475569" strokeWidth={0.3} rx={0.5}/>
      {/* Basin (oval recessed bowl) */}
      <ellipse cx={0} cy={0.3} rx={2.4} ry={1.3} fill="#cbd5e1" stroke="#64748b" strokeWidth={0.35}/>
      <ellipse cx={0} cy={0.3} rx={1.9} ry={1.0} fill="#bfdbfe" opacity={0.65}/>
      {/* Drain hole */}
      <circle cx={0} cy={0.3} r={0.35} fill="#0f172a"/>
      {/* Faucet spout */}
      <rect x={-0.45} y={-1.7} width={0.9} height={1.5} fill="#94a3b8" stroke="#475569" strokeWidth={0.2}/>
      <circle cx={0} cy={-0.4} r={0.35} fill="#cbd5e1"/>
      {/* Tap handles (left + right) */}
      <circle cx={-1.6} cy={-1.3} r={0.5} fill="#94a3b8" stroke="#475569" strokeWidth={0.2}/>
      <circle cx={1.6} cy={-1.3} r={0.5} fill="#94a3b8" stroke="#475569" strokeWidth={0.2}/>
    </g>
  )
}

// Mirror — long rectangle, framed, with light reflection accents.
function Mirror({ x, y, width = 12 }: { x: number; y: number; width?: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-width / 2} y={-4.8} width={width} height={3.6} fill="#1f2937" stroke="#0f172a" strokeWidth={0.5}/>
      <rect x={-width / 2 + 0.4} y={-4.5} width={width - 0.8} height={3.0} fill="#bae6fd"/>
      {/* Reflection sheen */}
      <line x1={-width / 2 + 1.5} y1={-4.4} x2={-width / 2 + 4} y2={-1.7} stroke="#fff" strokeWidth={0.25} opacity={0.7}/>
      <line x1={-width / 2 + 3} y1={-4.4} x2={-width / 2 + 5} y2={-2.4} stroke="#fff" strokeWidth={0.2} opacity={0.5}/>
    </g>
  )
}

// Stall partition — a small enclosure with a half-open door and a top-down
// toilet inside. The walls are short partitions (commercial bathroom style).
function Stall({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Stall floor (slightly different tile) */}
      <polygon points="-4.5,-3 4.5,-3 4.5,3.5 -4.5,3.5" fill="#e0f2fe" stroke="#0891b2" strokeWidth={0.25} opacity={0.6}/>
      {/* Side partitions (short walls) */}
      <rect x={-4.7} y={-3.2} width={0.5} height={7} fill="#94a3b8" stroke="#475569" strokeWidth={0.25}/>
      <rect x={4.2}  y={-3.2} width={0.5} height={7} fill="#94a3b8" stroke="#475569" strokeWidth={0.25}/>
      {/* Back wall */}
      <rect x={-4.5} y={-3.5} width={9} height={0.5} fill="#94a3b8" stroke="#475569" strokeWidth={0.25}/>
      {/* Front wall with door cut-out */}
      <rect x={-4.5} y={3.3} width={2.0} height={0.5} fill="#94a3b8" stroke="#475569" strokeWidth={0.25}/>
      <rect x={2.5}  y={3.3} width={2.0} height={0.5} fill="#94a3b8" stroke="#475569" strokeWidth={0.25}/>
      {/* Open door (hanging at an angle) */}
      <rect x={-2.5} y={3.0} width={2.2} height={0.4} fill="#cbd5e1" stroke="#475569" strokeWidth={0.2} transform="rotate(-15)"/>
      {/* Toilet inside */}
      <Toilet x={0} y={0}/>
    </g>
  )
}

// Urinal — wall-mounted, top-down view: a wide curved trough.
function Urinal({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Mounting plate (against the wall) */}
      <rect x={-2.5} y={-1.5} width={5} height={1.0} fill="#cbd5e1" stroke="#475569" strokeWidth={0.3}/>
      {/* Bowl — wider top, narrower bottom */}
      <path d="M-2.4,-0.5 L2.4,-0.5 L2.0,2.4 L-2.0,2.4 Z" fill="#f8fafc" stroke="#475569" strokeWidth={0.3}/>
      {/* Drain */}
      <ellipse cx={0} cy={1.6} rx={0.7} ry={0.3} fill="#0f172a"/>
      {/* Flush button */}
      <circle cx={0} cy={-1.0} r={0.4} fill="#94a3b8" stroke="#475569" strokeWidth={0.2}/>
    </g>
  )
}

// Door with sign plaque (M / F / Restroom).
function RestroomDoor({ x, y, label }: { x: number; y: number; label: 'M' | 'F' }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Door body */}
      <rect x={-3.5} y={-12} width={7} height={12} fill="#475569" stroke="#1e293b" strokeWidth={0.4}/>
      {/* Door pattern (panel) */}
      <rect x={-2.7} y={-10.5} width={5.4} height={4} fill="#334155" stroke="#1e293b" strokeWidth={0.2}/>
      <rect x={-2.7} y={-5.8} width={5.4} height={4} fill="#334155" stroke="#1e293b" strokeWidth={0.2}/>
      {/* Sign plaque ABOVE door */}
      <rect x={-3} y={-15} width={6} height={2.5} fill="#f8fafc" stroke="#1e293b" strokeWidth={0.3}/>
      <text
        x={0}
        y={-13.2}
        textAnchor="middle"
        fontSize={2.3}
        fontWeight="bold"
        fill={label === 'M' ? '#1e40af' : '#be185d'}
      >
        {label === 'M' ? '🚹 RESTROOM' : '🚺 RESTROOM'}
      </text>
      {/* Handle */}
      <circle cx={2.3} cy={-5.5} r={0.7} fill="#fbbf24"/>
    </g>
  )
}

// Tile a polygon with a small grid pattern (top-down "bathroom tile" look).
// Renders as a clipped pattern fill so the tiles never escape the room
// outline. Subtle so it doesn't compete with the fixtures.
function TileFloor({ id, points }: { id: string; points: ScreenPoint[] }) {
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return (
    <>
      <defs>
        <pattern id={`vO-tile-${id}`} x={0} y={0} width={5} height={2.5} patternUnits="userSpaceOnUse">
          <rect width={5} height={2.5} fill="#dbeafe"/>
          <line x1={0} y1={0} x2={5} y2={0} stroke="#bae6fd" strokeWidth={0.18}/>
          <line x1={0} y1={0} x2={0} y2={2.5} stroke="#bae6fd" strokeWidth={0.18}/>
        </pattern>
        <clipPath id={`vO-tileclip-${id}`}>
          <polygon points={ptsStr(points)}/>
        </clipPath>
      </defs>
      {/* Pale-blue floor tint so the room reads as bathroom at a glance */}
      <polygon points={ptsStr(points)} fill="#e0f2fe" opacity={0.85}/>
      {/* Tile grid overlaid on the bathroom area */}
      <rect
        x={minX} y={minY}
        width={maxX - minX} height={maxY - minY}
        fill={`url(#vO-tile-${id})`}
        opacity={0.55}
        clipPath={`url(#vO-tileclip-${id})`}
      />
    </>
  )
}

export function Restrooms({ layout }: RestroomsProps) {
  const r = layout.rooms.restrooms
  const labels: Array<'M' | 'F'> = ['M', 'F']
  const b = r.isoBounds
  const ox = layout.origin.x
  const oy = layout.origin.y
  const midJ = (b.jMin + b.jMax) / 2

  // Layout the fixtures inside each half. Positions chosen so they read
  // clearly at the iso scale and stay inside the room polygon.
  const mStall1 = isoToScreen(b.iMin + 1.0, b.jMin + 0.7, ox, oy)
  const mStall2 = isoToScreen(b.iMin + 2.4, b.jMin + 0.7, ox, oy)
  const mUrinal1 = isoToScreen(b.iMin + 4.0, b.jMin + 0.4, ox, oy)
  const mUrinal2 = isoToScreen(b.iMin + 5.0, b.jMin + 0.5, ox, oy)
  const mSink1  = isoToScreen(b.iMin + 1.5, midJ - 0.3, ox, oy)
  const mSink2  = isoToScreen(b.iMin + 3.5, midJ - 0.3, ox, oy)
  const mMirror = isoToScreen(b.iMin + 2.5, midJ - 0.5, ox, oy)

  const fStall1 = isoToScreen(b.iMin + 1.0, midJ + 0.7, ox, oy)
  const fStall2 = isoToScreen(b.iMin + 2.4, midJ + 0.7, ox, oy)
  const fStall3 = isoToScreen(b.iMin + 4.2, midJ + 0.7, ox, oy)
  const fSink1  = isoToScreen(b.iMin + 1.5, b.jMax - 0.4, ox, oy)
  const fSink2  = isoToScreen(b.iMin + 3.5, b.jMax - 0.4, ox, oy)
  const fMirror = isoToScreen(b.iMin + 2.5, b.jMax - 0.6, ox, oy)

  return (
    <g>
      {/* Pale-blue tiled floor — instantly reads as bathroom. */}
      <TileFloor id="restroom" points={r.zonePoints}/>

      {/* Tile divider between M and F halves (mid-room wall hint) */}
      <line
        x1={isoToScreen(b.iMin, midJ, ox, oy).x}
        y1={isoToScreen(b.iMin, midJ, ox, oy).y}
        x2={isoToScreen(b.iMax, midJ, ox, oy).x}
        y2={isoToScreen(b.iMax, midJ, ox, oy).y}
        stroke="#0891b2"
        strokeWidth={0.7}
        opacity={0.7}
      />

      {/* M-side fixtures */}
      <Stall x={mStall1.x} y={mStall1.y}/>
      <Stall x={mStall2.x} y={mStall2.y}/>
      <Urinal x={mUrinal1.x} y={mUrinal1.y}/>
      <Urinal x={mUrinal2.x} y={mUrinal2.y}/>
      <Mirror x={mMirror.x} y={mMirror.y - 1} width={11}/>
      <Sink x={mSink1.x} y={mSink1.y}/>
      <Sink x={mSink2.x} y={mSink2.y}/>

      {/* F-side fixtures */}
      <Stall x={fStall1.x} y={fStall1.y}/>
      <Stall x={fStall2.x} y={fStall2.y}/>
      <Stall x={fStall3.x} y={fStall3.y}/>
      <Mirror x={fMirror.x} y={fMirror.y - 1} width={11}/>
      <Sink x={fSink1.x} y={fSink1.y}/>
      <Sink x={fSink2.x} y={fSink2.y}/>

      {/* Doors with "RESTROOM" sign above each */}
      {r.doorPositions.map((p, i) => (
        <RestroomDoor key={`rd${i}`} x={p.x} y={p.y} label={labels[i] ?? 'M'}/>
      ))}
    </g>
  )
}

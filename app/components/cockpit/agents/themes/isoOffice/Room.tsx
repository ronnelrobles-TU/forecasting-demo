'use client'

import { WALL_HEIGHT, isoToScreen, type OfficeLayout, type ScreenPoint } from './geometry'

interface RoomProps { layout: OfficeLayout }

const ptsStr = (pts: ReadonlyArray<ScreenPoint>) => pts.map(p => `${p.x},${p.y}`).join(' ')

const WINDOW_INSET_TOP = 13
const WINDOW_INSET_BOTTOM = 8
const WINDOW_HALF_WIDTH = 0.5  // iso units half-width per window

function makeWindow(midI: number, midJ: number, alongI: boolean, originX: number, originY: number): ScreenPoint[] {
  // Window centered on iso (midI, midJ).
  // For NE wall (alongI=true), window spans iso (midI ± WHW, 0).
  // For NW wall (alongI=false), window spans iso (0, midJ ± WHW).
  if (alongI) {
    const bl = isoToScreen(midI - WINDOW_HALF_WIDTH, 0, originX, originY)
    const br = isoToScreen(midI + WINDOW_HALF_WIDTH, 0, originX, originY)
    return [
      { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
      { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
      { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
      { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
    ]
  } else {
    const bl = isoToScreen(0, midJ - WINDOW_HALF_WIDTH, originX, originY)
    const br = isoToScreen(0, midJ + WINDOW_HALF_WIDTH, originX, originY)
    return [
      { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
      { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
      { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
      { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
    ]
  }
}

function makePartition(p1: ScreenPoint, p2: ScreenPoint): ScreenPoint[] {
  // Low partition: extrude 6px upward in screen y from the iso line p1->p2
  return [
    p1,
    p2,
    { x: p2.x, y: p2.y - 6 },
    { x: p1.x, y: p1.y - 6 },
  ]
}

export function Room({ layout }: RoomProps) {
  const { N, E, W, S } = layout.floorCorners
  const wallTopN: ScreenPoint = { x: N.x, y: N.y - WALL_HEIGHT }
  const wallTopE: ScreenPoint = { x: E.x, y: E.y - WALL_HEIGHT }
  const wallTopW: ScreenPoint = { x: W.x, y: W.y - WALL_HEIGHT }

  const { tilesW, tilesD, windowsPerWall, origin } = layout

  // Distribute windows evenly along each back wall.
  const neWindows: ScreenPoint[][] = []
  for (let k = 0; k < windowsPerWall; k++) {
    const midI = (k + 0.5) * tilesW / windowsPerWall
    neWindows.push(makeWindow(midI, 0, true, origin.x, origin.y))
  }
  const nwWindows: ScreenPoint[][] = []
  for (let k = 0; k < windowsPerWall; k++) {
    const midJ = (k + 0.5) * tilesD / windowsPerWall
    nwWindows.push(makeWindow(0, midJ, false, origin.x, origin.y))
  }

  return (
    <g>
      {/* Back walls */}
      <polygon points={ptsStr([N, wallTopN, wallTopW, W])} fill="url(#vO-wallNW)" stroke="#64748b" strokeWidth="0.8"/>
      <polygon points={ptsStr([N, wallTopN, wallTopE, E])} fill="url(#vO-wallNE)" stroke="#64748b" strokeWidth="0.8"/>
      <line x1={N.x} y1={wallTopN.y} x2={N.x} y2={N.y} stroke="#475569" strokeWidth="1.2"/>

      {/* Windows */}
      {nwWindows.map((w, i) => <polygon key={`nww${i}`} points={ptsStr(w)} fill="url(#vO-win)" stroke="#0c4a6e" strokeWidth="0.6"/>)}
      {neWindows.map((w, i) => <polygon key={`new${i}`} points={ptsStr(w)} fill="url(#vO-win)" stroke="#0c4a6e" strokeWidth="0.6"/>)}

      {/* Floor */}
      <polygon points={ptsStr([N, E, S, W])} fill="url(#vO-floor)" stroke="#475569" strokeWidth="1"/>

      {/* Zone tints */}
      <polygon points={ptsStr(layout.manager.zonePoints)} fill="url(#vO-mgrZone)" opacity="0.7"/>
      <polygon points={ptsStr(layout.breakRoom.zonePoints)} fill="url(#vO-brkZone)" opacity="0.7"/>

      {/* Low partitions dividing zones from the main floor */}
      {layout.manager.partitionEdges.map(([p1, p2], i) => (
        <polygon key={`mgrP${i}`} points={ptsStr(makePartition(p1, p2))} fill="#94a3b8" stroke="#475569" strokeWidth="0.4"/>
      ))}
      {layout.breakRoom.partitionEdges.map(([p1, p2], i) => (
        <polygon key={`brkP${i}`} points={ptsStr(makePartition(p1, p2))} fill="#94a3b8" stroke="#475569" strokeWidth="0.4"/>
      ))}
    </g>
  )
}

export function RoomDefs() {
  return (
    <defs>
      <linearGradient id="vO-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cbd5e1"/><stop offset="100%" stopColor="#94a3b8"/>
      </linearGradient>
      <linearGradient id="vO-wallNE" x1="0" y1="0" x2="1" y2="0.5">
        <stop offset="0%" stopColor="#f1f5f9"/><stop offset="100%" stopColor="#cbd5e1"/>
      </linearGradient>
      <linearGradient id="vO-wallNW" x1="1" y1="0" x2="0" y2="0.5">
        <stop offset="0%" stopColor="#e2e8f0"/><stop offset="100%" stopColor="#b8c2cf"/>
      </linearGradient>
      <linearGradient id="vO-win" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#dbeafe"/><stop offset="50%" stopColor="#7dd3fc"/><stop offset="100%" stopColor="#bae6fd"/>
      </linearGradient>
      <linearGradient id="vO-brkZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef3c7"/><stop offset="100%" stopColor="#fde68a"/>
      </linearGradient>
      <linearGradient id="vO-mgrZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e0e7ff"/><stop offset="100%" stopColor="#c7d2fe"/>
      </linearGradient>
    </defs>
  )
}

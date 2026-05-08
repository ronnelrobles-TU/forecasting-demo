'use client'

import { FLOOR_CORNERS, isoToScreen, WALL_HEIGHT, MANAGER_ZONE_POINTS, BREAK_ZONE_POINTS } from './geometry'

const ptsStr = (pts: ReadonlyArray<{ x: number; y: number }>) =>
  pts.map(p => `${p.x},${p.y}`).join(' ')

// Six windows: 3 along each back wall, at iso steps (1,2), (2.5,3.5), (4,5) along each axis.
const WINDOW_INSET_TOP = 13
const WINDOW_INSET_BOTTOM = 8

function makeWindowOnNW(jStart: number, jEnd: number) {
  // NW wall: bottom edge along iso (0, j) for j=0..6. Wall extends UP by WALL_HEIGHT.
  const bl = isoToScreen(0, jStart)
  const br = isoToScreen(0, jEnd)
  return [
    { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
    { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
  ]
}

function makeWindowOnNE(iStart: number, iEnd: number) {
  const bl = isoToScreen(iStart, 0)
  const br = isoToScreen(iEnd, 0)
  return [
    { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
    { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
  ]
}

const NW_WINDOWS = [makeWindowOnNW(1, 2), makeWindowOnNW(2.5, 3.5), makeWindowOnNW(4, 5)]
const NE_WINDOWS = [makeWindowOnNE(1, 2), makeWindowOnNE(2.5, 3.5), makeWindowOnNE(4, 5)]

export function Room() {
  const { N, E, S, W } = FLOOR_CORNERS
  const wallTopN = { x: N.x, y: N.y - WALL_HEIGHT }
  const wallTopE = { x: E.x, y: E.y - WALL_HEIGHT }
  const wallTopW = { x: W.x, y: W.y - WALL_HEIGHT }

  return (
    <g>
      {/* Back walls */}
      <polygon points={ptsStr([N, wallTopN, wallTopW, W])} fill="url(#vO-wallNW)" stroke="#64748b" strokeWidth="0.8"/>
      <polygon points={ptsStr([N, wallTopN, wallTopE, E])} fill="url(#vO-wallNE)" stroke="#64748b" strokeWidth="0.8"/>
      <line x1={N.x} y1={wallTopN.y} x2={N.x} y2={N.y} stroke="#475569" strokeWidth="1.2"/>

      {/* Windows */}
      {NW_WINDOWS.map((w, i) => <polygon key={`nww${i}`} points={ptsStr(w)} fill="url(#vO-win)" stroke="#0c4a6e" strokeWidth="0.6"/>)}
      {NE_WINDOWS.map((w, i) => <polygon key={`new${i}`} points={ptsStr(w)} fill="url(#vO-win)" stroke="#0c4a6e" strokeWidth="0.6"/>)}

      {/* Floor */}
      <polygon points={ptsStr([N, E, S, W])} fill="url(#vO-floor)" stroke="#475569" strokeWidth="1"/>

      {/* Zone tints */}
      <polygon points={ptsStr(MANAGER_ZONE_POINTS)} fill="url(#vO-mgrZone)" opacity="0.7"/>
      <polygon points={ptsStr(BREAK_ZONE_POINTS)} fill="url(#vO-brkZone)" opacity="0.7"/>

      {/* Low partition walls dividing zones from main floor */}
      {/* Manager partition: front edge from iso(4,0) to iso(4,2) and side from iso(4,2) to iso(6,2) */}
      <polygon
        points={ptsStr([
          isoToScreen(4, 0),
          isoToScreen(4, 2),
          { x: isoToScreen(4, 2).x, y: isoToScreen(4, 2).y - 6 },
          { x: isoToScreen(4, 0).x, y: isoToScreen(4, 0).y - 6 },
        ])}
        fill="#94a3b8" stroke="#475569" strokeWidth="0.4"
      />
      <polygon
        points={ptsStr([
          isoToScreen(4, 2),
          isoToScreen(6, 2),
          { x: isoToScreen(6, 2).x, y: isoToScreen(6, 2).y - 6 },
          { x: isoToScreen(4, 2).x, y: isoToScreen(4, 2).y - 6 },
        ])}
        fill="#a1aab9" stroke="#475569" strokeWidth="0.4"
      />
      {/* Break partition */}
      <polygon
        points={ptsStr([
          isoToScreen(0, 4),
          isoToScreen(2, 4),
          { x: isoToScreen(2, 4).x, y: isoToScreen(2, 4).y - 6 },
          { x: isoToScreen(0, 4).x, y: isoToScreen(0, 4).y - 6 },
        ])}
        fill="#a1aab9" stroke="#475569" strokeWidth="0.4"
      />
      <polygon
        points={ptsStr([
          isoToScreen(2, 4),
          isoToScreen(2, 6),
          { x: isoToScreen(2, 6).x, y: isoToScreen(2, 6).y - 6 },
          { x: isoToScreen(2, 4).x, y: isoToScreen(2, 4).y - 6 },
        ])}
        fill="#94a3b8" stroke="#475569" strokeWidth="0.4"
      />
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

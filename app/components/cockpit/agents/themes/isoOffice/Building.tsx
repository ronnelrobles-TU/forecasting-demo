'use client'

import { WALL_HEIGHT, isoToScreen, type BuildingLayout, type ScreenPoint } from './geometry'
import type { LightingState } from './lighting'

interface BuildingProps { layout: BuildingLayout; lighting?: LightingState }

// FNV-1a-style integer hash for deterministic per-window "lit" choice at night.
function windowHash(seed: number): number {
  let h = (seed * 2654435761) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const ptsStr = (pts: ReadonlyArray<ScreenPoint>) => pts.map(p => `${p.x},${p.y}`).join(' ')

const WINDOW_INSET_TOP = 13
const WINDOW_INSET_BOTTOM = 8
const WINDOW_HALF_WIDTH = 0.5  // iso units half-width per window

function makeBackWallWindow(midI: number, midJ: number, alongI: boolean, originX: number, originY: number): ScreenPoint[] {
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

// Front-wall windows: rendered as low-profile glass panels on the front (south)
// walls of the building. We extrude downward in screen y instead of upward
// because the front walls are not "behind" the floor.
const FRONT_WALL_HEIGHT = 8

function makeInteriorWall([p1, p2]: [ScreenPoint, ScreenPoint]): ScreenPoint[] {
  // Extrude 6px upward in screen y to simulate a low partition wall.
  return [
    p1,
    p2,
    { x: p2.x, y: p2.y - 6 },
    { x: p1.x, y: p1.y - 6 },
  ]
}

export function Building({ layout, lighting }: BuildingProps) {
  const { N, E, S, W } = layout.buildingCorners
  const wallTopN: ScreenPoint = { x: N.x, y: N.y - WALL_HEIGHT }
  const wallTopE: ScreenPoint = { x: E.x, y: E.y - WALL_HEIGHT }
  const wallTopW: ScreenPoint = { x: W.x, y: W.y - WALL_HEIGHT }

  const { tilesW, tilesD, windowsPerWall, origin, rooms } = layout

  // Back-wall (NE + NW) windows.
  const neWindows: ScreenPoint[][] = []
  for (let k = 0; k < windowsPerWall; k++) {
    const midI = (k + 0.5) * tilesW / windowsPerWall
    neWindows.push(makeBackWallWindow(midI, 0, true, origin.x, origin.y))
  }
  const nwWindows: ScreenPoint[][] = []
  for (let k = 0; k < windowsPerWall; k++) {
    const midJ = (k + 0.5) * tilesD / windowsPerWall
    nwWindows.push(makeBackWallWindow(0, midJ, false, origin.x, origin.y))
  }

  // Front (SE + SW) walls — low-profile, with the entrance door cut out of the
  // SW wall (the wall along i = tilesW, j varies; runs from E to S). Actually
  // the front entrance is on the south face of reception; we render the door
  // as a separate component but draw the front walls here as low silhouettes.
  // SE face: from E to S; SW face: from S to W.
  const frontTopE: ScreenPoint = { x: E.x, y: E.y - FRONT_WALL_HEIGHT }
  const frontTopS_e: ScreenPoint = { x: S.x, y: S.y - FRONT_WALL_HEIGHT }
  const frontTopS_w: ScreenPoint = { x: S.x, y: S.y - FRONT_WALL_HEIGHT }
  const frontTopW: ScreenPoint = { x: W.x, y: W.y - FRONT_WALL_HEIGHT }

  // Door cut-out positions on the SW face. Door spans iso (centerI - doorWidth/2, tilesD)
  // to iso (centerI + doorWidth/2, tilesD) along the south wall (j = tilesD).
  const door = rooms.reception
  const doorHalf = door.doorWidth / 2
  // Door is on the south wall — i.e., the wall running from S to W at j = tilesD,
  // and from E to S at i = tilesW. Reception spans i in [iMin, iMax], j = tilesD.
  // The door is centered at i = (iMin+iMax)/2 along that wall.
  const ci = (door.isoBounds.iMin + door.isoBounds.iMax) / 2
  // The wall from S(=tilesW, tilesD) to W(=0, tilesD) runs along i decreasing at j=tilesD.
  // Door endpoints in screen space:
  const doorIMin = Math.max(0, ci - doorHalf)
  const doorIMax = Math.min(tilesW, ci + doorHalf)
  const doorL = isoToScreen(doorIMax, tilesD, origin.x, origin.y)   // closer to S
  const doorR = isoToScreen(doorIMin, tilesD, origin.x, origin.y)   // closer to W

  // Interior walls — collected from each room except reception (we don't want
  // the reception walls to overlap the agent floor wall on the j=tilesD-RECEPTION_DEPTH line).
  const interiorWalls: Array<[ScreenPoint, ScreenPoint]> = []
  // Helper: include interior segments only — drop any wall that lies on the
  // perimeter (i=0, i=tilesW, j=0, j=tilesD).
  const onPerimeter = (p: ScreenPoint) => {
    // Test by inverting the iso transform: i-j = (p.x - originX) * 2 / TILE_W, i+j = (p.y - originY) * 2 / TILE_H
    // But simpler: compare against the building corners' walls.
    // We'll just test against actual screen points of perimeter.
    // (The perimeter walls are drawn separately with full WALL_HEIGHT, so
    // we don't want to double-draw them as low partitions.)
    void p
    return false
  }
  void onPerimeter

  const collectWalls = (segs: Array<[ScreenPoint, ScreenPoint]>) => {
    for (const seg of segs) interiorWalls.push(seg)
  }

  // Filter wall segments to interior-only by checking iso coordinates.
  // We compute iso(i,j) from screen by inverting; but it's faster to filter
  // by iso bounds: a segment is on the perimeter if both endpoints' iso coords
  // share a value of 0 or tilesW (for i) or 0 or tilesD (for j).
  // Since each room provides 4 wall segments (NW, NE, SE, SW edges), we can
  // filter by checking the iso bounds of each room.
  function interiorOf(b: { iMin: number; iMax: number; jMin: number; jMax: number }): Array<[ScreenPoint, ScreenPoint]> {
    const NW = isoToScreen(b.iMin, b.jMin, origin.x, origin.y)
    const NE = isoToScreen(b.iMax, b.jMin, origin.x, origin.y)
    const SE = isoToScreen(b.iMax, b.jMax, origin.x, origin.y)
    const SW = isoToScreen(b.iMin, b.jMax, origin.x, origin.y)
    const segs: Array<[ScreenPoint, ScreenPoint]> = []
    // North edge (j = jMin)
    if (b.jMin > 0) segs.push([NW, NE])
    // East edge (i = iMax)
    if (b.iMax < tilesW) segs.push([NE, SE])
    // South edge (j = jMax)
    if (b.jMax < tilesD) segs.push([SE, SW])
    // West edge (i = iMin)
    if (b.iMin > 0) segs.push([SW, NW])
    return segs
  }

  collectWalls(interiorOf(rooms.trainingRoom.isoBounds))
  collectWalls(interiorOf(rooms.breakRoom.isoBounds))
  collectWalls(interiorOf(rooms.restrooms.isoBounds))
  collectWalls(interiorOf(rooms.gym.isoBounds))
  collectWalls(interiorOf(rooms.reception.isoBounds))
  for (const office of rooms.managerOffices) {
    collectWalls(interiorOf(office.isoBounds))
  }

  return (
    <g>
      {/* Back perimeter walls (NE + NW) at full height. */}
      <polygon points={ptsStr([N, wallTopN, wallTopW, W])} fill="url(#vO-wallNW)" stroke="#64748b" strokeWidth="0.8"/>
      <polygon points={ptsStr([N, wallTopN, wallTopE, E])} fill="url(#vO-wallNE)" stroke="#64748b" strokeWidth="0.8"/>
      <line x1={N.x} y1={wallTopN.y} x2={N.x} y2={N.y} stroke="#475569" strokeWidth="1.2"/>

      {/* Back-wall windows. At night, ~30% of windows shine yellow ("someone
          working late"); the rest take the time-of-day fill. During the day
          we use the existing sky-blue gradient. */}
      {nwWindows.map((w, i) => {
        const litAtNight = lighting?.isNight && (windowHash(i * 7919 + 13) % 100) < 30
        const fill = litAtNight ? '#fbbf24' : (lighting?.windowFill ?? 'url(#vO-win)')
        const stroke = litAtNight ? '#b45309' : (lighting?.windowStroke ?? '#0c4a6e')
        return <polygon key={`nww${i}`} points={ptsStr(w)} fill={fill} stroke={stroke} strokeWidth="0.6"/>
      })}
      {neWindows.map((w, i) => {
        const litAtNight = lighting?.isNight && (windowHash(i * 7919 + 17) % 100) < 30
        const fill = litAtNight ? '#fbbf24' : (lighting?.windowFill ?? 'url(#vO-win)')
        const stroke = litAtNight ? '#b45309' : (lighting?.windowStroke ?? '#0c4a6e')
        return <polygon key={`new${i}`} points={ptsStr(w)} fill={fill} stroke={stroke} strokeWidth="0.6"/>
      })}

      {/* Floor (entire building). */}
      <polygon points={ptsStr([N, E, S, W])} fill="url(#vO-floor)" stroke="#475569" strokeWidth="1"/>

      {/* Night-time warm overlay. Subtle yellow wash that simulates overhead
          office lighting after sundown. wallWarmth ramps 0 → 0.35. */}
      {lighting && lighting.wallWarmth > 0 && (
        <polygon
          points={ptsStr([N, E, S, W])}
          fill="#fde68a"
          opacity={lighting.wallWarmth}
          pointerEvents="none"
        />
      )}

      {/* Per-room floor tints (light wash on each room). */}
      <polygon points={ptsStr(rooms.agentFloor.zonePoints)} fill="#cbd5e1" opacity="0.25"/>
      <polygon points={ptsStr(rooms.reception.zonePoints)} fill="#fef3c7" opacity="0.5"/>
      <polygon points={ptsStr(rooms.breakRoom.zonePoints)} fill="#fed7aa" opacity="0.55"/>
      <polygon points={ptsStr(rooms.trainingRoom.zonePoints)} fill="#bbf7d0" opacity="0.5"/>
      <polygon points={ptsStr(rooms.restrooms.zonePoints)} fill="#bae6fd" opacity="0.55"/>
      <polygon points={ptsStr(rooms.gym.zonePoints)} fill="#fbcfe8" opacity="0.55"/>
      {rooms.managerOffices.map((o, i) => (
        <polygon key={`mo-tint-${i}`} points={ptsStr(o.zonePoints)} fill="#e0e7ff" opacity="0.6"/>
      ))}

      {/* Interior walls (low partitions for room dividers). */}
      {interiorWalls.map((seg, i) => (
        <polygon key={`iw${i}`} points={ptsStr(makeInteriorWall(seg))} fill="#94a3b8" stroke="#475569" strokeWidth="0.4"/>
      ))}

      {/* Front perimeter walls (SE + SW) at low profile, with door cut-out on SW face. */}
      {/* SE face: E -> S */}
      <polygon points={ptsStr([E, frontTopE, frontTopS_e, S])} fill="url(#vO-frontWall)" stroke="#64748b" strokeWidth="0.6"/>
      {/* SW face: S -> doorL (skipped door) doorR -> W. Render as two segments. */}
      <polygon
        points={ptsStr([
          S, frontTopS_w,
          { x: doorL.x, y: doorL.y - FRONT_WALL_HEIGHT }, doorL,
        ])}
        fill="url(#vO-frontWall)"
        stroke="#64748b"
        strokeWidth="0.6"
      />
      <polygon
        points={ptsStr([
          doorR, { x: doorR.x, y: doorR.y - FRONT_WALL_HEIGHT },
          frontTopW, W,
        ])}
        fill="url(#vO-frontWall)"
        stroke="#64748b"
        strokeWidth="0.6"
      />
    </g>
  )
}

export function BuildingDefs() {
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
      <linearGradient id="vO-frontWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cbd5e1"/><stop offset="100%" stopColor="#94a3b8"/>
      </linearGradient>
      <linearGradient id="vO-win" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#dbeafe"/><stop offset="50%" stopColor="#7dd3fc"/><stop offset="100%" stopColor="#bae6fd"/>
      </linearGradient>
    </defs>
  )
}

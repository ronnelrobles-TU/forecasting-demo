// Static scenery for the Office HD (Pixi.js / WebGL) theme. Renders the
// building shell, floor, perimeter walls, back-wall windows, room floor
// tints, interior partition walls, and cubicle pod partitions, into a
// single Pixi.Container that is built ONCE per layout. Lighting overlay
// (sky color, wall warmth, lit windows at night) is applied separately by
// `lighting.ts` because it changes with simulation time.
//
// We keep these draw calls self-contained, no React, no effects, so the
// scene factory in `scene.ts` can hand the container off to the renderer
// and forget about it. Updates that depend on time (lighting) come back
// through dedicated update helpers, not by re-rendering scenery.
//
// Visual fidelity: this is a faithful translation of the SVG `Building.tsx`
// + room components, but simplified, manager offices, training-room
// scenery, full break-room props, restrooms and gym scenery are drawn as
// floor tints + outlines for the first cut. Detailed furniture lives in the
// SVG fallback theme. The HD theme's selling point is *agent throughput*,
// not visual maximalism.

import { Container, FillGradient, Graphics } from 'pixi.js'
import {
  WALL_HEIGHT,
  isoToScreen,
  type BuildingLayout,
  type ScreenPoint,
} from '../isoOffice/geometry'
import {
  drawGymFurniture,
  drawTrainingFurniture,
  drawBreakRoomFurniture,
  drawRestroomFurniture,
  drawManagerOfficesFurniture,
  drawReceptionFurniture,
  drawSmokingPatio,
  buildGuardSprite,
  buildManagerSprites,
} from './furniture'

const FRONT_WALL_HEIGHT = 8
const PARTITION_HEIGHT = 6
const POD_PARTITION_HEIGHT = 10

const WINDOW_INSET_TOP = 13
const WINDOW_INSET_BOTTOM = 8
const WINDOW_HALF_WIDTH = 0.5

// Floor / wall colors, match the SVG palette.
const FLOOR_TOP = 0xcbd5e1
const FLOOR_BOTTOM = 0x94a3b8
const WALL_NE_TOP = 0xf1f5f9
const WALL_NE_BOT = 0xcbd5e1
const WALL_NW_TOP = 0xe2e8f0
const WALL_NW_BOT = 0xb8c2cf
const WALL_OUTLINE = 0x64748b
const PARTITION_FILL = 0x94a3b8
const PARTITION_OUTLINE = 0x475569
const POD_PARTITION_FILL = 0xcbd5e1
const POD_PARTITION_OUTLINE = 0x64748b
const FRONT_WALL_FILL = 0xcbd5e1

// Per-room floor tint colors + alpha (matches the SVG <polygon fill>'s).
const ROOM_TINTS: Array<{ name: keyof BuildingLayout['rooms']; color: number; alpha: number } > = [
  { name: 'agentFloor',     color: 0xcbd5e1, alpha: 0.25 },
  { name: 'reception',      color: 0xfef3c7, alpha: 0.50 },
  { name: 'breakRoom',      color: 0xfed7aa, alpha: 0.55 },
  { name: 'trainingRoom',   color: 0xbbf7d0, alpha: 0.50 },
  { name: 'restrooms',      color: 0xbae6fd, alpha: 0.55 },
  { name: 'gym',            color: 0xfbcfe8, alpha: 0.55 },
]

interface PointLike { x: number; y: number }

function polyPoints(pts: ReadonlyArray<PointLike>): number[] {
  const out: number[] = []
  for (const p of pts) { out.push(p.x, p.y) }
  return out
}

function drawFilledPoly(g: Graphics, pts: ReadonlyArray<PointLike>, fill: number, alpha = 1) {
  g.poly(polyPoints(pts)).fill({ color: fill, alpha })
}

function strokePoly(g: Graphics, pts: ReadonlyArray<PointLike>, color: number, width = 0.6, alpha = 1) {
  g.poly(polyPoints(pts)).stroke({ color, width, alpha })
}

function makeBackWallWindow(
  midI: number,
  midJ: number,
  alongI: boolean,
  origin: ScreenPoint,
): ScreenPoint[] {
  if (alongI) {
    const bl = isoToScreen(midI - WINDOW_HALF_WIDTH, 0, origin.x, origin.y)
    const br = isoToScreen(midI + WINDOW_HALF_WIDTH, 0, origin.x, origin.y)
    return [
      { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
      { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
      { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
      { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
    ]
  }
  const bl = isoToScreen(0, midJ - WINDOW_HALF_WIDTH, origin.x, origin.y)
  const br = isoToScreen(0, midJ + WINDOW_HALF_WIDTH, origin.x, origin.y)
  return [
    { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
    { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
  ]
}

function makeInteriorWallPolygon(p1: ScreenPoint, p2: ScreenPoint): ScreenPoint[] {
  return [
    p1,
    p2,
    { x: p2.x, y: p2.y - PARTITION_HEIGHT },
    { x: p1.x, y: p1.y - PARTITION_HEIGHT },
  ]
}

function makePodPartitionPolygon(p1: ScreenPoint, p2: ScreenPoint): ScreenPoint[] {
  return [
    p1,
    p2,
    { x: p2.x, y: p2.y - POD_PARTITION_HEIGHT },
    { x: p1.x, y: p1.y - POD_PARTITION_HEIGHT },
  ]
}

/**
 * Result of building the static scenery layer. The `windows` graphics object
 * is returned separately so `lighting.ts` can re-tint it as the day cycles
 * (sky-blue at noon, warm orange at sunset, dim/lit at night) without
 * rebuilding the whole scenery container.
 */
export interface SceneryLayer {
  /** Root container (added once to the cameraLayer). */
  container: Container
  /** Floor polygon, solid color, used by the lighting overlay for warmth tint. */
  floor: Graphics
  /** Window polygons, re-tinted per-frame by the lighting pass. */
  windows: Graphics
  /** Number of NE-side windows; rest are NW. Lets lighting hash deterministically. */
  neWindowCount: number
  nwWindowCount: number
  /** Per-window centers (used by the lighting pass to lay down individual lit-glow circles). */
  windowCenters: Array<{ x: number; y: number }>
}

/** Build the static building shell (floor, walls, room tints, partitions). */
export function buildScenery(layout: BuildingLayout): SceneryLayer {
  const container = new Container()

  const { N, E, S, W } = layout.buildingCorners
  const wallTopN = { x: N.x, y: N.y - WALL_HEIGHT }
  const wallTopE = { x: E.x, y: E.y - WALL_HEIGHT }
  const wallTopW = { x: W.x, y: W.y - WALL_HEIGHT }

  // ── Back perimeter walls (NE + NW) at full height. HD: real linear
  // gradients via Pixi v8's FillGradient, top edge bright, bottom edge
  // shadowed. SVG version did this with a `<linearGradient>`; the original
  // HD pass faked it with an overlay triangle.
  const backWalls = new Graphics()
  // NW wall: top→bottom gradient in global coords so it lines up with the
  // wall polygon regardless of where it sits.
  const nwWallGrad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: wallTopW.y },
    end: { x: 0, y: W.y },
    colorStops: [
      { offset: 0, color: WALL_NW_TOP },
      { offset: 1, color: WALL_NW_BOT },
    ],
    textureSpace: 'global',
  })
  backWalls.poly(polyPoints([N, wallTopN, wallTopW, W])).fill(nwWallGrad)
  strokePoly(backWalls, [N, wallTopN, wallTopW, W], WALL_OUTLINE, 0.8)

  const neWallGrad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: wallTopE.y },
    end: { x: 0, y: E.y },
    colorStops: [
      { offset: 0, color: WALL_NE_TOP },
      { offset: 1, color: WALL_NE_BOT },
    ],
    textureSpace: 'global',
  })
  backWalls.poly(polyPoints([N, wallTopN, wallTopE, E])).fill(neWallGrad)
  strokePoly(backWalls, [N, wallTopN, wallTopE, E], WALL_OUTLINE, 0.8)

  // Vertical seam at N corner. Round caps for a cleaner look at this scale.
  backWalls.moveTo(N.x, wallTopN.y).lineTo(N.x, N.y)
    .stroke({ color: 0x475569, width: 1.2, cap: 'round' })
  container.addChild(backWalls)

  // ── Floor, true linear gradient from north (lighter) to south (darker).
  // Replaces the previous triangle-overlay fake.
  const floor = new Graphics()
  const floorGrad = new FillGradient({
    type: 'linear',
    start: { x: 0, y: N.y },
    end: { x: 0, y: S.y },
    colorStops: [
      { offset: 0, color: FLOOR_TOP },
      { offset: 1, color: FLOOR_BOTTOM },
    ],
    textureSpace: 'global',
  })
  floor.poly(polyPoints([N, E, S, W])).fill(floorGrad)
  strokePoly(floor, [N, E, S, W], 0x475569, 1)
  container.addChild(floor)

  // ── Per-room floor tints.
  const tints = new Graphics()
  for (const t of ROOM_TINTS) {
    const room = layout.rooms[t.name]
    if (!room) continue
    if (Array.isArray(room)) {
      // managerOffices is an array, iterate
      for (const office of room as Array<{ zonePoints: ScreenPoint[] }>) {
        drawFilledPoly(tints, office.zonePoints, t.color, t.alpha)
      }
    } else if ('zonePoints' in room) {
      drawFilledPoly(tints, room.zonePoints, t.color, t.alpha)
    }
  }
  // Manager offices use a different tint.
  for (const office of layout.rooms.managerOffices) {
    drawFilledPoly(tints, office.zonePoints, 0xe0e7ff, 0.6)
  }
  container.addChild(tints)

  // ── Interior walls (low partitions for room dividers).
  const interiorWalls = new Graphics()
  function collectInteriorOf(b: { iMin: number; iMax: number; jMin: number; jMax: number }) {
    const NWp = isoToScreen(b.iMin, b.jMin, layout.origin.x, layout.origin.y)
    const NEp = isoToScreen(b.iMax, b.jMin, layout.origin.x, layout.origin.y)
    const SEp = isoToScreen(b.iMax, b.jMax, layout.origin.x, layout.origin.y)
    const SWp = isoToScreen(b.iMin, b.jMax, layout.origin.x, layout.origin.y)
    const segs: Array<[ScreenPoint, ScreenPoint]> = []
    if (b.jMin > 0) segs.push([NWp, NEp])
    if (b.iMax < layout.tilesW) segs.push([NEp, SEp])
    if (b.jMax < layout.tilesD) segs.push([SEp, SWp])
    if (b.iMin > 0) segs.push([SWp, NWp])
    return segs
  }
  const allWalls: Array<[ScreenPoint, ScreenPoint]> = []
  allWalls.push(...collectInteriorOf(layout.rooms.trainingRoom.isoBounds))
  allWalls.push(...collectInteriorOf(layout.rooms.breakRoom.isoBounds))
  allWalls.push(...collectInteriorOf(layout.rooms.restrooms.isoBounds))
  allWalls.push(...collectInteriorOf(layout.rooms.gym.isoBounds))
  allWalls.push(...collectInteriorOf(layout.rooms.reception.isoBounds))
  for (const office of layout.rooms.managerOffices) {
    allWalls.push(...collectInteriorOf(office.isoBounds))
  }
  for (const seg of allWalls) {
    drawFilledPoly(interiorWalls, makeInteriorWallPolygon(seg[0], seg[1]), PARTITION_FILL)
    strokePoly(interiorWalls, makeInteriorWallPolygon(seg[0], seg[1]), PARTITION_OUTLINE, 0.4)
  }
  container.addChild(interiorWalls)

  // ── Pod partition walls.
  const podWalls = new Graphics()
  for (const pod of layout.rooms.agentFloor.pods) {
    for (const seg of pod.partitionWalls) {
      drawFilledPoly(podWalls, makePodPartitionPolygon(seg[0], seg[1]), POD_PARTITION_FILL, 0.85)
      strokePoly(podWalls, makePodPartitionPolygon(seg[0], seg[1]), POD_PARTITION_OUTLINE, 0.3)
    }
  }
  container.addChild(podWalls)

  // ── Front (south) walls, low silhouettes with a door cut out of SW face.
  const frontTopE = { x: E.x, y: E.y - FRONT_WALL_HEIGHT }
  const frontTopS = { x: S.x, y: S.y - FRONT_WALL_HEIGHT }
  const frontTopW = { x: W.x, y: W.y - FRONT_WALL_HEIGHT }

  const door = layout.rooms.reception
  const doorHalf = door.doorWidth / 2
  const ci = (door.isoBounds.iMin + door.isoBounds.iMax) / 2
  const doorIMin = Math.max(0, ci - doorHalf)
  const doorIMax = Math.min(layout.tilesW, ci + doorHalf)
  const doorL = isoToScreen(doorIMax, layout.tilesD, layout.origin.x, layout.origin.y)
  const doorR = isoToScreen(doorIMin, layout.tilesD, layout.origin.x, layout.origin.y)

  const frontWalls = new Graphics()
  drawFilledPoly(frontWalls, [E, frontTopE, frontTopS, S], FRONT_WALL_FILL)
  strokePoly(frontWalls, [E, frontTopE, frontTopS, S], WALL_OUTLINE, 0.6)
  drawFilledPoly(frontWalls, [
    S, frontTopS,
    { x: doorL.x, y: doorL.y - FRONT_WALL_HEIGHT }, doorL,
  ], FRONT_WALL_FILL)
  strokePoly(frontWalls, [
    S, frontTopS,
    { x: doorL.x, y: doorL.y - FRONT_WALL_HEIGHT }, doorL,
  ], WALL_OUTLINE, 0.6)
  drawFilledPoly(frontWalls, [
    doorR, { x: doorR.x, y: doorR.y - FRONT_WALL_HEIGHT },
    frontTopW, W,
  ], FRONT_WALL_FILL)
  strokePoly(frontWalls, [
    doorR, { x: doorR.x, y: doorR.y - FRONT_WALL_HEIGHT },
    frontTopW, W,
  ], WALL_OUTLINE, 0.6)
  container.addChild(frontWalls)

  // ── Windows, drawn into a dedicated graphics object the lighting pass can
  // re-tint each frame.
  const windows = new Graphics()
  const windowCenters: Array<{ x: number; y: number }> = []
  const neWindows: ScreenPoint[][] = []
  const nwWindows: ScreenPoint[][] = []
  for (let k = 0; k < layout.windowsPerWall; k++) {
    const midI = (k + 0.5) * layout.tilesW / layout.windowsPerWall
    const w = makeBackWallWindow(midI, 0, true, layout.origin)
    neWindows.push(w)
  }
  for (let k = 0; k < layout.windowsPerWall; k++) {
    const midJ = (k + 0.5) * layout.tilesD / layout.windowsPerWall
    const w = makeBackWallWindow(0, midJ, false, layout.origin)
    nwWindows.push(w)
  }
  for (const w of [...nwWindows, ...neWindows]) {
    let cx = 0, cy = 0
    for (const p of w) { cx += p.x; cy += p.y }
    windowCenters.push({ x: cx / w.length, y: cy / w.length })
  }
  drawWindowsInto(windows, neWindows, nwWindows, 0xbae6fd, 0x0c4a6e)
  container.addChild(windows)

  // ── Desks + chairs (static, empty desks visible from the start).
  const desks = new Graphics()
  for (const deskPos of layout.deskPositions) {
    drawDesk(desks, deskPos.x, deskPos.y)
    drawChair(desks, deskPos.x, deskPos.y - 7, 0.55)
  }
  container.addChild(desks)

  // ── Room furniture (Round 8: HD parity with SVG).
  // Draw into a fresh Graphics so the static furniture sits over room tints
  // and floor, but under agents (which are added in their own layer above
  // scenery). Order: gym, training, break, restrooms, manager offices,
  // reception, smoking patio. The patio extends outside the perimeter wall,
  // so we draw it last so it visually overlaps the front wall edge.
  const roomFurniture = new Graphics()
  drawGymFurniture(roomFurniture, layout)
  drawTrainingFurniture(roomFurniture, layout)
  drawBreakRoomFurniture(roomFurniture, layout)
  drawRestroomFurniture(roomFurniture, layout)
  drawManagerOfficesFurniture(roomFurniture, layout)
  drawReceptionFurniture(roomFurniture, layout)
  drawSmokingPatio(roomFurniture, layout)
  container.addChild(roomFurniture)

  // Static occupants: security guard at reception desk, manager in each office.
  // These aren't part of the simulation roster so they live in the static scene.
  container.addChild(buildGuardSprite(layout))
  container.addChild(buildManagerSprites(layout))

  return {
    container,
    floor,
    windows,
    neWindowCount: neWindows.length,
    nwWindowCount: nwWindows.length,
    windowCenters,
  }
}

/** Re-tint the windows graphics with a single fill+stroke. Cheap, Pixi
 *  reuses the underlying geometry, only the paint command list is rewritten. */
export function drawWindowsInto(
  g: Graphics,
  neWindows: ScreenPoint[][],
  nwWindows: ScreenPoint[][],
  fillColor: number,
  strokeColor: number,
): void {
  g.clear()
  for (const w of [...nwWindows, ...neWindows]) {
    g.poly(polyPoints(w)).fill({ color: fillColor }).stroke({ color: strokeColor, width: 0.6 })
  }
}

/** Repaint windows by index pattern, used by the lighting pass to glow a
 *  fraction of windows yellow at night. We accept a predicate so the renderer
 *  can hash by window index for stable patterns across frames. */
export function repaintWindows(
  layer: SceneryLayer,
  layout: BuildingLayout,
  fillColor: number,
  strokeColor: number,
  litFillColor: number,
  litStrokeColor: number,
  isLit: (index: number) => boolean,
): void {
  layer.windows.clear()
  let idx = 0
  // NW first, then NE, matches buildScenery's drawing order.
  for (let k = 0; k < layout.windowsPerWall; k++) {
    const midJ = (k + 0.5) * layout.tilesD / layout.windowsPerWall
    const w = makeBackWallWindow(0, midJ, false, layout.origin)
    const lit = isLit(idx++)
    layer.windows.poly(polyPoints(w))
      .fill({ color: lit ? litFillColor : fillColor })
      .stroke({ color: lit ? litStrokeColor : strokeColor, width: 0.6 })
  }
  for (let k = 0; k < layout.windowsPerWall; k++) {
    const midI = (k + 0.5) * layout.tilesW / layout.windowsPerWall
    const w = makeBackWallWindow(midI, 0, true, layout.origin)
    const lit = isLit(idx++)
    layer.windows.poly(polyPoints(w))
      .fill({ color: lit ? litFillColor : fillColor })
      .stroke({ color: lit ? litStrokeColor : strokeColor, width: 0.6 })
  }
}

// ── Desk + chair primitives (translated from AgentFloor.tsx) ──────────────

function drawDesk(g: Graphics, x: number, y: number) {
  // Top
  g.poly([
    x +  0, y - 3,
    x + 12, y + 4,
    x +  0, y + 11,
    x - 12, y + 4,
  ]).fill({ color: 0x64748b }).stroke({ color: 0x1e293b, width: 0.5 })
  // Side panels
  g.poly([
    x - 12, y + 4,
    x - 12, y + 7,
    x +  0, y + 14,
    x +  0, y + 11,
  ]).fill({ color: 0x475569 })
  g.poly([
    x + 12, y + 4,
    x + 12, y + 7,
    x +  0, y + 14,
    x +  0, y + 11,
  ]).fill({ color: 0x334155 })
  // Monitor
  g.rect(x - 2.5, y, 5, 3.2).fill({ color: 0x0f172a }).stroke({ color: 0x1e293b, width: 0.3 })
  // Stand
  g.poly([
    x - 3, y + 3.2,
    x + 3, y + 3.2,
    x + 1.5, y + 4.5,
    x - 1.5, y + 4.5,
  ]).fill({ color: 0x475569 })
  // Keyboard
  g.rect(x - 6, y + 2.5, 2.2, 1.8).fill({ color: 0xcbd5e1 })
}

function drawChair(g: Graphics, x: number, y: number, alpha = 1) {
  g.poly([
    x - 5, y + 2,
    x + 5, y + 2,
    x + 4, y + 5,
    x - 4, y + 5,
  ]).fill({ color: 0x1e293b, alpha })
  g.rect(x - 4.5, y - 3, 9, 5).fill({ color: 0x334155, alpha }).stroke({ color: 0x1e293b, width: 0.3, alpha })
  g.rect(x - 4, y - 4.5, 8, 1.5).fill({ color: 0x475569, alpha })
}

// Iso office layout. Floor + walls + zones + windows all derive from agentCount
// via computeOfficeLayout(agentCount). The SVG viewBox grows with the floor so
// every agent stays at full sprite/desk/chair/bubble detail; high counts produce
// a "zoomed out" appearance via xMidYMid meet aspect-ratio scaling.
//
// iso(i,j): i increases toward the NE (right) wall; j increases toward the NW (left) wall.
// Screen mapping (relative to a per-render origin):
//   iso(i,j) -> (originX + (i-j)*TILE_W/2, originY + (i+j)*TILE_H/2)

export interface ScreenPoint { x: number; y: number }

export const TILE_W = 33.33   // pixel width of one iso tile
export const TILE_H = 16.67   // pixel height of one iso tile
export const WALL_HEIGHT = 50

const PADDING = 24
const ZONE_TILES = 2          // manager + break corners are each 2x2 iso tiles

export function isoToScreen(i: number, j: number, originX: number, originY: number): ScreenPoint {
  return {
    x: originX + (i - j) * (TILE_W / 2),
    y: originY + (i + j) * (TILE_H / 2),
  }
}

export interface OfficeLayout {
  // Iso dimensions (square floor)
  tilesW: number
  tilesD: number
  // SVG viewBox sized to fit floor + walls + padding
  viewBox: { w: number; h: number }
  // Floor origin (N corner) in screen space
  origin: ScreenPoint
  // Floor diamond corners in screen space
  floorCorners: { N: ScreenPoint; E: ScreenPoint; S: ScreenPoint; W: ScreenPoint }
  // Number of windows distributed along each back wall
  windowsPerWall: number
  // Manager corner (back-right): zone iso bounds + decoration positions
  manager: {
    zonePoints: ScreenPoint[]                          // 4-point parallelogram on the floor
    deskPosition: ScreenPoint
    plantPosition: ScreenPoint
    partitionEdges: Array<[ScreenPoint, ScreenPoint]>  // pairs of iso-screen pts where low partitions sit
  }
  // Break room (front-left)
  breakRoom: {
    zonePoints: ScreenPoint[]
    tableCenter: ScreenPoint
    waterCoolerPosition: ScreenPoint
    seatPositions: ScreenPoint[]                       // dynamically sized to fit ~25% of agentCount, min 8
    partitionEdges: Array<[ScreenPoint, ScreenPoint]>
  }
  // Agent floor: one home-desk position per agent
  deskPositions: ScreenPoint[]
}

/**
 * Compute the full iso office layout for a given agent count.
 *
 * Pick the smallest square floor whose agent zone fits agentCount at 1.0 desk
 * spacing. Agent zone capacity at floor size N ≈ (N-2)² - 2 * ZONE_TILES².
 * Solve (N-2)² - 8 >= agentCount → N >= 2 + sqrt(agentCount + 8). All positions
 * (manager corner back-right, break corner front-left, walls, windows, etc.)
 * derive from this floor size and the chosen origin.
 */
export function computeOfficeLayout(agentCount: number): OfficeLayout {
  const minFloor = Math.max(6, Math.ceil(2 + Math.sqrt(agentCount + 8)))
  const tilesW = minFloor
  const tilesD = minFloor

  // Floor diamond width = (tilesW + tilesD) * TILE_W / 2 = tilesW * TILE_W (since W==D)
  const floorWidth = tilesW * TILE_W
  const floorHeight = tilesW * TILE_H

  const viewBoxW = floorWidth + PADDING * 2
  const viewBoxH = floorHeight + WALL_HEIGHT + PADDING * 2

  const originX = viewBoxW / 2          // N corner is centered horizontally
  const originY = WALL_HEIGHT + PADDING // N corner is below the wall top

  const origin: ScreenPoint = { x: originX, y: originY }

  // Floor corners
  const N = isoToScreen(0, 0, originX, originY)
  const E = isoToScreen(tilesW, 0, originX, originY)
  const S = isoToScreen(tilesW, tilesD, originX, originY)
  const W = isoToScreen(0, tilesD, originX, originY)

  // Distribute roughly 1 window per 2 iso tiles along each back wall.
  const windowsPerWall = Math.max(3, Math.floor(tilesW / 2))

  // Manager corner: iso (tilesW-ZONE_TILES, 0) to (tilesW, ZONE_TILES)
  const mgrI = tilesW - ZONE_TILES
  const mgrZonePoints = [
    isoToScreen(mgrI, 0, originX, originY),
    isoToScreen(tilesW, 0, originX, originY),
    isoToScreen(tilesW, ZONE_TILES, originX, originY),
    isoToScreen(mgrI, ZONE_TILES, originX, originY),
  ]
  const managerDesk = isoToScreen(tilesW - 1, 1, originX, originY)
  const plantPosition = isoToScreen(tilesW - 0.4, 0.4, originX, originY)
  const mgrPartitionEdges: Array<[ScreenPoint, ScreenPoint]> = [
    [isoToScreen(mgrI, 0, originX, originY), isoToScreen(mgrI, ZONE_TILES, originX, originY)],
    [isoToScreen(mgrI, ZONE_TILES, originX, originY), isoToScreen(tilesW, ZONE_TILES, originX, originY)],
  ]

  // Break corner: iso (0, tilesD-ZONE_TILES) to (ZONE_TILES, tilesD)
  const brkJ = tilesD - ZONE_TILES
  const brkZonePoints = [
    isoToScreen(0, brkJ, originX, originY),
    isoToScreen(ZONE_TILES, brkJ, originX, originY),
    isoToScreen(ZONE_TILES, tilesD, originX, originY),
    isoToScreen(0, tilesD, originX, originY),
  ]
  const breakTable = isoToScreen(1, tilesD - 1, originX, originY)
  const waterCooler = isoToScreen(0.3, brkJ, originX, originY)
  const brkPartitionEdges: Array<[ScreenPoint, ScreenPoint]> = [
    [isoToScreen(0, brkJ, originX, originY), isoToScreen(ZONE_TILES, brkJ, originX, originY)],
    [isoToScreen(ZONE_TILES, brkJ, originX, originY), isoToScreen(ZONE_TILES, tilesD, originX, originY)],
  ]

  // Break seats: sized for ~25% of agents, min 8
  const maxBreakAgents = Math.max(8, Math.ceil(agentCount * 0.25))
  const seatPositions = computeBreakSeats(maxBreakAgents, breakTable, brkJ, tilesD, originX, originY)

  // Desk positions in agent zone (iso 1..tilesW-1, 1..tilesD-1) excluding manager + break corners
  const deskPositions = computeDesks(agentCount, tilesW, tilesD, originX, originY, mgrI, brkJ)

  return {
    tilesW,
    tilesD,
    viewBox: { w: viewBoxW, h: viewBoxH },
    origin,
    floorCorners: { N, E, S, W },
    windowsPerWall,
    manager: {
      zonePoints: mgrZonePoints,
      deskPosition: managerDesk,
      plantPosition,
      partitionEdges: mgrPartitionEdges,
    },
    breakRoom: {
      zonePoints: brkZonePoints,
      tableCenter: breakTable,
      waterCoolerPosition: waterCooler,
      seatPositions,
      partitionEdges: brkPartitionEdges,
    },
    deskPositions,
  }
}

function computeDesks(
  agentCount: number,
  tilesW: number,
  tilesD: number,
  originX: number,
  originY: number,
  mgrI: number,
  brkJ: number,
): ScreenPoint[] {
  const positions: ScreenPoint[] = []
  // Iso (1, 1) to (tilesW-1, tilesD-1) excluding manager + break corners.
  // 1.0 spacing for desks; back-to-front by i+j for SVG depth ordering.
  const candidates: Array<{ i: number; j: number }> = []
  for (let i = 1; i <= tilesW - 1; i++) {
    for (let j = 1; j <= tilesD - 1; j++) {
      // Skip manager corner: i >= mgrI && j < ZONE_TILES
      if (i >= mgrI && j < ZONE_TILES) continue
      // Skip break corner: i < ZONE_TILES && j >= brkJ
      if (i < ZONE_TILES && j >= brkJ) continue
      candidates.push({ i, j })
    }
  }
  candidates.sort((a, b) => (a.i + a.j) - (b.i + b.j))
  for (const c of candidates.slice(0, agentCount)) {
    positions.push(isoToScreen(c.i, c.j, originX, originY))
  }
  return positions
}

function computeBreakSeats(
  maxBreakAgents: number,
  tableCenter: ScreenPoint,
  brkJ: number,
  tilesD: number,
  originX: number,
  originY: number,
): ScreenPoint[] {
  const seats: ScreenPoint[] = []

  // Ring of 8 around the table
  const RING_RX = 18
  const RING_RY = 9
  const RING_COUNT = 8
  for (let k = 0; k < RING_COUNT; k++) {
    const angle = (k / RING_COUNT) * 2 * Math.PI
    seats.push({
      x: tableCenter.x + Math.cos(angle) * RING_RX,
      y: tableCenter.y + Math.sin(angle) * RING_RY,
    })
  }

  // Additional grid seats in the break room zone if more capacity is needed.
  // Step 0.2 gives ~80 candidate slots in a 2x2 iso break zone, comfortably
  // accommodating ~50 break-room agents (25% of 200).
  if (maxBreakAgents > RING_COUNT) {
    const candidates: Array<{ i: number; j: number }> = []
    for (let i = 0.2; i <= 1.8 + 1e-9; i += 0.2) {
      for (let j = brkJ + 0.2; j <= tilesD - 0.2 + 1e-9; j += 0.2) {
        // Skip a small exclusion radius around the table center (iso (1, tilesD-1))
        const di = i - 1
        const dj = j - (tilesD - 1)
        if (di * di + dj * dj < 0.16) continue   // 0.4 iso-unit exclusion
        candidates.push({ i, j })
      }
    }
    candidates.sort((a, b) => (a.i + a.j) - (b.i + b.j))
    for (const c of candidates) {
      seats.push(isoToScreen(c.i, c.j, originX, originY))
      if (seats.length >= maxBreakAgents) break
    }
  }
  return seats
}

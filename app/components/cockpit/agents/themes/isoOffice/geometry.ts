// Iso office layout. All coordinates target a 500x280 SVG viewBox.
// iso(i,j): i increases toward the NE (right) wall; j increases toward the NW (left) wall.
// Screen mapping: iso(i,j) -> (FLOOR_ORIGIN.x + (i-j)*TILE_W/2, FLOOR_ORIGIN.y + (i+j)*TILE_H/2)

export interface ScreenPoint { x: number; y: number }

export const TILE_W = 33.33  // pixel width of one iso tile (200px / 6 tiles wide)
export const TILE_H = 16.67  // pixel height of one iso tile (100px / 6 tiles deep)
export const FLOOR_ORIGIN: ScreenPoint = { x: 250, y: 50 }
export const VIEWBOX = { w: 500, h: 280 } as const

export const FLOOR_TILES_W = 6
export const FLOOR_TILES_D = 6
export const WALL_HEIGHT = 50

export function isoToScreen(i: number, j: number): ScreenPoint {
  return {
    x: FLOOR_ORIGIN.x + (i - j) * (TILE_W / 2),
    y: FLOOR_ORIGIN.y + (i + j) * (TILE_H / 2),
  }
}

export interface DeskLayout {
  positions: ScreenPoint[]      // one per agent, generated to fit agentCount
  tileSpacing: number            // 1.0 / 0.5 / 0.25
  spriteScale: number            // same as tileSpacing
  tier: 1 | 2 | 3                // LOD tier
}

/**
 * Compute a packed iso desk grid sized to the requested agent count.
 *
 * The agent-floor zone is iso (1..5, 1..5) — a 4x4 region between the manager
 * corner (i>=4 && j<=2) and break room (i<=2 && j>=4). To fit more agents we
 * densify by halving the tile spacing.
 *
 * Tiers (drives downstream LOD in Desks.tsx):
 *   - tier 1: 1..16 agents,  spacing 1.0  (4x4 = 16 slots minus diagonal corners)
 *   - tier 2: 17..64,        spacing 0.5
 *   - tier 3: 65+,           spacing 0.25
 *
 * Positions are sorted back-to-front (i+j ascending) for SVG depth order.
 */
export function computeDeskLayout(agentCount: number): DeskLayout {
  let tileSpacing: number
  let tier: 1 | 2 | 3
  if (agentCount <= 16) {
    tileSpacing = 1.0
    tier = 1
  } else if (agentCount <= 64) {
    tileSpacing = 0.5
    tier = 2
  } else {
    tileSpacing = 0.25
    tier = 3
  }

  const minI = 1
  const maxI = 5
  const minJ = 1
  const maxJ = 5
  const candidates: Array<{ i: number; j: number }> = []
  for (let i = minI; i <= maxI - tileSpacing / 2; i += tileSpacing) {
    for (let j = minJ; j <= maxJ - tileSpacing / 2; j += tileSpacing) {
      // Skip positions that overlap the manager corner or break room.
      if (i >= 4 && j <= 2) continue
      if (i <= 2 && j >= 4) continue
      candidates.push({ i, j })
    }
  }
  candidates.sort((a, b) => (a.i + a.j) - (b.i + b.j))
  const taken = candidates.slice(0, Math.min(agentCount, candidates.length))
  const positions: ScreenPoint[] = taken.map(c => isoToScreen(c.i, c.j))

  return { positions, tileSpacing, spriteScale: tileSpacing, tier }
}

// Floor diamond corner screen points (for floor polygon and zone tints)
export const FLOOR_CORNERS = {
  N: isoToScreen(0, 0),
  E: isoToScreen(FLOOR_TILES_W, 0),
  S: isoToScreen(FLOOR_TILES_W, FLOOR_TILES_D),
  W: isoToScreen(0, FLOOR_TILES_D),
} as const

// Manager at iso(5, 1) — back-right corner
export const MANAGER_ISO = { i: 5, j: 1 }
export const MANAGER_POSITION = isoToScreen(MANAGER_ISO.i, MANAGER_ISO.j)

// Plant next to manager
export const PLANT_POSITION = isoToScreen(5.6, 0.4)

// Break room: round table at iso(1, 5), 8 seats around it
export const BREAK_TABLE_POSITION = isoToScreen(1, 5)
export const WATER_COOLER_POSITION = isoToScreen(0.3, 4)

// 8 seats around the break table at iso(1, 5).
// Seats arranged in a ring; seat positions are screen offsets in pixels from the table center.
const BREAK_TABLE_RADIUS_X = 18
const BREAK_TABLE_RADIUS_Y = 9
const SEAT_COUNT = 8
export const BREAK_SEAT_POSITIONS: ScreenPoint[] = Array.from({ length: SEAT_COUNT }, (_, k) => {
  const angle = (k / SEAT_COUNT) * 2 * Math.PI
  return {
    x: BREAK_TABLE_POSITION.x + Math.cos(angle) * BREAK_TABLE_RADIUS_X,
    y: BREAK_TABLE_POSITION.y + Math.sin(angle) * BREAK_TABLE_RADIUS_Y,
  }
})

/**
 * Compute break-room seat positions sized to the requested max-on-break count.
 *
 * Always includes the original 8-seat ring around the break table at iso(1, 5).
 * If more seats are needed, fills the remainder of the break-room zone
 * (iso 0..2, 4..6) with a packed grid (step 0.4 iso units), skipping a small
 * exclusion radius around the table center. Candidates are sorted back-to-front
 * (i+j ascending) for SVG depth ordering.
 *
 * Used by BreakRoom.tsx to render seated agents and by Desks.tsx walk-lerp
 * targets so transition animations land on the correct seat slot.
 */
export function computeBreakSeatPositions(maxBreakAgents: number): ScreenPoint[] {
  const tableCenter = BREAK_TABLE_POSITION
  const seats: ScreenPoint[] = []

  // Ring 1 (existing): 8 seats around the table
  const RING1_RX = 18
  const RING1_RY = 9
  const RING1_COUNT = 8
  for (let k = 0; k < RING1_COUNT; k++) {
    const angle = (k / RING1_COUNT) * 2 * Math.PI
    seats.push({
      x: tableCenter.x + Math.cos(angle) * RING1_RX,
      y: tableCenter.y + Math.sin(angle) * RING1_RY,
    })
  }

  // If we need more seats, fill the rest of the break-room zone in a packed grid.
  // Break zone: iso (0..2, 4..6). Skip the table area (around iso(1, 5)).
  if (maxBreakAgents > RING1_COUNT) {
    const candidates: Array<{ i: number; j: number }> = []
    for (let i = 0.2; i <= 2.0; i += 0.4) {
      for (let j = 4.0; j <= 6.0; j += 0.4) {
        // Skip positions too close to the table center (iso 1, 5)
        const di = i - 1
        const dj = j - 5
        if (di * di + dj * dj < 0.36) continue   // 0.6 iso-unit radius around table
        candidates.push({ i, j })
      }
    }
    // Sort by depth (i+j ascending) for back-to-front order
    candidates.sort((a, b) => (a.i + a.j) - (b.i + b.j))
    for (const c of candidates) {
      seats.push(isoToScreen(c.i, c.j))
      if (seats.length >= maxBreakAgents) break
    }
  }

  return seats
}

// Zone polygons (for floor-tint rendering)
export const MANAGER_ZONE_POINTS = [
  isoToScreen(4, 0),
  isoToScreen(6, 0),
  isoToScreen(6, 2),
  isoToScreen(4, 2),
] as const

export const BREAK_ZONE_POINTS = [
  isoToScreen(0, 4),
  isoToScreen(2, 4),
  isoToScreen(2, 6),
  isoToScreen(0, 6),
] as const

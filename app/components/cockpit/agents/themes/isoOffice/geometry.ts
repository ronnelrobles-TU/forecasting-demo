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

export const MAX_AGENTS_OFFICE = 6

export function isoToScreen(i: number, j: number): ScreenPoint {
  return {
    x: FLOOR_ORIGIN.x + (i - j) * (TILE_W / 2),
    y: FLOOR_ORIGIN.y + (i + j) * (TILE_H / 2),
  }
}

// Floor diamond corner screen points (for floor polygon and zone tints)
export const FLOOR_CORNERS = {
  N: isoToScreen(0, 0),
  E: isoToScreen(FLOOR_TILES_W, 0),
  S: isoToScreen(FLOOR_TILES_W, FLOOR_TILES_D),
  W: isoToScreen(0, FLOOR_TILES_D),
} as const

// 6 main agent desks: 2 rows x 3 columns, diagonal grid
export const DESK_ISO_POSITIONS: Array<{ i: number; j: number }> = [
  { i: 1.5, j: 1.5 },
  { i: 2.5, j: 1.5 },
  { i: 3.5, j: 1.5 },
  { i: 1.5, j: 3.0 },
  { i: 2.5, j: 3.0 },
  { i: 3.5, j: 3.0 },
]

export const DESK_POSITIONS: ScreenPoint[] = DESK_ISO_POSITIONS.map(p => isoToScreen(p.i, p.j))

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

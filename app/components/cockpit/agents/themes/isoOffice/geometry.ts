// Iso building layout. Defines a multi-room call-center floor plan: perimeter
// walls all around, reception (front), agent floor (center) of cubicle pods,
// 4-5 manager mini-offices (NE side), training room, break room, restrooms,
// and a small gym (NW side). All positions derive from computeBuildingLayout
// (agentCount).
//
// iso(i,j): i increases toward the NE (right) wall; j increases toward the NW
// (left) wall. Screen mapping (relative to a per-render origin):
//   iso(i,j) -> (originX + (i-j)*TILE_W/2, originY + (i+j)*TILE_H/2)

export interface ScreenPoint { x: number; y: number }

export const TILE_W = 33.33   // pixel width of one iso tile
export const TILE_H = 16.67   // pixel height of one iso tile
export const WALL_HEIGHT = 50

const PADDING = 32

export function isoToScreen(i: number, j: number, originX: number, originY: number): ScreenPoint {
  return {
    x: originX + (i - j) * (TILE_W / 2),
    y: originY + (i + j) * (TILE_H / 2),
  }
}

// ---------- Layout types ----------

export interface IsoBounds { iMin: number; iMax: number; jMin: number; jMax: number }

export interface RoomBounds {
  isoBounds: IsoBounds
  zonePoints: ScreenPoint[]                              // 4-pt floor polygon (for tinting)
  wallSegments: Array<[ScreenPoint, ScreenPoint]>        // interior walls (excluding building perimeter)
}

export interface CubiclePod {
  centerIso: { i: number; j: number }
  desks: ScreenPoint[]                                   // 4 positions (front-left, front-right, back-right, back-left)
  partitionWalls: Array<[ScreenPoint, ScreenPoint]>      // outer perimeter of the pod (4 segments)
}

export interface ReceptionRoom extends RoomBounds {
  doorPosition: ScreenPoint                              // visible door on the south (front) wall
  doorWidth: number                                      // width of the double-door opening, in iso units along the wall
  securityDeskPosition: ScreenPoint
  guardPosition: ScreenPoint
}

export interface ManagerOffice extends RoomBounds {
  deskPosition: ScreenPoint
  managerPosition: ScreenPoint
  doorPosition: ScreenPoint                              // door on west wall of office (opens into agent floor)
  whiteboardPosition: ScreenPoint
}

export interface BreakRoomLayout extends RoomBounds {
  tableCenter: ScreenPoint
  waterCoolerPosition: ScreenPoint
  vendingMachinePosition: ScreenPoint
  seatPositions: ScreenPoint[]
  // Cluster of standing positions near the water cooler for the
  // at_water_cooler activity (informal hangouts).
  waterCoolerCluster: ScreenPoint[]
}

export interface TrainingRoomLayout extends RoomBounds {
  whiteboardPosition: ScreenPoint
  studentSeats: ScreenPoint[]
}

export interface RestroomsLayout extends RoomBounds {
  doorPositions: ScreenPoint[]                           // 2 doors (M, F)
}

export interface GymLayout extends RoomBounds {
  treadmillPosition: ScreenPoint
  weightsPosition: ScreenPoint
}

export interface AgentFloorLayout extends RoomBounds {
  pods: CubiclePod[]
  // Pairs of nearby points where idle agents can stand chatting in the aisles
  // between pods. Each pair is two points 8px apart (one for each chatter).
  chattingHotspots: Array<[ScreenPoint, ScreenPoint]>
  // Slow loop of waypoints for the janitor NPC (perimeter of the agent floor).
  janitorPath: ScreenPoint[]
}

export interface BuildingLayout {
  tilesW: number
  tilesD: number
  viewBox: { w: number; h: number }
  origin: ScreenPoint                                    // N corner of building
  buildingCorners: { N: ScreenPoint; E: ScreenPoint; S: ScreenPoint; W: ScreenPoint }
  windowsPerWall: number

  rooms: {
    reception: ReceptionRoom
    agentFloor: AgentFloorLayout
    managerOffices: ManagerOffice[]
    breakRoom: BreakRoomLayout
    trainingRoom: TrainingRoomLayout
    restrooms: RestroomsLayout
    gym: GymLayout
  }

  // Flat array of every desk position in the agent floor, in stable
  // back-to-front order (sorted by i+j). agents[i] -> deskPositions[i].
  deskPositions: ScreenPoint[]
}

// ---------- Layout computation ----------

// Pod geometry: a 2x2 cluster of desks. Desk spacing within a pod is 0.7 iso
// tiles. Pods are placed on a 2x2 iso-tile grid (so the gap between pods is
// 1.3 iso tiles, leaving a clear walking aisle).
const POD_DESK_SPACING = 0.7
const POD_SPACING_I = 2     // iso tiles between pod centers along i
const POD_SPACING_J = 2     // iso tiles between pod centers along j

// Building footprint constants. Agent floor and manager-office strip grow
// based on agent count; the rest of the rooms are fixed-size (reception,
// training, break, restrooms, gym).
const TRAINING_BOUNDS: IsoBounds = { iMin: 0, iMax: 10, jMin: 0, jMax: 6 }
const BREAK_BOUNDS:    IsoBounds = { iMin: 0, iMax: 10, jMin: 6, jMax: 12 }
const RESTROOM_BOUNDS: IsoBounds = { iMin: 0, iMax: 6, jMin: 12, jMax: 16 }
const GYM_BOUNDS:      IsoBounds = { iMin: 0, iMax: 6, jMin: 16, jMax: 20 }
// Reception runs across the front (south) edge with a fixed depth of 4 iso tiles.
const RECEPTION_DEPTH = 4
// Agent-floor bounds:
//   iMin = 10 (east of NW rooms), iMax = depends on building width
//   jMin = 6  (south of training), jMax = building depth - reception depth
const AGENT_FLOOR_I_MIN = 10
const AGENT_FLOOR_J_MIN = 6
// Manager office strip width (along i): 6 iso tiles for each office.
const MANAGER_OFFICE_WIDTH = 6
// Building must be at least this deep to fit the NW rooms + reception.
const MIN_BUILDING_DEPTH = 20 + RECEPTION_DEPTH    // = 24

/**
 * Compute the full building layout for a given agent count.
 *
 * The number of cubicle pods (and hence the agent-floor footprint) scales with
 * agentCount; the number of manager mini-offices scales as max(2, ceil(N/35)).
 * Every other room is a fixed footprint. The building's overall iso width and
 * depth are sized so all rooms fit without overlap.
 */
export function computeBuildingLayout(agentCount: number): BuildingLayout {
  // 1. Decide how many pods we need (4 desks/pod, never less than 1 pod).
  const podCount = Math.max(1, Math.ceil(agentCount / 4))

  // 2. Decide manager office count (one per ~35 agents, min 2, max 6).
  const managerCount = Math.max(2, Math.min(6, Math.ceil(agentCount / 35)))

  // 3. Decide agent-floor pod grid. Use roughly square aspect (cols ~ rows).
  const podCols = Math.max(1, Math.ceil(Math.sqrt(podCount)))
  const podRows = Math.max(1, Math.ceil(podCount / podCols))

  // 4. Each pod takes POD_SPACING_I × POD_SPACING_J iso tiles. Plus a half-pod
  //    margin on every side of the agent floor for hallway space.
  const agentFloorIsoW = podCols * POD_SPACING_I + 2     // 1-tile margin each side
  const agentFloorIsoD = podRows * POD_SPACING_J + 2

  // 5. Manager strip depth: each office is (managerStripDepth / managerCount)
  //    iso tiles deep. Minimum 3 deep per office.
  const managerStripDepth = Math.max(managerCount * 4, agentFloorIsoD)

  // 6. Building footprint:
  //    Width tilesW = max(agent-floor + manager strip, training/break width = 10)
  //    Depth tilesD = max(MIN_BUILDING_DEPTH, NW rooms + agent floor + reception)
  const tilesW = AGENT_FLOOR_I_MIN + agentFloorIsoW + MANAGER_OFFICE_WIDTH
  const tilesD = Math.max(
    MIN_BUILDING_DEPTH,
    AGENT_FLOOR_J_MIN + Math.max(agentFloorIsoD, managerStripDepth) + RECEPTION_DEPTH,
  )

  // 7. Compute viewBox + origin (N corner centered horizontally).
  const buildingScreenW = (tilesW + tilesD) * (TILE_W / 2)
  const buildingScreenH = (tilesW + tilesD) * (TILE_H / 2)
  const viewBoxW = buildingScreenW + PADDING * 2
  const viewBoxH = buildingScreenH + WALL_HEIGHT + PADDING * 2
  // N corner sits at the top of the diamond. Center horizontally.
  // Diamond ranges from x = origin.x - tilesD * TILE_W/2 (W corner)
  // to x = origin.x + tilesW * TILE_W/2 (E corner).
  const originX = PADDING + tilesD * (TILE_W / 2)
  const originY = WALL_HEIGHT + PADDING

  const origin: ScreenPoint = { x: originX, y: originY }

  // 8. Building corners.
  const N = isoToScreen(0, 0, originX, originY)
  const E = isoToScreen(tilesW, 0, originX, originY)
  const S = isoToScreen(tilesW, tilesD, originX, originY)
  const W = isoToScreen(0, tilesD, originX, originY)

  // 9. Build each room.
  const trainingRoom = makeTrainingRoom(originX, originY)
  const breakRoom = makeBreakRoom(agentCount, originX, originY)
  const restrooms = makeRestrooms(originX, originY)
  const gym = makeGym(originX, originY)

  // Reception: spans front edge between manager strip and west wall.
  const receptionBounds: IsoBounds = {
    iMin: 0,
    iMax: tilesW,
    jMin: tilesD - RECEPTION_DEPTH,
    jMax: tilesD,
  }
  const reception = makeReception(receptionBounds, originX, originY)

  // Manager offices: along the east edge, j 0..managerStripDepth (capped to tilesD - RECEPTION_DEPTH).
  const mgrJMax = Math.min(managerStripDepth, tilesD - RECEPTION_DEPTH)
  const managerOffices = makeManagerOffices(
    managerCount,
    {
      iMin: tilesW - MANAGER_OFFICE_WIDTH,
      iMax: tilesW,
      jMin: 0,
      jMax: mgrJMax,
    },
    originX,
    originY,
  )

  // Agent floor.
  const agentFloorBounds: IsoBounds = {
    iMin: AGENT_FLOOR_I_MIN,
    iMax: tilesW - MANAGER_OFFICE_WIDTH,
    jMin: AGENT_FLOOR_J_MIN,
    jMax: tilesD - RECEPTION_DEPTH,
  }
  const agentFloor = makeAgentFloor(podCount, podCols, podRows, agentFloorBounds, originX, originY)

  // Distribute windows along the back walls (NE + NW). One window per ~3 iso tiles.
  const windowsPerWall = Math.max(3, Math.floor(Math.max(tilesW, tilesD) / 3))

  return {
    tilesW,
    tilesD,
    viewBox: { w: viewBoxW, h: viewBoxH },
    origin,
    buildingCorners: { N, E, S, W },
    windowsPerWall,
    rooms: {
      reception,
      agentFloor,
      managerOffices,
      breakRoom,
      trainingRoom,
      restrooms,
      gym,
    },
    deskPositions: agentFloor.pods.flatMap(p => p.desks).slice(0, agentCount),
  }
}

// ---------- Helpers ----------

function isoRect(b: IsoBounds, originX: number, originY: number): ScreenPoint[] {
  return [
    isoToScreen(b.iMin, b.jMin, originX, originY),
    isoToScreen(b.iMax, b.jMin, originX, originY),
    isoToScreen(b.iMax, b.jMax, originX, originY),
    isoToScreen(b.iMin, b.jMax, originX, originY),
  ]
}

function rectWalls(b: IsoBounds, originX: number, originY: number): Array<[ScreenPoint, ScreenPoint]> {
  const NW = isoToScreen(b.iMin, b.jMin, originX, originY)
  const NE = isoToScreen(b.iMax, b.jMin, originX, originY)
  const SE = isoToScreen(b.iMax, b.jMax, originX, originY)
  const SW = isoToScreen(b.iMin, b.jMax, originX, originY)
  return [
    [NW, NE],
    [NE, SE],
    [SE, SW],
    [SW, NW],
  ]
}

// ---------- Room builders ----------

function makeAgentFloor(
  podCount: number,
  podCols: number,
  podRows: number,
  bounds: IsoBounds,
  originX: number,
  originY: number,
): AgentFloorLayout {
  const pods: CubiclePod[] = []
  // Margin: 1 iso tile from each side of the agent-floor bounds.
  const i0 = bounds.iMin + 1
  const j0 = bounds.jMin + 1
  let placed = 0
  for (let r = 0; r < podRows; r++) {
    for (let c = 0; c < podCols; c++) {
      if (placed >= podCount) break
      const ci = i0 + c * POD_SPACING_I + POD_SPACING_I / 2
      const cj = j0 + r * POD_SPACING_J + POD_SPACING_J / 2
      pods.push(makePod(ci, cj, originX, originY))
      placed++
    }
  }
  // Sort pod desks back-to-front (low i+j first) for stable agent assignment.
  // Keep pod ordering as-is, but note: pods.flatMap(desks) will already be
  // back-to-front because the loop visits pods in row-major order with rows
  // stepping front-ward (j increases) and cols left-to-right.

  // Chatting hotspots: pairs of points in the aisles BETWEEN adjacent pod
  // columns (along the i-axis). Each pair is two standing positions ~8px apart
  // in screen space, suitable for two agents standing facing each other.
  const chattingHotspots: Array<[ScreenPoint, ScreenPoint]> = []
  for (let r = 0; r < podRows; r++) {
    for (let c = 0; c < podCols - 1; c++) {
      // Aisle midpoint between pod (r,c) and pod (r,c+1) along i.
      const aisleI = i0 + c * POD_SPACING_I + POD_SPACING_I  // i = boundary between cols
      const aisleJ = j0 + r * POD_SPACING_J + POD_SPACING_J / 2
      const center = isoToScreen(aisleI, aisleJ, originX, originY)
      chattingHotspots.push([
        { x: center.x - 4, y: center.y },
        { x: center.x + 4, y: center.y },
      ])
    }
  }

  // Janitor path: perimeter loop around the agent floor (8 waypoints).
  const pad = 0.5
  const inset = (i: number, j: number) => isoToScreen(i, j, originX, originY)
  const janitorPath: ScreenPoint[] = [
    inset(bounds.iMin + pad, bounds.jMin + pad),                         // NW
    inset((bounds.iMin + bounds.iMax) / 2, bounds.jMin + pad),           // N
    inset(bounds.iMax - pad, bounds.jMin + pad),                         // NE
    inset(bounds.iMax - pad, (bounds.jMin + bounds.jMax) / 2),           // E
    inset(bounds.iMax - pad, bounds.jMax - pad),                         // SE
    inset((bounds.iMin + bounds.iMax) / 2, bounds.jMax - pad),           // S
    inset(bounds.iMin + pad, bounds.jMax - pad),                         // SW
    inset(bounds.iMin + pad, (bounds.jMin + bounds.jMax) / 2),           // W
  ]

  return {
    isoBounds: bounds,
    zonePoints: isoRect(bounds, originX, originY),
    wallSegments: rectWalls(bounds, originX, originY),
    pods,
    chattingHotspots,
    janitorPath,
  }
}

function makePod(ci: number, cj: number, originX: number, originY: number): CubiclePod {
  // 4 desks: 2x2 grid centered at (ci, cj), spaced POD_DESK_SPACING apart.
  const off = POD_DESK_SPACING / 2
  const desks: ScreenPoint[] = [
    isoToScreen(ci - off, cj - off, originX, originY),  // back-left
    isoToScreen(ci + off, cj - off, originX, originY),  // back-right
    isoToScreen(ci - off, cj + off, originX, originY),  // front-left
    isoToScreen(ci + off, cj + off, originX, originY),  // front-right
  ]
  // Pod outer perimeter (2x2 cluster boundary).
  const half = POD_DESK_SPACING + 0.05
  const NW = isoToScreen(ci - half, cj - half, originX, originY)
  const NE = isoToScreen(ci + half, cj - half, originX, originY)
  const SE = isoToScreen(ci + half, cj + half, originX, originY)
  const SW = isoToScreen(ci - half, cj + half, originX, originY)
  return {
    centerIso: { i: ci, j: cj },
    desks,
    partitionWalls: [
      [NW, NE],
      [NE, SE],
      [SE, SW],
      [SW, NW],
    ],
  }
}

function makeManagerOffices(
  count: number,
  stripBounds: IsoBounds,
  originX: number,
  originY: number,
): ManagerOffice[] {
  const offices: ManagerOffice[] = []
  const stripDepth = stripBounds.jMax - stripBounds.jMin
  const officeDepth = stripDepth / count
  for (let k = 0; k < count; k++) {
    const b: IsoBounds = {
      iMin: stripBounds.iMin,
      iMax: stripBounds.iMax,
      jMin: stripBounds.jMin + k * officeDepth,
      jMax: stripBounds.jMin + (k + 1) * officeDepth,
    }
    const ci = (b.iMin + b.iMax) / 2
    const cj = (b.jMin + b.jMax) / 2
    offices.push({
      isoBounds: b,
      zonePoints: isoRect(b, originX, originY),
      wallSegments: rectWalls(b, originX, originY),
      // Desk in the center-east of the office (manager faces toward door / west).
      deskPosition: isoToScreen(ci + 0.6, cj, originX, originY),
      managerPosition: isoToScreen(ci + 0.6, cj - 0.3, originX, originY),
      // Door on the west wall (opening into agent floor).
      doorPosition: isoToScreen(b.iMin, cj, originX, originY),
      // Whiteboard on the east (back) wall.
      whiteboardPosition: isoToScreen(b.iMax - 0.2, cj, originX, originY),
    })
  }
  return offices
}

function makeReception(b: IsoBounds, originX: number, originY: number): ReceptionRoom {
  const ci = (b.iMin + b.iMax) / 2
  const cj = (b.jMin + b.jMax) / 2
  return {
    isoBounds: b,
    zonePoints: isoRect(b, originX, originY),
    wallSegments: rectWalls(b, originX, originY),
    // Front double door: at the center of the south wall (i in middle, j = jMax).
    doorPosition: isoToScreen(ci, b.jMax, originX, originY),
    doorWidth: 4,
    // Security desk in the center of the lobby, slightly back.
    securityDeskPosition: isoToScreen(ci, cj - 0.5, originX, originY),
    guardPosition: isoToScreen(ci, cj - 1.0, originX, originY),
  }
}

function makeBreakRoom(agentCount: number, originX: number, originY: number): BreakRoomLayout {
  const b = BREAK_BOUNDS
  const ci = (b.iMin + b.iMax) / 2
  const cj = (b.jMin + b.jMax) / 2
  const tableCenter = isoToScreen(ci, cj, originX, originY)
  // Water cooler + vending machine sit along the back (low-j) wall but pushed
  // INWARD (higher j, larger i for cooler / smaller i for vending) so that
  // their drawn body — which extends ~22-26px upward in screen y from the
  // anchor point — still falls inside the room polygon. The previous values
  // (jMin + 0.5) put the rendered body OUT of the room because the y-offset
  // pulled it above the back wall (vending landed in the training room).
  const waterCooler = isoToScreen(b.iMin + 1.2, b.jMin + 2.3, originX, originY)
  const vending = isoToScreen(b.iMax - 1.2, b.jMin + 2.3, originX, originY)

  // Break seats: a ring of 8 around the table + grid fill if more capacity needed.
  const maxBreakAgents = Math.max(8, Math.ceil(agentCount * 0.25))
  const seats = computeBreakSeats(maxBreakAgents, tableCenter, b, originX, originY)

  // Cluster of 4 standing positions near the water cooler for the
  // at_water_cooler activity (small offsets, all inside the room).
  const waterCoolerCluster: ScreenPoint[] = [
    { x: waterCooler.x - 12, y: waterCooler.y + 6 },
    { x: waterCooler.x + 14, y: waterCooler.y + 4 },
    { x: waterCooler.x - 4,  y: waterCooler.y + 14 },
    { x: waterCooler.x + 18, y: waterCooler.y + 12 },
  ]

  return {
    isoBounds: b,
    zonePoints: isoRect(b, originX, originY),
    wallSegments: rectWalls(b, originX, originY),
    tableCenter,
    waterCoolerPosition: waterCooler,
    vendingMachinePosition: vending,
    seatPositions: seats,
    waterCoolerCluster,
  }
}

function makeTrainingRoom(originX: number, originY: number): TrainingRoomLayout {
  const b = TRAINING_BOUNDS
  // Whiteboard at the back (north / low j edge) center.
  const whiteboardPosition = isoToScreen((b.iMin + b.iMax) / 2, b.jMin + 0.3, originX, originY)
  // Student seats: 4 rows × 6 cols facing the whiteboard.
  const studentSeats: ScreenPoint[] = []
  const rows = 4
  const cols = 6
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = b.iMin + 1.5 + c * 1.2
      const j = b.jMin + 1.8 + r * 1.0
      if (i >= b.iMax - 0.5 || j >= b.jMax - 0.5) continue
      studentSeats.push(isoToScreen(i, j, originX, originY))
    }
  }
  return {
    isoBounds: b,
    zonePoints: isoRect(b, originX, originY),
    wallSegments: rectWalls(b, originX, originY),
    whiteboardPosition,
    studentSeats,
  }
}

function makeRestrooms(originX: number, originY: number): RestroomsLayout {
  const b = RESTROOM_BOUNDS
  const ci = (b.iMin + b.iMax) / 2
  // Two doors on the east wall (at iMax) splitting the room conceptually.
  const doorPositions: ScreenPoint[] = [
    isoToScreen(b.iMax, (b.jMin + ci - b.iMin / 2) / 1, originX, originY),
    isoToScreen(b.iMax, (b.jMax + ci - b.iMin / 2) / 1, originX, originY),
  ]
  // Simpler: two doors on the east wall at j = jMin+1 and j = jMax-1.
  const doors: ScreenPoint[] = [
    isoToScreen(b.iMax, b.jMin + 1.2, originX, originY),
    isoToScreen(b.iMax, b.jMax - 1.2, originX, originY),
  ]
  void doorPositions
  return {
    isoBounds: b,
    zonePoints: isoRect(b, originX, originY),
    wallSegments: rectWalls(b, originX, originY),
    doorPositions: doors,
  }
}

function makeGym(originX: number, originY: number): GymLayout {
  const b = GYM_BOUNDS
  const ci = (b.iMin + b.iMax) / 2
  const cj = (b.jMin + b.jMax) / 2
  return {
    isoBounds: b,
    zonePoints: isoRect(b, originX, originY),
    wallSegments: rectWalls(b, originX, originY),
    treadmillPosition: isoToScreen(ci - 0.6, cj - 0.5, originX, originY),
    weightsPosition: isoToScreen(ci + 0.8, cj + 0.5, originX, originY),
  }
}

function computeBreakSeats(
  maxBreakAgents: number,
  tableCenter: ScreenPoint,
  b: IsoBounds,
  originX: number,
  originY: number,
): ScreenPoint[] {
  const seats: ScreenPoint[] = []

  // Ring of 8 around the table.
  const RING_RX = 24
  const RING_RY = 12
  const RING_COUNT = 8
  for (let k = 0; k < RING_COUNT; k++) {
    const angle = (k / RING_COUNT) * 2 * Math.PI
    seats.push({
      x: tableCenter.x + Math.cos(angle) * RING_RX,
      y: tableCenter.y + Math.sin(angle) * RING_RY,
    })
  }

  if (maxBreakAgents > RING_COUNT) {
    const candidates: Array<{ i: number; j: number }> = []
    const ci = (b.iMin + b.iMax) / 2
    const cj = (b.jMin + b.jMax) / 2
    for (let i = b.iMin + 0.4; i <= b.iMax - 0.4 + 1e-9; i += 0.35) {
      for (let j = b.jMin + 0.4; j <= b.jMax - 0.4 + 1e-9; j += 0.35) {
        const di = i - ci
        const dj = j - cj
        if (di * di + dj * dj < 0.6) continue   // exclusion radius around the table
        candidates.push({ i, j })
      }
    }
    candidates.sort((a, b2) => (a.i + a.j) - (b2.i + b2.j))
    for (const c of candidates) {
      seats.push(isoToScreen(c.i, c.j, originX, originY))
      if (seats.length >= maxBreakAgents) break
    }
  }
  return seats
}

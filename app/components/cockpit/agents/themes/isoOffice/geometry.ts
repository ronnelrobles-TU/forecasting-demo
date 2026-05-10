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
  // 12 unique workout spots — gym agents distribute across these so multiple
  // agents at the same equipment don't stack on top of each other.
  workoutSpots: ScreenPoint[]
}

// Smoking / chat patio attached to the SW side of the building (outside the
// perimeter wall). Renders as a small floor extension with a railing, bench,
// and ashtray. Chatters and smokers stand here in pairs.
export interface SmokingPatioLayout {
  // Floor polygon in screen space (4 points, drawn as the patio deck).
  zonePoints: ScreenPoint[]
  // Railing segments around 3 sides of the patio (the side touching the
  // building has no rail).
  railingSegments: Array<[ScreenPoint, ScreenPoint]>
  bench: ScreenPoint
  ashtray: ScreenPoint
  // 4-6 standing positions where chatters/smokers stand (pairs preferred).
  standingPositions: ScreenPoint[]
}

// A hotspot the free-roaming janitor NPC may walk to. The renderer picks a
// random hotspot every "leg" (weighted per janitor preference) so the
// behaviour reads as autonomous rather than a fixed loop.
export type JanitorHotspotType = 'aisle' | 'corner' | 'near_room'
export interface JanitorHotspot {
  pos: ScreenPoint
  type: JanitorHotspotType
  // For 'near_room' hotspots: which room this hotspot is at the entrance of.
  // The janitor can occasionally enter the room (rendered at roomCenter).
  roomId?: 'gym' | 'training' | 'breakRoom' | 'restroom'
  roomCenter?: ScreenPoint
}

export interface AgentFloorLayout extends RoomBounds {
  pods: CubiclePod[]
  // Pairs of nearby points where idle agents can stand chatting in the aisles
  // between pods. Each pair is two points 8px apart (one for each chatter).
  chattingHotspots: Array<[ScreenPoint, ScreenPoint]>
  // Slow loop of waypoints for the janitor NPC (perimeter of the agent floor).
  // Kept for back-compat: equivalent to `janitorPaths[0]`.
  janitorPath: ScreenPoint[]
  // Multiple janitor paths (2-3), one per janitor. Each janitor walks its own
  // loop at its own speed (see Janitor.tsx).
  janitorPaths: ScreenPoint[][]
  // Optional one-off room visits a janitor can pause inside (mop the gym,
  // training, etc.). Used by the Janitor renderer to occasionally divert.
  janitorRoomVisits: Array<{ roomId: 'gym' | 'training' | 'breakRoom'; pos: ScreenPoint }>
  // Free-roaming hotspots used by the janitor state machine to pick random
  // destinations (Round 4). Each janitor weights them differently.
  janitorHotspots: JanitorHotspot[]
  // Position of the water cooler in screen space (cached for the coffee-run
  // micro-event so callers don't have to dig into breakRoom).
  waterCoolerPos: ScreenPoint
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
    smokingPatio: SmokingPatioLayout
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
  // +30 vertical / +20 horizontal extra for the smoking patio that extends
  // past the SW face of the building.
  const viewBoxW = buildingScreenW + PADDING * 2 + 20
  const viewBoxH = buildingScreenH + WALL_HEIGHT + PADDING * 2 + 30
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
  const agentFloor = makeAgentFloor(
    podCount, podCols, podRows, agentFloorBounds, originX, originY,
    {
      gymCenter: isoToScreen((GYM_BOUNDS.iMin + GYM_BOUNDS.iMax) / 2, (GYM_BOUNDS.jMin + GYM_BOUNDS.jMax) / 2, originX, originY),
      trainingCenter: isoToScreen((TRAINING_BOUNDS.iMin + TRAINING_BOUNDS.iMax) / 2, (TRAINING_BOUNDS.jMin + TRAINING_BOUNDS.jMax) / 2, originX, originY),
      breakCenter: isoToScreen((BREAK_BOUNDS.iMin + BREAK_BOUNDS.iMax) / 2, (BREAK_BOUNDS.jMin + BREAK_BOUNDS.jMax) / 2, originX, originY),
      restroomCenter: isoToScreen((RESTROOM_BOUNDS.iMin + RESTROOM_BOUNDS.iMax) / 2, (RESTROOM_BOUNDS.jMin + RESTROOM_BOUNDS.jMax) / 2, originX, originY),
      gymDoor: isoToScreen(GYM_BOUNDS.iMax, (GYM_BOUNDS.jMin + GYM_BOUNDS.jMax) / 2, originX, originY),
      trainingDoor: isoToScreen(TRAINING_BOUNDS.iMax, (TRAINING_BOUNDS.jMin + TRAINING_BOUNDS.jMax) / 2, originX, originY),
      breakDoor: isoToScreen(BREAK_BOUNDS.iMax, (BREAK_BOUNDS.jMin + BREAK_BOUNDS.jMax) / 2, originX, originY),
      restroomDoor: isoToScreen(RESTROOM_BOUNDS.iMax, (RESTROOM_BOUNDS.jMin + RESTROOM_BOUNDS.jMax) / 2, originX, originY),
      waterCoolerPos: breakRoom.waterCoolerPosition,
    },
  )

  // Distribute windows along the back walls (NE + NW). One window per ~3 iso tiles.
  const windowsPerWall = Math.max(3, Math.floor(Math.max(tilesW, tilesD) / 3))

  // Smoking patio: attached to the SW face of the building, just outside the
  // perimeter. We build it from the south corner (S) and the west corner (W),
  // extending outward by a small offset.
  const smokingPatio = makeSmokingPatio(S, W, agentFloor)

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
      smokingPatio,
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

interface RoomAnchors {
  gymCenter: ScreenPoint
  trainingCenter: ScreenPoint
  breakCenter: ScreenPoint
  restroomCenter: ScreenPoint
  gymDoor: ScreenPoint
  trainingDoor: ScreenPoint
  breakDoor: ScreenPoint
  restroomDoor: ScreenPoint
  waterCoolerPos: ScreenPoint
}

function makeAgentFloor(
  podCount: number,
  podCols: number,
  podRows: number,
  bounds: IsoBounds,
  originX: number,
  originY: number,
  rooms: RoomAnchors,
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

  // Janitor paths: 3 distinct loops around the agent floor so the user sees
  // multiple janitors with different routes (no single agent doing endless
  // laps). Path 0 hugs the perimeter; path 1 is a shorter inner loop biased
  // toward the north half; path 2 zig-zags through the southern aisles.
  const pad = 0.5
  const inset = (i: number, j: number) => isoToScreen(i, j, originX, originY)
  const ci = (bounds.iMin + bounds.iMax) / 2
  const cj = (bounds.jMin + bounds.jMax) / 2
  const perimeterPath: ScreenPoint[] = [
    inset(bounds.iMin + pad, bounds.jMin + pad),                         // NW
    inset(ci, bounds.jMin + pad),                                        // N
    inset(bounds.iMax - pad, bounds.jMin + pad),                         // NE
    inset(bounds.iMax - pad, cj),                                        // E
    inset(bounds.iMax - pad, bounds.jMax - pad),                         // SE
    inset(ci, bounds.jMax - pad),                                        // S
    inset(bounds.iMin + pad, bounds.jMax - pad),                         // SW
    inset(bounds.iMin + pad, cj),                                        // W
  ]
  const innerNorthPath: ScreenPoint[] = [
    inset(bounds.iMin + pad + 1, bounds.jMin + pad + 0.5),
    inset(ci, bounds.jMin + pad + 0.5),
    inset(bounds.iMax - pad - 1, bounds.jMin + pad + 0.5),
    inset(bounds.iMax - pad - 1, cj - 0.5),
    inset(ci, cj - 0.5),
    inset(bounds.iMin + pad + 1, cj - 0.5),
  ]
  const southZigPath: ScreenPoint[] = [
    inset(bounds.iMin + pad + 0.5, cj + 0.5),
    inset(ci - 1, cj + 1.5),
    inset(ci + 1, cj + 0.5),
    inset(bounds.iMax - pad - 0.5, cj + 1.5),
    inset(bounds.iMax - pad - 0.5, bounds.jMax - pad - 0.5),
    inset(ci, bounds.jMax - pad - 0.5),
    inset(bounds.iMin + pad + 0.5, bounds.jMax - pad - 0.5),
  ]
  const janitorPaths: ScreenPoint[][] = [perimeterPath, innerNorthPath, southZigPath]

  // A few one-off room visits so a janitor occasionally diverts inside a room
  // to "mop". Positions are inside the respective rooms (using fixed bounds
  // matching the makeXxx helpers).
  const janitorRoomVisits: Array<{ roomId: 'gym' | 'training' | 'breakRoom'; pos: ScreenPoint }> = [
    { roomId: 'training', pos: isoToScreen((TRAINING_BOUNDS.iMin + TRAINING_BOUNDS.iMax) / 2, (TRAINING_BOUNDS.jMin + TRAINING_BOUNDS.jMax) / 2 + 0.5, originX, originY) },
    { roomId: 'gym',      pos: isoToScreen((GYM_BOUNDS.iMin + GYM_BOUNDS.iMax) / 2 + 0.3, (GYM_BOUNDS.jMin + GYM_BOUNDS.jMax) / 2, originX, originY) },
    { roomId: 'breakRoom',pos: isoToScreen((BREAK_BOUNDS.iMin + BREAK_BOUNDS.iMax) / 2 - 0.5, (BREAK_BOUNDS.jMin + BREAK_BOUNDS.jMax) / 2 + 0.6, originX, originY) },
  ]

  // Build a richer hotspot list for the free-roaming janitor state machine.
  // Mix of: aisle midpoints (between pod columns AND rows), 4 corners of the
  // agent floor, and one entrance per nearby room.
  const janitorHotspots: JanitorHotspot[] = []
  // Aisles between pod columns (vertical aisles)
  for (let r = 0; r < podRows; r++) {
    for (let c = 0; c < podCols - 1; c++) {
      const aisleI = i0 + c * POD_SPACING_I + POD_SPACING_I
      const aisleJ = j0 + r * POD_SPACING_J + POD_SPACING_J / 2
      janitorHotspots.push({ pos: isoToScreen(aisleI, aisleJ, originX, originY), type: 'aisle' })
    }
  }
  // Aisles between pod rows (horizontal aisles)
  for (let r = 0; r < podRows - 1; r++) {
    for (let c = 0; c < podCols; c++) {
      const aisleI = i0 + c * POD_SPACING_I + POD_SPACING_I / 2
      const aisleJ = j0 + r * POD_SPACING_J + POD_SPACING_J
      janitorHotspots.push({ pos: isoToScreen(aisleI, aisleJ, originX, originY), type: 'aisle' })
    }
  }
  // 4 corners
  const cornerPad = 0.7
  janitorHotspots.push({ pos: isoToScreen(bounds.iMin + cornerPad, bounds.jMin + cornerPad, originX, originY), type: 'corner' })
  janitorHotspots.push({ pos: isoToScreen(bounds.iMax - cornerPad, bounds.jMin + cornerPad, originX, originY), type: 'corner' })
  janitorHotspots.push({ pos: isoToScreen(bounds.iMax - cornerPad, bounds.jMax - cornerPad, originX, originY), type: 'corner' })
  janitorHotspots.push({ pos: isoToScreen(bounds.iMin + cornerPad, bounds.jMax - cornerPad, originX, originY), type: 'corner' })
  // Near-room entrances (just inside the agent floor near each NW room's east-side door).
  janitorHotspots.push({ pos: rooms.gymDoor,      type: 'near_room', roomId: 'gym',      roomCenter: rooms.gymCenter })
  janitorHotspots.push({ pos: rooms.trainingDoor, type: 'near_room', roomId: 'training', roomCenter: rooms.trainingCenter })
  janitorHotspots.push({ pos: rooms.breakDoor,    type: 'near_room', roomId: 'breakRoom', roomCenter: rooms.breakCenter })
  janitorHotspots.push({ pos: rooms.restroomDoor, type: 'near_room', roomId: 'restroom', roomCenter: rooms.restroomCenter })

  return {
    isoBounds: bounds,
    zonePoints: isoRect(bounds, originX, originY),
    wallSegments: rectWalls(bounds, originX, originY),
    pods,
    chattingHotspots,
    janitorPath: perimeterPath,
    janitorPaths,
    janitorRoomVisits,
    janitorHotspots,
    waterCoolerPos: rooms.waterCoolerPos,
  }
}

function makeSmokingPatio(
  S: ScreenPoint,
  W: ScreenPoint,
  agentFloor: AgentFloorLayout,
): SmokingPatioLayout {
  // Attach FLUSH to the SW face — Round 4 reposition. Removes the previous
  // floating-deck offset and instead sits the patio tight against the wall
  // line, then extends outward perpendicular to the wall. Reads as a small
  // attached balcony rather than a disconnected deck.
  const PATIO_DEPTH = 32       // depth perpendicular to the wall (screen px)
  const PATIO_WIDTH_PCT = 0.5  // fraction of the SW wall length the patio covers

  const dx = W.x - S.x
  const dy = W.y - S.y
  const wallLen = Math.hypot(dx, dy)
  const ux = dx / wallLen
  const uy = dy / wallLen
  // Outward-pointing normal to the SW wall (screen-down/left side of building).
  // The SW wall runs from S to W with positive y-direction; outward normal
  // (away from the building) points toward (+y) in screen space mostly.
  const nx = uy
  const ny = -ux
  // Choose the outward-pointing normal: building interior is "above" (smaller
  // y) the SW wall, so outward = direction with positive y component.
  const outward = ny > 0 ? { x: nx, y: ny } : { x: -nx, y: -ny }

  const halfPatio = (wallLen * PATIO_WIDTH_PCT) / 2
  const midX = (S.x + W.x) / 2
  const midY = (S.y + W.y) / 2

  const wallA: ScreenPoint = { x: midX - ux * halfPatio, y: midY - uy * halfPatio }
  const wallB: ScreenPoint = { x: midX + ux * halfPatio, y: midY + uy * halfPatio }
  const outerA: ScreenPoint = { x: wallA.x + outward.x * PATIO_DEPTH, y: wallA.y + outward.y * PATIO_DEPTH }
  const outerB: ScreenPoint = { x: wallB.x + outward.x * PATIO_DEPTH, y: wallB.y + outward.y * PATIO_DEPTH }

  const zonePoints: ScreenPoint[] = [wallA, wallB, outerB, outerA]
  const railingSegments: Array<[ScreenPoint, ScreenPoint]> = [
    [wallA, outerA],
    [outerA, outerB],
    [outerB, wallB],
  ]

  // Bench along the back (against the building wall): midway between wallA/wallB,
  // pushed slightly outward into the patio.
  const benchX = (wallA.x + wallB.x) / 2 + outward.x * 6
  const benchY = (wallA.y + wallB.y) / 2 + outward.y * 6
  const bench: ScreenPoint = { x: benchX, y: benchY }
  // Ashtray near one outer corner.
  const ashtray: ScreenPoint = {
    x: outerA.x + (outerB.x - outerA.x) * 0.18,
    y: outerA.y + (outerB.y - outerA.y) * 0.18 - 3,
  }

  // Up to 16 standing positions across the patio: TWO depth-rows of 8 paired
  // clusters. Round 5: previous 6 collapsed into 3 stacks. Now we lay agents
  // out across the patio depth too so a busy chat crowd reads as people in
  // small groups, not stacked sprites.
  const standingPositions: ScreenPoint[] = []
  const PAIRS = 4
  const ROWS = 2
  for (let row = 0; row < ROWS; row++) {
    const depthFrac = 0.4 + row * 0.3   // row 0 → 0.4, row 1 → 0.7
    for (let k = 0; k < PAIRS; k++) {
      const t = (k + 0.5) / PAIRS
      const baseX = wallA.x + (wallB.x - wallA.x) * t + outward.x * (PATIO_DEPTH * depthFrac)
      const baseY = wallA.y + (wallB.y - wallA.y) * t + outward.y * (PATIO_DEPTH * depthFrac)
      // Pair offset along the wall axis (partners face each other).
      standingPositions.push({ x: baseX - ux * 3.5, y: baseY - uy * 3.5 })
      standingPositions.push({ x: baseX + ux * 3.5, y: baseY + uy * 3.5 })
    }
  }
  // Reference agentFloor so it isn't reported unused (useful for future
  // patio-routing tweaks tied to floor layout).
  void agentFloor
  return { zonePoints, railingSegments, bench, ashtray, standingPositions }
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

  // Break seats: ring of 8 around the table + grid fill. Round 5: bumped from
  // 25% → 40% of agent count so peak lunch-time break occupancy doesn't force
  // multiple agents onto the same seat.
  const maxBreakAgents = Math.max(8, Math.ceil(agentCount * 0.4))
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
    workoutSpots: [
      // Treadmill area (4 spots — pseudo-treadmill row)
      isoToScreen(ci - 1.2, cj - 0.7, originX, originY),
      isoToScreen(ci - 0.6, cj - 0.5, originX, originY),
      isoToScreen(ci + 0.0, cj - 0.4, originX, originY),
      isoToScreen(ci + 0.6, cj - 0.2, originX, originY),
      // Weights area (4 spots)
      isoToScreen(ci - 0.8, cj + 0.5, originX, originY),
      isoToScreen(ci + 0.0, cj + 0.6, originX, originY),
      isoToScreen(ci + 0.8, cj + 0.5, originX, originY),
      isoToScreen(ci + 1.4, cj + 0.7, originX, originY),
      // Floor mat / yoga corner
      isoToScreen(ci - 1.4, cj + 1.2, originX, originY),
      isoToScreen(ci - 0.7, cj + 1.4, originX, originY),
      isoToScreen(ci + 0.7, cj + 1.4, originX, originY),
      isoToScreen(ci + 1.4, cj + 1.2, originX, originY),
    ],
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

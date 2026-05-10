// Shared NPC state machines for the office themes (Round 8).
//
// Round 4 originally embedded the janitor / executive / delivery state machines
// inside each SVG component. The HD (Pixi) renderer needs the same behaviour,
// so the pure logic is extracted here and consumed by both. SVG components
// continue to keep their own React glue (refs / rAF loops); the HD renderer
// calls these helpers directly from its Pixi ticker.
//
// All state machines are wall-clock driven and deterministic per leg (PRNG
// seeded by NPC index + leg counter), so behaviour is reproducible across
// scrubs and theme switches. No React, no DOM, no Pixi imports — keep this
// module dependency-free so it can be unit-tested.
//
// `mulberry32` lives in Janitor.tsx for back-compat (existing tests import it
// from there). It's re-exported here so HD code only has to depend on this
// module.

import type { JanitorHotspot, ScreenPoint } from './geometry'
import { mulberry32 } from './Janitor'

export { mulberry32 }

// ---------- shared utility ----------

export function lerpPoint(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// ---------- janitor ----------

export interface JanitorPersonality {
  aisle: number
  corner: number
  near_room: number
  enterRoomChance: number
}

export const JANITOR_PERSONALITIES: JanitorPersonality[] = [
  { aisle: 0.60, corner: 0.20, near_room: 0.20, enterRoomChance: 0.10 },
  { aisle: 0.30, corner: 0.20, near_room: 0.50, enterRoomChance: 0.40 },
  { aisle: 0.30, corner: 0.60, near_room: 0.10, enterRoomChance: 0.05 },
]

export type JanitorActivity = 'mopping' | 'looking_around' | 'in_room'

export type JanitorState =
  | {
      kind: 'walking_to'
      from: ScreenPoint
      to: ScreenPoint
      target: 'mop_spot' | 'room_visit'
      targetRoomId?: string
      startedAt: number
      durationMs: number
      legCounter: number
    }
  | {
      kind: 'pausing'
      at: ScreenPoint
      activity: JanitorActivity
      startedAt: number
      durationMs: number
      legCounter: number
    }

export const JANITOR_WALK_MS_MIN = 1500
export const JANITOR_WALK_MS_MAX = 2000
export const JANITOR_PAUSE_MOP_MS = 2500
export const JANITOR_PAUSE_LOOK_MS = 1200
export const JANITOR_PAUSE_INROOM_MS = 4500

export const JANITOR_COUNT = 3

interface PickedDestination {
  hotspot: JanitorHotspot
  enterRoom: boolean
}

export function pickJanitorDestination(
  janitorIdx: number,
  simTimeMin: number,
  hotspots: ReadonlyArray<JanitorHotspot>,
  legCounter: number,
): PickedDestination {
  if (hotspots.length === 0) {
    return { hotspot: { pos: { x: 0, y: 0 }, type: 'aisle' }, enterRoom: false }
  }
  const seed = janitorIdx * 100000 + Math.floor(simTimeMin / 5) * 1000 + legCounter
  const rng = mulberry32(seed)
  const p = JANITOR_PERSONALITIES[janitorIdx % JANITOR_PERSONALITIES.length]
  const r = rng()
  const wantedType: 'aisle' | 'corner' | 'near_room' =
    r < p.aisle ? 'aisle'
    : r < p.aisle + p.corner ? 'corner'
    : 'near_room'
  const candidates = hotspots.filter(h => h.type === wantedType)
  const pool = candidates.length > 0 ? candidates : hotspots
  const idx = Math.floor(rng() * pool.length)
  const hotspot = pool[idx]
  const enterRoom = hotspot.type === 'near_room'
    && rng() < p.enterRoomChance
    && !!hotspot.roomCenter
  return { hotspot, enterRoom }
}

function pickJanitorWalkMs(rng: () => number): number {
  return JANITOR_WALK_MS_MIN + rng() * (JANITOR_WALK_MS_MAX - JANITOR_WALK_MS_MIN)
}

function pickJanitorActivity(rng: () => number): JanitorActivity {
  return rng() < 0.6 ? 'mopping' : 'looking_around'
}

export function janitorPosition(state: JanitorState, nowMs: number): ScreenPoint {
  if (state.kind === 'pausing') return state.at
  const elapsed = Math.max(0, nowMs - state.startedAt)
  const t = state.durationMs > 0 ? Math.min(1, elapsed / state.durationMs) : 1
  return lerpPoint(state.from, state.to, t)
}

export function initialJanitorState(
  janitorIdx: number,
  simTimeMin: number,
  hotspots: ReadonlyArray<JanitorHotspot>,
  nowMs: number,
): JanitorState {
  const seed = janitorIdx * 999991 + Math.floor(simTimeMin)
  const rng = mulberry32(seed)
  const startIdx = Math.floor(rng() * Math.max(1, hotspots.length))
  const start = hotspots[startIdx]?.pos ?? { x: 0, y: 0 }
  const dest = pickJanitorDestination(janitorIdx, simTimeMin, hotspots, 0)
  const target = dest.enterRoom && dest.hotspot.roomCenter
    ? dest.hotspot.roomCenter
    : dest.hotspot.pos
  return {
    kind: 'walking_to',
    from: start,
    to: target,
    target: dest.enterRoom ? 'room_visit' : 'mop_spot',
    targetRoomId: dest.enterRoom ? dest.hotspot.roomId : undefined,
    startedAt: nowMs,
    durationMs: pickJanitorWalkMs(rng),
    legCounter: 0,
  }
}

export function advanceJanitorState(
  state: JanitorState,
  janitorIdx: number,
  simTimeMin: number,
  hotspots: ReadonlyArray<JanitorHotspot>,
  nowMs: number,
): JanitorState {
  const elapsed = nowMs - state.startedAt
  if (state.kind === 'walking_to') {
    if (elapsed < state.durationMs) return state
    const rng = mulberry32(janitorIdx * 7919 + state.legCounter * 31 + Math.floor(nowMs))
    if (state.target === 'room_visit') {
      return {
        kind: 'pausing',
        at: state.to,
        activity: 'in_room',
        startedAt: nowMs,
        durationMs: JANITOR_PAUSE_INROOM_MS,
        legCounter: state.legCounter,
      }
    }
    const activity = pickJanitorActivity(rng)
    return {
      kind: 'pausing',
      at: state.to,
      activity,
      startedAt: nowMs,
      durationMs: activity === 'mopping' ? JANITOR_PAUSE_MOP_MS : JANITOR_PAUSE_LOOK_MS,
      legCounter: state.legCounter,
    }
  }
  if (elapsed < state.durationMs) return state
  const nextLeg = state.legCounter + 1
  const dest = pickJanitorDestination(janitorIdx, simTimeMin, hotspots, nextLeg)
  const rng = mulberry32(janitorIdx * 4421 + nextLeg * 17)
  const target = dest.enterRoom && dest.hotspot.roomCenter
    ? dest.hotspot.roomCenter
    : dest.hotspot.pos
  return {
    kind: 'walking_to',
    from: state.at,
    to: target,
    target: dest.enterRoom ? 'room_visit' : 'mop_spot',
    targetRoomId: dest.enterRoom ? dest.hotspot.roomId : undefined,
    startedAt: nowMs,
    durationMs: pickJanitorWalkMs(rng),
    legCounter: nextLeg,
  }
}

// ---------- executive walker ----------

export type ExecState =
  | { kind: 'walking'; from: ScreenPoint; to: ScreenPoint; startedAt: number; durationMs: number; targetIdx: number; legCounter: number }
  | { kind: 'pausing'; at: ScreenPoint; startedAt: number; durationMs: number; legCounter: number }

export const EXEC_WALK_MS_MIN = 1800
export const EXEC_WALK_MS_MAX = 2400
export const EXEC_PAUSE_MS_MIN = 4000
export const EXEC_PAUSE_MS_MAX = 9000

function pickExecDoor(rng: () => number, count: number, exclude: number): number {
  if (count <= 1) return 0
  let idx = Math.floor(rng() * count)
  if (idx === exclude) idx = (idx + 1) % count
  return idx
}

export function execPosition(s: ExecState, nowMs: number): ScreenPoint {
  if (s.kind === 'pausing') return s.at
  const elapsed = Math.max(0, nowMs - s.startedAt)
  const t = s.durationMs > 0 ? Math.min(1, elapsed / s.durationMs) : 1
  return lerpPoint(s.from, s.to, t)
}

export function initialExecState(officeDoors: ReadonlyArray<ScreenPoint>, nowMs: number): ExecState | null {
  if (officeDoors.length === 0) return null
  const rng = mulberry32(7331)
  const startIdx = Math.floor(rng() * officeDoors.length)
  const targetIdx = pickExecDoor(rng, officeDoors.length, startIdx)
  return {
    kind: 'walking',
    from: officeDoors[startIdx],
    to: officeDoors[targetIdx],
    startedAt: nowMs,
    durationMs: EXEC_WALK_MS_MIN + rng() * (EXEC_WALK_MS_MAX - EXEC_WALK_MS_MIN),
    targetIdx,
    legCounter: 0,
  }
}

export function advanceExecState(
  s: ExecState,
  officeDoors: ReadonlyArray<ScreenPoint>,
  nowMs: number,
): ExecState {
  if (officeDoors.length === 0) return s
  const elapsed = nowMs - s.startedAt
  if (elapsed < s.durationMs) return s
  if (s.kind === 'walking') {
    const rng = mulberry32(7331 + s.legCounter * 131)
    return {
      kind: 'pausing',
      at: s.to,
      startedAt: nowMs,
      durationMs: EXEC_PAUSE_MS_MIN + rng() * (EXEC_PAUSE_MS_MAX - EXEC_PAUSE_MS_MIN),
      legCounter: s.legCounter,
    }
  }
  const nextLeg = s.legCounter + 1
  const rng = mulberry32(7331 + nextLeg * 131)
  const newTarget = pickExecDoor(rng, officeDoors.length, s.legCounter % officeDoors.length)
  return {
    kind: 'walking',
    from: s.at,
    to: officeDoors[newTarget],
    startedAt: nowMs,
    durationMs: EXEC_WALK_MS_MIN + rng() * (EXEC_WALK_MS_MAX - EXEC_WALK_MS_MIN),
    targetIdx: newTarget,
    legCounter: nextLeg,
  }
}

// ---------- delivery person ----------

export type DeliveryState =
  | { kind: 'idle' }
  | { kind: 'walking_in'; from: ScreenPoint; to: ScreenPoint; startedAt: number; durationMs: number }
  | { kind: 'dropping'; at: ScreenPoint; startedAt: number; durationMs: number }
  | { kind: 'walking_out'; from: ScreenPoint; to: ScreenPoint; startedAt: number; durationMs: number }

export const DELIVERY_WALK_MS = 2200
export const DELIVERY_DROP_MS = 1500
export const DELIVERY_SIM_INTERVAL_MIN = 30
export const DELIVERY_SIM_FIRST = 540    // first delivery at 9:00 AM

export interface DeliveryFrame {
  pos: ScreenPoint
  carrying: boolean
}

/** Returns the visible frame for a delivery state, or null when idle. */
export function deliveryFrame(s: DeliveryState, nowMs: number): DeliveryFrame | null {
  if (s.kind === 'idle') return null
  const elapsed = Math.max(0, nowMs - s.startedAt)
  if (s.kind === 'walking_in') {
    const t = s.durationMs > 0 ? Math.min(1, elapsed / s.durationMs) : 1
    return { pos: lerpPoint(s.from, s.to, t), carrying: true }
  }
  if (s.kind === 'dropping') {
    return { pos: s.at, carrying: true }
  }
  const t = s.durationMs > 0 ? Math.min(1, elapsed / s.durationMs) : 1
  return { pos: lerpPoint(s.from, s.to, t), carrying: false }
}

/** Advance a delivery state through walking_in → dropping → walking_out → idle. */
export function advanceDeliveryState(
  s: DeliveryState,
  door: ScreenPoint,
  nowMs: number,
): DeliveryState {
  if (s.kind === 'idle') return s
  const elapsed = nowMs - s.startedAt
  if (elapsed < s.durationMs) return s
  if (s.kind === 'walking_in') {
    return {
      kind: 'dropping',
      at: s.to,
      startedAt: nowMs,
      durationMs: DELIVERY_DROP_MS,
    }
  }
  if (s.kind === 'dropping') {
    return {
      kind: 'walking_out',
      from: s.at,
      to: door,
      startedAt: nowMs,
      durationMs: DELIVERY_WALK_MS,
    }
  }
  return { kind: 'idle' }
}

/** Decide whether a new delivery should start now, given the current sim time
 *  and the sim time of the previous delivery. Returns the new state, or null
 *  if it's not yet time. */
export function maybeStartDelivery(
  current: DeliveryState,
  simTimeMin: number,
  lastDeliverySimTime: number,
  door: ScreenPoint,
  dropTarget: ScreenPoint,
  nowMs: number,
): DeliveryState | null {
  if (current.kind !== 'idle') return null
  const sinceFirst = simTimeMin - DELIVERY_SIM_FIRST
  if (sinceFirst < 0) return null
  const dueWindow = Math.floor(sinceFirst / DELIVERY_SIM_INTERVAL_MIN)
  const lastWindow = Math.floor((lastDeliverySimTime - DELIVERY_SIM_FIRST) / DELIVERY_SIM_INTERVAL_MIN)
  if (dueWindow > lastWindow) {
    return {
      kind: 'walking_in',
      from: door,
      to: dropTarget,
      startedAt: nowMs,
      durationMs: DELIVERY_WALK_MS,
    }
  }
  return null
}

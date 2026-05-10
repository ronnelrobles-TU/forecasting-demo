// Per-agent visual journey state machine.
//
// Architectural shift away from the per-frame state-diff renderer in
// `animation.ts`: each agent now owns a `VisualJourney` describing the phase
// of their narrative (walking to break, sitting at table, walking back,
// outside for lunch, etc.). Sim state changes are DEFERRED while a journey is
// in-flight; they are applied only when the journey reaches a stable resting
// point. Resting phases also have minimum hold durations so the user can
// actually SEE an agent at the break table even when sim time blasts through
// the break in 1.3 real seconds.
//
// Long breaks (>20 sim min) are treated as lunch — the agent walks all the
// way to the front door, disappears, then walks back in. Coffee breaks
// (<=20 sim min) keep the existing walk-to-table-and-back behavior.

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { ScreenPoint, BuildingLayout } from './geometry'

// Visual phases an agent can be in. Some are "stable resting points"
// (interruptible), others are "in-flight" (must complete before honoring new
// sim state). See `isRestingPhase` for the precise mapping.
export type RoomKind = 'gym' | 'training' | 'restroom' | 'patio' | 'water_cooler' | 'chat'

export type JourneyPhase =
  | { kind: 'arriving_at_door'; from: ScreenPoint; to: ScreenPoint; duration: number }
  | { kind: 'at_desk'; pos: ScreenPoint }
  | { kind: 'on_call_at_desk'; pos: ScreenPoint }
  | { kind: 'walking_to_break'; from: ScreenPoint; to: ScreenPoint; duration: number; seat: ScreenPoint }
  | { kind: 'at_break_table'; pos: ScreenPoint; until: number }
  | { kind: 'walking_back_to_desk'; from: ScreenPoint; to: ScreenPoint; duration: number }
  | { kind: 'walking_to_door_for_lunch'; from: ScreenPoint; to: ScreenPoint; duration: number }
  | { kind: 'outside_for_lunch'; until: number }
  | { kind: 'walking_back_from_lunch'; from: ScreenPoint; to: ScreenPoint; duration: number }
  | { kind: 'walking_to_door_for_shift_end'; from: ScreenPoint; to: ScreenPoint; duration: number }
  | { kind: 'gone' }
  | { kind: 'walking_to_room'; targetRoom: RoomKind; from: ScreenPoint; to: ScreenPoint; duration: number; roomPos: ScreenPoint }
  | { kind: 'in_room'; targetRoom: RoomKind; pos: ScreenPoint; until: number }
  | { kind: 'walking_back_from_room'; targetRoom: RoomKind; from: ScreenPoint; to: ScreenPoint; duration: number }
  // Restroom is rendered as a 5-phase visible journey (Round 4): walk to door,
  // fade out at door, hidden inside, fade in at door, walk back. The agent is
  // never teleported.
  | { kind: 'walking_to_restroom_door'; from: ScreenPoint; to: ScreenPoint; duration: number }
  | { kind: 'entering_restroom'; pos: ScreenPoint; duration: number }
  | { kind: 'inside_restroom'; pos: ScreenPoint; until: number }
  | { kind: 'exiting_restroom'; pos: ScreenPoint; duration: number }
  | { kind: 'walking_back_from_restroom'; from: ScreenPoint; to: ScreenPoint; duration: number }
  // Chatting (now visible — agent walks to a chat hotspot, stands a beat,
  // walks back). Distinct from in_room so the chatter remains owned by the
  // floor renderer rather than a room component.
  | { kind: 'walking_to_chat_spot'; from: ScreenPoint; to: ScreenPoint; duration: number; spot: ScreenPoint }
  | { kind: 'at_chat_spot'; pos: ScreenPoint; until: number }
  | { kind: 'walking_back_from_chat'; from: ScreenPoint; to: ScreenPoint; duration: number }

export interface VisualJourney {
  agentId: string
  phase: JourneyPhase
  phaseStartedAt: number
  pendingSimState: AgentVisualState | null
  homeDeskPosition: ScreenPoint
  // Last on-screen position of the agent (updated whenever a walk completes
  // or a resting phase is entered). Used to source-position room→desk walks
  // so the agent appears to walk back from the room they were last in,
  // instead of teleporting to a door first.
  lastKnownPosition: ScreenPoint
}

export const MIN_BREAK_HOLD_MS = 2500
export const MIN_LUNCH_OUT_MS = 4000
export const MIN_ROOM_HOLD_MS = 3000
export const MIN_CHAT_HOLD_MS = 2500
export const MIN_RESTROOM_HOLD_MS = 3500
export const RESTROOM_FADE_MS = 500
export const WALK_DURATION_MS = 1500
export const LUNCH_WALK_DURATION_MS = 2000

// FNV-1a hash, returns float in [0, 1).
function simpleHash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 2 ** 32
}

function simpleHashIdx(s: string, max: number): number {
  if (max <= 0) return 0
  return Math.floor(simpleHash01(s) * max) % max
}

export function lerp(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function makeJourney(
  agentId: string,
  homeDeskPosition: ScreenPoint,
  initialState: AgentVisualState,
  nowMs: number,
): VisualJourney {
  const phase: JourneyPhase = initialState === 'on_call'
    ? { kind: 'on_call_at_desk', pos: homeDeskPosition }
    : initialState === 'off_shift'
      ? { kind: 'gone' }
      : { kind: 'at_desk', pos: homeDeskPosition }
  return {
    agentId,
    phase,
    phaseStartedAt: nowMs,
    pendingSimState: null,
    homeDeskPosition,
    lastKnownPosition: homeDeskPosition,
  }
}

// Returns true if the phase is at a stable resting point (can be interrupted).
export function isRestingPhase(phase: JourneyPhase, nowMs: number): boolean {
  switch (phase.kind) {
    case 'at_desk':
    case 'on_call_at_desk':
    case 'gone':
      return true
    case 'at_break_table':
    case 'in_room':
    case 'outside_for_lunch':
    case 'at_chat_spot':
    case 'inside_restroom':
      return nowMs >= phase.until
    default:
      return false
  }
}

// Compute the agent's current screen position + opacity. Returns opacity 0
// when the agent is hidden (outside_for_lunch / gone / inside_restroom).
export function journeyPosition(
  journey: VisualJourney,
  nowMs: number,
): { pos: ScreenPoint; opacity: number; visible: boolean } {
  const elapsed = Math.max(0, nowMs - journey.phaseStartedAt)
  const phase = journey.phase
  switch (phase.kind) {
    case 'arriving_at_door':
    case 'walking_to_break':
    case 'walking_back_to_desk':
    case 'walking_to_door_for_lunch':
    case 'walking_back_from_lunch':
    case 'walking_to_room':
    case 'walking_back_from_room':
    case 'walking_to_restroom_door':
    case 'walking_back_from_restroom':
    case 'walking_to_chat_spot':
    case 'walking_back_from_chat': {
      const t = phase.duration > 0 ? Math.min(1, elapsed / phase.duration) : 1
      return { pos: lerp(phase.from, phase.to, t), opacity: 1, visible: true }
    }
    case 'walking_to_door_for_shift_end': {
      const t = phase.duration > 0 ? Math.min(1, elapsed / phase.duration) : 1
      // Fade out across the last 30% of the walk so the exit reads as "leaving".
      const opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3)
      return { pos: lerp(phase.from, phase.to, t), opacity, visible: true }
    }
    case 'entering_restroom': {
      // Standing at the door, opacity 1 -> 0.
      const t = phase.duration > 0 ? Math.min(1, elapsed / phase.duration) : 1
      return { pos: phase.pos, opacity: 1 - t, visible: t < 0.999 }
    }
    case 'exiting_restroom': {
      // Standing at the door, opacity 0 -> 1.
      const t = phase.duration > 0 ? Math.min(1, elapsed / phase.duration) : 1
      return { pos: phase.pos, opacity: t, visible: true }
    }
    case 'at_desk':
    case 'on_call_at_desk':
      return { pos: phase.pos, opacity: 1, visible: true }
    case 'at_break_table':
    case 'in_room':
    case 'at_chat_spot':
      return { pos: phase.pos, opacity: 1, visible: true }
    case 'inside_restroom':
    case 'outside_for_lunch':
    case 'gone':
      return { pos: { x: 0, y: 0 }, opacity: 0, visible: false }
  }
}

function getCurrentPos(journey: VisualJourney, nowMs: number): ScreenPoint {
  return journeyPosition(journey, nowMs).pos
}

function startPhase(journey: VisualJourney, phase: JourneyPhase, nowMs: number): VisualJourney {
  // Update lastKnownPosition opportunistically — whenever we transition to a
  // new phase, snapshot where the agent currently is (resolved via the OLD
  // phase's position, which is our latest visible point) so subsequent
  // walks can source from there instead of teleporting to a door.
  const lastResolved = journeyPosition(journey, nowMs)
  const lastKnown = lastResolved.visible ? lastResolved.pos : journey.lastKnownPosition
  return { ...journey, phase, phaseStartedAt: nowMs, lastKnownPosition: lastKnown }
}

// Pick a stable seat for an agent. We extract the numeric portion of the
// agent id (e.g. "A123" → 123) and use it modulo seat count. This gives a
// bijective seat assignment when agentCount <= seats.length, sharply reducing
// the seat-collision rate vs. a hash-based pick (Round 5 fix).
function pickBreakSeat(agentId: string, seats: ReadonlyArray<ScreenPoint>): ScreenPoint {
  if (seats.length === 0) return { x: 0, y: 0 }
  const numeric = parseInt(agentId.replace(/^[A-Za-z]+/, ''), 10)
  if (Number.isFinite(numeric) && numeric >= 0) {
    return seats[numeric % seats.length]
  }
  return seats[simpleHashIdx(agentId, seats.length)]
}

// Build the natural starting phase for a sim state, called when journey is
// resting and a state change should now be honored.
function startPhaseForState(
  journey: VisualJourney,
  newSimState: AgentVisualState,
  layout: BuildingLayout,
  nowMs: number,
  simBreakDurationMin?: number,
): VisualJourney {
  const doorPos = layout.rooms.reception.doorPosition
  const breakSeats = layout.rooms.breakRoom.seatPositions

  switch (newSimState) {
    case 'idle': {
      // From wherever they are -> walking back to desk, unless they're already at-desk.
      const cur = getCurrentPos(journey, nowMs)
      const home = journey.homeDeskPosition
      const isAlreadyHome = (journey.phase.kind === 'at_desk' || journey.phase.kind === 'on_call_at_desk')
      if (isAlreadyHome) {
        return startPhase({ ...journey, pendingSimState: null }, { kind: 'at_desk', pos: home }, nowMs)
      }
      if (journey.phase.kind === 'gone') {
        // Coming back to the office: walk from door to desk.
        return startPhase({ ...journey, pendingSimState: null }, {
          kind: 'arriving_at_door',
          from: doorPos,
          to: home,
          duration: LUNCH_WALK_DURATION_MS,
        }, nowMs)
      }
      if (journey.phase.kind === 'outside_for_lunch') {
        return startPhase({ ...journey, pendingSimState: null }, {
          kind: 'walking_back_from_lunch',
          from: doorPos,
          to: home,
          duration: LUNCH_WALK_DURATION_MS,
        }, nowMs)
      }
      return startPhase({ ...journey, pendingSimState: null }, {
        kind: 'walking_back_to_desk',
        from: cur,
        to: home,
        duration: WALK_DURATION_MS,
      }, nowMs)
    }
    case 'on_call': {
      // Calls happen at the desk — if not at the desk, walk back first.
      if (journey.phase.kind === 'at_desk' || journey.phase.kind === 'on_call_at_desk') {
        return startPhase({ ...journey, pendingSimState: null }, {
          kind: 'on_call_at_desk',
          pos: journey.homeDeskPosition,
        }, nowMs)
      }
      // Need to walk back to take the call. Defer the on_call by stashing it.
      return startPhase({ ...journey, pendingSimState: 'on_call' }, {
        kind: 'walking_back_to_desk',
        from: getCurrentPos(journey, nowMs),
        to: journey.homeDeskPosition,
        duration: WALK_DURATION_MS,
      }, nowMs)
    }
    case 'on_break': {
      const isLunch = (simBreakDurationMin ?? 0) > 20
      if (isLunch) {
        return startPhase({ ...journey, pendingSimState: null }, {
          kind: 'walking_to_door_for_lunch',
          from: getCurrentPos(journey, nowMs),
          to: doorPos,
          duration: LUNCH_WALK_DURATION_MS,
        }, nowMs)
      }
      const seat = pickBreakSeat(journey.agentId, breakSeats)
      return startPhase({ ...journey, pendingSimState: null }, {
        kind: 'walking_to_break',
        from: getCurrentPos(journey, nowMs),
        to: seat,
        duration: WALK_DURATION_MS,
        seat,
      }, nowMs)
    }
    case 'off_shift': {
      // If already gone, stay gone.
      if (journey.phase.kind === 'gone') {
        return { ...journey, pendingSimState: null }
      }
      return startPhase({ ...journey, pendingSimState: null }, {
        kind: 'walking_to_door_for_shift_end',
        from: getCurrentPos(journey, nowMs),
        to: doorPos,
        duration: LUNCH_WALK_DURATION_MS,
      }, nowMs)
    }
  }
}

// Dispatch a visible walk to a non-break room (gym, training, water cooler,
// chat spot, restroom). Returns the new journey. If the agent is currently
// mid-walk this is a no-op (we don't want to interrupt an in-flight journey).
export function startWalkToRoom(
  journey: VisualJourney,
  room: RoomKind,
  roomPos: ScreenPoint,
  nowMs: number,
): VisualJourney {
  // Don't interrupt anything that isn't a stable resting phase at the desk.
  const k = journey.phase.kind
  if (k !== 'at_desk' && k !== 'on_call_at_desk') return journey
  const from = journey.lastKnownPosition
  if (room === 'restroom') {
    return startPhase(journey, {
      kind: 'walking_to_restroom_door',
      from,
      to: roomPos,
      duration: WALK_DURATION_MS,
    }, nowMs)
  }
  if (room === 'chat') {
    return startPhase(journey, {
      kind: 'walking_to_chat_spot',
      from,
      to: roomPos,
      duration: WALK_DURATION_MS,
      spot: roomPos,
    }, nowMs)
  }
  return startPhase(journey, {
    kind: 'walking_to_room',
    targetRoom: room,
    from,
    to: roomPos,
    duration: WALK_DURATION_MS,
    roomPos,
  }, nowMs)
}

// Dispatch a walk back to the desk from wherever the agent currently is.
// No-op if the agent is already at-desk or mid-walk.
export function startWalkBackToDesk(
  journey: VisualJourney,
  nowMs: number,
): VisualJourney {
  const phase = journey.phase
  // If at a stable non-desk resting phase, walk back. The room→desk source
  // position is the resting phase's pos (so no teleport).
  if (phase.kind === 'in_room') {
    return startPhase(journey, {
      kind: 'walking_back_from_room',
      targetRoom: phase.targetRoom,
      from: phase.pos,
      to: journey.homeDeskPosition,
      duration: WALK_DURATION_MS,
    }, nowMs)
  }
  if (phase.kind === 'at_chat_spot') {
    return startPhase(journey, {
      kind: 'walking_back_from_chat',
      from: phase.pos,
      to: journey.homeDeskPosition,
      duration: WALK_DURATION_MS,
    }, nowMs)
  }
  // For inside_restroom we let the natural exit phase handle the return walk.
  return journey
}

// Apply a sim state change to a journey. May DEFER if the agent is mid-walk.
export function transitionJourney(
  journey: VisualJourney,
  newSimState: AgentVisualState,
  layout: BuildingLayout,
  nowMs: number,
  simBreakDurationMin?: number,
): VisualJourney {
  const isResting = isRestingPhase(journey.phase, nowMs)
  if (!isResting) {
    // Stash for later — current narrative segment must complete first.
    return { ...journey, pendingSimState: newSimState }
  }
  return startPhaseForState(journey, newSimState, layout, nowMs, simBreakDurationMin)
}

// Per-frame tick. Advances in-flight phases to natural successors and applies
// any pending sim state once a resting point is reached.
export function tickJourney(
  journey: VisualJourney,
  layout: BuildingLayout,
  nowMs: number,
): VisualJourney {
  const elapsed = nowMs - journey.phaseStartedAt
  const phase = journey.phase
  const doorPos = layout.rooms.reception.doorPosition

  switch (phase.kind) {
    case 'arriving_at_door': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, { kind: 'at_desk', pos: journey.homeDeskPosition }, nowMs)
      }
      break
    }
    case 'walking_to_break': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'at_break_table',
          pos: phase.seat,
          until: nowMs + MIN_BREAK_HOLD_MS,
        }, nowMs)
      }
      break
    }
    case 'at_break_table': {
      if (nowMs >= phase.until) {
        // Min hold satisfied. If sim says still on_break, keep sitting.
        // If sim has changed (pending), walk back to desk.
        if (journey.pendingSimState && journey.pendingSimState !== 'on_break') {
          return startPhase(journey, {
            kind: 'walking_back_to_desk',
            from: phase.pos,
            to: journey.homeDeskPosition,
            duration: WALK_DURATION_MS,
          }, nowMs)
        }
      }
      break
    }
    case 'walking_back_to_desk': {
      if (elapsed >= phase.duration) {
        const stableState = journey.pendingSimState ?? 'idle'
        const nextPhase: JourneyPhase = stableState === 'on_call'
          ? { kind: 'on_call_at_desk', pos: journey.homeDeskPosition }
          : stableState === 'off_shift'
            ? { kind: 'walking_to_door_for_shift_end', from: journey.homeDeskPosition, to: doorPos, duration: LUNCH_WALK_DURATION_MS }
            : { kind: 'at_desk', pos: journey.homeDeskPosition }
        return startPhase({ ...journey, pendingSimState: null }, nextPhase, nowMs)
      }
      break
    }
    case 'walking_to_door_for_lunch': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'outside_for_lunch',
          until: nowMs + MIN_LUNCH_OUT_MS,
        }, nowMs)
      }
      break
    }
    case 'outside_for_lunch': {
      if (nowMs >= phase.until) {
        // If sim has flipped them off-break, walk back. Otherwise wait.
        if (journey.pendingSimState && journey.pendingSimState !== 'on_break') {
          return startPhase(journey, {
            kind: 'walking_back_from_lunch',
            from: doorPos,
            to: journey.homeDeskPosition,
            duration: LUNCH_WALK_DURATION_MS,
          }, nowMs)
        }
      }
      break
    }
    case 'walking_back_from_lunch': {
      if (elapsed >= phase.duration) {
        const stableState = journey.pendingSimState ?? 'idle'
        const nextPhase: JourneyPhase = stableState === 'on_call'
          ? { kind: 'on_call_at_desk', pos: journey.homeDeskPosition }
          : { kind: 'at_desk', pos: journey.homeDeskPosition }
        return startPhase({ ...journey, pendingSimState: null }, nextPhase, nowMs)
      }
      break
    }
    case 'walking_to_door_for_shift_end': {
      if (elapsed >= phase.duration) {
        return startPhase({ ...journey, pendingSimState: null }, { kind: 'gone' }, nowMs)
      }
      break
    }
    case 'walking_to_room': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'in_room',
          targetRoom: phase.targetRoom,
          pos: phase.roomPos,
          until: nowMs + MIN_ROOM_HOLD_MS,
        }, nowMs)
      }
      break
    }
    case 'in_room': {
      if (nowMs >= phase.until) {
        if (journey.pendingSimState && journey.pendingSimState !== 'idle') {
          return startPhase(journey, {
            kind: 'walking_back_from_room',
            targetRoom: phase.targetRoom,
            from: phase.pos,
            to: journey.homeDeskPosition,
            duration: WALK_DURATION_MS,
          }, nowMs)
        }
      }
      break
    }
    case 'walking_back_from_room': {
      if (elapsed >= phase.duration) {
        const stableState = journey.pendingSimState ?? 'idle'
        const nextPhase: JourneyPhase = stableState === 'on_call'
          ? { kind: 'on_call_at_desk', pos: journey.homeDeskPosition }
          : { kind: 'at_desk', pos: journey.homeDeskPosition }
        return startPhase({ ...journey, pendingSimState: null }, nextPhase, nowMs)
      }
      break
    }
    case 'walking_to_restroom_door': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'entering_restroom',
          pos: phase.to,
          duration: RESTROOM_FADE_MS,
        }, nowMs)
      }
      break
    }
    case 'entering_restroom': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'inside_restroom',
          pos: phase.pos,
          until: nowMs + MIN_RESTROOM_HOLD_MS,
        }, nowMs)
      }
      break
    }
    case 'inside_restroom': {
      if (nowMs >= phase.until) {
        if (journey.pendingSimState && journey.pendingSimState !== 'idle') {
          return startPhase(journey, {
            kind: 'exiting_restroom',
            pos: phase.pos,
            duration: RESTROOM_FADE_MS,
          }, nowMs)
        }
        // Auto-exit even if sim state hasn't changed (visit ended naturally).
        return startPhase(journey, {
          kind: 'exiting_restroom',
          pos: phase.pos,
          duration: RESTROOM_FADE_MS,
        }, nowMs)
      }
      break
    }
    case 'exiting_restroom': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'walking_back_from_restroom',
          from: phase.pos,
          to: journey.homeDeskPosition,
          duration: WALK_DURATION_MS,
        }, nowMs)
      }
      break
    }
    case 'walking_back_from_restroom': {
      if (elapsed >= phase.duration) {
        const stableState = journey.pendingSimState ?? 'idle'
        const nextPhase: JourneyPhase = stableState === 'on_call'
          ? { kind: 'on_call_at_desk', pos: journey.homeDeskPosition }
          : { kind: 'at_desk', pos: journey.homeDeskPosition }
        return startPhase({ ...journey, pendingSimState: null }, nextPhase, nowMs)
      }
      break
    }
    case 'walking_to_chat_spot': {
      if (elapsed >= phase.duration) {
        return startPhase(journey, {
          kind: 'at_chat_spot',
          pos: phase.spot,
          until: nowMs + MIN_CHAT_HOLD_MS,
        }, nowMs)
      }
      break
    }
    case 'at_chat_spot': {
      if (nowMs >= phase.until) {
        if (journey.pendingSimState && journey.pendingSimState !== 'idle') {
          return startPhase(journey, {
            kind: 'walking_back_from_chat',
            from: phase.pos,
            to: journey.homeDeskPosition,
            duration: WALK_DURATION_MS,
          }, nowMs)
        }
      }
      break
    }
    case 'walking_back_from_chat': {
      if (elapsed >= phase.duration) {
        const stableState = journey.pendingSimState ?? 'idle'
        const nextPhase: JourneyPhase = stableState === 'on_call'
          ? { kind: 'on_call_at_desk', pos: journey.homeDeskPosition }
          : { kind: 'at_desk', pos: journey.homeDeskPosition }
        return startPhase({ ...journey, pendingSimState: null }, nextPhase, nowMs)
      }
      break
    }
    case 'at_desk':
    case 'on_call_at_desk':
    case 'gone':
      // Resting. If a pending state is queued, apply it now.
      break
  }

  // After advancing, if we're resting and have a pending sim state, apply it.
  const after = journey.phase === phase ? journey : journey
  void after
  if (isRestingPhase(journey.phase, nowMs) && journey.pendingSimState !== null) {
    return startPhaseForState(journey, journey.pendingSimState, layout, nowMs)
  }
  return journey
}

// Returns true when this phase wants the agent rendered as "at the desk"
// (so the desk component owns it). False when the agent is in another room.
export function isAtDeskPhase(phase: JourneyPhase): boolean {
  return phase.kind === 'at_desk' || phase.kind === 'on_call_at_desk'
}

// Returns true when this phase is a walking phase that traverses the floor.
// Used by the desk-floor renderer to decide whether to draw the lerping
// sprite (which covers any room-to-room or room-to-desk path).
export function isWalkingPhase(phase: JourneyPhase): boolean {
  switch (phase.kind) {
    case 'arriving_at_door':
    case 'walking_to_break':
    case 'walking_back_to_desk':
    case 'walking_to_door_for_lunch':
    case 'walking_back_from_lunch':
    case 'walking_to_door_for_shift_end':
    case 'walking_to_room':
    case 'walking_back_from_room':
    case 'walking_to_restroom_door':
    case 'walking_back_from_restroom':
    case 'walking_to_chat_spot':
    case 'walking_back_from_chat':
    case 'entering_restroom':
    case 'exiting_restroom':
      return true
    default:
      return false
  }
}

// Returns true if the agent is currently sitting at a break table.
export function isAtBreakTable(phase: JourneyPhase): boolean {
  return phase.kind === 'at_break_table'
}

// Returns true if the agent is currently in a non-break room (gym/training/patio).
// Used by the room components to know whether to render the agent.
export function isInRoom(phase: JourneyPhase, room: RoomKind): boolean {
  return phase.kind === 'in_room' && phase.targetRoom === room
}

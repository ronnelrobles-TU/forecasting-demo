import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { ScreenPoint } from './geometry'

export type AnimationKind =
  | 'desk_to_break'   // existing, agent walks from desk to break-room seat
  | 'break_to_desk'   // existing, agent walks from break-room seat back to desk
  | 'fade_in'         // legacy, kept for back-compat with tests / unknown paths
  | 'fade_out'        // legacy, kept for back-compat with tests / unknown paths
  | 'door_to_desk'    // shift_start: agent walks from front door to home desk
  | 'desk_to_door'    // shift_end: agent walks from desk to front door (then fades)
  | 'desk_to_room'    // idle activity transition: walk from desk to a room target
  | 'room_to_desk'    // idle activity transition: walk from room target back to desk

export interface AnimEntry {
  kind: AnimationKind
  progress: number    // 0..1
  startedAt: number   // wall-clock ms when started; useful for debugging
  // For desk_to_room / room_to_desk / door_to_desk / desk_to_door, the
  // target screen position for the walk endpoint that ISN'T the desk.
  targetPosition?: ScreenPoint
}

export type AnimState = Record<string, AnimEntry>

export type StateMap = Record<string, AgentVisualState>

export interface Transition {
  agentId: string
  kind: AnimationKind
  targetPosition?: ScreenPoint
}

export const ANIM_DURATION_MS: Record<AnimationKind, number> = {
  desk_to_break: 1000,
  break_to_desk: 1000,
  fade_in: 500,
  fade_out: 500,
  door_to_desk: 1500,
  desk_to_door: 1500,
  desk_to_room: 1000,
  room_to_desk: 1000,
}

export function detectTransitions(prev: StateMap, curr: StateMap): Transition[] {
  const out: Transition[] = []
  for (const id of Object.keys(curr)) {
    const p = prev[id]
    const c = curr[id]
    if (!p || p === c) continue

    if (c === 'on_break' && (p === 'idle' || p === 'on_call')) {
      out.push({ agentId: id, kind: 'desk_to_break' })
    } else if (p === 'on_break' && (c === 'idle' || c === 'on_call')) {
      out.push({ agentId: id, kind: 'break_to_desk' })
    } else if (p === 'off_shift' && c !== 'off_shift') {
      // Default to fade_in for backwards-compat. The renderer can replace
      // this with door_to_desk by passing an explicit transition.
      out.push({ agentId: id, kind: 'fade_in' })
    } else if (c === 'off_shift' && p !== 'off_shift') {
      out.push({ agentId: id, kind: 'fade_out' })
    }
  }
  return out
}

/**
 * Advance all in-flight animations by dt seconds. Apply skip rule for any new
 * transitions: a new transition for an agent that already has an in-flight
 * animation replaces it (snap to new state).
 *
 * Note: the 3rd and 4th args are optional to keep the simple "advance only"
 * use case readable in tests; in production the renderer always passes them.
 */
export function advanceAnimations(
  state: AnimState,
  dtSeconds: number,
  newTransitions: Transition[] = [],
  nowMs: number = 0,
): AnimState {
  const next: AnimState = { ...state }

  // Advance progress for each existing animation
  for (const id of Object.keys(next)) {
    const entry = next[id]
    const duration = ANIM_DURATION_MS[entry.kind]
    const inc = (dtSeconds * 1000) / duration
    const newProgress = entry.progress + inc
    if (newProgress >= 1) {
      delete next[id]
    } else {
      next[id] = { ...entry, progress: newProgress }
    }
  }

  // Apply new transitions (skip rule: replace any in-flight animation)
  for (const t of newTransitions) {
    next[t.agentId] = {
      kind: t.kind,
      progress: 0,
      startedAt: nowMs,
      targetPosition: t.targetPosition,
    }
  }

  return next
}

import type { AgentVisualState } from '@/lib/animation/agentTimeline'

export type AnimationKind = 'desk_to_break' | 'break_to_desk' | 'fade_in' | 'fade_out'

export interface AnimEntry {
  kind: AnimationKind
  progress: number    // 0..1
  startedAt: number   // wall-clock ms when started; useful for debugging
}

export type AnimState = Record<string, AnimEntry>

export type StateMap = Record<string, AgentVisualState>

export interface Transition {
  agentId: string
  kind: AnimationKind
}

export const ANIM_DURATION_MS: Record<AnimationKind, number> = {
  desk_to_break: 1000,
  break_to_desk: 1000,
  fade_in: 500,
  fade_out: 500,
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
 * Note: the 4th and 5th args are optional to keep the simple "advance only"
 * use case readable in tests; in production the renderer always passes them.
 */
export function advanceAnimations(
  state: AnimState,
  dtSeconds: number,
  durationMs: number,
  newTransitions: Transition[] = [],
  nowMs: number = 0,
): AnimState {
  const next: AnimState = { ...state }

  // Advance progress for each existing animation
  for (const id of Object.keys(next)) {
    const entry = next[id]
    const duration = ANIM_DURATION_MS[entry.kind] ?? durationMs
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
    next[t.agentId] = { kind: t.kind, progress: 0, startedAt: nowMs }
  }

  return next
}

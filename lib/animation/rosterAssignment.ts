// Round 11: roster-driven shift assignment.
//
// The sim kernel converts a roster into a per-interval scheduled-agent count
// (`buildAgentsPerIntervalFromRoster` in lib/kernel/sim.ts), but it never
// associates a specific agent index with a specific shift. The renderer-side
// shift model previously turned that count back into "the first N indices
// are on shift" via a smooth interpolation — which means a 7am shift and a
// 9am shift collapse into the same morning ramp without any link to the
// roster the user actually drew.
//
// This module fills that gap: given a roster + a total agent count, it
// assigns each agent index to a specific shift template, deterministically
// and stably across re-renders. The renderer can then ask "is agent 42
// inside their shift window right now?" and animate door arrivals at the
// actual `startMin` the user dragged on the Gantt — not at the rounded
// 15-minute boundary the smoothed Erlang curve happened to cross.
//
// Pure module. No React, no animations.

import type { RosterShift } from '@/lib/types'

export interface AgentShiftAssignment {
  agentIndex: number
  shiftId: string
  startMin: number
  endMin: number
  /** First scheduled break window for this shift, or null if none. */
  breakStartMin: number | null
  breakEndMin: number | null
}

/**
 * Given a roster and total agent count, deterministically assigns each agent
 * index to a specific shift. Agents are distributed proportionally to each
 * shift's `agentCount`, in agent-index order. The result is stable across
 * re-renders so shift_start animations don't shuffle.
 *
 * Example: roster = [{startMin: 420, agentCount: 50}, {startMin: 540, agentCount: 100}]
 *   Agents 0..49   → shift 0 (arrives at 7:00am)
 *   Agents 50..149 → shift 1 (arrives at 9:00am)
 *
 * If the sum of `agentCount` across shifts doesn't match `totalAgents`
 * (common — the kernel sizes the agent pool from peak-interval staffing,
 * not from the sum of shift sizes), counts are scaled proportionally so
 * the assignment fills exactly `totalAgents` slots.
 */
export function assignAgentsToShifts(
  roster: RosterShift[],
  totalAgents: number,
): Map<number, AgentShiftAssignment> {
  const map = new Map<number, AgentShiftAssignment>()
  if (roster.length === 0 || totalAgents <= 0) return map

  const totalShiftAgents = roster.reduce((s, sh) => s + sh.agentCount, 0)
  const scale = totalShiftAgents > 0 ? totalAgents / totalShiftAgents : 1

  let cursor = 0
  for (const shift of roster) {
    const count = Math.max(0, Math.round(shift.agentCount * scale))
    for (let i = 0; i < count && cursor < totalAgents; i++) {
      map.set(cursor, buildAssignment(cursor, shift))
      cursor++
    }
  }
  // Trailing agents (rounding can leave a few unassigned): give them the
  // last shift so every index has an assignment.
  const lastShift = roster[roster.length - 1]
  while (cursor < totalAgents) {
    map.set(cursor, buildAssignment(cursor, lastShift))
    cursor++
  }
  return map
}

function buildAssignment(agentIndex: number, shift: RosterShift): AgentShiftAssignment {
  const firstBreak = shift.breaks[0]
  return {
    agentIndex,
    shiftId: shift.id,
    startMin: shift.startMin,
    endMin: shift.endMin,
    breakStartMin: firstBreak ? firstBreak.startMin : null,
    breakEndMin: firstBreak ? firstBreak.startMin + firstBreak.durationMin : null,
  }
}

/**
 * Returns true if an agent is currently inside their scheduled shift window
 * (start inclusive, end exclusive).
 */
export function isAgentInShift(
  assignment: AgentShiftAssignment,
  simTimeMin: number,
): boolean {
  return simTimeMin >= assignment.startMin && simTimeMin < assignment.endMin
}

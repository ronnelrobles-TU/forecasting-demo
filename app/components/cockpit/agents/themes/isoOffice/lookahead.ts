// Pre-compute per-agent lookups used by the journey state machine:
//  - breakDurations: for each (agentId, breakStartTimeMin) => duration in sim min
//    (so the renderer can decide coffee-break vs. lunch when on_break begins)
//  - shiftEndTimes: for each agentId => the next shift_end event time in sim min
//
// Both are pure derivations from the raw events list and are memoized in
// IsoRenderer (computed once per events array).

import type { SimEvent } from '@/lib/types'

export interface JourneyLookahead {
  // Map agentId -> sorted ascending list of { startMin, durationMin } for each
  // break that agent takes. Renderer binary-searches to find the active break.
  breaks: Record<string, Array<{ startMin: number; durationMin: number }>>
  // Map agentId -> sorted ascending list of shift_end event times.
  shiftEnds: Record<string, number[]>
}

export function computeJourneyLookahead(events: ReadonlyArray<SimEvent>): JourneyLookahead {
  const breaks: Record<string, Array<{ startMin: number; durationMin: number }>> = {}
  const shiftEnds: Record<string, number[]> = {}

  // Track open breaks per agent so we can pair start/end.
  const openBreaks: Record<string, number[]> = {}

  for (const ev of events) {
    if (!ev.agentId) continue
    if (ev.type === 'agent_break_start') {
      ;(openBreaks[ev.agentId] = openBreaks[ev.agentId] ?? []).push(ev.timeMin)
    } else if (ev.type === 'agent_break_end') {
      const stack = openBreaks[ev.agentId]
      if (stack && stack.length > 0) {
        const startMin = stack.shift() as number
        const durationMin = Math.max(0, ev.timeMin - startMin)
        ;(breaks[ev.agentId] = breaks[ev.agentId] ?? []).push({ startMin, durationMin })
      }
    } else if (ev.type === 'agent_shift_end') {
      ;(shiftEnds[ev.agentId] = shiftEnds[ev.agentId] ?? []).push(ev.timeMin)
    }
  }

  for (const k of Object.keys(breaks)) breaks[k].sort((a, b) => a.startMin - b.startMin)
  for (const k of Object.keys(shiftEnds)) shiftEnds[k].sort((a, b) => a - b)
  return { breaks, shiftEnds }
}

// Find the duration (sim min) of the break covering or starting at simTimeMin
// for this agent, with a small tolerance so a transition detected slightly
// after the start still resolves. Returns undefined if no matching break.
export function breakDurationFor(
  lookahead: JourneyLookahead,
  agentId: string,
  simTimeMin: number,
  toleranceMin = 5,
): number | undefined {
  const list = lookahead.breaks[agentId]
  if (!list || list.length === 0) return undefined
  // Find the break whose startMin is closest to (and at or before) simTimeMin
  // within the tolerance window. We allow ±toleranceMin slack.
  let best: number | undefined
  for (const b of list) {
    if (b.startMin <= simTimeMin + toleranceMin && b.startMin >= simTimeMin - toleranceMin * 4) {
      best = b.durationMin
    }
    if (b.startMin > simTimeMin + toleranceMin) break
  }
  return best
}

// Returns true if this agent has an upcoming shift_end within `withinMin`
// sim minutes of `simTimeMin`. Used to start the desk_to_door walk before
// the actual shift_end fires (so the exit is visible on screen).
export function hasUpcomingShiftEnd(
  lookahead: JourneyLookahead,
  agentId: string,
  simTimeMin: number,
  withinMin: number,
): boolean {
  const list = lookahead.shiftEnds[agentId]
  if (!list || list.length === 0) return false
  for (const t of list) {
    if (t >= simTimeMin && t <= simTimeMin + withinMin) return true
    if (t > simTimeMin + withinMin) return false
  }
  return false
}

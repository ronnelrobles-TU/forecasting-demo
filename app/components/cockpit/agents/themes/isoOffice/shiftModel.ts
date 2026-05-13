// Visible-active-agent decision: given the per-15-min Erlang scheduled
// count and the current sim minute, decide which agents (by index) are
// "on shift" right now, and stagger arrivals/departures by a per-agent
// micro-offset so the morning ramp doesn't bunch up at the 15-minute
// boundary.
//
// Round 5.7: the Erlang count from `perInterval[t].agents` is the
// PRODUCTIVE headcount required (people actively taking calls). Real
// in-office headcount is higher because of shrinkage (training, meetings,
// breaks, etc.). To make the floor look correctly populated at peak, we
// scale the schedule up by `1 / (1 - shrink/100)`, which is the in-office
// target. The activity scatter (gym/training/break/etc.) absorbs the
// extra agents into shrinkage rooms; the rest stay at desks taking calls.
// Above the in-office target there's still room for absentee agents who
// never come in (their desks render with the AbsentMarker).
//
// Pure module. No React, no animations. Used by IsoRenderer to derive
// `isActive` per agent each frame.

import type { IntervalStat, RosterShift } from '@/lib/types'
import { assignAgentsToShifts, isAgentInShift } from '@/lib/animation/rosterAssignment'

// Bucket size of the kernel's `perInterval` array. The kernel produces 48
// entries (24h ÷ 30min). Earlier rounds incorrectly used 15min here, which
// made shiftModel read the wrong bucket, at 5:54am it would index bucket
// 23 (= 11:30am peak) instead of bucket 11 (= 5:30am low), so the whole
// shift roster appeared "in office" before the morning had even started.
// Both Office and Dots themes consume the result, so the bug surfaced as
// hundreds of visible agents at 5:54am when only ~22 were actually needed.
const INTERVAL_MIN = 30

// Minutes either side of an interval boundary across which agents trickle
// in or out, instead of all flipping at once.
export const STAGGER_WINDOW_MIN = 12

// Deterministic per-agent micro-offset in [-STAGGER_WINDOW_MIN/2, +STAGGER_WINDOW_MIN/2).
// Hashes the agent index so the same agent always trickles in at the
// same relative moment within an interval (stable scrubbing behaviour).
export function staggerOffset(agentIdx: number): number {
  // Simple integer hash, Knuth's multiplicative.
  const h = ((agentIdx * 2654435761) >>> 0) / 4294967296 // [0, 1)
  return (h - 0.5) * STAGGER_WINDOW_MIN
}

// Convert an Erlang (productive) headcount into the in-office headcount
// by dividing out shrinkage. `shrinkPct` is in 0..100; clamped so we
// don't divide by zero or produce negatives.
export function inOfficeFromErlang(erlangCount: number, shrinkPct: number | undefined): number {
  const s = Math.max(0, Math.min(95, shrinkPct ?? 0)) // cap at 95% so denom stays sane
  return erlangCount / (1 - s / 100)
}

// Returns the Erlang-scheduled count for the interval containing simTimeMin.
// Falls back to 0 when perInterval is missing (stays empty rather than
// pretending all agents are working).
export function scheduledCountAt(perInterval: ReadonlyArray<IntervalStat> | undefined, simTimeMin: number): number {
  if (!perInterval || perInterval.length === 0) return 0
  const idx = Math.max(0, Math.min(perInterval.length - 1, Math.floor(simTimeMin / INTERVAL_MIN)))
  return Math.max(0, Math.floor(perInterval[idx]?.agents ?? 0))
}

// Smoothly-ramped scheduled count: linearly interpolates between the prior
// interval's scheduled count and the current one based on how far into the
// interval we are. This is the "background" target, the per-agent stagger
// is added on top to decide individual activations.
//
// `shrinkPct` (Round 5.7): when provided, scales the curve up to the
// in-office target instead of the productive Erlang target.
export function smoothScheduledAt(
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  simTimeMin: number,
  shrinkPct?: number,
): number {
  if (!perInterval || perInterval.length === 0) return 0
  const idx = Math.max(0, Math.min(perInterval.length - 1, Math.floor(simTimeMin / INTERVAL_MIN)))
  const prev = idx > 0 ? perInterval[idx - 1].agents : perInterval[idx].agents
  const curr = perInterval[idx].agents
  const intoInterval = simTimeMin - idx * INTERVAL_MIN
  const t = Math.max(0, Math.min(1, intoInterval / INTERVAL_MIN))
  const erlang = prev + (curr - prev) * t
  return inOfficeFromErlang(erlang, shrinkPct)
}

// Decide whether agent index `i` is currently active (on shift) given
// the smooth scheduled count + per-agent stagger. The trick: each agent
// has its own micro-offset that shifts them slightly earlier or later
// than the bulk count. So if the smooth target is 47, agents whose
// adjusted position is ≤ 47 are active; the others are off.
export function isAgentActive(
  agentIdx: number,
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  simTimeMin: number,
  shrinkPct?: number,
): boolean {
  if (!perInterval || perInterval.length === 0) {
    // No schedule data, assume everyone idle (preserve old behaviour).
    return true
  }
  // Use the *forward-looking* schedule shifted by the per-agent stagger.
  // Negative stagger -> agent arrives slightly EARLIER (counts as active
  // sooner); positive stagger -> arrives later. Same logic on departure.
  const adjustedTime = simTimeMin - staggerOffset(agentIdx)
  const target = smoothScheduledAt(perInterval, adjustedTime, shrinkPct)
  // Agents are sorted by index; the first `target` are active.
  return agentIdx < Math.round(target)
}

// Return the set of active agent indices at this moment. Useful for tests
// and for the renderer to enumerate transitions in O(N).
export function activeAgentIndices(
  agentCount: number,
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  simTimeMin: number,
  shrinkPct?: number,
): boolean[] {
  const out = new Array<boolean>(agentCount)
  for (let i = 0; i < agentCount; i++) out[i] = isAgentActive(i, perInterval, simTimeMin, shrinkPct)
  return out
}

// Peak in-office count across the whole day, used to decide how many of
// the top-indexed agents are "today's absentees" (never on shift). Returns
// 0 when perInterval is missing.
export function peakInOfficeCount(
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  shrinkPct?: number,
): number {
  if (!perInterval || perInterval.length === 0) return 0
  let peak = 0
  for (const s of perInterval) {
    const v = inOfficeFromErlang(s?.agents ?? 0, shrinkPct)
    if (v > peak) peak = v
  }
  return Math.round(peak)
}

// Round 7.1: three-tier office allocation.
// Workforce-management math ties together three counts at any given moment:
//   - PRODUCTIVE   = Erlang-required headcount at desks taking calls.
//                    This is what `perInterval[t].agents` represents and
//                    what KPI strips show as "Active Agents".
//   - IN_OFFICE    = productive / (1 - shrink/100). Includes both
//                    productive agents AND shrinkage agents (training,
//                    gym, break, etc.), i.e. everyone physically in.
//   - SHRINKAGE_IN_OFFICE = inOffice - productive.
//
// The activity scheduler used to scatter ~30% of the productive agents
// into non-desk activities, double-counting shrinkage and producing the
// "Active Agents 249 but only 177 at desks" mismatch. Now the renderer
// partitions agents into productive vs shrinkage by index, so productive
// agents stay at desks (their state comes from the sim) and shrinkage
// agents are routed into the non-desk rooms.
export interface OfficeAllocation {
  productive: number          // at desks (productive headcount per Erlang)
  shrinkageInOffice: number   // in non-desk activities
  inOffice: number            // productive + shrinkageInOffice
}

// Smooth office allocation at the current sim time, accounting for the
// Erlang-required productive headcount and the shrinkage uplift.
//
// `productive` rides the un-shrunk Erlang curve (so it interpolates the
// same way `scheduledCountAt`/`smoothScheduledAt(...without shrink)` do),
// and `inOffice` is `productive / (1 - shrink/100)`. The difference is
// the shrinkage population in the office at this instant.
export function smoothOfficeAllocation(
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  simTimeMin: number,
  shrinkPct?: number,
): OfficeAllocation {
  if (!perInterval || perInterval.length === 0) {
    return { productive: 0, shrinkageInOffice: 0, inOffice: 0 }
  }
  const productiveSmooth = smoothScheduledAt(perInterval, simTimeMin, 0)
  const inOfficeSmooth = inOfficeFromErlang(productiveSmooth, shrinkPct)
  const productive = Math.round(productiveSmooth)
  const inOffice = Math.round(inOfficeSmooth)
  return {
    productive,
    shrinkageInOffice: Math.max(0, inOffice - productive),
    inOffice,
  }
}

// Three-tier per-agent allocation by agent index.
//
//   indices 0 .. productive-1                       PRODUCTIVE  (at desks)
//   indices productive .. inOffice-1                SHRINKAGE   (non-desk)
//   indices inOffice .. (peakAgents-1)              OFF SHIFT / ABSENT
//
// Per-agent stagger is applied so the morning ramp doesn't bunch at the
// 15-min boundary. An agent with negative stagger arrives slightly
// earlier than the bulk count; positive stagger arrives later. The
// productive/shrinkage split itself is also staggered so transitions
// are smooth (an agent doesn't pop from "at desk" to "in gym", they
// trickle into the shrinkage band one at a time).
export function activeAgentIndicesAllocated(
  agentCount: number,
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  simTimeMin: number,
  shrinkPct?: number,
): { productive: Set<number>; shrinkage: Set<number> } {
  const productive = new Set<number>()
  const shrinkage = new Set<number>()
  if (!perInterval || perInterval.length === 0) {
    // No schedule data, preserve legacy "everyone idle at desks"
    // behaviour. Productive set covers all agents; shrinkage is empty.
    for (let i = 0; i < agentCount; i++) productive.add(i)
    return { productive, shrinkage }
  }
  for (let i = 0; i < agentCount; i++) {
    const adjustedTime = simTimeMin - staggerOffset(i)
    const productiveSmooth = smoothScheduledAt(perInterval, adjustedTime, 0)
    const inOfficeSmooth = inOfficeFromErlang(productiveSmooth, shrinkPct)
    const productiveTarget = Math.round(productiveSmooth)
    const inOfficeTarget = Math.round(inOfficeSmooth)
    if (i < productiveTarget) {
      productive.add(i)
    } else if (i < inOfficeTarget) {
      shrinkage.add(i)
    }
    // else: off-shift / absent, in neither set.
  }
  return { productive, shrinkage }
}

// Round 11: roster-driven three-tier allocation.
//
// When the user has authored a roster, the per-agent shift assignment is
// derived directly from the roster (see `assignAgentsToShifts`). At each
// sim minute, agents whose assigned shift contains `simTimeMin` are "in
// the office"; the rest are off-shift. Among the in-office population,
// the first `(1 - shrink/100)` fraction are productive (at desks); the
// remainder are routed to non-desk shrinkage activities.
//
// This bypasses the smooth-Erlang-curve interpolation used by
// `activeAgentIndicesAllocated` and instead snaps each agent to the
// `startMin`/`endMin` the user dragged on the Gantt, so a 7am shift
// causes those agents to walk in through the door at exactly 7am.
//
// Returns an empty allocation when no agents are assigned to the active
// minute (e.g., before the day's first shift starts). Falls back to the
// legacy interval-curve behaviour when `roster` is empty so the existing
// no-roster path keeps working.
export function activeAgentIndicesFromRoster(
  roster: RosterShift[],
  totalAgents: number,
  simTimeMin: number,
  shrinkPct?: number,
): { productive: Set<number>; shrinkage: Set<number> } {
  const productive = new Set<number>()
  const shrinkage = new Set<number>()
  if (roster.length === 0 || totalAgents <= 0) return { productive, shrinkage }

  const assignments = assignAgentsToShifts(roster, totalAgents)
  const inShift: number[] = []
  for (let i = 0; i < totalAgents; i++) {
    const a = assignments.get(i)
    if (a && isAgentInShift(a, simTimeMin)) inShift.push(i)
  }
  if (inShift.length === 0) return { productive, shrinkage }

  // Productive vs shrinkage split among the in-office population. Same
  // shrinkage clamp as `inOfficeFromErlang` so we can't divide by zero
  // or produce weird negatives.
  const s = Math.max(0, Math.min(95, shrinkPct ?? 0))
  const productiveCount = Math.round(inShift.length * (1 - s / 100))
  for (let k = 0; k < inShift.length; k++) {
    if (k < productiveCount) productive.add(inShift[k])
    else shrinkage.add(inShift[k])
  }
  return { productive, shrinkage }
}

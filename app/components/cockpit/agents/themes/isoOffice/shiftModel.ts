// Visible-active-agent decision: given the per-15-min Erlang scheduled
// count and the current sim minute, decide which agents (by index) are
// "on shift" right now — and stagger arrivals/departures by a per-agent
// micro-offset so the morning ramp doesn't bunch up at the 15-minute
// boundary.
//
// Pure module. No React, no animations. Used by IsoRenderer to derive
// `isActive` per agent each frame.

import type { IntervalStat } from '@/lib/types'

const INTERVAL_MIN = 15

// Minutes either side of an interval boundary across which agents trickle
// in or out, instead of all flipping at once.
export const STAGGER_WINDOW_MIN = 12

// Deterministic per-agent micro-offset in [-STAGGER_WINDOW_MIN/2, +STAGGER_WINDOW_MIN/2).
// Hashes the agent index so the same agent always trickles in at the
// same relative moment within an interval (stable scrubbing behaviour).
export function staggerOffset(agentIdx: number): number {
  // Simple integer hash — Knuth's multiplicative.
  const h = ((agentIdx * 2654435761) >>> 0) / 4294967296 // [0, 1)
  return (h - 0.5) * STAGGER_WINDOW_MIN
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
// interval we are. This is the "background" target — the per-agent stagger
// is added on top to decide individual activations.
export function smoothScheduledAt(perInterval: ReadonlyArray<IntervalStat> | undefined, simTimeMin: number): number {
  if (!perInterval || perInterval.length === 0) return 0
  const idx = Math.max(0, Math.min(perInterval.length - 1, Math.floor(simTimeMin / INTERVAL_MIN)))
  const prev = idx > 0 ? perInterval[idx - 1].agents : perInterval[idx].agents
  const curr = perInterval[idx].agents
  const intoInterval = simTimeMin - idx * INTERVAL_MIN
  const t = Math.max(0, Math.min(1, intoInterval / INTERVAL_MIN))
  return prev + (curr - prev) * t
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
): boolean {
  if (!perInterval || perInterval.length === 0) {
    // No schedule data — assume everyone idle (preserve old behaviour).
    return true
  }
  // Use the *forward-looking* schedule shifted by the per-agent stagger.
  // Negative stagger -> agent arrives slightly EARLIER (counts as active
  // sooner); positive stagger -> arrives later. Same logic on departure.
  const adjustedTime = simTimeMin - staggerOffset(agentIdx)
  const target = smoothScheduledAt(perInterval, adjustedTime)
  // Agents are sorted by index; the first `target` are active.
  return agentIdx < Math.round(target)
}

// Return the set of active agent indices at this moment. Useful for tests
// and for the renderer to enumerate transitions in O(N).
export function activeAgentIndices(
  agentCount: number,
  perInterval: ReadonlyArray<IntervalStat> | undefined,
  simTimeMin: number,
): boolean[] {
  const out = new Array<boolean>(agentCount)
  for (let i = 0; i < agentCount; i++) out[i] = isAgentActive(i, perInterval, simTimeMin)
  return out
}

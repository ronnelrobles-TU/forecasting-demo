import type { Scenario, RosterShift } from '@/lib/types'
import { runDay } from './sim'
import { buildDefaultRoster, totalAgentHours } from './roster'
import { requiredAgents } from '@/lib/erlang'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { makeRng, type Rng } from '@/lib/rng'

export interface OptimizeOptions {
  iterations?: number              // default 300
  budgetAgentHours: number         // hard-ish cap; over-budget is heavily penalized
  optSeed?: number                 // RNG seed for the SA moves (separate from sim seed)
  onIter?: (iter: number, best: RosterShift[], bestScore: number) => void
  emitEvery?: number               // call onIter every N iterations (default 20)
}

const T0 = 0.10           // initial temperature (score units; SL is in [0,1])
const COOLING = 0.97
const MIN_SHIFT_MIN = 240    // 4h
const MAX_SHIFT_MIN = 600    // 10h
const STEP_MIN = 30          // snap moves to 30 min

/** Score a roster: SL ∈ [0,1] minus a budget-overrun penalty. Higher is better. */
export function scoreRoster(scenario: Scenario, roster: RosterShift[], budgetAgentHours: number): number {
  const result = runDay({ ...scenario, roster }, { collectEvents: false })
  const sl = result.totals.sl
  const hours = totalAgentHours(roster)
  const overshoot = Math.max(0, hours - budgetAgentHours)
  const penalty = overshoot / Math.max(1, budgetAgentHours)   // 1.0 penalty for 100% over budget
  return sl - 0.2 * penalty
}

function clone(roster: RosterShift[]): RosterShift[] {
  return roster.map(s => ({ ...s, breaks: s.breaks.map(b => ({ ...b })) }))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function snap(min: number): number {
  return Math.round(min / STEP_MIN) * STEP_MIN
}

/** Apply a random local move to one shift, respecting HOOP and shift-length limits. */
function neighbor(roster: RosterShift[], hoopStart: number, hoopEnd: number, rng: Rng): RosterShift[] {
  if (roster.length === 0) return roster
  const next = clone(roster)
  const idx = Math.floor(rng() * next.length)
  const s = next[idx]
  const move = Math.floor(rng() * 4)   // 0=move start, 1=move end, 2=shift left, 3=shift right
  const delta = (Math.floor(rng() * 4) - 2) * STEP_MIN || STEP_MIN
  switch (move) {
    case 0: {
      const newStart = clamp(snap(s.startMin + delta), hoopStart, s.endMin - MIN_SHIFT_MIN)
      const len = s.endMin - newStart
      if (len >= MIN_SHIFT_MIN && len <= MAX_SHIFT_MIN) s.startMin = newStart
      break
    }
    case 1: {
      const newEnd = clamp(snap(s.endMin + delta), s.startMin + MIN_SHIFT_MIN, hoopEnd)
      const len = newEnd - s.startMin
      if (len >= MIN_SHIFT_MIN && len <= MAX_SHIFT_MIN) s.endMin = newEnd
      break
    }
    case 2:
    case 3: {
      const len = s.endMin - s.startMin
      const dir = move === 2 ? -1 : 1
      const newStart = clamp(snap(s.startMin + dir * STEP_MIN), hoopStart, hoopEnd - len)
      s.startMin = newStart
      s.endMin = newStart + len
      break
    }
  }
  return next
}

export function optimizeRoster(scenario: Scenario, opts: OptimizeOptions): RosterShift[] {
  const iterations = opts.iterations ?? 300
  const emitEvery = opts.emitEvery ?? 20
  const optSeed = opts.optSeed ?? 1
  const rng = makeRng(optSeed)

  // Starting roster: existing if present and non-empty, otherwise built from peak Erlang C
  let current: RosterShift[]
  if (scenario.roster && scenario.roster.length > 0) {
    current = clone(scenario.roster)
  } else {
    const curveAfterHoop = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curveAfterHoop, scenario.dailyTotal)
    const peakCalls = Math.max(0.001, ...calls)
    const { N } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    current = buildDefaultRoster(scenario.hoop, scheduled)
  }

  let currentScore = scoreRoster(scenario, current, opts.budgetAgentHours)
  let best = clone(current)
  let bestScore = currentScore

  let T = T0
  for (let i = 0; i < iterations; i++) {
    const candidate = neighbor(current, scenario.hoop.startMin, scenario.hoop.endMin, rng)
    const candidateScore = scoreRoster(scenario, candidate, opts.budgetAgentHours)
    const delta = candidateScore - currentScore
    if (delta > 0 || Math.exp(delta / T) > rng()) {
      current = candidate
      currentScore = candidateScore
      if (candidateScore > bestScore) {
        best = clone(candidate)
        bestScore = candidateScore
      }
    }
    if ((i + 1) % emitEvery === 0) opts.onIter?.(i + 1, best, bestScore)
    T *= COOLING
  }
  // Emit final state only if not already emitted by the loop (i.e. iterations % emitEvery !== 0)
  if (iterations % emitEvery !== 0) opts.onIter?.(iterations, best, bestScore)
  return best
}

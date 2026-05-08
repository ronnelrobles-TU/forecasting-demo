import type { HoopWindow, RosterShift } from '@/lib/types'

const DEFAULT_NUM_SHIFTS = 4

/** Build a starter roster of evenly-spaced shifts covering the HOOP, with agentCount split across them. */
export function buildDefaultRoster(hoop: HoopWindow, peakAgents: number): RosterShift[] {
  const hoopMin = Math.max(0, hoop.endMin - hoop.startMin)
  if (hoopMin <= 0) return []

  // For tiny HOOPs (<2h) just give one shift covering the whole window.
  if (hoopMin < 120) {
    return [{
      id: 's0',
      startMin: hoop.startMin,
      endMin: hoop.endMin,
      agentCount: peakAgents,
      breaks: [],
    }]
  }

  // Otherwise: 4 shifts staggered to give double-coverage in the middle of the day.
  // Each shift is ~hoopMin/2 long; starts are evenly spaced.
  const numShifts = DEFAULT_NUM_SHIFTS
  const shiftLen = Math.max(60, Math.round(hoopMin / 2 / 30) * 30)   // half-HOOP, snapped to 30 min
  const stride = Math.max(30, Math.round((hoopMin - shiftLen) / Math.max(1, numShifts - 1) / 30) * 30)
  const perShiftAgents = Math.max(1, Math.ceil(peakAgents / 2))     // each shift covers ~half peak

  const out: RosterShift[] = []
  for (let i = 0; i < numShifts; i++) {
    const start = hoop.startMin + i * stride
    const end = Math.min(hoop.endMin, start + shiftLen)
    out.push({
      id: `s${i}`,
      startMin: start,
      endMin: end,
      agentCount: perShiftAgents,
      breaks: [],
    })
  }
  // Force first to start at HOOP start and last to end at HOOP end
  if (out.length > 0) {
    out[0].startMin = hoop.startMin
    out[out.length - 1].endMin = hoop.endMin
  }
  return out
}

/** Sum of agentCount for shifts active at the given minute (start inclusive, end exclusive). */
export function agentsActiveAt(roster: RosterShift[], minute: number): number {
  let total = 0
  for (const s of roster) {
    if (minute >= s.startMin && minute < s.endMin) total += s.agentCount
  }
  return total
}

/** Total scheduled agent-hours across the roster. Used by the optimizer for cost penalty. */
export function totalAgentHours(roster: RosterShift[]): number {
  let total = 0
  for (const s of roster) {
    total += ((s.endMin - s.startMin) / 60) * s.agentCount
  }
  return total
}

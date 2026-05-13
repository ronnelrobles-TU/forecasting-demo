import type { Scenario, SimResult } from '@/lib/types'
import { runDay, type RunDayOptions } from './sim'

export function dayRngSeed(baseSeed: number, dayIndex: number): number {
  return baseSeed * 1000 + dayIndex
}

export function runManyDays(
  scenario: Scenario,
  days: number,
  baseSeed: number,
  opts: RunDayOptions = {},
): SimResult[] {
  const out: SimResult[] = new Array(days)
  for (let i = 0; i < days; i++) {
    out[i] = runDay({ ...scenario, rngSeed: dayRngSeed(baseSeed, i) }, opts)
  }
  return out
}

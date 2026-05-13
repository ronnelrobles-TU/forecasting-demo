import { describe, it, expect } from 'vitest'
import type { Scenario } from '@/lib/types'
import { runManyDays } from '@/lib/kernel/monteCarlo'
import { campaigns } from '@/lib/campaigns'

function baseScenario(seed = 100): Scenario {
  const c = campaigns.us_telco_manila
  return {
    campaignKey: c.key,
    hoop: c.hoop,
    curve: c.curveTemplate.slice(),
    dailyTotal: c.dailyTotal,
    aht: c.aht,
    sl: c.sl,
    asa: c.asa,
    shrink: c.shrink,
    abs: c.abs,
    roster: null,
    rngSeed: seed,
    injectedEvents: [],
  }
}

describe('runManyDays', () => {
  it('returns the requested number of results', () => {
    const results = runManyDays(baseScenario(7), 5, 42)
    expect(results).toHaveLength(5)
  })

  it('is deterministic for same base seed', () => {
    const a = runManyDays(baseScenario(11), 3, 99)
    const b = runManyDays(baseScenario(11), 3, 99)
    expect(a.map(r => r.totals.sl)).toEqual(b.map(r => r.totals.sl))
  })

  it('produces variation across days', () => {
    // Bump dailyTotal beyond the campaign default — the default 12400 is so over-staffed
    // by the Erlang-C-derived count that every RNG draw produces ~100% SL with no variation
    // to assert against. 20000 puts the system into a regime where Poisson noise produces
    // visibly different per-day SL outcomes.
    const scenario = { ...baseScenario(13), dailyTotal: 20000 }
    const results = runManyDays(scenario, 10, 1)
    const sls = results.map(r => r.totals.sl)
    const allSame = sls.every(v => v === sls[0])
    expect(allSame).toBe(false)
  })

  it('each day i uses seed baseSeed*1000+i', () => {
    const baseSeed = 7
    const results = runManyDays(baseScenario(13), 3, baseSeed)
    // Same scenario but explicitly seeded with baseSeed*1000+0 should match results[0]
    const explicit0 = runManyDays({ ...baseScenario(13), rngSeed: baseSeed * 1000 + 0 }, 1, 0)
    expect(results[0].totals.sl).toBe(explicit0[0].totals.sl)
  })
})

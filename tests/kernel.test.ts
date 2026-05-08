import { describe, it, expect } from 'vitest'
import type { Scenario } from '@/lib/types'
import { runDay } from '@/lib/kernel'
import { campaigns } from '@/lib/campaigns'

function baseScenario(seed = 42): Scenario {
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
  }
}

describe('runDay', () => {
  it('produces 48 interval stats', () => {
    const result = runDay(baseScenario())
    expect(result.perInterval).toHaveLength(48)
  })

  it('is deterministic for the same seed', () => {
    const a = runDay(baseScenario(7))
    const b = runDay(baseScenario(7))
    expect(a.totals.sl).toBe(b.totals.sl)
    expect(a.events.length).toBe(b.events.length)
  })

  it('produces different results for different seeds', () => {
    const a = runDay(baseScenario(1))
    const b = runDay(baseScenario(2))
    expect(a.events.length).not.toBe(b.events.length)
  })

  it('returns SL between 0 and 1 for the totals', () => {
    const result = runDay(baseScenario())
    expect(result.totals.sl).toBeGreaterThanOrEqual(0)
    expect(result.totals.sl).toBeLessThanOrEqual(1)
  })

  it('emits call_arrive events only inside HOOP', () => {
    const sc = baseScenario()
    sc.hoop = { startMin: 600, endMin: 720 }  // 10:00–12:00 only
    const result = runDay(sc)
    const arrivals = result.events.filter(e => e.type === 'call_arrive')
    expect(arrivals.length).toBeGreaterThan(0)
    for (const e of arrivals) {
      expect(e.timeMin).toBeGreaterThanOrEqual(600)
      expect(e.timeMin).toBeLessThan(720)
    }
  })
})

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
    injectedEvents: [],
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

describe('runDay v2 — abandons', () => {
  it('produces some abandons under heavy load', () => {
    const sc = baseScenario(7)
    sc.dailyTotal = 50000   // overload
    const result = runDay(sc)
    expect(result.totals.abandons).toBeGreaterThan(0)
  })

  it('produces zero abandons when overstaffed', () => {
    const sc = baseScenario(7)
    sc.dailyTotal = 200    // tiny load
    const result = runDay(sc)
    expect(result.totals.abandons).toBe(0)
  })
})

describe('runDay v2 — breaks', () => {
  it('emits agent_break_start and agent_break_end events', () => {
    const result = runDay(baseScenario(11))
    const starts = result.events.filter(e => e.type === 'agent_break_start')
    const ends = result.events.filter(e => e.type === 'agent_break_end')
    expect(starts.length).toBeGreaterThan(0)
    expect(starts.length).toBe(ends.length)
  })
})

describe('runDay v2 — injection', () => {
  it('volume_surge injection raises abandons', () => {
    const baseline = runDay(baseScenario(13))
    const surged = runDay({
      ...baseScenario(13),
      injectedEvents: [
        { type: 'volume_surge', fireAtMin: 600, durationMin: 120, magnitude: 0.5 },
      ],
    })
    expect(surged.totals.abandons).toBeGreaterThanOrEqual(baseline.totals.abandons)
  })

  it('staff_drop injection emits agent_shift_end events at fireAtMin', () => {
    const result = runDay({
      ...baseScenario(17),
      injectedEvents: [
        { type: 'staff_drop', fireAtMin: 700, magnitude: 0.25 },
      ],
    })
    const ends = result.events.filter(e => e.type === 'agent_shift_end' && e.timeMin >= 700 && e.timeMin <= 701)
    expect(ends.length).toBeGreaterThan(0)
  })

  it('flash_absent emits agent_shift_end events exactly at fireAtMin', () => {
    const result = runDay({
      ...baseScenario(19),
      injectedEvents: [
        { type: 'flash_absent', fireAtMin: 750, magnitude: 10 },
      ],
    })
    const ends = result.events.filter(e => e.type === 'agent_shift_end' && e.timeMin === 750)
    expect(ends.length).toBeGreaterThanOrEqual(10)
  })
})

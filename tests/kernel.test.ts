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
    sc.hoop = { startMin: 600, endMin: 720 }  // 10:00-12:00 only
    const result = runDay(sc)
    const arrivals = result.events.filter(e => e.type === 'call_arrive')
    expect(arrivals.length).toBeGreaterThan(0)
    for (const e of arrivals) {
      expect(e.timeMin).toBeGreaterThanOrEqual(600)
      expect(e.timeMin).toBeLessThan(720)
    }
  })
})

describe('runDay v2, abandons', () => {
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

describe('runDay v2, breaks', () => {
  it('emits agent_break_start and agent_break_end events', () => {
    const result = runDay(baseScenario(11))
    const starts = result.events.filter(e => e.type === 'agent_break_start')
    const ends = result.events.filter(e => e.type === 'agent_break_end')
    expect(starts.length).toBeGreaterThan(0)
    expect(starts.length).toBe(ends.length)
  })
})

describe('runDay v2, injection', () => {
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

describe('runDay v3, roster-driven staffing', () => {
  it('uses roster agentCount per interval when roster is provided', () => {
    const sc = baseScenario(31)
    sc.roster = [
      // Two shifts: 06-14 (24 agents), 12-22 (32 agents)
      { id: 's1', startMin: 360,  endMin: 840,  agentCount: 24, breaks: [] },
      { id: 's2', startMin: 720,  endMin: 1320, agentCount: 32, breaks: [] },
    ]
    const result = runDay(sc)
    // Interval 12 = 06:00 (06:00 starts at min 360 = idx 12). Should have 24 agents.
    expect(result.perInterval[12].agents).toBeGreaterThanOrEqual(20)
    expect(result.perInterval[12].agents).toBeLessThanOrEqual(28)
    // Interval 24 = 12:00 (both shifts active). Should have ~56.
    expect(result.perInterval[24].agents).toBeGreaterThanOrEqual(50)
    expect(result.perInterval[24].agents).toBeLessThanOrEqual(60)
    // Interval 0 = 00:00 (neither active). Should have 0.
    expect(result.perInterval[0].agents).toBe(0)
  })

  it('falls back to Erlang C derivation when roster is null', () => {
    const sc = baseScenario(31)
    sc.roster = null
    const result = runDay(sc)
    // Phase 1-3 behavior: peak interval has positive agents.
    const maxAgents = Math.max(...result.perInterval.map(s => s.agents))
    expect(maxAgents).toBeGreaterThan(0)
  })

  it('roster with empty array means zero coverage', () => {
    const sc = baseScenario(31)
    sc.dailyTotal = 200
    sc.roster = []
    const result = runDay(sc)
    expect(Math.max(...result.perInterval.map(s => s.agents))).toBe(0)
  })
})

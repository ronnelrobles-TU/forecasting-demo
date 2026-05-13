import { describe, it, expect } from 'vitest'
import type { Scenario, RosterShift } from '@/lib/types'
import { optimizeRoster, scoreRoster } from '@/lib/kernel/optimizer'
import { campaigns } from '@/lib/campaigns'

function baseScenario(seed = 200): Scenario {
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

describe('scoreRoster', () => {
  it('higher SL → higher score', () => {
    const sc = baseScenario()
    const sparse: RosterShift[] = [{ id: 's1', startMin: 480, endMin: 1080, agentCount: 5, breaks: [] }]
    const heavy: RosterShift[] = [{ id: 's1', startMin: 0,   endMin: 1440, agentCount: 200, breaks: [] }]
    expect(scoreRoster(sc, heavy, 1000)).toBeGreaterThan(scoreRoster(sc, sparse, 1000))
  })

  it('penalizes over-budget rosters', () => {
    const sc = baseScenario()
    const fitted: RosterShift[] = [{ id: 's1', startMin: 0, endMin: 1440, agentCount: 100, breaks: [] }]
    const bloated: RosterShift[] = [{ id: 's1', startMin: 0, endMin: 1440, agentCount: 500, breaks: [] }]
    // Both should hit ~100% SL but bloated busts the budget. Score should reflect that.
    const s1 = scoreRoster(sc, fitted, 100 * 24)     // budget = 100 agents × 24h
    const s2 = scoreRoster(sc, bloated, 100 * 24)
    expect(s1).toBeGreaterThan(s2)
  })
})

describe('optimizeRoster', () => {
  it('returns a valid roster with shifts inside HOOP', () => {
    const sc = baseScenario()
    sc.hoop = { startMin: 480, endMin: 1080 }   // 08:00-18:00
    const result = optimizeRoster(sc, { iterations: 50, budgetAgentHours: 1000 })
    expect(result.length).toBeGreaterThan(0)
    for (const s of result) {
      expect(s.startMin).toBeGreaterThanOrEqual(480)
      expect(s.endMin).toBeLessThanOrEqual(1080)
      expect(s.endMin - s.startMin).toBeGreaterThanOrEqual(60)   // min 1h
    }
  })

  it('streams best-so-far via onIter callback', () => {
    const sc = baseScenario()
    let lastIter = -1
    let calls = 0
    optimizeRoster(sc, {
      iterations: 100,
      budgetAgentHours: 1000,
      onIter: (iter, best, score) => {
        expect(iter).toBeGreaterThan(lastIter)
        expect(best.length).toBeGreaterThan(0)
        expect(typeof score).toBe('number')
        lastIter = iter
        calls++
      },
    })
    expect(calls).toBeGreaterThan(0)
  })

  it('is deterministic for same seed', () => {
    const sc1 = baseScenario(99)
    const sc2 = baseScenario(99)
    const r1 = optimizeRoster(sc1, { iterations: 30, budgetAgentHours: 1000, optSeed: 7 })
    const r2 = optimizeRoster(sc2, { iterations: 30, budgetAgentHours: 1000, optSeed: 7 })
    expect(r1.map(s => `${s.startMin}-${s.endMin}-${s.agentCount}`)).toEqual(
      r2.map(s => `${s.startMin}-${s.endMin}-${s.agentCount}`),
    )
  })
})

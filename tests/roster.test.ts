import { describe, it, expect } from 'vitest'
import type { RosterShift } from '@/lib/types'
import { buildDefaultRoster, agentsActiveAt, totalAgentHours } from '@/lib/kernel/roster'
import { campaigns } from '@/lib/campaigns'

describe('buildDefaultRoster', () => {
  it('returns 4 evenly-spaced shifts covering the HOOP', () => {
    const c = campaigns.au_retail_cebu  // HOOP 360–1320 (06:00–22:00, 16h)
    const peakAgents = 80
    const r = buildDefaultRoster(c.hoop, peakAgents)
    expect(r).toHaveLength(4)
    // First starts at HOOP start; last ends at HOOP end (within tolerance)
    expect(r[0].startMin).toBe(360)
    expect(r[r.length - 1].endMin).toBe(1320)
    // Total agentCount across shifts >= peakAgents (each shift covers part of peak)
    const totalAgents = r.reduce((s, x) => s + x.agentCount, 0)
    expect(totalAgents).toBeGreaterThanOrEqual(peakAgents)
  })

  it('handles 24/7 HOOP', () => {
    const r = buildDefaultRoster({ startMin: 0, endMin: 1440 }, 100)
    expect(r).toHaveLength(4)
    expect(r[0].startMin).toBe(0)
    expect(r[r.length - 1].endMin).toBe(1440)
  })

  it('handles tiny HOOP by clamping shift length to fit', () => {
    const r = buildDefaultRoster({ startMin: 600, endMin: 720 }, 10)  // 10:00–12:00 (2h)
    expect(r.length).toBeGreaterThanOrEqual(1)
    for (const s of r) {
      expect(s.startMin).toBeGreaterThanOrEqual(600)
      expect(s.endMin).toBeLessThanOrEqual(720)
    }
  })
})

describe('agentsActiveAt', () => {
  const roster: RosterShift[] = [
    { id: 's1', startMin: 480, endMin: 1020, agentCount: 20, breaks: [] },  // 08:00–17:00
    { id: 's2', startMin: 720, endMin: 1260, agentCount: 30, breaks: [] },  // 12:00–21:00
  ]

  it('sums agentCount for shifts active at the given minute', () => {
    expect(agentsActiveAt(roster, 480)).toBe(20)        // only s1
    expect(agentsActiveAt(roster, 800)).toBe(50)        // both
    expect(agentsActiveAt(roster, 1100)).toBe(30)       // only s2
    expect(agentsActiveAt(roster, 1300)).toBe(0)        // neither
    expect(agentsActiveAt(roster, 100)).toBe(0)
  })

  it('start minute is inclusive, end minute is exclusive', () => {
    expect(agentsActiveAt(roster, 1019)).toBe(50)
    expect(agentsActiveAt(roster, 1020)).toBe(30)
  })
})

describe('totalAgentHours', () => {
  it('sums (endMin - startMin) / 60 × agentCount across the roster', () => {
    const roster: RosterShift[] = [
      { id: 's1', startMin: 480, endMin: 1020, agentCount: 20, breaks: [] },  // 9h × 20 = 180
      { id: 's2', startMin: 720, endMin: 1260, agentCount: 30, breaks: [] },  // 9h × 30 = 270
    ]
    expect(totalAgentHours(roster)).toBeCloseTo(450)
  })

  it('returns 0 for empty roster', () => {
    expect(totalAgentHours([])).toBe(0)
  })
})

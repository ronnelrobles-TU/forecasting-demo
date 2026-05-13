import { describe, it, expect } from 'vitest'
import type { RosterShift } from '@/lib/types'
import {
  assignAgentsToShifts,
  isAgentInShift,
} from '@/lib/animation/rosterAssignment'
import { activeAgentIndicesFromRoster } from '@/app/components/cockpit/agents/themes/isoOffice/shiftModel'

function shift(
  id: string,
  startMin: number,
  endMin: number,
  agentCount: number,
  breaks: { startMin: number; durationMin: number }[] = [],
): RosterShift {
  return { id, startMin, endMin, agentCount, breaks }
}

describe('assignAgentsToShifts', () => {
  it('returns empty map for empty roster', () => {
    expect(assignAgentsToShifts([], 50).size).toBe(0)
  })

  it('returns empty map for zero agents', () => {
    expect(assignAgentsToShifts([shift('s0', 420, 900, 50)], 0).size).toBe(0)
  })

  it('assigns all agents to a single shift', () => {
    const r = [shift('s0', 420, 900, 50)]
    const m = assignAgentsToShifts(r, 50)
    expect(m.size).toBe(50)
    for (let i = 0; i < 50; i++) {
      const a = m.get(i)!
      expect(a.shiftId).toBe('s0')
      expect(a.startMin).toBe(420)
      expect(a.endMin).toBe(900)
    }
  })

  it('splits agents proportionally across multiple shifts', () => {
    // 50 + 100 = 150 → with totalAgents = 150 the assignment is exact.
    const r = [shift('s0', 420, 900, 50), shift('s1', 540, 1020, 100)]
    const m = assignAgentsToShifts(r, 150)
    expect(m.size).toBe(150)
    for (let i = 0; i < 50; i++) expect(m.get(i)!.shiftId).toBe('s0')
    for (let i = 50; i < 150; i++) expect(m.get(i)!.shiftId).toBe('s1')
  })

  it('scales counts when totalAgents differs from sum of shift agentCount', () => {
    // Roster sums to 100; we ask for 200 — each shift's allocation should
    // double. The exact split is allowed to use rounding; what matters is
    // that all 200 indices get an assignment with the right shiftId order.
    const r = [shift('s0', 420, 900, 25), shift('s1', 540, 1020, 75)]
    const m = assignAgentsToShifts(r, 200)
    expect(m.size).toBe(200)
    // s0 should take roughly 50 (25/100 × 200) and s1 the rest.
    const s0 = Array.from(m.values()).filter(a => a.shiftId === 's0').length
    const s1 = Array.from(m.values()).filter(a => a.shiftId === 's1').length
    expect(s0).toBeCloseTo(50, -1)
    expect(s1).toBeCloseTo(150, -1)
    expect(s0 + s1).toBe(200)
  })

  it('assigns trailing agents from rounding to the last shift', () => {
    // 3 shifts × 1 agent each = 3, ask for 5 → 2 trailing agents.
    const r = [shift('s0', 0, 60, 1), shift('s1', 60, 120, 1), shift('s2', 120, 180, 1)]
    const m = assignAgentsToShifts(r, 5)
    expect(m.size).toBe(5)
    // Cursor advances per shift (rounded); whatever the rounding produces,
    // any leftover indices land on s2 (the last shift).
    expect(m.get(4)!.shiftId).toBe('s2')
  })

  it('captures the first break window when present', () => {
    const r = [shift('s0', 420, 900, 10, [{ startMin: 600, durationMin: 30 }])]
    const a = assignAgentsToShifts(r, 10).get(0)!
    expect(a.breakStartMin).toBe(600)
    expect(a.breakEndMin).toBe(630)
  })

  it('leaves break fields null when shift has no breaks', () => {
    const r = [shift('s0', 420, 900, 10)]
    const a = assignAgentsToShifts(r, 10).get(0)!
    expect(a.breakStartMin).toBeNull()
    expect(a.breakEndMin).toBeNull()
  })
})

describe('isAgentInShift', () => {
  const a = {
    agentIndex: 0,
    shiftId: 's0',
    startMin: 420,
    endMin: 900,
    breakStartMin: null,
    breakEndMin: null,
  }

  it('returns true inside the shift window', () => {
    expect(isAgentInShift(a, 420)).toBe(true)
    expect(isAgentInShift(a, 600)).toBe(true)
    expect(isAgentInShift(a, 899)).toBe(true)
  })

  it('returns false before the shift starts', () => {
    expect(isAgentInShift(a, 0)).toBe(false)
    expect(isAgentInShift(a, 419)).toBe(false)
  })

  it('returns false at and after the shift ends (end is exclusive)', () => {
    expect(isAgentInShift(a, 900)).toBe(false)
    expect(isAgentInShift(a, 1200)).toBe(false)
  })
})

describe('activeAgentIndicesFromRoster', () => {
  it('returns empty sets for empty roster', () => {
    const { productive, shrinkage } = activeAgentIndicesFromRoster([], 50, 600, 30)
    expect(productive.size).toBe(0)
    expect(shrinkage.size).toBe(0)
  })

  it('puts all assigned agents in-shift into the in-office population', () => {
    const r = [shift('s0', 420, 900, 100)]
    const { productive, shrinkage } = activeAgentIndicesFromRoster(r, 100, 600, 0)
    // Shrink 0 → all 100 agents productive, 0 shrinkage
    expect(productive.size).toBe(100)
    expect(shrinkage.size).toBe(0)
  })

  it('returns empty sets before any shift starts', () => {
    const r = [shift('s0', 420, 900, 100)]
    const { productive, shrinkage } = activeAgentIndicesFromRoster(r, 100, 60, 0)
    expect(productive.size).toBe(0)
    expect(shrinkage.size).toBe(0)
  })

  it('returns empty sets after all shifts end', () => {
    const r = [shift('s0', 420, 900, 100)]
    const { productive, shrinkage } = activeAgentIndicesFromRoster(r, 100, 1000, 0)
    expect(productive.size).toBe(0)
    expect(shrinkage.size).toBe(0)
  })

  it('only includes agents from the active shift when shifts overlap partially', () => {
    // s0 ends at 600, s1 starts at 540. At minute 700 only s1 is active.
    const r = [shift('s0', 420, 600, 50), shift('s1', 540, 900, 50)]
    const { productive, shrinkage } = activeAgentIndicesFromRoster(r, 100, 700, 0)
    // s1 covers indices 50..99
    expect(productive.size + shrinkage.size).toBe(50)
    for (const i of productive) expect(i).toBeGreaterThanOrEqual(50)
    for (const i of shrinkage) expect(i).toBeGreaterThanOrEqual(50)
  })

  it('splits in-office agents into productive/shrinkage by shrinkage pct', () => {
    const r = [shift('s0', 0, 1440, 100)]
    const { productive, shrinkage } = activeAgentIndicesFromRoster(r, 100, 600, 30)
    // 30% shrinkage → ~70 productive, ~30 shrinkage. Allow rounding.
    expect(productive.size).toBeCloseTo(70, 0)
    expect(shrinkage.size).toBeCloseTo(30, 0)
    expect(productive.size + shrinkage.size).toBe(100)
  })

  it('clamps shrinkage above 95% so denominator stays sane', () => {
    const r = [shift('s0', 0, 1440, 100)]
    // shrinkPct 150 should be clamped to 95 → 5 productive, 95 shrinkage.
    const { productive, shrinkage } = activeAgentIndicesFromRoster(r, 100, 600, 150)
    expect(productive.size).toBe(5)
    expect(shrinkage.size).toBe(95)
  })
})

import { describe, it, expect } from 'vitest'
import {
  computeActivityAssignments,
  hash,
  type DisplayActivity,
} from '@/app/components/cockpit/agents/themes/isoOffice/activity'
import { computeBuildingLayout } from '@/app/components/cockpit/agents/themes/isoOffice/geometry'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

function makeAgents(n: number, state: AgentVisualState = 'idle') {
  const out: Array<{ id: string; state: AgentVisualState }> = []
  for (let i = 0; i < n; i++) out.push({ id: `A${i}`, state })
  return out
}

describe('hash', () => {
  it('returns a value in [0, 1)', () => {
    for (const s of ['', 'a', 'A0|0|act', 'long-string-here']) {
      const h = hash(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(1)
    }
  })
  it('is deterministic', () => {
    expect(hash('A0|0|act')).toBe(hash('A0|0|act'))
    expect(hash('A1|0|act')).not.toBe(hash('A0|0|act'))
  })
})

describe('computeActivityAssignments', () => {
  const layout = computeBuildingLayout(150)
  const agents = makeAgents(150, 'idle')

  it('assigns every agent an activity', () => {
    const out = computeActivityAssignments(agents, 100, layout)
    for (const a of agents) {
      expect(out[a.id]).toBeDefined()
      expect(out[a.id].position).toBeDefined()
    }
  })

  it('is deterministic across calls with same inputs', () => {
    const a = computeActivityAssignments(agents, 100, layout)
    const b = computeActivityAssignments(agents, 100, layout)
    for (const id of Object.keys(a)) {
      expect(a[id].activity).toBe(b[id].activity)
      expect(a[id].position).toEqual(b[id].position)
    }
  })

  it('most agents are stable across a sub-1-min sim step (Round 4: per-agent staggered windows)', () => {
    // With staggered per-agent windows + an 8-min window length, most agents
    // should NOT flip between adjacent sim minutes — but a few will (those
    // whose phase puts a window boundary in between).
    const a = computeActivityAssignments(agents, 100, layout)
    const b = computeActivityAssignments(agents, 100.5, layout)  // half a sim minute later
    let differences = 0
    for (const id of Object.keys(a)) {
      if (a[id].activity !== b[id].activity) differences++
    }
    // Vast majority stay the same.
    expect(differences).toBeLessThan(agents.length * 0.2)
  })

  it('changes assignments across larger time gaps', () => {
    const a = computeActivityAssignments(agents, 0, layout)
    const b = computeActivityAssignments(agents, 60, layout)
    let differences = 0
    for (const id of Object.keys(a)) {
      if (a[id].activity !== b[id].activity) differences++
    }
    // With shorter per-agent windows, plenty of agents should rotate.
    expect(differences).toBeGreaterThan(5)
  })

  it('roughly hits target activity distribution for idle agents', () => {
    const counts: Record<DisplayActivity, number> = {
      at_desk: 0, in_training: 0, in_gym: 0, in_restroom: 0,
      chatting: 0, at_water_cooler: 0, at_break_table: 0,
    }
    const out = computeActivityAssignments(agents, 100, layout)
    for (const id of Object.keys(out)) counts[out[id].activity]++
    // Expected ~70% at desk; allow generous tolerance.
    expect(counts.at_desk / 150).toBeGreaterThan(0.55)
    expect(counts.at_desk / 150).toBeLessThan(0.85)
    // Each non-desk activity should have at least a few agents.
    expect(counts.in_training).toBeGreaterThan(2)
    expect(counts.in_gym).toBeGreaterThan(0)
    expect(counts.chatting).toBeGreaterThan(0)
    expect(counts.at_water_cooler).toBeGreaterThan(0)
    expect(counts.in_restroom).toBeGreaterThan(0)
  })

  it('non-idle agents stay at desk / break table', () => {
    const mixed: Array<{ id: string; state: AgentVisualState }> = [
      { id: 'C0', state: 'on_call' },
      { id: 'B0', state: 'on_break' },
      { id: 'O0', state: 'off_shift' },
    ]
    const out = computeActivityAssignments(mixed, 100, layout)
    expect(out.C0.activity).toBe('at_desk')
    expect(out.B0.activity).toBe('at_break_table')
    expect(out.O0.activity).toBe('at_desk')
  })

  it('chatting agents are paired into hotspot positions', () => {
    const out = computeActivityAssignments(agents, 100, layout)
    const chatters = Object.entries(out).filter(([, v]) => v.activity === 'chatting')
    // Multiple chatters should occupy at least 2 distinct positions (paired).
    const distinctPositions = new Set(chatters.map(([, v]) => `${v.position.x},${v.position.y}`))
    if (chatters.length >= 4) {
      expect(distinctPositions.size).toBeGreaterThan(1)
    }
  })
})

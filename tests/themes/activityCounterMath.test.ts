import { describe, it, expect } from 'vitest'
import { runDay } from '@/lib/kernel/sim'
import { campaigns } from '@/lib/campaigns'
import { computeActivityAssignments } from '@/app/components/cockpit/agents/themes/isoOffice/activity'
import { computeBuildingLayout } from '@/app/components/cockpit/agents/themes/isoOffice/geometry'
import { activeAgentIndicesAllocated, peakInOfficeCount, inOfficeFromErlang } from '@/app/components/cockpit/agents/themes/isoOffice/shiftModel'
import { agentStateAt, buildAgentTimelines } from '@/lib/animation/agentTimeline'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { Scenario } from '@/lib/types'

/**
 * Integration test for the activity counter math (Round 12 fix).
 *
 * Reproduces the user-reported bug at 8:03 PM:
 *   - Active Agents = 130, Scheduled HC = 211
 *   - At desks = 203, total visible = 219  (BAD, should have been ~130 / ~191)
 *
 * Two root causes were identified and fixed:
 *   1. Kernel never emitted `call_end`, so every agent who EVER took a call
 *      stayed `on_call` forever. By 8pm 60-70% of the pool was stuck on_call,
 *      and the activity scheduler forces on_call → at_desk regardless of band.
 *   2. The activity scheduler used a fixed productive-vs-shrinkage band by
 *      index, which collided with the kernel's call routing, when the kernel
 *      put an on_call into a shrinkage-band index, the scheduler still forced
 *      it at_desk. With many such collisions, shrinkage rooms went empty.
 *
 * This test verifies the post-fix end-to-end math: at a moment when the
 * Erlang requirement is around 130 productive agents and shrink is 32%, the
 * activity scheduler routes ≈130 agents at desks and ≈61 to non-desk rooms.
 */
describe('activity counter math at peak, Round 12 (Bug 1)', () => {
  it('shrinkage rooms are populated; at-desks ≈ productive Erlang', () => {
    const camp = campaigns['us_telco_manila']
    const scenario: Scenario = {
      campaignKey: 'us_telco_manila',
      dailyTotal: 12400,
      hoop: { startMin: 0, endMin: 1440 },
      curve: camp.curveTemplate.slice(),
      aht: 420, sl: 80, asa: 20, shrink: 32, abs: 9,
      rngSeed: 42,
      injectedEvents: [],
      roster: null,
    }
    const r = runDay(scenario)
    const maxAgents = Math.max(...r.perInterval.map(s => s.agents))
    // Match LiveSimTab's peakAgents calc.
    const peakAgents = Math.ceil(maxAgents / 0.68 / 0.91)

    const simTime = 1203 // 8:03 PM, where the user reported the broken counts.
    const layout = computeBuildingLayout(peakAgents, peakAgents)
    const timelines = buildAgentTimelines(r.events, peakAgents)
    const agents: { id: string; state: AgentVisualState }[] = []
    for (let i = 0; i < peakAgents; i++) {
      const id = `A${i}`
      const tl = timelines[id]
      agents.push({ id, state: tl ? agentStateAt(tl, simTime) : 'idle' })
    }

    const productiveAt8pm = r.perInterval[Math.floor(simTime / 30)].agents
    const expectedInOffice = inOfficeFromErlang(productiveAt8pm, 32) // ~191
    const peakIO = peakInOfficeCount(r.perInterval, 32)
    const absentSlots = Math.max(0, peakAgents - peakIO)
    const alloc = activeAgentIndicesAllocated(peakAgents, r.perInterval, simTime, 32)
    const acts = computeActivityAssignments(agents, simTime, layout, alloc)

    // Bucket activity counts the same way the on-canvas overlay does.
    let atDesk = 0, nonDesk = 0
    const tailStart = peakAgents - absentSlots
    for (let i = 0; i < agents.length; i++) {
      // Mimic the renderer's "in office" gate: not in absent tail, and
      // either productive or shrinkage band.
      const inOffice = i < tailStart && (alloc.productive.has(i) || alloc.shrinkage.has(i))
      if (!inOffice) continue
      const a = agents[i]
      const act = acts[a.id]?.activity ?? 'at_desk'
      if (act === 'at_desk') atDesk++
      else nonDesk++
    }

    // Visible total should be roughly the in-office target (with stagger jitter).
    const totalVisible = atDesk + nonDesk
    expect(totalVisible).toBeGreaterThan(expectedInOffice * 0.9)
    expect(totalVisible).toBeLessThan(expectedInOffice * 1.1)

    // At desks should match the productive Erlang target within ~15%
    // (kernel's call routing, plus stagger, can put a few extra at desks).
    expect(atDesk).toBeGreaterThan(productiveAt8pm * 0.85)
    expect(atDesk).toBeLessThan(productiveAt8pm * 1.2)

    // Non-desk rooms should hold roughly the shrinkage population, NOT 0.
    // The pre-fix bug had nonDesk ≈ 11 instead of ~61, so we assert a much
    // higher floor than the broken behaviour ever produced.
    const expectedShrinkage = expectedInOffice - productiveAt8pm
    expect(nonDesk).toBeGreaterThan(expectedShrinkage * 0.7)
  })
})

import { describe, it, expect } from 'vitest'
import { simMinutesPerSec, type Speed } from '@/lib/animation/timeScale'

describe('simMinutesPerSec', () => {
  it('returns 24 for 1×', () => { expect(simMinutesPerSec(1)).toBe(24) })
  it('returns 240 for 10×', () => { expect(simMinutesPerSec(10)).toBe(240) })
  it('returns 1440 for 60×', () => { expect(simMinutesPerSec(60)).toBe(1440) })
  it('Speed type accepts only allowed values (compile-time check, runtime no-op)', () => {
    const x: Speed = 1
    expect(x).toBe(1)
  })
})

import type { SimEvent } from '@/lib/types'
import { buildAgentTimelines, agentStateAt, type AgentVisualState } from '@/lib/animation/agentTimeline'

describe('buildAgentTimelines', () => {
  it('produces a timeline per agent ID', () => {
    const events: SimEvent[] = [
      { timeMin: 480, type: 'agent_shift_start', agentId: 'A0' },
      { timeMin: 600, type: 'call_answer', agentId: 'A0', callId: 'C1' },
      { timeMin: 605, type: 'call_end', agentId: 'A0' },
      { timeMin: 480, type: 'agent_shift_start', agentId: 'A1' },
    ]
    const timelines = buildAgentTimelines(events, 2)
    expect(timelines.A0.length).toBeGreaterThan(0)
    expect(timelines.A1.length).toBeGreaterThan(0)
  })
})

describe('agentStateAt', () => {
  const events: SimEvent[] = [
    { timeMin: 0,   type: 'agent_shift_start', agentId: 'A0' },
    { timeMin: 600, type: 'call_answer', agentId: 'A0', callId: 'C1' },
    { timeMin: 605, type: 'call_end', agentId: 'A0' },
    { timeMin: 700, type: 'agent_break_start', agentId: 'A0' },
    { timeMin: 715, type: 'agent_break_end', agentId: 'A0' },
    { timeMin: 900, type: 'agent_shift_end', agentId: 'A0' },
  ]
  const tl = buildAgentTimelines(events, 1).A0

  it('idle before any call', () => {
    expect(agentStateAt(tl, 100)).toBe<AgentVisualState>('idle')
  })
  it('on_call during a call', () => {
    expect(agentStateAt(tl, 602)).toBe<AgentVisualState>('on_call')
  })
  it('idle after call_end', () => {
    expect(agentStateAt(tl, 650)).toBe<AgentVisualState>('idle')
  })
  it('on_break during break', () => {
    expect(agentStateAt(tl, 710)).toBe<AgentVisualState>('on_break')
  })
  it('off_shift after shift_end', () => {
    expect(agentStateAt(tl, 1000)).toBe<AgentVisualState>('off_shift')
  })
})

import { describe, it, expect } from 'vitest'
import {
  detectTransitions,
  advanceAnimations,
  type AnimState,
  type AnimationKind,
} from '@/app/components/cockpit/agents/themes/isoOffice/animation'

describe('detectTransitions', () => {
  it('returns no transitions when prev and curr are identical', () => {
    const prev = { A0: 'idle' as const }
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([])
  })

  it('detects desk_to_break when state moves to on_break', () => {
    const prev = { A0: 'idle' as const }
    const curr = { A0: 'on_break' as const }
    const ts = detectTransitions(prev, curr)
    expect(ts).toEqual([{ agentId: 'A0', kind: 'desk_to_break' }])
  })

  it('detects break_to_desk when state leaves on_break to idle/on_call', () => {
    const prev = { A0: 'on_break' as const }
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([{ agentId: 'A0', kind: 'break_to_desk' }])
  })

  it('detects fade_in when state moves from off_shift to active', () => {
    const prev = { A0: 'off_shift' as const }
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([{ agentId: 'A0', kind: 'fade_in' }])
  })

  it('detects fade_out when state moves to off_shift', () => {
    const prev = { A0: 'on_call' as const }
    const curr = { A0: 'off_shift' as const }
    expect(detectTransitions(prev, curr)).toEqual([{ agentId: 'A0', kind: 'fade_out' }])
  })

  it('handles new agents (no prev entry) without crashing', () => {
    const prev = {}
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([])
  })
})

describe('advanceAnimations', () => {
  it('decreases progress towards 1.0 over wall-clock dt', () => {
    const start: AnimState = { A0: { kind: 'desk_to_break', progress: 0, startedAt: 0 } }
    const after = advanceAnimations(start, 0.5) // dt=500ms; assume 1s duration
    expect(after.A0.progress).toBeCloseTo(0.5, 2)
  })

  it('drops animations whose progress reaches 1.0', () => {
    const start: AnimState = { A0: { kind: 'desk_to_break', progress: 0.95, startedAt: 0 } }
    const after = advanceAnimations(start, 0.1)
    expect(after.A0).toBeUndefined()
  })

  it('skip rule: starting a new transition for an in-flight agent replaces it', () => {
    const start: AnimState = { A0: { kind: 'desk_to_break', progress: 0.3, startedAt: 0 } }
    const trans: Array<{ agentId: string; kind: AnimationKind }> = [{ agentId: 'A0', kind: 'break_to_desk' }]
    const after = advanceAnimations(start, 0, trans, 0)
    expect(after.A0.kind).toBe('break_to_desk')
    expect(after.A0.progress).toBe(0)
  })
})

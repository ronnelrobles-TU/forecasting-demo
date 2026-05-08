import { describe, it, expect } from 'vitest'
import type { InjectedEvent } from '@/lib/types'
import { activePerturbations } from '@/lib/kernel/inject'

describe('activePerturbations', () => {
  it('returns identity when no events', () => {
    const p = activePerturbations([], 600)
    expect(p.volumeMultiplier).toBe(1)
    expect(p.ahtMultiplier).toBe(1)
    expect(p.agentReductionFraction).toBe(0)
    expect(p.flashAbsentJustFired).toBe(0)
  })

  it('applies volume_surge during its window', () => {
    const ev: InjectedEvent = { type: 'volume_surge', fireAtMin: 600, durationMin: 60, magnitude: 0.3 }
    expect(activePerturbations([ev], 599).volumeMultiplier).toBe(1)
    expect(activePerturbations([ev], 600).volumeMultiplier).toBeCloseTo(1.3)
    expect(activePerturbations([ev], 659).volumeMultiplier).toBeCloseTo(1.3)
    expect(activePerturbations([ev], 660).volumeMultiplier).toBe(1)
  })

  it('applies aht_spike during its window', () => {
    const ev: InjectedEvent = { type: 'aht_spike', fireAtMin: 700, durationMin: 30, magnitude: 1.0 }
    expect(activePerturbations([ev], 700).ahtMultiplier).toBeCloseTo(2.0)
    expect(activePerturbations([ev], 729).ahtMultiplier).toBeCloseTo(2.0)
    expect(activePerturbations([ev], 730).ahtMultiplier).toBe(1)
  })

  it('staff_drop persists past durationMin if undefined', () => {
    const ev: InjectedEvent = { type: 'staff_drop', fireAtMin: 800, magnitude: 0.25 }  // no durationMin → rest of day
    expect(activePerturbations([ev], 700).agentReductionFraction).toBe(0)
    expect(activePerturbations([ev], 800).agentReductionFraction).toBeCloseTo(0.25)
    expect(activePerturbations([ev], 1400).agentReductionFraction).toBeCloseTo(0.25)
  })

  it('flash_absent fires only at fireAtMin', () => {
    const ev: InjectedEvent = { type: 'flash_absent', fireAtMin: 850, magnitude: 15 }
    expect(activePerturbations([ev], 849).flashAbsentJustFired).toBe(0)
    expect(activePerturbations([ev], 850).flashAbsentJustFired).toBe(15)
    expect(activePerturbations([ev], 851).flashAbsentJustFired).toBe(0)
  })

  it('stacks multiple active events', () => {
    const evs: InjectedEvent[] = [
      { type: 'volume_surge', fireAtMin: 600, durationMin: 120, magnitude: 0.3 },
      { type: 'aht_spike',    fireAtMin: 600, durationMin: 60,  magnitude: 0.5 },
    ]
    const p = activePerturbations(evs, 600)
    expect(p.volumeMultiplier).toBeCloseTo(1.3)
    expect(p.ahtMultiplier).toBeCloseTo(1.5)
  })
})

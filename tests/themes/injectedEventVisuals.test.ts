import { describe, it, expect } from 'vitest'
import type { InjectedEvent } from '@/lib/types'
import {
  activeInjectedEvents,
  eventBadge,
  eventVisualFlags,
  formatRemaining,
} from '@/app/components/cockpit/agents/themes/isoOffice/injectedEventVisuals'

describe('activeInjectedEvents', () => {
  it('returns [] when no events', () => {
    expect(activeInjectedEvents(undefined, 100)).toEqual([])
    expect(activeInjectedEvents([], 100)).toEqual([])
  })

  it('includes timed events while their window is active', () => {
    const evs: InjectedEvent[] = [
      { type: 'volume_surge', fireAtMin: 600, durationMin: 60, magnitude: 0.3 },
    ]
    expect(activeInjectedEvents(evs, 599).length).toBe(0)
    expect(activeInjectedEvents(evs, 600).length).toBe(1)
    expect(activeInjectedEvents(evs, 600)[0].remainingMin).toBeCloseTo(60)
    expect(activeInjectedEvents(evs, 659)[0].remainingMin).toBeCloseTo(1)
    expect(activeInjectedEvents(evs, 660).length).toBe(0)
  })

  it('treats staff_drop with no durationMin as live (infinite remaining)', () => {
    const evs: InjectedEvent[] = [
      { type: 'staff_drop', fireAtMin: 700, magnitude: 0.25 },
    ]
    const a = activeInjectedEvents(evs, 800)
    expect(a.length).toBe(1)
    expect(Number.isFinite(a[0].remainingMin)).toBe(false)
  })

  it('flash_absent shows for a few minutes after firing then dismisses', () => {
    const evs: InjectedEvent[] = [
      { type: 'flash_absent', fireAtMin: 720, magnitude: 15 },
    ]
    expect(activeInjectedEvents(evs, 719).length).toBe(0)
    expect(activeInjectedEvents(evs, 720).length).toBe(1)
    expect(activeInjectedEvents(evs, 723).length).toBe(1)
    // Round 15: bumped FLASH_DISPLAY_MIN from 5 → 8 sim-min so flash visuals
    // persist long enough to read at 1× speed. Still on at +7m, gone at +8m.
    expect(activeInjectedEvents(evs, 727).length).toBe(1)
    expect(activeInjectedEvents(evs, 728).length).toBe(0)
  })
})

describe('eventVisualFlags', () => {
  it('produces a clean baseline when nothing is active', () => {
    const f = eventVisualFlags([])
    expect(f).toEqual({
      surgeActive: false,
      outageActive: false,
      staffDropActive: false,
      flashAbsentActive: false,
    })
  })

  it('flips per-type flags', () => {
    const surge: InjectedEvent = { type: 'volume_surge', fireAtMin: 0, durationMin: 60, magnitude: 0.3 }
    const aht:   InjectedEvent = { type: 'aht_spike',    fireAtMin: 0, durationMin: 60, magnitude: 1   }
    const drop:  InjectedEvent = { type: 'staff_drop',   fireAtMin: 0, magnitude: 0.25 }
    const flash: InjectedEvent = { type: 'flash_absent', fireAtMin: 0, magnitude: 15 }
    const f = eventVisualFlags([
      { ev: surge, remainingMin: 10, id: 'a' },
      { ev: aht,   remainingMin: 10, id: 'b' },
      { ev: drop,  remainingMin: Infinity, id: 'c' },
      { ev: flash, remainingMin: 2, id: 'd' },
    ])
    expect(f.surgeActive).toBe(true)
    expect(f.outageActive).toBe(true)
    expect(f.staffDropActive).toBe(true)
    expect(f.flashAbsentActive).toBe(true)
  })
})

describe('eventBadge', () => {
  it('produces a sensible badge per event type', () => {
    expect(eventBadge({ type: 'volume_surge', fireAtMin: 0, durationMin: 60, magnitude: 0.3 }).title)
      .toMatch(/surge/i)
    expect(eventBadge({ type: 'aht_spike', fireAtMin: 0, durationMin: 60, magnitude: 1 }).title)
      .toMatch(/slowdown|outage/i)
    expect(eventBadge({ type: 'staff_drop', fireAtMin: 0, magnitude: 0.25 }).title)
      .toMatch(/staff/i)
    expect(eventBadge({ type: 'flash_absent', fireAtMin: 0, magnitude: 15 }).title)
      .toMatch(/15/)
  })
})

describe('formatRemaining', () => {
  it('returns "live" for infinity', () => {
    expect(formatRemaining(Infinity)).toBe('live')
  })
  it('formats minutes', () => {
    expect(formatRemaining(0)).toBe('0m')
    expect(formatRemaining(45)).toBe('45m')
    expect(formatRemaining(60)).toBe('1h')
    expect(formatRemaining(125)).toBe('2h 5m')
  })
})

import { describe, it, expect } from 'vitest'
import {
  EVENT_PRESETS,
  KIND_SLIDER_CONFIG,
  buildEventsFromPreset,
  type EventPreset,
} from '@/app/components/cockpit/inject/eventPresets'

function presetById(id: string): EventPreset {
  const p = EVENT_PRESETS.find(x => x.id === id)
  if (!p) throw new Error(`No preset ${id}`)
  return p
}

describe('EVENT_PRESETS, preset library', () => {
  it('exposes the new round-15 presets', () => {
    const ids = EVENT_PRESETS.map(p => p.id)
    expect(ids).toContain('viral_surge')
    expect(ids).toContain('major_outage')
    expect(ids).toContain('half_team_training')
    expect(ids).toContain('system_failure')
    expect(ids).toContain('flash_absent_large')
    expect(ids).toContain('compound_crisis')
  })

  it('viral_surge is +100% volume for 30min', () => {
    const events = presetById('viral_surge').build(600)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'volume_surge', fireAtMin: 600, durationMin: 30, magnitude: 1.0,
    })
  })

  it('flash_absent_large drops 40 agents instantly', () => {
    const events = presetById('flash_absent_large').build(720)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'flash_absent', fireAtMin: 720, magnitude: 40,
    })
    expect(events[0].durationMin).toBeUndefined()
  })

  it('compound_crisis returns three events at the same fireAtMin', () => {
    const events = presetById('compound_crisis').build(840)
    expect(events).toHaveLength(3)
    const types = events.map(e => e.type).sort()
    expect(types).toEqual(['aht_spike', 'staff_drop', 'volume_surge'])
    for (const ev of events) {
      expect(ev.fireAtMin).toBe(840)
      expect(ev.durationMin).toBe(60)
    }
  })

  it('staff_drop preset (typhoon) stays open-ended (no durationMin)', () => {
    const events = presetById('typhoon').build(700)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('staff_drop')
    expect(events[0].durationMin).toBeUndefined()
  })

  it('mass_training preset uses durationMin=240 for the 4h training window', () => {
    const events = presetById('half_team_training').build(540)
    expect(events[0]).toMatchObject({ type: 'staff_drop', durationMin: 240, magnitude: 0.5 })
  })
})

describe('buildEventsFromPreset, user-tuned values', () => {
  it('overrides magnitude and duration per part', () => {
    const preset = presetById('surge')
    const events = buildEventsFromPreset(preset, 500, [{ magnitude: 1.5, durationMin: 90 }])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'volume_surge', fireAtMin: 500, durationMin: 90, magnitude: 1.5,
    })
  })

  it('respects null durationMin (open-ended) for staff_drop', () => {
    const preset = presetById('system_failure')
    const events = buildEventsFromPreset(preset, 600, [{ magnitude: 0.6, durationMin: null }])
    expect(events[0].type).toBe('staff_drop')
    expect(events[0].magnitude).toBe(0.6)
    expect(events[0].durationMin).toBeUndefined()
  })

  it('omits durationMin entirely for flash_absent', () => {
    const preset = presetById('flash_absent')
    const events = buildEventsFromPreset(preset, 750, [{ magnitude: 25, durationMin: 30 }])
    expect(events[0].type).toBe('flash_absent')
    expect(events[0].magnitude).toBe(25)
    expect(events[0].durationMin).toBeUndefined()
  })

  it('builds compound preset events with per-part tunings', () => {
    const preset = presetById('compound_crisis')
    const events = buildEventsFromPreset(preset, 720, [
      { magnitude: 1.0, durationMin: 30 },
      { magnitude: 2.0, durationMin: 30 },
      { magnitude: 0.5, durationMin: 30 },
    ])
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({ type: 'volume_surge', magnitude: 1.0, durationMin: 30 })
    expect(events[1]).toMatchObject({ type: 'aht_spike', magnitude: 2.0, durationMin: 30 })
    expect(events[2]).toMatchObject({ type: 'staff_drop', magnitude: 0.5, durationMin: 30 })
  })
})

describe('KIND_SLIDER_CONFIG, slider ranges', () => {
  it('volume_surge spans 0..200%', () => {
    const cfg = KIND_SLIDER_CONFIG.volume_surge
    expect(cfg.magnitude.min).toBe(0)
    expect(cfg.magnitude.max).toBe(2)
  })
  it('aht_spike spans up to ×5 extra', () => {
    expect(KIND_SLIDER_CONFIG.aht_spike.magnitude.max).toBe(5)
  })
  it('staff_drop allows open-ended duration', () => {
    expect(KIND_SLIDER_CONFIG.staff_drop.duration?.allowOpenEnded).toBe(true)
  })
  it('flash_absent has no duration knob', () => {
    expect(KIND_SLIDER_CONFIG.flash_absent.duration).toBeUndefined()
  })
})

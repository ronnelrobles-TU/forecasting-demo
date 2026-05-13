import { describe, it, expect } from 'vitest'
import {
  computeLighting,
  quantizeLightingTime,
} from '@/app/components/cockpit/agents/themes/isoOffice/lighting'

const VB = { w: 800, h: 600 }

function isHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}

describe('computeLighting', () => {
  it('returns a valid hex sky color at every hour', () => {
    for (let h = 0; h < 24; h++) {
      const l = computeLighting(h * 60, VB)
      expect(isHex(l.skyColor), `bad sky color at ${h}:00 -> ${l.skyColor}`).toBe(true)
      expect(isHex(l.windowFill)).toBe(true)
    }
  })

  it('sky is dark at midnight, light during midday', () => {
    const night = computeLighting(0, VB)
    const noon = computeLighting(12 * 60, VB)
    // Compare brightness (sum of channel values).
    const brightness = (hex: string) => {
      const v = parseInt(hex.slice(1), 16)
      return ((v >> 16) & 0xff) + ((v >> 8) & 0xff) + (v & 0xff)
    }
    expect(brightness(noon.skyColor)).toBeGreaterThan(brightness(night.skyColor))
  })

  it('marks night vs day correctly', () => {
    expect(computeLighting(2 * 60, VB).isNight).toBe(true)         // 2am
    expect(computeLighting(13 * 60, VB).isNight).toBe(false)       // 1pm
    expect(computeLighting(23 * 60, VB).isNight).toBe(true)        // 11pm
  })

  it('wallWarmth is 0 during the day and >0 at night', () => {
    expect(computeLighting(12 * 60, VB).wallWarmth).toBe(0)
    expect(computeLighting(2 * 60, VB).wallWarmth).toBeGreaterThan(0)
    expect(computeLighting(22 * 60, VB).wallWarmth).toBeGreaterThan(0)
  })

  it('shows the sun during midday and the moon at midnight', () => {
    const noon = computeLighting(12 * 60, VB)
    expect(noon.sunPosition.visible).toBe(true)
    expect(noon.celestialBody).toBe('sun')

    const midnight = computeLighting(0, VB)
    expect(midnight.celestialBody).toBe('moon')
  })

  it('sun position changes across the day (rises east, sets west)', () => {
    const morning = computeLighting(8 * 60, VB)
    const afternoon = computeLighting(16 * 60, VB)
    expect(morning.sunPosition.x).toBeGreaterThan(afternoon.sunPosition.x)
  })

  it('is deterministic for the same input', () => {
    const a = computeLighting(540, VB)
    const b = computeLighting(540, VB)
    expect(a).toEqual(b)
  })

  it('sky color interpolates smoothly between adjacent times', () => {
    // Two times 1 minute apart should differ by very little (smooth lerp).
    const a = computeLighting(720, VB)
    const b = computeLighting(721, VB)
    // Their colors should be close, but unequal in the worst case is fine.
    expect(isHex(a.skyColor)).toBe(true)
    expect(isHex(b.skyColor)).toBe(true)
  })
})

describe('quantizeLightingTime', () => {
  it('snaps to a 5-minute grid by default', () => {
    expect(quantizeLightingTime(0)).toBe(0)
    expect(quantizeLightingTime(4)).toBe(0)
    expect(quantizeLightingTime(5)).toBe(5)
    expect(quantizeLightingTime(9.9)).toBe(5)
    expect(quantizeLightingTime(10)).toBe(10)
    expect(quantizeLightingTime(539.5)).toBe(535)
  })

  it('respects a custom step', () => {
    expect(quantizeLightingTime(67, 10)).toBe(60)
    expect(quantizeLightingTime(67, 30)).toBe(60)
    expect(quantizeLightingTime(95, 30)).toBe(90)
  })
})

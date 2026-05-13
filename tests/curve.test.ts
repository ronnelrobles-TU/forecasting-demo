import { describe, it, expect } from 'vitest'
import { applyHoop, normalize, callsPerInterval, intervalIndexForMinute } from '@/lib/curve'

describe('applyHoop', () => {
  it('zeroes intervals outside HOOP', () => {
    const curve = Array.from({ length: 48 }, () => 1)
    const result = applyHoop(curve, { startMin: 480, endMin: 1080 }) // 08:00–18:00
    // 08:00 = interval 16; 18:00 = interval 36
    expect(result[15]).toBe(0)
    expect(result[16]).toBe(1)
    expect(result[35]).toBe(1)
    expect(result[36]).toBe(0)
  })

  it('keeps full curve when HOOP covers all 24h', () => {
    const curve = Array.from({ length: 48 }, () => 1)
    const result = applyHoop(curve, { startMin: 0, endMin: 1440 })
    expect(result.every(v => v === 1)).toBe(true)
  })
})

describe('normalize', () => {
  it('makes weights sum to 1', () => {
    const result = normalize([2, 3, 5])
    expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(result).toEqual([0.2, 0.3, 0.5])
  })

  it('returns zeros when input is all zeros', () => {
    const result = normalize([0, 0, 0])
    expect(result).toEqual([0, 0, 0])
  })
})

describe('callsPerInterval', () => {
  it('distributes total calls per normalized weights', () => {
    const curve = [0, 1, 1, 0]
    const out = callsPerInterval(curve, 100)
    expect(out).toEqual([0, 50, 50, 0])
  })
})

describe('intervalIndexForMinute', () => {
  it('rounds 30-min minutes to interval indices', () => {
    expect(intervalIndexForMinute(0)).toBe(0)
    expect(intervalIndexForMinute(29)).toBe(0)
    expect(intervalIndexForMinute(30)).toBe(1)
    expect(intervalIndexForMinute(1439)).toBe(47)
  })
})

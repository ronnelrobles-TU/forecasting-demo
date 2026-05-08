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

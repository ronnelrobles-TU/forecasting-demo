import { describe, it, expect } from 'vitest'
import { makeRng, poisson, logNormal } from '@/lib/rng'

describe('makeRng', () => {
  it('produces deterministic sequences for the same seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect(a()).toBe(b())
    expect(a()).toBe(b())
  })

  it('produces different sequences for different seeds', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    expect(a()).not.toBe(b())
  })
})

describe('poisson', () => {
  it('returns non-negative integers', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 50; i++) {
      const k = poisson(rng, 5)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(k)).toBe(true)
    }
  })

  it('mean over many draws is close to lambda', () => {
    const rng = makeRng(100)
    const N = 5000
    let sum = 0
    for (let i = 0; i < N; i++) sum += poisson(rng, 8)
    expect(sum / N).toBeGreaterThan(7.6)
    expect(sum / N).toBeLessThan(8.4)
  })
})

describe('logNormal', () => {
  it('returns positive values', () => {
    const rng = makeRng(11)
    for (let i = 0; i < 50; i++) {
      expect(logNormal(rng, 360, 0.4)).toBeGreaterThan(0)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { erlangC, serviceLevel, avgWait, requiredAgents } from '@/lib/erlang'

describe('erlangC', () => {
  it('returns 1 when N <= A (saturated)', () => {
    expect(erlangC(5, 5)).toBe(1)
    expect(erlangC(3, 8)).toBe(1)
  })

  it('drops as N grows above A', () => {
    const a = erlangC(10, 8)
    const b = erlangC(15, 8)
    expect(b).toBeLessThan(a)
    expect(b).toBeGreaterThan(0)
  })

  it('produces a probability between 0 and 1', () => {
    const p = erlangC(20, 12)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThanOrEqual(1)
  })
})

describe('serviceLevel', () => {
  it('returns 0 when undermanned', () => {
    expect(serviceLevel(5, 8, 360, 20)).toBe(0)
  })

  it('approaches 1 as agents grow', () => {
    const lo = serviceLevel(10, 8, 360, 20)
    const hi = serviceLevel(40, 8, 360, 20)
    expect(hi).toBeGreaterThan(lo)
    expect(hi).toBeLessThanOrEqual(1)
  })
})

describe('avgWait', () => {
  it('returns large sentinel when undermanned', () => {
    expect(avgWait(5, 8, 360)).toBe(999)
  })

  it('shrinks as agents grow', () => {
    const lo = avgWait(10, 8, 360)
    const hi = avgWait(30, 8, 360)
    expect(hi).toBeLessThan(lo)
  })
})

describe('requiredAgents', () => {
  // 450 calls/30min, AHT 360s, SL 80%/20s → spec example, expect ~97 agents
  it('matches the spec worked example (within 1)', () => {
    const { N, A } = requiredAgents(450, 360, 0.8, 20)
    expect(A).toBeCloseTo(90, 1)
    expect(N).toBeGreaterThanOrEqual(96)
    expect(N).toBeLessThanOrEqual(98)
  })

  it('caps at 5000 to avoid infinite loops', () => {
    const { N } = requiredAgents(50000, 360, 0.99, 5)
    expect(N).toBeLessThanOrEqual(5000)
  })
})

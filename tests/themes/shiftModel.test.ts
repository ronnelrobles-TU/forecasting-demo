import { describe, it, expect } from 'vitest'
import {
  scheduledCountAt,
  smoothScheduledAt,
  isAgentActive,
  activeAgentIndices,
  staggerOffset,
  STAGGER_WINDOW_MIN,
} from '@/app/components/cockpit/agents/themes/isoOffice/shiftModel'
import type { IntervalStat } from '@/lib/types'

// Build a synthetic perInterval that ramps from 5 (night) to 100 (midday)
// to 5 (late evening) — typical office shape.
function makeRamp(): IntervalStat[] {
  const out: IntervalStat[] = []
  for (let i = 0; i < 96; i++) {
    // Triangular over 24h — peak at i=48 (12:00).
    const t = Math.abs(i - 48) / 48 // 0 at noon, 1 at midnight
    const agents = Math.round(5 + (1 - t) * 95)
    out.push({ sl: 1, agents, queueLen: 0, abandons: 0, occ: 0.7 })
  }
  return out
}

describe('staggerOffset', () => {
  it('returns offsets within the configured window', () => {
    for (let i = 0; i < 200; i++) {
      const off = staggerOffset(i)
      expect(off).toBeGreaterThanOrEqual(-STAGGER_WINDOW_MIN / 2)
      expect(off).toBeLessThan(STAGGER_WINDOW_MIN / 2)
    }
  })

  it('is deterministic per agent index', () => {
    expect(staggerOffset(7)).toBe(staggerOffset(7))
    expect(staggerOffset(42)).toBe(staggerOffset(42))
  })

  it('produces a roughly even spread', () => {
    let pos = 0, neg = 0
    for (let i = 0; i < 200; i++) {
      if (staggerOffset(i) >= 0) pos++
      else neg++
    }
    // Each side should have at least 30% of the spread.
    expect(pos).toBeGreaterThan(60)
    expect(neg).toBeGreaterThan(60)
  })
})

describe('scheduledCountAt', () => {
  const ramp = makeRamp()

  it('returns 0 when perInterval is missing', () => {
    expect(scheduledCountAt(undefined, 600)).toBe(0)
    expect(scheduledCountAt([], 600)).toBe(0)
  })

  it('reads the right interval', () => {
    expect(scheduledCountAt(ramp, 0)).toBe(ramp[0].agents) // midnight
    expect(scheduledCountAt(ramp, 720)).toBe(ramp[48].agents) // noon
    expect(scheduledCountAt(ramp, 1380)).toBe(ramp[92].agents) // 11pm
  })

  it('clamps to last interval when overshooting', () => {
    expect(scheduledCountAt(ramp, 9999)).toBe(ramp[95].agents)
  })
})

describe('smoothScheduledAt', () => {
  const ramp = makeRamp()

  it('matches scheduledCountAt at interval boundaries', () => {
    expect(smoothScheduledAt(ramp, 0)).toBeCloseTo(ramp[0].agents, 5)
  })

  it('interpolates between neighbour intervals', () => {
    // At minute 7.5 (halfway through interval 0), should be halfway from
    // interval 0 -> interval 1 (but interval -1 is treated as interval 0).
    const v = smoothScheduledAt(ramp, 7.5)
    expect(v).toBeCloseTo(ramp[0].agents, 5)
    // Halfway through interval 5 (minutes 75..90) — between interval 4 and 5.
    const mid = 75 + 7.5
    const expected = ramp[4].agents + (ramp[5].agents - ramp[4].agents) * 0.5
    expect(smoothScheduledAt(ramp, mid)).toBeCloseTo(expected, 1)
  })
})

describe('isAgentActive', () => {
  const ramp = makeRamp()

  it('treats everyone as active when perInterval is missing (legacy mode)', () => {
    for (let i = 0; i < 50; i++) {
      expect(isAgentActive(i, undefined, 600)).toBe(true)
    }
  })

  it('keeps the night skeleton at midnight', () => {
    // ramp[0].agents is 5 — agent 0..4 should be active, the rest off.
    let active = 0
    for (let i = 0; i < 100; i++) {
      if (isAgentActive(i, ramp, 0)) active++
    }
    // With per-agent stagger ±6 minutes around the boundary, the count
    // is approximately the ramp value but jittered. Accept anywhere in
    // [0, 25] for an expected value of 5.
    expect(active).toBeLessThanOrEqual(25)
    expect(active).toBeGreaterThanOrEqual(0)
  })

  it('peak at noon: most agents active', () => {
    let active = 0
    for (let i = 0; i < 100; i++) {
      if (isAgentActive(i, ramp, 720)) active++
    }
    // At peak, ramp[48] is 100 — but the per-agent stagger pulls some
    // agents to "future" effective times where the ramp has already begun
    // its descent (interval 49 is 98). So we expect very high (>=95), not
    // necessarily exactly 100.
    expect(active).toBeGreaterThanOrEqual(95)
  })

  it('low at 11pm: skeleton crew', () => {
    let active = 0
    for (let i = 0; i < 100; i++) {
      if (isAgentActive(i, ramp, 1380)) active++
    }
    // ramp[92].agents ≈ 13. Allow some jitter from stagger.
    expect(active).toBeLessThanOrEqual(40)
  })
})

describe('activeAgentIndices', () => {
  const ramp = makeRamp()

  it('returns array of correct length', () => {
    const r = activeAgentIndices(50, ramp, 720)
    expect(r).toHaveLength(50)
    expect(r.every(v => typeof v === 'boolean')).toBe(true)
  })

  it('peak: all true at noon when count <= scheduled', () => {
    const r = activeAgentIndices(50, ramp, 720)
    expect(r.every(Boolean)).toBe(true)
  })

  it('midnight: most are false', () => {
    const r = activeAgentIndices(50, ramp, 0)
    const trueCount = r.filter(Boolean).length
    expect(trueCount).toBeLessThan(20)
  })
})

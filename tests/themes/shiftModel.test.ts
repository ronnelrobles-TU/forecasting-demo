import { describe, it, expect } from 'vitest'
import {
  scheduledCountAt,
  smoothScheduledAt,
  isAgentActive,
  activeAgentIndices,
  activeAgentIndicesAllocated,
  smoothOfficeAllocation,
  staggerOffset,
  STAGGER_WINDOW_MIN,
  inOfficeFromErlang,
  peakInOfficeCount,
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

describe('inOfficeFromErlang (Round 5.7)', () => {
  it('returns input unchanged when shrinkPct is 0 or undefined', () => {
    expect(inOfficeFromErlang(159, 0)).toBe(159)
    expect(inOfficeFromErlang(159, undefined)).toBe(159)
  })

  it('scales up by 1/(1 - shrink/100)', () => {
    // 159 / (1 - 0.32) ≈ 233.8
    expect(inOfficeFromErlang(159, 32)).toBeCloseTo(159 / 0.68, 2)
  })

  it('clamps shrinkPct to 95 to prevent divide-by-zero', () => {
    const v = inOfficeFromErlang(10, 200)
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBeCloseTo(10 / 0.05, 2)
  })

  it('treats negative shrinkPct as 0', () => {
    expect(inOfficeFromErlang(50, -10)).toBe(50)
  })
})

describe('smoothScheduledAt with shrinkPct', () => {
  const ramp = makeRamp()

  it('matches no-shrink behavior when shrinkPct is 0', () => {
    expect(smoothScheduledAt(ramp, 720, 0)).toBeCloseTo(smoothScheduledAt(ramp, 720), 5)
  })

  it('scales up at peak with shrinkage', () => {
    const noShrink = smoothScheduledAt(ramp, 720)
    const withShrink = smoothScheduledAt(ramp, 720, 32)
    expect(withShrink).toBeGreaterThan(noShrink)
    expect(withShrink).toBeCloseTo(noShrink / 0.68, 2)
  })
})

describe('isAgentActive with shrinkPct', () => {
  const ramp = makeRamp()

  it('marks more agents active at peak when shrinkage is non-zero', () => {
    let activeNoShrink = 0
    let activeWithShrink = 0
    for (let i = 0; i < 200; i++) {
      if (isAgentActive(i, ramp, 720)) activeNoShrink++
      if (isAgentActive(i, ramp, 720, 32)) activeWithShrink++
    }
    expect(activeWithShrink).toBeGreaterThan(activeNoShrink)
    // Should be roughly noShrink / 0.68 ≈ 1.47×, allowing 10pt jitter
    expect(activeWithShrink).toBeGreaterThan(Math.round(activeNoShrink / 0.68) - 10)
  })
})

describe('peakInOfficeCount', () => {
  const ramp = makeRamp()

  it('returns 0 when perInterval is missing', () => {
    expect(peakInOfficeCount(undefined, 32)).toBe(0)
    expect(peakInOfficeCount([], 32)).toBe(0)
  })

  it('returns the un-scaled peak when shrinkPct is 0', () => {
    expect(peakInOfficeCount(ramp, 0)).toBe(100)
  })

  it('scales the peak by 1/(1 - shrink/100)', () => {
    // peak = 100, shrink = 32% → 147 (rounded)
    expect(peakInOfficeCount(ramp, 32)).toBe(Math.round(100 / 0.68))
  })
})

describe('smoothOfficeAllocation (Round 7.1)', () => {
  const ramp = makeRamp()

  it('returns zeros when perInterval is missing', () => {
    const a = smoothOfficeAllocation(undefined, 720, 32)
    expect(a).toEqual({ productive: 0, shrinkageInOffice: 0, inOffice: 0 })
    const b = smoothOfficeAllocation([], 720, 32)
    expect(b).toEqual({ productive: 0, shrinkageInOffice: 0, inOffice: 0 })
  })

  it('productive equals Erlang count when shrinkPct is 0', () => {
    // smoothScheduledAt interpolates *into* the current interval, so at the
    // start of interval 48 (minute 720) it reads halfway between ramp[47]=98
    // and ramp[48]=100 → 98. Use a boundary that lands cleanly on 100.
    const a = smoothOfficeAllocation(ramp, 720 + 14.99, 0)
    expect(a.productive).toBe(100)
    expect(a.inOffice).toBe(100)
    expect(a.shrinkageInOffice).toBe(0)
  })

  it('inOffice = productive / (1 - shrink/100) at peak', () => {
    const a = smoothOfficeAllocation(ramp, 720 + 14.99, 32)
    expect(a.productive).toBe(100)
    expect(a.inOffice).toBe(Math.round(100 / 0.68))
    expect(a.shrinkageInOffice).toBe(a.inOffice - a.productive)
  })

  it('matches the conceptual example from the fix spec (Erlang 159, shrink 32%)', () => {
    const peak159: IntervalStat[] = [{ sl: 1, agents: 159, queueLen: 0, abandons: 0, occ: 0.7 }]
    const a = smoothOfficeAllocation(peak159, 0, 32)
    expect(a.productive).toBe(159)
    expect(a.inOffice).toBe(Math.round(159 / 0.68))      // 234
    expect(a.shrinkageInOffice).toBe(Math.round(159 / 0.68) - 159) // 75
  })
})

describe('activeAgentIndicesAllocated (Round 7.1)', () => {
  const ramp = makeRamp()

  it('returns all agents in productive set when perInterval is missing', () => {
    const r = activeAgentIndicesAllocated(50, undefined, 720, 32)
    expect(r.productive.size).toBe(50)
    expect(r.shrinkage.size).toBe(0)
  })

  it('partitions agents into productive vs shrinkage at peak with shrinkage', () => {
    const r = activeAgentIndicesAllocated(200, ramp, 720, 32)
    // At peak: productive ≈ 100, inOffice ≈ 147. Shrinkage ≈ 47.
    // With per-agent stagger ±6 min, the actual counts jitter slightly.
    expect(r.productive.size).toBeGreaterThan(85)
    expect(r.productive.size).toBeLessThan(115)
    expect(r.shrinkage.size).toBeGreaterThan(35)
    expect(r.shrinkage.size).toBeLessThan(60)
  })

  it('productive and shrinkage sets never overlap', () => {
    const r = activeAgentIndicesAllocated(200, ramp, 720, 32)
    for (const i of r.productive) {
      expect(r.shrinkage.has(i)).toBe(false)
    }
  })

  it('shrinkage is empty when shrinkPct is 0', () => {
    const r = activeAgentIndicesAllocated(200, ramp, 720, 0)
    expect(r.shrinkage.size).toBe(0)
  })

  it('inactive (off-shift) agents land in neither set', () => {
    const r = activeAgentIndicesAllocated(200, ramp, 720, 32)
    const inactive = 200 - r.productive.size - r.shrinkage.size
    // ~50 agents should be off-shift / absent at peak with 100 + 47 in-office.
    expect(inactive).toBeGreaterThan(30)
  })

  it('low at midnight: most agents in neither set', () => {
    const r = activeAgentIndicesAllocated(200, ramp, 0, 32)
    // ramp[0]=5 productive; with 32% shrink inOffice ≈ 7. So ~193 off-shift.
    expect(r.productive.size + r.shrinkage.size).toBeLessThan(40)
  })
})

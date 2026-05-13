import { describe, it, expect } from 'vitest'
import { __test_internals } from '@/app/components/cockpit/agents/themes/isoOffice/useCamera'

const { clampPan, easeOutCubic } = __test_internals

describe('clampPan', () => {
  // Office is 100 x 100 in viewBox space; 30% must remain visible.
  // axisFrac = sqrt(0.3) ≈ 0.5477 → minOverlap ≈ 54.77 along each axis.
  const baseW = 100, baseH = 100, baseX = 0, baseY = 0, frac = 0.3

  it('returns identity at scale=1, pan=(0,0)', () => {
    const r = clampPan(0, 0, 1, baseX, baseY, baseW, baseH, frac)
    expect(r.panX).toBeCloseTo(0)
    expect(r.panY).toBeCloseTo(0)
  })

  it('clamps an extreme positive pan so the office stays visible', () => {
    // Try to pan way off to the right at scale=1 (push office out of view).
    const r = clampPan(1000, 0, 1, baseX, baseY, baseW, baseH, frac)
    // panX must be reduced — the result should be far less than 1000.
    expect(r.panX).toBeLessThan(50)
  })

  it('clamps an extreme negative pan symmetrically', () => {
    const r = clampPan(-1000, 0, 1, baseX, baseY, baseW, baseH, frac)
    expect(r.panX).toBeGreaterThan(-50)
  })

  it('keeps the viewport overlapping the office when zoomed in', () => {
    // At scale=2 the viewport is 50x50; min per-axis overlap is sqrt(0.3)*100
    // ≈ 54.77 office units. Since the viewport is smaller than the min
    // overlap budget, the viewport is forced to stay fully inside the office
    // — i.e. vbX clamped to [0, 100 - 54.77]. A pan that pushes vbX below 0
    // (panX > 0 → vbX = -panX/scale) gets clamped to vbX = 0 → panX = 0.
    const r = clampPan(40, 0, 2, baseX, baseY, baseW, baseH, frac)
    expect(r.panX).toBe(0)
  })
})

describe('easeOutCubic', () => {
  it('is 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })
  it('is monotonically increasing', () => {
    let prev = 0
    for (let i = 1; i <= 10; i++) {
      const v = easeOutCubic(i / 10)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })
  it('eases out (steeper at start than end)', () => {
    // Slope from 0 to 0.1 should be larger than slope from 0.9 to 1.0.
    const startSlope = (easeOutCubic(0.1) - easeOutCubic(0)) / 0.1
    const endSlope   = (easeOutCubic(1.0) - easeOutCubic(0.9)) / 0.1
    expect(startSlope).toBeGreaterThan(endSlope)
  })
})

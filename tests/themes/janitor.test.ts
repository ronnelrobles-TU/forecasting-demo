import { describe, it, expect } from 'vitest'
import {
  pickDestination,
  mulberry32,
} from '@/app/components/cockpit/agents/themes/isoOffice/Janitor'
import { computeBuildingLayout } from '@/app/components/cockpit/agents/themes/isoOffice/geometry'

const layout = computeBuildingLayout(50)
const hotspots = layout.rooms.agentFloor.janitorHotspots

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produces values in [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('pickDestination', () => {
  it('returns a hotspot from the layout', () => {
    const d = pickDestination(0, 0, hotspots, 0)
    expect(hotspots).toContain(d.hotspot)
  })

  it('is deterministic for the same (janitorIdx, simTimeWindow, leg)', () => {
    const a = pickDestination(1, 100, hotspots, 5)
    const b = pickDestination(1, 100, hotspots, 5)
    expect(a.hotspot.pos).toEqual(b.hotspot.pos)
    expect(a.enterRoom).toBe(b.enterRoom)
  })

  it('different janitor indexes pick different destinations on the same leg', () => {
    // Statistically: with different seeds the destinations will diverge.
    let differences = 0
    for (let leg = 0; leg < 50; leg++) {
      const a = pickDestination(0, 0, hotspots, leg)
      const b = pickDestination(2, 0, hotspots, leg)
      if (a.hotspot !== b.hotspot) differences++
    }
    expect(differences).toBeGreaterThan(20)
  })

  it('janitor 0 prefers aisles, janitor 2 prefers corners (weighted picks)', () => {
    let aisleHits0 = 0
    let cornerHits2 = 0
    for (let leg = 0; leg < 200; leg++) {
      const j0 = pickDestination(0, 0, hotspots, leg)
      const j2 = pickDestination(2, 0, hotspots, leg)
      if (j0.hotspot.type === 'aisle') aisleHits0++
      if (j2.hotspot.type === 'corner') cornerHits2++
    }
    // Janitor 0: 60% aisle weight; janitor 2: 60% corner weight. Allow loose
    // bounds (subject to mulberry32 distribution + hotspot pool sizes).
    expect(aisleHits0).toBeGreaterThan(80)
    expect(cornerHits2).toBeGreaterThan(80)
  })

  it('falls back gracefully when hotspots is empty', () => {
    const d = pickDestination(0, 0, [], 0)
    expect(d.hotspot.pos).toEqual({ x: 0, y: 0 })
    expect(d.enterRoom).toBe(false)
  })
})

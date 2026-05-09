import { describe, it, expect } from 'vitest'
import {
  isoToScreen,
  BREAK_SEAT_POSITIONS,
  MANAGER_POSITION,
  FLOOR_ORIGIN,
  TILE_W,
  TILE_H,
  computeDeskLayout,
  computeBreakSeatPositions,
} from '@/app/components/cockpit/agents/themes/isoOffice/geometry'

describe('isoToScreen', () => {
  it('maps iso (0,0) to FLOOR_ORIGIN', () => {
    expect(isoToScreen(0, 0)).toEqual(FLOOR_ORIGIN)
  })

  it('moves +x (NE direction): screen.x increases, screen.y increases by half', () => {
    const s = isoToScreen(1, 0)
    expect(s.x).toBe(FLOOR_ORIGIN.x + TILE_W / 2)
    expect(s.y).toBe(FLOOR_ORIGIN.y + TILE_H / 2)
  })

  it('moves +y (NW direction): screen.x decreases, screen.y increases', () => {
    const s = isoToScreen(0, 1)
    expect(s.x).toBe(FLOOR_ORIGIN.x - TILE_W / 2)
    expect(s.y).toBe(FLOOR_ORIGIN.y + TILE_H / 2)
  })

  it('positions are linearly additive', () => {
    const a = isoToScreen(2, 3)
    const expected = {
      x: FLOOR_ORIGIN.x + (2 - 3) * (TILE_W / 2),
      y: FLOOR_ORIGIN.y + (2 + 3) * (TILE_H / 2),
    }
    expect(a).toEqual(expected)
  })
})

describe('layout constants', () => {
  it('at least 8 break-seat positions (the original ring)', () => {
    expect(BREAK_SEAT_POSITIONS.length).toBeGreaterThanOrEqual(8)
  })

  it('manager position is in the back-right of the floor', () => {
    expect(MANAGER_POSITION.x).toBeGreaterThan(FLOOR_ORIGIN.x)
    expect(MANAGER_POSITION.y).toBeGreaterThan(FLOOR_ORIGIN.y)
  })
})

describe('computeDeskLayout', () => {
  it('returns tier 1 (spacing 1.0) for small agent counts that fit', () => {
    const layout = computeDeskLayout(6)
    expect(layout.tier).toBe(1)
    expect(layout.tileSpacing).toBe(1.0)
    expect(layout.spriteScale).toBe(1.0)
    expect(layout.positions.length).toBe(6)
  })

  it('returns tier 2 when count exceeds tier 1 capacity', () => {
    // tier 1 capacity is 12; agentCount=13 should bump us to tier 2
    const layout = computeDeskLayout(13)
    expect(layout.tier).toBe(2)
    expect(layout.tileSpacing).toBe(0.5)
    expect(layout.positions.length).toBe(13)
  })

  it('renders all requested agents at the chosen tier (no silent drop)', () => {
    for (const n of [10, 12, 13, 30, 60, 63, 70, 100, 200]) {
      const layout = computeDeskLayout(n)
      expect(layout.positions.length).toBe(n)  // all agents placed
    }
  })

  it('chooses the smallest tier that fits', () => {
    // tier 3 capacity ~239; tier 4 should kick in above that
    const layout250 = computeDeskLayout(250)
    expect(layout250.tier).toBe(4)
    expect(layout250.positions.length).toBe(250)
  })

  it('caps at densest tier capacity when even tier 4 is exceeded', () => {
    const layout = computeDeskLayout(100_000)
    expect(layout.tier).toBe(4)
    expect(layout.positions.length).toBeGreaterThan(0)
    // It returns whatever tier 4 can fit (some large number, but not 100_000)
    expect(layout.positions.length).toBeLessThan(100_000)
  })

  it('positions are sorted back-to-front by i+j depth', () => {
    const layout = computeDeskLayout(20)
    expect(layout.positions.length).toBe(20)
    // Higher screen.y means closer to the front (greater i+j). Back-to-front
    // sorting means y values should be non-decreasing across the array.
    for (let k = 1; k < layout.positions.length; k++) {
      expect(layout.positions[k].y).toBeGreaterThanOrEqual(layout.positions[k - 1].y)
    }
  })

  it('handles zero agents without crashing', () => {
    const layout = computeDeskLayout(0)
    expect(layout.positions.length).toBe(0)
    expect(layout.tier).toBe(1)
  })
})

describe('computeBreakSeatPositions', () => {
  it('returns at least 8 seats (the original ring) for small max', () => {
    expect(computeBreakSeatPositions(5).length).toBeGreaterThanOrEqual(8)
  })
  it('grows the seat count to accommodate higher max', () => {
    const small = computeBreakSeatPositions(8)
    const big = computeBreakSeatPositions(40)
    expect(big.length).toBeGreaterThan(small.length)
    expect(big.length).toBeLessThanOrEqual(40 + 8)  // at most maxBreakAgents extras + ring 1
  })
})

describe('computeBreakSeatPositions capacity', () => {
  it('returns at least 50 seats when 50 are requested', () => {
    expect(computeBreakSeatPositions(50).length).toBeGreaterThanOrEqual(50)
  })
})

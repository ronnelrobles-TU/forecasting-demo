import { describe, it, expect } from 'vitest'
import { computeOfficeLayout, isoToScreen, TILE_W, TILE_H } from '@/app/components/cockpit/agents/themes/isoOffice/geometry'

describe('isoToScreen', () => {
  it('maps (0,0) to provided origin', () => {
    expect(isoToScreen(0, 0, 250, 50)).toEqual({ x: 250, y: 50 })
  })
  it('moves +i: x and y both increase by half tile', () => {
    expect(isoToScreen(1, 0, 0, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 })
  })
  it('moves +j: x decreases, y increases', () => {
    expect(isoToScreen(0, 1, 0, 0)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 })
  })
})

describe('computeOfficeLayout', () => {
  it('floor grows with agent count', () => {
    const small = computeOfficeLayout(6)
    const big = computeOfficeLayout(200)
    expect(big.tilesW).toBeGreaterThan(small.tilesW)
  })

  it('places exactly agentCount desks (no silent drop)', () => {
    for (const n of [1, 6, 12, 30, 60, 100, 200, 500]) {
      const layout = computeOfficeLayout(n)
      expect(layout.deskPositions.length).toBe(n)
    }
  })

  it('viewBox grows with floor', () => {
    const small = computeOfficeLayout(6)
    const big = computeOfficeLayout(200)
    expect(big.viewBox.w).toBeGreaterThan(small.viewBox.w)
    expect(big.viewBox.h).toBeGreaterThan(small.viewBox.h)
  })

  it('manager position is in the back-right', () => {
    const layout = computeOfficeLayout(50)
    expect(layout.manager.deskPosition.x).toBeGreaterThan(layout.origin.x)
  })

  it('break room position is in the front-left', () => {
    const layout = computeOfficeLayout(50)
    expect(layout.breakRoom.tableCenter.x).toBeLessThan(layout.origin.x)
  })

  it('break room has at least 8 seats and grows with agent count', () => {
    expect(computeOfficeLayout(6).breakRoom.seatPositions.length).toBeGreaterThanOrEqual(8)
    expect(computeOfficeLayout(200).breakRoom.seatPositions.length).toBeGreaterThanOrEqual(50)
  })

  it('windowsPerWall grows with floor size', () => {
    const small = computeOfficeLayout(6)
    const big = computeOfficeLayout(100)
    expect(big.windowsPerWall).toBeGreaterThanOrEqual(small.windowsPerWall)
  })
})

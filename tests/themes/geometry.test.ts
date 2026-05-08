import { describe, it, expect } from 'vitest'
import {
  isoToScreen,
  DESK_POSITIONS,
  BREAK_SEAT_POSITIONS,
  MANAGER_POSITION,
  FLOOR_ORIGIN,
  TILE_W,
  TILE_H,
  MAX_AGENTS_OFFICE,
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
  it('exactly 6 desk positions for the agent pool', () => {
    expect(DESK_POSITIONS).toHaveLength(6)
    expect(MAX_AGENTS_OFFICE).toBe(6)
  })

  it('every desk position has a screen-coords pair', () => {
    for (const d of DESK_POSITIONS) {
      expect(typeof d.x).toBe('number')
      expect(typeof d.y).toBe('number')
    }
  })

  it('at least 8 break-seat positions (≥ MAX_AGENTS_OFFICE + 2 headroom)', () => {
    expect(BREAK_SEAT_POSITIONS.length).toBeGreaterThanOrEqual(8)
  })

  it('manager position is in the back-right of the floor', () => {
    expect(MANAGER_POSITION.x).toBeGreaterThan(FLOOR_ORIGIN.x)
    expect(MANAGER_POSITION.y).toBeGreaterThan(FLOOR_ORIGIN.y)
  })
})

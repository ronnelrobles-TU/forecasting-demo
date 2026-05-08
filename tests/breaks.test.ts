import { describe, it, expect } from 'vitest'
import { scheduleBreaks } from '@/lib/kernel/breaks'

describe('scheduleBreaks', () => {
  it('produces one 15-min break per agent', () => {
    const breaks = scheduleBreaks(10, { startMin: 480, endMin: 1080 }, 42)
    expect(breaks).toHaveLength(10)
    for (const b of breaks) {
      expect(b.durationMin).toBe(15)
      expect(b.startMin).toBeGreaterThanOrEqual(480)
      expect(b.startMin + b.durationMin).toBeLessThanOrEqual(1080)
    }
  })

  it('is deterministic for same seed', () => {
    const a = scheduleBreaks(20, { startMin: 480, endMin: 1080 }, 7)
    const b = scheduleBreaks(20, { startMin: 480, endMin: 1080 }, 7)
    expect(a).toEqual(b)
  })

  it('returns empty when 0 agents', () => {
    expect(scheduleBreaks(0, { startMin: 0, endMin: 1440 }, 1)).toEqual([])
  })
})

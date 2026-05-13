import { describe, it, expect } from 'vitest'
import { hexStringToNumber, SHIRT_COLOR_HEX } from '@/app/components/cockpit/agents/themes/isoOfficeHD/colors'
import { pickBubble } from '@/app/components/cockpit/agents/themes/isoOfficeHD/bubbles'

describe('isoOfficeHD/colors', () => {
  it('parses 6-digit hex strings with and without #', () => {
    expect(hexStringToNumber('#22c55e')).toBe(0x22c55e)
    expect(hexStringToNumber('22c55e')).toBe(0x22c55e)
    expect(hexStringToNumber('#000000')).toBe(0x000000)
    expect(hexStringToNumber('#ffffff')).toBe(0xffffff)
  })

  it('parses 3-digit shorthand', () => {
    expect(hexStringToNumber('#fff')).toBe(0xffffff)
    expect(hexStringToNumber('f00')).toBe(0xff0000)
  })

  it('returns black for invalid input', () => {
    expect(hexStringToNumber('')).toBe(0x000000)
    expect(hexStringToNumber('#xyz')).toBe(0x000000)
  })

  it('exposes shirt colors for every visual state', () => {
    expect(SHIRT_COLOR_HEX.idle).toBe(0x22c55e)
    expect(SHIRT_COLOR_HEX.on_call).toBe(0xdc2626)
    expect(SHIRT_COLOR_HEX.on_break).toBe(0xd97706)
    expect(SHIRT_COLOR_HEX.off_shift).toBe(0x475569)
  })
})

describe('isoOfficeHD/bubbles.pickBubble', () => {
  const desk = { x: 0, y: 0 }

  it('off_shift agents have no bubble', () => {
    expect(pickBubble('off_shift', undefined)).toBeNull()
  })

  it('idle agent at desk gets the sleep bubble', () => {
    const b = pickBubble('idle', { kind: 'at_desk', pos: desk })
    expect(b?.emoji).toBe('💤')
  })

  it('on_call agent at desk gets the phone bubble', () => {
    const b = pickBubble('on_call', { kind: 'on_call_at_desk', pos: desk })
    expect(b?.emoji).toBe('📞')
  })

  it('phase wins over sim state, agent in gym shows 💪 even when sim is on_break', () => {
    const b = pickBubble('on_break', {
      kind: 'in_room', targetRoom: 'gym', pos: desk, until: 0,
    })
    expect(b?.emoji).toBe('💪')
  })

  it('inside_restroom suppresses the bubble entirely', () => {
    const b = pickBubble('idle', { kind: 'inside_restroom', pos: desk, until: 0 })
    expect(b).toBeNull()
  })

  it('at_chat_spot bubble has the blue stroke', () => {
    const b = pickBubble('idle', { kind: 'at_chat_spot', pos: desk, until: 0 })
    expect(b).toEqual({ emoji: '💬', strokeColor: 0x3b82f6 })
  })

  it('water_cooler in_room shows 💧', () => {
    const b = pickBubble('idle', {
      kind: 'in_room', targetRoom: 'water_cooler', pos: desk, until: 0,
    })
    expect(b?.emoji).toBe('💧')
  })

  it('at_break_table shows ☕ regardless of sim state', () => {
    const b = pickBubble('idle', { kind: 'at_break_table', pos: desk, until: 0 })
    expect(b?.emoji).toBe('☕')
  })

  it('walking phases drop the bubble', () => {
    const b = pickBubble('idle', {
      kind: 'walking_to_chat_spot',
      from: desk, to: desk, duration: 1000, spot: desk,
    })
    expect(b).toBeNull()
  })

  it('falls back to sim-state bubble when no phase is provided', () => {
    expect(pickBubble('idle', undefined)?.emoji).toBe('💤')
    expect(pickBubble('on_call', undefined)?.emoji).toBe('📞')
    expect(pickBubble('on_break', undefined)?.emoji).toBe('☕')
  })
})

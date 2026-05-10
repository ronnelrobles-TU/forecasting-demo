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
  it('off_shift agents have no bubble', () => {
    expect(pickBubble('off_shift', undefined)).toBeNull()
  })

  it('idle agent at desk gets the sleep bubble', () => {
    const b = pickBubble('idle', undefined)
    expect(b?.emoji).toBe('💤')
  })

  it('on_call agent at desk gets the phone bubble', () => {
    const b = pickBubble('on_call', undefined)
    expect(b?.emoji).toBe('📞')
  })

  it('room activity wins over sim state — gym beats on_break', () => {
    const b = pickBubble('on_break', 'in_gym')
    expect(b?.emoji).toBe('💪')
  })

  it('in_restroom suppresses the bubble entirely', () => {
    expect(pickBubble('idle', 'in_restroom')).toBeNull()
  })

  it('chatting bubble has the blue stroke', () => {
    expect(pickBubble('idle', 'chatting')).toEqual({ emoji: '💬', strokeColor: 0x3b82f6 })
  })
})

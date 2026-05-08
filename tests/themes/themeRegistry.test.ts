import { describe, it, expect } from 'vitest'
import { THEME_REGISTRY } from '@/app/components/cockpit/agents/themes/AgentRenderer'

describe('THEME_REGISTRY', () => {
  it('has entries for both shipping themes', () => {
    expect(Object.keys(THEME_REGISTRY).sort()).toEqual(['dots', 'office'])
  })

  it('every entry is a function (React component)', () => {
    for (const key of Object.keys(THEME_REGISTRY)) {
      expect(typeof THEME_REGISTRY[key as keyof typeof THEME_REGISTRY]).toBe('function')
    }
  })
})

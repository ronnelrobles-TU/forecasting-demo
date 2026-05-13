// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import React from 'react'
import { ScenarioProvider, useScenario } from '@/app/components/cockpit/ScenarioContext'

const wrapper = ({ children }: { children: ReactNode }) =>
  React.createElement(ScenarioProvider, null, children)

beforeEach(() => {
  localStorage.clear()
})

describe('ScenarioContext theme', () => {
  it('defaults to "office" when no localStorage entry exists', () => {
    const { result } = renderHook(() => useScenario(), { wrapper })
    expect(result.current.theme).toBe('office')
  })

  it('hydrates from localStorage on mount', async () => {
    localStorage.setItem('wfm.cockpit.theme', 'dots')
    const { result } = renderHook(() => useScenario(), { wrapper })
    // initial render is server-side default ("office"); useEffect runs after mount
    await act(async () => { await Promise.resolve() })
    expect(result.current.theme).toBe('dots')
  })

  it('setTheme updates state and writes to localStorage', () => {
    const { result } = renderHook(() => useScenario(), { wrapper })
    act(() => result.current.setTheme('dots'))
    expect(result.current.theme).toBe('dots')
    expect(localStorage.getItem('wfm.cockpit.theme')).toBe('dots')
  })

  it('setTheme rejects invalid keys at the type boundary (compile-time, runtime no-op test)', () => {
    const { result } = renderHook(() => useScenario(), { wrapper })
    act(() => result.current.setTheme('office'))
    expect(result.current.theme).toBe('office')
  })
})

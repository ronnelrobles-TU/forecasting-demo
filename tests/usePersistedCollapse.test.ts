// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedCollapse } from '@/lib/onboarding/usePersistedCollapse'
import { STRIP_VERSION } from '@/lib/onboarding/copy'

beforeEach(() => {
  localStorage.clear()
})

describe('usePersistedCollapse', () => {
  it('starts expanded when no localStorage entry', () => {
    const { result } = renderHook(() => usePersistedCollapse('live'))
    expect(result.current.collapsed).toBe(false)
  })

  it('persists collapse state to localStorage', () => {
    const { result } = renderHook(() => usePersistedCollapse('live'))
    act(() => result.current.collapse())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem(`cockpit-strip-live-v${STRIP_VERSION}`)).toBe('collapsed')
  })

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem(`cockpit-strip-monte-v${STRIP_VERSION}`, 'collapsed')
    const { result } = renderHook(() => usePersistedCollapse('monte'))
    expect(result.current.collapsed).toBe(true)
  })

  it('expand() flips state and removes localStorage entry', () => {
    localStorage.setItem(`cockpit-strip-roster-v${STRIP_VERSION}`, 'collapsed')
    const { result } = renderHook(() => usePersistedCollapse('roster'))
    expect(result.current.collapsed).toBe(true)
    act(() => result.current.expand())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem(`cockpit-strip-roster-v${STRIP_VERSION}`)).toBeNull()
  })

  it('different tabs have independent state', () => {
    const live = renderHook(() => usePersistedCollapse('live'))
    const monte = renderHook(() => usePersistedCollapse('monte'))
    act(() => live.result.current.collapse())
    expect(live.result.current.collapsed).toBe(true)
    expect(monte.result.current.collapsed).toBe(false)
  })
})

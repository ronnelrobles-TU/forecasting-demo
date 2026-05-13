'use client'

import { useCallback, useEffect, useState } from 'react'
import { STRIP_VERSION, type TabKey } from './copy'

function storageKey(tab: TabKey): string {
  return `cockpit-strip-${tab}-v${STRIP_VERSION}`
}

export interface PersistedCollapse {
  collapsed: boolean
  collapse: () => void
  expand: () => void
}

export function usePersistedCollapse(tab: TabKey): PersistedCollapse {
  // SSR-safe default: starts expanded server-side. useEffect reads localStorage on mount.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(storageKey(tab))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration; we can't read storage during render server-side, so we set state once on mount
    if (stored === 'collapsed') setCollapsed(true)
  }, [tab])

  const collapse = useCallback(() => {
    setCollapsed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey(tab), 'collapsed')
    }
  }, [tab])

  const expand = useCallback(() => {
    setCollapsed(false)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey(tab))
    }
  }, [tab])

  return { collapsed, collapse, expand }
}

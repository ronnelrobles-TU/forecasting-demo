'use client'

// Round 5.7: collapsible status emoji legend. Default collapsed (just a "?"
// button); on click, expands into a small panel mapping each emoji used by
// StatusBubble to its meaning. Persists open/closed in localStorage so the
// user only has to learn the legend once.

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cockpit-status-legend-open-v1'

const ENTRIES: Array<{ emoji: string; label: string }> = [
  { emoji: '📞', label: 'On call' },
  { emoji: '💤', label: 'Idle' },
  { emoji: '☕', label: 'On break' },
  { emoji: '📚', label: 'In training' },
  { emoji: '💪', label: 'In gym' },
  { emoji: '💬', label: 'Chatting' },
  { emoji: '💧', label: 'Water cooler' },
  { emoji: '🚽', label: 'Restroom (hidden)' },
]

export function StatusLegend() {
  // SSR-safe: starts collapsed, hydrates from localStorage on mount.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration; we can't read storage during render server-side, so we set state once on mount
    if (window.localStorage.getItem(STORAGE_KEY) === 'open') setOpen(true)
  }, [])

  function toggle() {
    setOpen(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        if (next) window.localStorage.setItem(STORAGE_KEY, 'open')
        else window.localStorage.removeItem(STORAGE_KEY)
      }
      return next
    })
  }

  return (
    <div className="cockpit-status-legend">
      <button
        type="button"
        className="cockpit-status-legend-toggle"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? 'Hide status legend' : 'Show status legend'}
        title={open ? 'Hide legend' : 'Show legend'}
      >
        {open ? '×' : '?'}
      </button>
      {open && (
        <div className="cockpit-status-legend-panel" role="region" aria-label="Status legend">
          <div className="cockpit-status-legend-title">What each icon means</div>
          <ul>
            {ENTRIES.map(e => (
              <li key={e.label}>
                <span className="cockpit-status-legend-emoji" aria-hidden="true">{e.emoji}</span>
                <span>{e.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

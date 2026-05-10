'use client'

// Round 5.7 / 5.8: dismissible onboarding hint near the speed control telling
// new users to try the slower speeds (0.1× / 0.25×) so they can actually
// SEE agents walking around instead of teleporting.
//
// Round 5.8: changed from an inline banner crowding the PlayControls row to
// a single 💡 icon button. Hovering reveals the tip in a tooltip popover;
// clicking the × inside the tooltip dismisses the hint forever (localStorage).
// Once dismissed, the icon disappears so returning users get a clean
// PlayControls row with no nag.

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cockpit-speed-hint-dismissed-v1'

export function SpeedHint() {
  // SSR-safe: starts hidden so we don't flash the hint to returning users.
  const [show, setShow] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === 'yes'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration; we can't read storage during render server-side, so we set state once on mount
    if (!dismissed) setShow(true)
  }, [])

  function dismiss() {
    setShow(false)
    setOpen(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'yes')
    }
  }

  if (!show) return null

  return (
    <div
      className="cockpit-speed-hint"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="cockpit-speed-hint-icon-btn"
        aria-label="Tip: try slower playback speeds"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
      >
        <span aria-hidden="true">💡</span>
      </button>
      {open && (
        <div className="cockpit-speed-hint-tooltip" role="tooltip">
          <span className="cockpit-speed-hint-text">
            Try <strong>0.1×</strong> or <strong>0.25×</strong> to watch agents move around the office.
          </span>
          <button
            type="button"
            className="cockpit-speed-hint-dismiss"
            onClick={dismiss}
            aria-label="Don't show this hint again"
            title="Don't show again"
          >×</button>
        </div>
      )}
    </div>
  )
}

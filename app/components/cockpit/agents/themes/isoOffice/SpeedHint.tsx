'use client'

// Round 5.7: dismissible onboarding hint near the speed control telling
// new users to try the slower speeds (0.1× / 0.25×) so they can actually
// SEE agents walking around instead of teleporting. Once dismissed, the
// hint never shows again (localStorage flag).

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cockpit-speed-hint-dismissed-v1'

export function SpeedHint() {
  // SSR-safe: starts hidden so we don't flash the hint to returning users.
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(STORAGE_KEY) === 'yes'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration; we can't read storage during render server-side, so we set state once on mount
    if (!dismissed) setShow(true)
  }, [])

  function dismiss() {
    setShow(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'yes')
    }
  }

  if (!show) return null

  return (
    <div className="cockpit-speed-hint" role="note">
      <span className="cockpit-speed-hint-icon" aria-hidden="true">💡</span>
      <span className="cockpit-speed-hint-text">
        Try <strong>0.1×</strong> or <strong>0.25×</strong> to watch agents move around the office.
      </span>
      <button
        type="button"
        className="cockpit-speed-hint-dismiss"
        onClick={dismiss}
        aria-label="Dismiss hint"
      >×</button>
    </div>
  )
}

'use client'

import { useState, useEffect, type ReactNode } from 'react'

const AUTH_KEY = 'wfm.auth'
const PASSWORD = 'xodus'

export function PasswordGate({ children }: { children: ReactNode }) {
  // Render children unconditionally so the cockpit's DOM/canvas refs mount
  // once and never have to re-initialize when auth state changes. The gate
  // is a fixed-position overlay that visually covers everything until the
  // user is authed.
  const [authed, setAuthed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    setHydrated(true)
    if (typeof window !== 'undefined' && window.localStorage.getItem(AUTH_KEY) === 'true') {
      setAuthed(true)
    }
  }, [])

  function trySubmit() {
    if (input === PASSWORD) {
      window.localStorage.setItem(AUTH_KEY, 'true')
      setAuthed(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  // During SSG and before hydration, treat as unauthed so the gate covers
  // the page on first paint. Once hydrated, show based on localStorage.
  const showGate = !hydrated || !authed

  return (
    <>
      {children}
      {showGate && (
        <div className="password-gate" role="dialog" aria-modal="true" aria-label="Password required">
          <form className="password-gate-form" onSubmit={e => { e.preventDefault(); trySubmit() }}>
            <div className="password-gate-title">WFM Forecasting Demo</div>
            <div className="password-gate-sub">Enter password to continue</div>
            <input
              type="password"
              className="password-gate-input"
              value={input}
              onChange={e => { setInput(e.target.value); setError(false) }}
              autoFocus
              aria-label="Password"
            />
            {error && <div className="password-gate-error">Incorrect password</div>}
            <button type="submit" className="password-gate-btn">Continue</button>
          </form>
        </div>
      )}
    </>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { JARGON, type TermKey } from '@/lib/onboarding/copy'

interface JargonTermProps {
  term: TermKey
  children: React.ReactNode
}

// Module-level: only one popover open at a time across the entire app.
let activeCloser: (() => void) | null = null

export function JargonTerm({ term, children }: JargonTermProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const def = JARGON[term]

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onOutside)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onOutside)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function show() {
    // Close any other open popover.
    if (activeCloser && activeCloser !== closeMe) activeCloser()
    activeCloser = closeMe
    setOpen(true)
  }
  function closeMe() {
    setOpen(false)
    if (activeCloser === closeMe) activeCloser = null
  }

  return (
    <span
      ref={wrapRef}
      className="cockpit-onboarding-term"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); open ? closeMe() : show() }}
    >
      {children}
      {open && (
        <span className="cockpit-onboarding-popover" role="tooltip">
          <span className="cockpit-onboarding-popover-label">{def.label}</span>
          <span className="cockpit-onboarding-popover-body">{def.body}</span>
          <Link
            href={`/learn${def.learnAnchor}`}
            className="cockpit-onboarding-popover-link"
            onClick={e => e.stopPropagation()}
          >More on /learn →</Link>
        </span>
      )}
    </span>
  )
}

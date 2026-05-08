'use client'

import { useEffect } from 'react'
import { EVENT_PRESETS } from './eventPresets'

interface InjectEventModalProps {
  open: boolean
  fireAtMin: number
  onClose: () => void
  onPick: (preset: typeof EVENT_PRESETS[number]) => void
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function InjectEventModal({ open, fireAtMin, onClose, onPick }: InjectEventModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="cockpit-modal-backdrop" onClick={onClose}>
      <div className="cockpit-modal" onClick={e => e.stopPropagation()}>
        <div className="cockpit-modal-title">Inject event at {fmtTime(fireAtMin)}</div>
        <div className="cockpit-modal-list">
          {EVENT_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className="cockpit-modal-item"
              onClick={() => { onPick(p); onClose() }}
            >
              <span className="cockpit-modal-item-emoji">{p.emoji}</span>
              <span className="cockpit-modal-item-label">{p.label}</span>
              <span className="cockpit-modal-item-desc">{p.description}</span>
            </button>
          ))}
        </div>
        <button type="button" className="cockpit-modal-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

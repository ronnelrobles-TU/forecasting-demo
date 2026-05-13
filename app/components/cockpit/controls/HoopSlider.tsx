'use client'

import type { HoopWindow } from '@/lib/types'

function fmt(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface HoopSliderProps {
  value: HoopWindow
  onChange: (v: HoopWindow) => void
}

export function HoopSlider({ value, onChange }: HoopSliderProps) {
  const { startMin, endMin } = value

  function setStart(v: number) {
    const next = Math.min(v, endMin - 30)
    onChange({ startMin: Math.round(next / 30) * 30, endMin })
  }

  function setEnd(v: number) {
    const next = Math.max(v, startMin + 30)
    onChange({ startMin, endMin: Math.round(next / 30) * 30 })
  }

  return (
    <div className="cockpit-hoop">
      <div className="cockpit-hoop-display">{fmt(startMin)}, {fmt(endMin)}</div>
      <div className="cockpit-hoop-track">
        <div
          className="cockpit-hoop-fill"
          style={{ left: `${(startMin / 1440) * 100}%`, right: `${100 - (endMin / 1440) * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={1440}
          step={30}
          value={startMin}
          onChange={e => setStart(Number(e.target.value))}
          aria-label="HOOP start"
          className="cockpit-hoop-thumb cockpit-hoop-thumb-start"
        />
        <input
          type="range"
          min={0}
          max={1440}
          step={30}
          value={endMin}
          onChange={e => setEnd(Number(e.target.value))}
          aria-label="HOOP end"
          className="cockpit-hoop-thumb cockpit-hoop-thumb-end"
        />
      </div>
    </div>
  )
}

'use client'

import type { Speed } from '@/lib/animation/timeScale'
import { SpeedHint } from '../agents/themes/isoOffice/SpeedHint'

interface PlayControlsProps {
  playing: boolean
  speed: Speed
  simTimeMin: number
  onPlayToggle: () => void
  onSpeedChange: (s: Speed) => void
  onReset: () => void
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function PlayControls({ playing, speed, simTimeMin, onPlayToggle, onSpeedChange, onReset }: PlayControlsProps) {
  return (
    <div className="cockpit-play-controls">
      <button type="button" className="cockpit-play-btn" onClick={onPlayToggle}>
        {playing ? '⏸' : '▶'}
      </button>
      <button type="button" className="cockpit-play-btn cockpit-play-btn--small" onClick={onReset} title="Reset to 00:00">
        ⏮
      </button>
      <div className="cockpit-play-time">{fmtTime(simTimeMin)}</div>
      <div className="cockpit-play-speed">
        {([0.1, 0.25, 0.5, 1, 10, 60] as Speed[]).map(s => (
          <button
            key={s}
            type="button"
            className={`cockpit-play-speed-btn ${speed === s ? 'cockpit-play-speed-btn--active' : ''}`}
            onClick={() => onSpeedChange(s)}
            title={`${s}× — ${(1440 / (s * 24)).toFixed(0)}s real per sim day`}
          >
            {s}×
          </button>
        ))}
        {/* Round 5.8: hint moved inside the speed cluster as a 💡 icon
            button so it sits next to the buttons it refers to and doesn't
            spread the controls bar wide. */}
        <SpeedHint />
      </div>
    </div>
  )
}

'use client'

// Round 5.7: prominent sim-time clock pinned to the top-left of the office
// canvas. The play controls already show the time but it's tiny and lives
// outside the main viz; new users miss it. This makes "what time is it in
// the simulation?" obvious at a glance.

interface SceneClockProps {
  simTimeMin: number
}

function fmt12h(min: number): { time: string; suffix: string } {
  const totalH = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  const suffix = totalH < 12 ? 'AM' : 'PM'
  const h12 = totalH % 12 === 0 ? 12 : totalH % 12
  return { time: `${h12}:${String(m).padStart(2, '0')}`, suffix }
}

export function SceneClock({ simTimeMin }: SceneClockProps) {
  const { time, suffix } = fmt12h(simTimeMin)
  return (
    <div className="cockpit-scene-clock" aria-label={`Sim time ${time} ${suffix}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="8" y1="8" x2="8" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="8" y1="8" x2="11" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      <span className="cockpit-scene-clock-time">{time}</span>
      <span className="cockpit-scene-clock-suffix">{suffix}</span>
    </div>
  )
}

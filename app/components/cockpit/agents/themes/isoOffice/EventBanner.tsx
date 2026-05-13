'use client'

import { eventBadge, formatRemaining, type ActiveInjectedEvent } from './injectedEventVisuals'
import type { InjectedEvent } from '@/lib/types'

interface EventBannerProps {
  active: ActiveInjectedEvent[]
}

// Round 9: cinematic banner stack. Each event gets a larger card with a
// dark backdrop, an animated icon (CSS keyframes per event type), prominent
// title, secondary subtitle, and a live countdown with a "remaining" tag.
// Slide-in/out is handled by the .cockpit-event-card animation in CSS.

function bannerLabel(ev: InjectedEvent): { headline: string; sub: string } {
  switch (ev.type) {
    case 'volume_surge':
      return { headline: 'CALL SURGE', sub: `+${Math.round(ev.magnitude * 100)}% volume incoming` }
    case 'aht_spike':
      return { headline: 'SYSTEM SLOWDOWN', sub: `AHT ×${(1 + ev.magnitude).toFixed(1)}, calls stuck` }
    case 'staff_drop':
      return { headline: 'TYPHOON ALERT', sub: `−${Math.round(ev.magnitude * 100)}% staff for the day` }
    case 'flash_absent':
      return { headline: 'AGENTS UNAVAILABLE', sub: `${ev.magnitude} agents just dropped` }
    case 'custom':
      return { headline: 'EVENT', sub: 'Custom' }
  }
}

/** Bigger, dramatic icon used in the cinematic banner. */
function iconFor(ev: InjectedEvent): string {
  return eventBadge(ev).emoji
}

export function EventBanner({ active }: EventBannerProps) {
  if (active.length === 0) return null
  return (
    <div className="cockpit-event-banner" role="status" aria-live="polite">
      {active.map(a => {
        const label = bannerLabel(a.ev)
        return (
          <div
            key={a.id}
            className={`cockpit-event-card cockpit-event-card--${a.ev.type}`}
          >
            <div
              className={`cockpit-event-card-icon cockpit-event-card-icon--${a.ev.type}`}
              aria-hidden="true"
            >
              {iconFor(a.ev)}
            </div>
            <div className="cockpit-event-card-text">
              <div className="cockpit-event-card-title">{label.headline}</div>
              <div className="cockpit-event-card-subtitle">{label.sub}</div>
            </div>
            <div className="cockpit-event-card-countdown" aria-label="time remaining">
              {formatRemaining(a.remainingMin)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

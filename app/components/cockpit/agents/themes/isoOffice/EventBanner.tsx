'use client'

import { eventBadge, formatRemaining, type ActiveInjectedEvent } from './injectedEventVisuals'

interface EventBannerProps {
  active: ActiveInjectedEvent[]
}

/**
 * Top-center stack of toasts, one per currently-active injected event.
 * Renders nothing when there are no active events. Each toast shows
 *   [emoji] TITLE · subtitle · remaining
 */
export function EventBanner({ active }: EventBannerProps) {
  if (active.length === 0) return null
  return (
    <div className="cockpit-event-banner" role="status" aria-live="polite">
      {active.map(a => {
        const badge = eventBadge(a.ev)
        return (
          <div
            key={a.id}
            className={`cockpit-event-toast cockpit-event-toast--${a.ev.type}`}
          >
            <span className="cockpit-event-toast-emoji" aria-hidden="true">{badge.emoji}</span>
            <span className="cockpit-event-toast-title">{badge.title}</span>
            {badge.subtitle && (
              <span className="cockpit-event-toast-subtitle">· {badge.subtitle}</span>
            )}
            <span className="cockpit-event-toast-remaining">· {formatRemaining(a.remainingMin)}</span>
          </div>
        )
      })}
    </div>
  )
}

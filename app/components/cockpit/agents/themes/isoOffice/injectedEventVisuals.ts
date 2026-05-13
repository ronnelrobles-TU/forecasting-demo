import type { InjectedEvent } from '@/lib/types'

/**
 * Sim-time-aware classification of injected events. Used by IsoRenderer +
 * EventBanner to know which visual cues to apply at the current minute.
 *
 * "Active" semantics mirror the kernel's `inject.ts`:
 *   • volume_surge / aht_spike: active for [fireAtMin, fireAtMin + durationMin)
 *   • staff_drop: active from fireAtMin to end-of-day (no durationMin)
 *   • flash_absent: instant, we keep it "shown" for FLASH_DISPLAY_MIN minutes
 *     after firing, so the banner has time to be read at any sim speed.
 */

// Round 15: bumped from 5 → 8 sim-min so the flash_absent toast persists
// long enough to be read at 1× speed (≈8s wall-clock). Tunable here only.
const FLASH_DISPLAY_MIN = 8

export interface ActiveInjectedEvent {
  ev: InjectedEvent
  /** Whole-minute remaining in sim time (banner countdown). */
  remainingMin: number
  /** Stable id (index-based) so React can key on it. */
  id: string
}

export function activeInjectedEvents(events: InjectedEvent[] | undefined, currentMin: number): ActiveInjectedEvent[] {
  if (!events || events.length === 0) return []
  const out: ActiveInjectedEvent[] = []
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (currentMin < ev.fireAtMin) continue
    if (ev.type === 'flash_absent') {
      // Instantaneous, show banner for a few minutes after fire so it's visible.
      const elapsed = currentMin - ev.fireAtMin
      if (elapsed >= FLASH_DISPLAY_MIN) continue
      out.push({ ev, remainingMin: Math.max(0, FLASH_DISPLAY_MIN - elapsed), id: `e${i}` })
      continue
    }
    if (ev.durationMin == null) {
      // Open-ended (e.g. staff_drop), no countdown.
      out.push({ ev, remainingMin: Number.POSITIVE_INFINITY, id: `e${i}` })
      continue
    }
    const endMin = ev.fireAtMin + ev.durationMin
    if (currentMin >= endMin) continue
    out.push({ ev, remainingMin: Math.max(0, endMin - currentMin), id: `e${i}` })
  }
  return out
}

export interface EventBadge {
  emoji: string
  title: string
  /** Short subtitle (e.g. "+30% volume"). */
  subtitle?: string
}

export function eventBadge(ev: InjectedEvent): EventBadge {
  switch (ev.type) {
    case 'volume_surge':
      return { emoji: '🌪', title: 'Call surge', subtitle: `+${Math.round(ev.magnitude * 100)}% volume` }
    case 'aht_spike':
      return { emoji: '📞', title: 'System slowdown', subtitle: `AHT ×${(1 + ev.magnitude).toFixed(1)}` }
    case 'staff_drop':
      return { emoji: '🌀', title: 'Staff reduction', subtitle: `−${Math.round(ev.magnitude * 100)}% agents` }
    case 'flash_absent':
      return { emoji: '🚨', title: `${ev.magnitude} agents unavailable` }
    case 'custom':
      return { emoji: '✦', title: 'Custom event' }
  }
}

/** Aggregated visual flags for the office canvas. */
export interface EventVisualFlags {
  /** Pulse a red ring around the door + heat the agent floor. */
  surgeActive: boolean
  /** Outage banner + dim the office. */
  outageActive: boolean
  /** Show a "departing" tint over agents leaving. */
  staffDropActive: boolean
  /** Last few minutes of a flash-absent, flash desks red. */
  flashAbsentActive: boolean
}

export function eventVisualFlags(active: ActiveInjectedEvent[]): EventVisualFlags {
  const flags: EventVisualFlags = {
    surgeActive: false,
    outageActive: false,
    staffDropActive: false,
    flashAbsentActive: false,
  }
  for (const a of active) {
    switch (a.ev.type) {
      case 'volume_surge': flags.surgeActive = true; break
      case 'aht_spike':    flags.outageActive = true; break
      case 'staff_drop':   flags.staffDropActive = true; break
      case 'flash_absent': flags.flashAbsentActive = true; break
    }
  }
  return flags
}

/** Format a remaining-minutes value as "12m" or "1h 5m" or "live". */
export function formatRemaining(remainingMin: number): string {
  if (!Number.isFinite(remainingMin)) return 'live'
  const total = Math.max(0, Math.ceil(remainingMin))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total - h * 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

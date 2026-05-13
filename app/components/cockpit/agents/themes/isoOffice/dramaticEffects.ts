// Round 9: shared "dramatic effect" state + helpers used by both renderers.
//
// Translates the list of currently-active injected events into a set of
// quantitative knobs the renderers can act on (intensity ramps, recent-flash
// flags, queue-counter strings, etc.). This sits a layer above
// `injectedEventVisuals.ts` — that file produces booleans + banner badges,
// while this file produces *intensities* and *time-relative* values used to
// drive cinematic visual effects (phone particles, lightning bolts, puffs,
// storm overlays).
//
// All math is pure / synchronous. The renderers call this each render and
// pass the resulting state to their effect-paint pass.

import type { ActiveInjectedEvent } from './injectedEventVisuals'

// Round 15: bumped from 5 → 8 sim-min so the puff/edge-flash/counter window
// matches the EventBanner's display window (FLASH_DISPLAY_MIN = 8).
const FLASH_RECENT_MIN = 8         // a "flash absent" is "recent" for 8 sim min
const SURGE_RAMP_MIN = 2           // ramp-in over 2 sim min so the drama eases in
const OUTAGE_RAMP_MIN = 1
const STAFF_DROP_RAMP_MIN = 1

export interface DramaticEffectState {
  // Surge ────────────────────────────────────────────────────────────────
  surgeActive: boolean
  /** 0..1 ramped intensity — climbs to 1.0 over SURGE_RAMP_MIN minutes. */
  surgeIntensity: number
  /** Whole sim minutes remaining (Infinity if open-ended). */
  surgeRemainingMin: number
  /** Magnitude (0..1) of the surge (e.g. 0.3 = +30% volume). */
  surgeMagnitude: number

  // Outage ───────────────────────────────────────────────────────────────
  outageActive: boolean
  outageIntensity: number
  outageRemainingMin: number
  outageAhtMultiplier: number

  // Staff drop (typhoon) ─────────────────────────────────────────────────
  staffDropActive: boolean
  staffDropIntensity: number
  staffDropMagnitude: number   // 0..1 — fraction of staff dropped

  // Flash absent ─────────────────────────────────────────────────────────
  /** True for ~5 sim min after a flash_absent fires. */
  flashAbsentRecent: boolean
  /** Number of agents flash-removed (sum of magnitudes from recent events). */
  flashAbsentCount: number
  /** Ages (in sim minutes) of every recent flash event — used to tag puff
   *  bursts so the renderer only spawns once per event. */
  flashAbsentEvents: { id: string; ageMin: number; count: number }[]
}

export const EMPTY_DRAMATIC_STATE: DramaticEffectState = {
  surgeActive: false,
  surgeIntensity: 0,
  surgeRemainingMin: 0,
  surgeMagnitude: 0,
  outageActive: false,
  outageIntensity: 0,
  outageRemainingMin: 0,
  outageAhtMultiplier: 1,
  staffDropActive: false,
  staffDropIntensity: 0,
  staffDropMagnitude: 0,
  flashAbsentRecent: false,
  flashAbsentCount: 0,
  flashAbsentEvents: [],
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Given the active-event list (already filtered by `activeInjectedEvents`)
 * and the current sim minute, derive the dramatic-effect state.
 *
 * Intensity ramps in over a few sim minutes from each event's fireAtMin so
 * the drama doesn't snap-on jarringly when the user injects an event. (For
 * `flash_absent`, which is instantaneous, this is moot — `flashAbsentRecent`
 * just means "still in the post-fire window".)
 */
export function computeDramaticState(
  active: ActiveInjectedEvent[],
  currentMin: number,
): DramaticEffectState {
  const out: DramaticEffectState = { ...EMPTY_DRAMATIC_STATE, flashAbsentEvents: [] }
  for (const a of active) {
    const e = a.ev
    const elapsed = Math.max(0, currentMin - e.fireAtMin)
    switch (e.type) {
      case 'volume_surge': {
        out.surgeActive = true
        out.surgeIntensity = Math.max(out.surgeIntensity, clamp01(elapsed / SURGE_RAMP_MIN))
        out.surgeRemainingMin = Math.max(out.surgeRemainingMin, a.remainingMin)
        out.surgeMagnitude = Math.max(out.surgeMagnitude, e.magnitude)
        break
      }
      case 'aht_spike': {
        out.outageActive = true
        out.outageIntensity = Math.max(out.outageIntensity, clamp01(elapsed / OUTAGE_RAMP_MIN))
        out.outageRemainingMin = Math.max(out.outageRemainingMin, a.remainingMin)
        // magnitude is "delta over 1×" (e.g. 1 → AHT ×2), so multiplier = 1 + magnitude.
        out.outageAhtMultiplier = Math.max(out.outageAhtMultiplier, 1 + e.magnitude)
        break
      }
      case 'staff_drop': {
        out.staffDropActive = true
        out.staffDropIntensity = Math.max(
          out.staffDropIntensity,
          clamp01(elapsed / STAFF_DROP_RAMP_MIN),
        )
        out.staffDropMagnitude = Math.max(out.staffDropMagnitude, e.magnitude)
        break
      }
      case 'flash_absent': {
        if (elapsed <= FLASH_RECENT_MIN) {
          out.flashAbsentRecent = true
          out.flashAbsentCount += e.magnitude
          out.flashAbsentEvents.push({ id: a.id, ageMin: elapsed, count: e.magnitude })
        }
        break
      }
      // 'custom' has no kernel effect → no dramatic visuals beyond the banner.
      case 'custom':
        break
    }
  }
  return out
}

/**
 * Estimate the queue depth ("CALLS WAITING: N") to surface above the door
 * during a surge. Uses the most recent perInterval queueLen if available,
 * otherwise scales from the surge magnitude as a fallback.
 */
export function estimateQueueDepth(
  surgeIntensity: number,
  surgeMagnitude: number,
  perIntervalQueueLen: number | null,
): number {
  if (perIntervalQueueLen != null && Number.isFinite(perIntervalQueueLen)) {
    return Math.round(perIntervalQueueLen * (1 + surgeMagnitude * surgeIntensity))
  }
  // Fallback: a believable demo number that scales with magnitude + ramp.
  return Math.round(15 + surgeMagnitude * 80 * surgeIntensity)
}

/**
 * Format remaining sim minutes as MM:SS-ish for the cinematic banner.
 * Sim minutes don't have a natural seconds component, so we render either
 * "12m" / "1h 5m" (use formatRemaining from injectedEventVisuals for that)
 * or the live label.
 */
export function formatLiveCountdown(remainingMin: number): string {
  if (!Number.isFinite(remainingMin)) return 'LIVE'
  const total = Math.max(0, Math.ceil(remainingMin))
  if (total < 60) return `${total}m remaining`
  const h = Math.floor(total / 60)
  const m = total - h * 60
  return m === 0 ? `${h}h remaining` : `${h}h ${m}m remaining`
}

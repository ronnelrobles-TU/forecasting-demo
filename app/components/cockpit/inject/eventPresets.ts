import type { InjectedEvent } from '@/lib/types'

/**
 * Round 15: presets now describe an *optional default magnitude / duration*
 * separate from the `build` factory. The Inject modal uses these defaults to
 * populate the customization sliders, then synthesizes the actual event(s)
 * from the user-tuned values via {@link buildEventsFromPreset}.
 *
 * `build` is still exported for the quick-fire path (click → fire with the
 * preset's defaults). It now returns `InjectedEvent[]` so compound presets
 * like `compound_crisis` can dispatch multiple events at once without
 * changing call-sites.
 */

export type PresetId =
  | 'surge'
  | 'outage'
  | 'typhoon'
  | 'flash_absent'
  | 'viral_surge'
  | 'major_outage'
  | 'half_team_training'
  | 'system_failure'
  | 'flash_absent_large'
  | 'compound_crisis'
  | 'custom'

export type EventKind = InjectedEvent['type']

/**
 * Tunable parameters for a preset. Each preset declares which knobs the
 * user can adjust + the default values + safe slider ranges.
 *
 * For compound presets, `parts` lists each sub-event's tunables.
 */
export interface PresetPart {
  /** Which kernel event kind this part fires. */
  kind: Exclude<EventKind, 'custom'>
  /** Default magnitude (interpretation depends on kind, see slider config). */
  defaultMagnitude: number
  /** Default duration in minutes (omit for instantaneous / open-ended). */
  defaultDurationMin?: number
}

export interface EventPreset {
  id: PresetId
  label: string
  emoji: string
  description: string
  /** Sub-events composing this preset. Single-event presets have one part. */
  parts: PresetPart[]
  /**
   * Build the event(s) using the preset's default magnitudes / durations.
   * Returns an array so compound presets work uniformly with the modal.
   */
  build: (fireAtMin: number) => InjectedEvent[]
}

/** Magnitude / duration ranges per kernel event kind, used by the modal sliders. */
export interface KindSliderConfig {
  magnitude: { min: number; max: number; step: number; format: (v: number) => string }
  /** When undefined, the event is instantaneous and has no duration knob. */
  duration?: {
    min: number
    max: number
    step: number
    quickPicks: number[]
    /** Allow a "rest of day" / open-ended option (only meaningful for staff_drop). */
    allowOpenEnded?: boolean
  }
}

export const KIND_SLIDER_CONFIG: Record<Exclude<EventKind, 'custom'>, KindSliderConfig> = {
  volume_surge: {
    // 0% .. 200%, magnitude is interpreted as a fractional add (1 + m).
    magnitude: { min: 0, max: 2, step: 0.05, format: v => `+${Math.round(v * 100)}% volume` },
    duration:  { min: 5, max: 480, step: 5, quickPicks: [15, 30, 60, 120, 240] },
  },
  aht_spike: {
    // 0× .. 5× extra (so AHT multiplier 1× .. 6×).
    magnitude: { min: 0, max: 5, step: 0.1, format: v => `×${(1 + v).toFixed(1)} AHT` },
    duration:  { min: 5, max: 480, step: 5, quickPicks: [15, 30, 60, 120, 240] },
  },
  staff_drop: {
    // 0% .. 80% staff offline.
    magnitude: { min: 0, max: 0.8, step: 0.05, format: v => `−${Math.round(v * 100)}% staff` },
    duration:  { min: 5, max: 600, step: 5, quickPicks: [15, 30, 60, 120, 240], allowOpenEnded: true },
  },
  flash_absent: {
    // 0 .. 100 agents instantly.
    magnitude: { min: 0, max: 100, step: 1, format: v => `−${Math.round(v)} agents` },
    // Instantaneous, no duration.
  },
}

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'surge',
    label: 'Surge',
    emoji: '🌪',
    description: '+30% volume for 2 hours',
    parts: [{ kind: 'volume_surge', defaultMagnitude: 0.3, defaultDurationMin: 120 }],
    build: fireAtMin => [{ type: 'volume_surge', fireAtMin, durationMin: 120, magnitude: 0.3 }],
  },
  {
    id: 'outage',
    label: 'Outage',
    emoji: '📞',
    description: 'AHT doubles for 1 hour',
    parts: [{ kind: 'aht_spike', defaultMagnitude: 1.0, defaultDurationMin: 60 }],
    build: fireAtMin => [{ type: 'aht_spike', fireAtMin, durationMin: 60, magnitude: 1.0 }],
  },
  {
    id: 'typhoon',
    label: 'Typhoon',
    emoji: '🌀',
    description: '−25% staff for the rest of the day',
    // duration omitted = open-ended (rest of day).
    parts: [{ kind: 'staff_drop', defaultMagnitude: 0.25 }],
    build: fireAtMin => [{ type: 'staff_drop', fireAtMin, magnitude: 0.25 }],
  },
  {
    id: 'flash_absent',
    label: 'Flash absent',
    emoji: '🚨',
    description: '−15 agents instantly',
    parts: [{ kind: 'flash_absent', defaultMagnitude: 15 }],
    build: fireAtMin => [{ type: 'flash_absent', fireAtMin, magnitude: 15 }],
  },
  // ── Round 15: stronger preset library ────────────────────────────────────
  {
    id: 'viral_surge',
    label: 'Viral surge',
    emoji: '🔥',
    description: '+100% volume for 30 minutes (social media moment)',
    parts: [{ kind: 'volume_surge', defaultMagnitude: 1.0, defaultDurationMin: 30 }],
    build: fireAtMin => [{ type: 'volume_surge', fireAtMin, durationMin: 30, magnitude: 1.0 }],
  },
  {
    id: 'major_outage',
    label: 'Major outage',
    emoji: '⚠️',
    description: 'AHT triples for 2 hours (system slowdown)',
    parts: [{ kind: 'aht_spike', defaultMagnitude: 2.0, defaultDurationMin: 120 }],
    build: fireAtMin => [{ type: 'aht_spike', fireAtMin, durationMin: 120, magnitude: 2.0 }],
  },
  {
    id: 'half_team_training',
    label: 'Mass training',
    emoji: '📚',
    description: '−50% productive for 4 hours (mandatory training session)',
    parts: [{ kind: 'staff_drop', defaultMagnitude: 0.5, defaultDurationMin: 240 }],
    build: fireAtMin => [{ type: 'staff_drop', fireAtMin, durationMin: 240, magnitude: 0.5 }],
  },
  {
    id: 'system_failure',
    label: 'System failure',
    emoji: '💥',
    description: '−40% staff offline for 1 hour (workstation crash)',
    parts: [{ kind: 'staff_drop', defaultMagnitude: 0.4, defaultDurationMin: 60 }],
    build: fireAtMin => [{ type: 'staff_drop', fireAtMin, durationMin: 60, magnitude: 0.4 }],
  },
  {
    id: 'flash_absent_large',
    label: 'Mass flash absent',
    emoji: '🚨',
    description: '−40 agents instantly (food poisoning at lunch?)',
    parts: [{ kind: 'flash_absent', defaultMagnitude: 40 }],
    build: fireAtMin => [{ type: 'flash_absent', fireAtMin, magnitude: 40 }],
  },
  {
    id: 'compound_crisis',
    label: 'Compound crisis',
    emoji: '🎭',
    description: 'Surge + AHT spike + staff drop all at once (perfect storm)',
    parts: [
      { kind: 'volume_surge', defaultMagnitude: 0.75, defaultDurationMin: 60 },
      { kind: 'aht_spike',    defaultMagnitude: 1.5,  defaultDurationMin: 60 },
      { kind: 'staff_drop',   defaultMagnitude: 0.3,  defaultDurationMin: 60 },
    ],
    build: fireAtMin => [
      { type: 'volume_surge', fireAtMin, durationMin: 60, magnitude: 0.75 },
      { type: 'aht_spike',    fireAtMin, durationMin: 60, magnitude: 1.5 },
      { type: 'staff_drop',   fireAtMin, durationMin: 60, magnitude: 0.3 },
    ],
  },
]

/**
 * Tuned values for each part of a preset, as edited by the user in the modal.
 * Indexed by part position so it lines up with `EventPreset.parts`.
 *
 *   • `magnitude`, replaces the part's defaultMagnitude.
 *   • `durationMin === undefined` → fall back to part's defaultDurationMin.
 *   • `durationMin === null`      → open-ended ("rest of day"), staff_drop only.
 *   • `durationMin === number`    → that many minutes.
 */
export interface PartTuning {
  magnitude: number
  durationMin?: number | null
}

/** Build the kernel event(s) for a preset using user-supplied tuning. */
export function buildEventsFromPreset(
  preset: EventPreset,
  fireAtMin: number,
  tunings: PartTuning[],
): InjectedEvent[] {
  const out: InjectedEvent[] = []
  for (let i = 0; i < preset.parts.length; i++) {
    const part = preset.parts[i]
    const tuning = tunings[i] ?? { magnitude: part.defaultMagnitude, durationMin: part.defaultDurationMin }
    const ev: InjectedEvent = {
      type: part.kind,
      fireAtMin,
      magnitude: tuning.magnitude,
    }
    if (part.kind !== 'flash_absent') {
      const dur = tuning.durationMin === undefined ? part.defaultDurationMin : tuning.durationMin
      // null → open-ended (rest of day) for staff_drop; for surge/aht we
      // always emit a duration (fall back to the preset default).
      if (dur != null) ev.durationMin = dur
    }
    out.push(ev)
  }
  return out
}

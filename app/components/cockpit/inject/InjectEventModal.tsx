'use client'

// Round 15: the inject modal is now an event *composer*.
//
//   • Quick-fire (single-click): pick a preset → it fires immediately with
//     the preset's defaults. Same UX as before.
//   • Customize (toggle on a preset card): expands a row of magnitude /
//     duration sliders + a "Fire at" input. Edits live in local state until
//     the user hits "Inject now" or "Add to stack".
//   • Custom (last card): pick event kind + magnitude + duration, then
//     inject. This replaces the no-op "custom" event from the kernel with
//     a real perturbation built from the chosen kind.
//   • Add to stack: when customizing, the user can push the configured
//     event(s) onto a "pending" list and add another before submitting, //     supports compound crises beyond the canned preset.

import { useEffect, useState } from 'react'
import type { InjectedEvent } from '@/lib/types'
import {
  EVENT_PRESETS,
  KIND_SLIDER_CONFIG,
  buildEventsFromPreset,
  type EventKind,
  type EventPreset,
  type PartTuning,
} from './eventPresets'

interface InjectEventModalProps {
  open: boolean
  fireAtMin: number
  onClose: () => void
  /** Called once per submission with all configured events for that submission. */
  onSubmit: (events: InjectedEvent[]) => void
}

/**
 * Public wrapper: only mounts the inner modal when `open` is true so the
 * inner component's transient state (tunings / pending stack) is reset by
 * mount instead of by a setState-in-effect (which the lint rule forbids).
 */
export function InjectEventModal(props: InjectEventModalProps) {
  if (!props.open) return null
  return <InjectEventModalInner {...props} />
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtDuration(min: number | null | undefined): string {
  if (min == null) return 'rest of day'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min - h * 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ── Tuning state shape for an in-progress preset / custom event ──────────

interface PresetTuningState {
  /** Per-part tunings, lined up with `preset.parts`. */
  parts: PartTuning[]
  /** Sim minute the event fires at. Defaults to current sim time. */
  fireAtMin: number
}

function defaultTuning(preset: EventPreset, fireAtMin: number): PresetTuningState {
  return {
    parts: preset.parts.map(p => ({
      magnitude: p.defaultMagnitude,
      durationMin: p.defaultDurationMin,
    })),
    fireAtMin,
  }
}

// ── Custom event composer state ──────────────────────────────────────────

interface CustomState {
  kind: Exclude<EventKind, 'custom'>
  magnitude: number
  durationMin: number | null
  fireAtMin: number
}

function defaultCustomState(fireAtMin: number): CustomState {
  return {
    kind: 'volume_surge',
    magnitude: 0.5,
    durationMin: 60,
    fireAtMin,
  }
}

function customToEvent(c: CustomState): InjectedEvent {
  const ev: InjectedEvent = { type: c.kind, fireAtMin: c.fireAtMin, magnitude: c.magnitude }
  if (c.kind !== 'flash_absent' && c.durationMin != null) ev.durationMin = c.durationMin
  return ev
}

// ── Modal ────────────────────────────────────────────────────────────────

function InjectEventModalInner({ fireAtMin, onClose, onSubmit }: InjectEventModalProps) {
  // Per-preset tuning state, keyed by preset id (so each card remembers its
  // edits while the user toggles between cards). State is fresh on each open
  // because the parent only mounts this component when `open` is true.
  const [tunings, setTunings] = useState<Record<string, PresetTuningState>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState<CustomState>(() => defaultCustomState(fireAtMin))
  const [customExpanded, setCustomExpanded] = useState(false)
  const [pending, setPending] = useState<InjectedEvent[]>([])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function quickFire(preset: EventPreset) {
    const events = preset.build(fireAtMin)
    onSubmit([...pending, ...events])
    onClose()
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function tuningFor(preset: EventPreset): PresetTuningState {
    return tunings[preset.id] ?? defaultTuning(preset, fireAtMin)
  }

  function setTuningFor(preset: EventPreset, next: PresetTuningState) {
    setTunings(prev => ({ ...prev, [preset.id]: next }))
  }

  function addPresetToPending(preset: EventPreset) {
    const t = tuningFor(preset)
    const events = buildEventsFromPreset(preset, t.fireAtMin, t.parts)
    setPending(prev => [...prev, ...events])
    // Reset this preset's tuning + collapse so the user can configure another
    // copy (or a different preset) cleanly.
    setTunings(prev => {
      const next = { ...prev }
      delete next[preset.id]
      return next
    })
    setExpanded(prev => {
      const next = new Set(prev)
      next.delete(preset.id)
      return next
    })
  }

  function addCustomToPending() {
    setPending(prev => [...prev, customToEvent(custom)])
    setCustom(defaultCustomState(fireAtMin))
    setCustomExpanded(false)
  }

  function injectPresetNow(preset: EventPreset) {
    const t = tuningFor(preset)
    const events = buildEventsFromPreset(preset, t.fireAtMin, t.parts)
    onSubmit([...pending, ...events])
    onClose()
  }

  function injectCustomNow() {
    onSubmit([...pending, customToEvent(custom)])
    onClose()
  }

  function injectPendingOnly() {
    if (pending.length === 0) return
    onSubmit(pending)
    onClose()
  }

  return (
    <div className="cockpit-modal-backdrop" onClick={onClose}>
      <div className="cockpit-modal cockpit-modal--inject" onClick={e => e.stopPropagation()}>
        <div className="cockpit-modal-title">
          Inject event at {fmtTime(fireAtMin)}
          {pending.length > 0 && (
            <span className="cockpit-modal-pending-pill" aria-label={`${pending.length} queued`}>
              {pending.length} queued
            </span>
          )}
        </div>

        <div className="cockpit-modal-list">
          {EVENT_PRESETS.map(p => {
            const isExpanded = expanded.has(p.id)
            const tuning = tuningFor(p)
            return (
              <div key={p.id} className={`cockpit-modal-item-card ${isExpanded ? 'is-expanded' : ''}`}>
                <div className="cockpit-modal-item-row">
                  <button
                    type="button"
                    className="cockpit-modal-item"
                    onClick={() => quickFire(p)}
                    title="Click to fire with default values"
                  >
                    <span className="cockpit-modal-item-emoji">{p.emoji}</span>
                    <span className="cockpit-modal-item-label">{p.label}</span>
                    <span className="cockpit-modal-item-desc">{p.description}</span>
                  </button>
                  <button
                    type="button"
                    className="cockpit-modal-customize-btn"
                    onClick={() => toggleExpanded(p.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Close' : 'Tune…'}
                  </button>
                </div>
                {isExpanded && (
                  <PresetTuner
                    preset={p}
                    state={tuning}
                    defaultFireAtMin={fireAtMin}
                    onChange={next => setTuningFor(p, next)}
                    onAddToStack={() => addPresetToPending(p)}
                    onInjectNow={() => injectPresetNow(p)}
                  />
                )}
              </div>
            )
          })}

          {/* Custom event composer ─────────────────────────────────────── */}
          <div className={`cockpit-modal-item-card ${customExpanded ? 'is-expanded' : ''}`}>
            <div className="cockpit-modal-item-row">
              <button
                type="button"
                className="cockpit-modal-item"
                onClick={() => setCustomExpanded(v => !v)}
                aria-expanded={customExpanded}
              >
                <span className="cockpit-modal-item-emoji">✦</span>
                <span className="cockpit-modal-item-label">Custom event</span>
                <span className="cockpit-modal-item-desc">Build your own perturbation: pick type, magnitude, duration</span>
              </button>
              <button
                type="button"
                className="cockpit-modal-customize-btn"
                onClick={() => setCustomExpanded(v => !v)}
                aria-expanded={customExpanded}
              >
                {customExpanded ? 'Close' : 'Compose…'}
              </button>
            </div>
            {customExpanded && (
              <CustomComposer
                state={custom}
                defaultFireAtMin={fireAtMin}
                onChange={setCustom}
                onAddToStack={addCustomToPending}
                onInjectNow={injectCustomNow}
              />
            )}
          </div>
        </div>

        {pending.length > 0 && (
          <div className="cockpit-modal-pending">
            <div className="cockpit-modal-pending-title">Queued events ({pending.length})</div>
            <ul className="cockpit-modal-pending-list">
              {pending.map((ev, i) => (
                <li key={i} className="cockpit-modal-pending-row">
                  <span className="cockpit-modal-pending-kind">{ev.type}</span>
                  <span className="cockpit-modal-pending-mag">{summarizeEvent(ev)}</span>
                  <button
                    type="button"
                    className="cockpit-modal-pending-remove"
                    onClick={() => setPending(prev => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove queued ${ev.type}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="cockpit-modal-pending-fire"
              onClick={injectPendingOnly}
            >
              Inject {pending.length} queued event{pending.length === 1 ? '' : 's'}
            </button>
          </div>
        )}

        <button type="button" className="cockpit-modal-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

// ── Tuner subcomponents ──────────────────────────────────────────────────

interface PresetTunerProps {
  preset: EventPreset
  state: PresetTuningState
  defaultFireAtMin: number
  onChange: (next: PresetTuningState) => void
  onAddToStack: () => void
  onInjectNow: () => void
}

function PresetTuner({ preset, state, defaultFireAtMin, onChange, onAddToStack, onInjectNow }: PresetTunerProps) {
  return (
    <div className="cockpit-modal-tuner">
      {preset.parts.map((part, i) => {
        const cfg = KIND_SLIDER_CONFIG[part.kind]
        const t = state.parts[i] ?? { magnitude: part.defaultMagnitude, durationMin: part.defaultDurationMin }
        return (
          <div key={i} className="cockpit-modal-tuner-row">
            <div className="cockpit-modal-tuner-label">
              {preset.parts.length > 1 ? `${i + 1}. ` : ''}{labelForKind(part.kind)}
            </div>
            <MagnitudeSlider
              value={t.magnitude}
              min={cfg.magnitude.min}
              max={cfg.magnitude.max}
              step={cfg.magnitude.step}
              format={cfg.magnitude.format}
              onChange={v => onChange({
                ...state,
                parts: state.parts.map((p, j) => j === i ? { ...p, magnitude: v } : p),
              })}
            />
            {cfg.duration && (
              <DurationPicker
                value={t.durationMin === undefined ? part.defaultDurationMin ?? null : t.durationMin}
                config={cfg.duration}
                onChange={v => onChange({
                  ...state,
                  parts: state.parts.map((p, j) => j === i ? { ...p, durationMin: v } : p),
                })}
              />
            )}
          </div>
        )
      })}
      <FireAtRow
        value={state.fireAtMin}
        defaultValue={defaultFireAtMin}
        onChange={v => onChange({ ...state, fireAtMin: v })}
      />
      <div className="cockpit-modal-tuner-actions">
        <button type="button" className="cockpit-modal-stack-btn" onClick={onAddToStack}>
          + Add to stack
        </button>
        <button type="button" className="cockpit-modal-fire-btn" onClick={onInjectNow}>
          Inject now
        </button>
      </div>
    </div>
  )
}

interface CustomComposerProps {
  state: CustomState
  defaultFireAtMin: number
  onChange: (next: CustomState) => void
  onAddToStack: () => void
  onInjectNow: () => void
}

function CustomComposer({ state, defaultFireAtMin, onChange, onAddToStack, onInjectNow }: CustomComposerProps) {
  const cfg = KIND_SLIDER_CONFIG[state.kind]
  return (
    <div className="cockpit-modal-tuner">
      <div className="cockpit-modal-tuner-row">
        <div className="cockpit-modal-tuner-label">Perturbation</div>
        <select
          className="cockpit-select cockpit-modal-kind-select"
          value={state.kind}
          onChange={e => {
            const k = e.target.value as Exclude<EventKind, 'custom'>
            const newCfg = KIND_SLIDER_CONFIG[k]
            onChange({
              kind: k,
              magnitude: clamp(state.magnitude, newCfg.magnitude.min, newCfg.magnitude.max),
              durationMin: newCfg.duration ? (state.durationMin ?? 60) : null,
              fireAtMin: state.fireAtMin,
            })
          }}
        >
          <option value="volume_surge">Volume surge (more calls)</option>
          <option value="aht_spike">AHT spike (slower handling)</option>
          <option value="staff_drop">Staff drop (% offline)</option>
          <option value="flash_absent">Flash absent (N agents)</option>
        </select>
      </div>
      <div className="cockpit-modal-tuner-row">
        <div className="cockpit-modal-tuner-label">{labelForKind(state.kind)}</div>
        <MagnitudeSlider
          value={state.magnitude}
          min={cfg.magnitude.min}
          max={cfg.magnitude.max}
          step={cfg.magnitude.step}
          format={cfg.magnitude.format}
          onChange={v => onChange({ ...state, magnitude: v })}
        />
        {cfg.duration && (
          <DurationPicker
            value={state.durationMin}
            config={cfg.duration}
            onChange={v => onChange({ ...state, durationMin: v })}
          />
        )}
      </div>
      <FireAtRow
        value={state.fireAtMin}
        defaultValue={defaultFireAtMin}
        onChange={v => onChange({ ...state, fireAtMin: v })}
      />
      <div className="cockpit-modal-tuner-actions">
        <button type="button" className="cockpit-modal-stack-btn" onClick={onAddToStack}>
          + Add to stack
        </button>
        <button type="button" className="cockpit-modal-fire-btn" onClick={onInjectNow}>
          Inject now
        </button>
      </div>
    </div>
  )
}

interface MagnitudeSliderProps {
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function MagnitudeSlider({ value, min, max, step, format, onChange }: MagnitudeSliderProps) {
  return (
    <div className="cockpit-modal-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="cockpit-modal-slider-value">{format(value)}</span>
    </div>
  )
}

interface DurationPickerProps {
  value: number | null
  config: NonNullable<typeof KIND_SLIDER_CONFIG['volume_surge']['duration']>
  onChange: (v: number | null) => void
}

function DurationPicker({ value, config, onChange }: DurationPickerProps) {
  // For sliders: when "rest of day" (null) is selected, fall back to a sane
  // intermediate value so the slider thumb still has a position to render.
  const sliderValue = value ?? Math.min(config.max, 240)
  return (
    <div className="cockpit-modal-duration">
      <div className="cockpit-modal-slider">
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={sliderValue}
          onChange={e => onChange(Number(e.target.value))}
          disabled={value == null}
        />
        <span className="cockpit-modal-slider-value">{fmtDuration(value)}</span>
      </div>
      <div className="cockpit-modal-quickpicks">
        {config.quickPicks.map(q => (
          <button
            key={q}
            type="button"
            className={`cockpit-modal-quickpick ${value === q ? 'is-active' : ''}`}
            onClick={() => onChange(q)}
          >
            {fmtDuration(q)}
          </button>
        ))}
        {config.allowOpenEnded && (
          <button
            type="button"
            className={`cockpit-modal-quickpick ${value == null ? 'is-active' : ''}`}
            onClick={() => onChange(null)}
          >
            rest of day
          </button>
        )}
      </div>
    </div>
  )
}

interface FireAtRowProps {
  value: number
  defaultValue: number
  onChange: (v: number) => void
}

function FireAtRow({ value, defaultValue, onChange }: FireAtRowProps) {
  return (
    <div className="cockpit-modal-tuner-row">
      <div className="cockpit-modal-tuner-label">Fire at</div>
      <div className="cockpit-modal-fire-at">
        <input
          type="time"
          value={fmtTime(value)}
          onChange={e => {
            const [h, m] = e.target.value.split(':').map(Number)
            if (Number.isFinite(h) && Number.isFinite(m)) onChange(h * 60 + m)
          }}
        />
        {value !== defaultValue && (
          <button
            type="button"
            className="cockpit-modal-fire-at-reset"
            onClick={() => onChange(defaultValue)}
            title="Reset to current sim time"
          >
            now
          </button>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function labelForKind(k: Exclude<EventKind, 'custom'>): string {
  switch (k) {
    case 'volume_surge': return 'Volume'
    case 'aht_spike':    return 'AHT'
    case 'staff_drop':   return 'Staff'
    case 'flash_absent': return 'Flash absent'
  }
}

function summarizeEvent(ev: InjectedEvent): string {
  const at = `@ ${fmtTime(ev.fireAtMin)}`
  switch (ev.type) {
    case 'volume_surge':
      return `+${Math.round(ev.magnitude * 100)}% for ${fmtDuration(ev.durationMin)} ${at}`
    case 'aht_spike':
      return `×${(1 + ev.magnitude).toFixed(1)} AHT for ${fmtDuration(ev.durationMin)} ${at}`
    case 'staff_drop':
      return `−${Math.round(ev.magnitude * 100)}% for ${fmtDuration(ev.durationMin)} ${at}`
    case 'flash_absent':
      return `−${Math.round(ev.magnitude)} agents ${at}`
    case 'custom':
      return `custom ${at}`
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

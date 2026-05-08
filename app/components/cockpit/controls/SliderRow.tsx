'use client'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}

export function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <div className="cockpit-slider-row">
      <div className="cockpit-slider-header">
        <span className="cockpit-slider-label">{label}</span>
        <span className="cockpit-slider-value">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="cockpit-range"
      />
    </div>
  )
}

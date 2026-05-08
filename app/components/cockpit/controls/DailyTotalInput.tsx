'use client'

interface DailyTotalInputProps {
  value: number
  onChange: (v: number) => void
}

export function DailyTotalInput({ value, onChange }: DailyTotalInputProps) {
  return (
    <div className="cockpit-daily-total">
      <label className="cockpit-daily-total-label">Daily total</label>
      <input
        type="number"
        min={100}
        max={100000}
        step={100}
        value={value}
        onChange={e => onChange(Math.max(100, Number(e.target.value) || 0))}
        className="cockpit-daily-total-input"
      />
      <span className="cockpit-daily-total-suffix">calls/day</span>
    </div>
  )
}

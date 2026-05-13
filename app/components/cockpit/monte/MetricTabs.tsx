'use client'

import type { MetricKey } from '@/lib/animation/fanStats'

interface MetricTabsProps {
  active: MetricKey
  onChange: (m: MetricKey) => void
}

const TABS: Array<{ key: MetricKey; label: string }> = [
  { key: 'sl', label: 'Service Level' },
  { key: 'abandons', label: 'Abandons' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'asa', label: 'Avg ASA' },
]

export function MetricTabs({ active, onChange }: MetricTabsProps) {
  return (
    <div className="cockpit-monte-metric-tabs" role="tablist">
      {TABS.map(t => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`cockpit-monte-metric-tab ${active === t.key ? 'cockpit-monte-metric-tab--active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

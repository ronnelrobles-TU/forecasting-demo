'use client'

import type { MetricKey } from '@/lib/animation/fanStats'

interface DailyHistogramProps {
  values: number[]            // raw daily values for the active metric
  metric: MetricKey
  targetSl?: number           // 0..1, only relevant when metric === 'sl'
  p10: number                 // metric value at P10 across days
  p50: number                 // metric value at P50 across days
  p90: number                 // metric value at P90 across days
  width?: number
  height?: number
}

const BIN_COUNT = 20
const PADDING = { top: 12, right: 16, bottom: 28, left: 38 }

function formatValue(metric: MetricKey, v: number): string {
  switch (metric) {
    case 'sl':
    case 'occupancy':
      return `${(v * 100).toFixed(0)}%`
    case 'asa':
      return `${v.toFixed(1)}s`
    case 'abandons':
      return v >= 100 ? Math.round(v).toString() : v.toFixed(0)
  }
}

function metricLabel(metric: MetricKey): string {
  switch (metric) {
    case 'sl': return 'Daily SL'
    case 'abandons': return 'Daily abandons'
    case 'occupancy': return 'Daily occupancy'
    case 'asa': return 'Daily ASA'
  }
}

export function DailyHistogram({
  values, metric, targetSl, p10, p50, p90,
  width = 280, height = 220,
}: DailyHistogramProps) {
  if (values.length === 0) {
    return (
      <div className="cockpit-monte-histogram cockpit-monte-histogram--empty">
        <div className="cockpit-monte-histogram-title">{metricLabel(metric)}</div>
        <div className="cockpit-placeholder"><p>No data</p></div>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // Avoid zero-width range — pad by tiny amount
  const range = max - min || 1
  const binWidth = range / BIN_COUNT
  const bins = new Array(BIN_COUNT).fill(0)
  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth)
    if (idx >= BIN_COUNT) idx = BIN_COUNT - 1
    if (idx < 0) idx = 0
    bins[idx]++
  }
  const maxCount = Math.max(...bins, 1)

  const innerW = width - PADDING.left - PADDING.right
  const innerH = height - PADDING.top - PADDING.bottom
  const barW = innerW / BIN_COUNT

  function xFor(v: number): number {
    return PADDING.left + ((v - min) / range) * innerW
  }

  return (
    <div className="cockpit-monte-histogram">
      <div className="cockpit-monte-histogram-title">{metricLabel(metric)} distribution</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="cockpit-monte-histogram-svg"
        role="img"
        aria-label={`${metricLabel(metric)} distribution histogram`}
      >
        {/* Bars */}
        {bins.map((count, i) => {
          const h = (count / maxCount) * innerH
          const x = PADDING.left + i * barW
          const y = PADDING.top + (innerH - h)
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(0.5, barW - 1)}
              height={h}
              fill="rgba(59,130,246,0.55)"
            />
          )
        })}

        {/* Baseline */}
        <line
          x1={PADDING.left} x2={PADDING.left + innerW}
          y1={PADDING.top + innerH} y2={PADDING.top + innerH}
          stroke="rgba(255,255,255,0.18)" strokeWidth={1}
        />

        {/* Y label (count axis hint) */}
        <text
          x={4} y={PADDING.top + 6}
          fontSize={9} fill="#64748b"
        >
          n={values.length}
        </text>

        {/* P10/P50/P90 markers */}
        {[
          { v: p10, label: 'P10', color: '#3b82f6' },
          { v: p50, label: 'P50', color: '#ffffff' },
          { v: p90, label: 'P90', color: '#3b82f6' },
        ].map(({ v, label, color }) => {
          if (v < min || v > max) return null
          const x = xFor(v)
          return (
            <g key={label}>
              <line
                x1={x} x2={x}
                y1={PADDING.top} y2={PADDING.top + innerH}
                stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.85}
              />
              <text
                x={x} y={PADDING.top - 2}
                fontSize={9} fill={color} textAnchor="middle"
              >
                {label}
              </text>
            </g>
          )
        })}

        {/* Target SL line (only for SL) */}
        {metric === 'sl' && targetSl !== undefined && targetSl >= min && targetSl <= max && (
          <g>
            <line
              x1={xFor(targetSl)} x2={xFor(targetSl)}
              y1={PADDING.top} y2={PADDING.top + innerH}
              stroke="#10b981" strokeWidth={1.5}
            />
            <text
              x={xFor(targetSl)} y={PADDING.top + innerH + 12}
              fontSize={9} fill="#10b981" textAnchor="middle"
            >
              target
            </text>
          </g>
        )}

        {/* X axis labels: min / max */}
        <text
          x={PADDING.left} y={PADDING.top + innerH + 14}
          fontSize={9} fill="#94a3b8"
        >
          {formatValue(metric, min)}
        </text>
        <text
          x={PADDING.left + innerW} y={PADDING.top + innerH + 14}
          fontSize={9} fill="#94a3b8" textAnchor="end"
        >
          {formatValue(metric, max)}
        </text>
      </svg>
      <div className="cockpit-monte-histogram-legend">
        <span><span className="cockpit-monte-hl-swatch" style={{ background: '#3b82f6' }} /> P10/P90</span>
        <span><span className="cockpit-monte-hl-swatch" style={{ background: '#fff' }} /> P50</span>
        {metric === 'sl' && (
          <span><span className="cockpit-monte-hl-swatch" style={{ background: '#10b981' }} /> target</span>
        )}
      </div>
    </div>
  )
}

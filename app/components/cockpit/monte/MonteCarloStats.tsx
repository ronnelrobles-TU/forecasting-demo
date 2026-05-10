'use client'

export type ReplayKind = 'best' | 'median' | 'worst'

interface MonteCarloStatsProps {
  daysBelowSl: number
  totalDays: number
  p50Sl: number       // 0..1
  p10Sl: number       // 0..1
  onReplay: (kind: ReplayKind) => void
  replayDisabled: boolean
}

export function MonteCarloStats({
  daysBelowSl, totalDays, p50Sl, p10Sl, onReplay, replayDisabled,
}: MonteCarloStatsProps) {
  const pctBelow = totalDays > 0 ? (daysBelowSl / totalDays) * 100 : 0
  return (
    <div className="cockpit-monte-stats-row">
      <div className="cockpit-monte-replay-row">
        <button
          type="button"
          className="cockpit-monte-replay-btn cockpit-monte-replay-btn--best"
          disabled={replayDisabled}
          onClick={() => onReplay('best')}
        >
          ▶ Best day
        </button>
        <button
          type="button"
          className="cockpit-monte-replay-btn cockpit-monte-replay-btn--median"
          disabled={replayDisabled}
          onClick={() => onReplay('median')}
        >
          ▶ Median day
        </button>
        <button
          type="button"
          className="cockpit-monte-replay-btn cockpit-monte-replay-btn--worst"
          disabled={replayDisabled}
          onClick={() => onReplay('worst')}
        >
          ▶ Worst day
        </button>
      </div>
      <div className="cockpit-monte-stats-inline">
        <span className="cockpit-monte-stats-chip">
          <span className="cockpit-monte-stats-chip-label">Days below SL</span>
          <span className="cockpit-monte-stats-chip-value cockpit-monte-stat-value--red">
            {pctBelow.toFixed(1)}%
          </span>
          <span className="cockpit-monte-stats-chip-sub">{daysBelowSl} of {totalDays}</span>
        </span>
        <span className="cockpit-monte-stats-chip">
          <span className="cockpit-monte-stats-chip-label">P50 SL</span>
          <span className="cockpit-monte-stats-chip-value cockpit-monte-stat-value--green">
            {(p50Sl * 100).toFixed(1)}%
          </span>
        </span>
        <span className="cockpit-monte-stats-chip">
          <span className="cockpit-monte-stats-chip-label">P10 SL · &ldquo;bad day&rdquo;</span>
          <span className="cockpit-monte-stats-chip-value cockpit-monte-stat-value--amber">
            {(p10Sl * 100).toFixed(1)}%
          </span>
        </span>
      </div>
    </div>
  )
}

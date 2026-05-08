'use client'

interface MonteCarloStatsProps {
  daysBelowSl: number
  totalDays: number
  p50Sl: number       // 0..1
  p10Sl: number       // 0..1
  onReplayWorstDay: () => void
  replayDisabled: boolean
}

export function MonteCarloStats({
  daysBelowSl, totalDays, p50Sl, p10Sl, onReplayWorstDay, replayDisabled,
}: MonteCarloStatsProps) {
  const pctBelow = totalDays > 0 ? (daysBelowSl / totalDays) * 100 : 0
  return (
    <div className="cockpit-monte-stats">
      <div className="cockpit-monte-stat">
        <div className="cockpit-monte-stat-label">Days below SL</div>
        <div className="cockpit-monte-stat-value cockpit-monte-stat-value--red">
          {pctBelow.toFixed(1)}%
        </div>
        <div className="cockpit-monte-stat-sub">{daysBelowSl} of {totalDays}</div>
      </div>
      <div className="cockpit-monte-stat">
        <div className="cockpit-monte-stat-label">P50 SL</div>
        <div className="cockpit-monte-stat-value cockpit-monte-stat-value--green">
          {(p50Sl * 100).toFixed(1)}%
        </div>
      </div>
      <div className="cockpit-monte-stat">
        <div className="cockpit-monte-stat-label">P10 SL · "bad day"</div>
        <div className="cockpit-monte-stat-value cockpit-monte-stat-value--amber">
          {(p10Sl * 100).toFixed(1)}%
        </div>
      </div>
      <button
        type="button"
        className="cockpit-monte-replay-btn"
        disabled={replayDisabled}
        onClick={onReplayWorstDay}
      >
        ▶ Replay worst day
      </button>
    </div>
  )
}

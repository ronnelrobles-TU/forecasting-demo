'use client'

interface OptimizerControlsProps {
  budgetAgentHours: number
  onBudgetChange: (n: number) => void
  iter: number | null            // null when not running
  totalIter: number
  bestScore: number | null
  onAutoGenerate: () => void
  onAddShift: () => void
  onClearRoster: () => void
  running: boolean
}

export function OptimizerControls({
  budgetAgentHours, onBudgetChange,
  iter, totalIter, bestScore,
  onAutoGenerate, onAddShift, onClearRoster, running,
}: OptimizerControlsProps) {
  return (
    <div className="cockpit-roster-controls">
      <button
        type="button"
        className="cockpit-roster-auto-btn"
        onClick={onAutoGenerate}
        disabled={running}
      >
        🧠 {running ? 'Optimizing…' : 'Auto-generate'}
      </button>

      <div className="cockpit-roster-iter-display">
        {iter != null
          ? `iter ${iter}/${totalIter} · best score: ${(bestScore ?? 0).toFixed(3)}`
          : bestScore != null
            ? `done · best score: ${bestScore.toFixed(3)}`
            : 'idle'}
      </div>

      <div className="cockpit-roster-budget">
        <label className="cockpit-roster-budget-label">Budget</label>
        <input
          type="range"
          min={100}
          max={5000}
          step={50}
          value={budgetAgentHours}
          onChange={e => onBudgetChange(Number(e.target.value))}
          className="cockpit-roster-budget-slider"
        />
        <span className="cockpit-roster-budget-value">{budgetAgentHours} agent-hours</span>
      </div>

      <div className="cockpit-roster-actions">
        <button type="button" className="cockpit-roster-action-btn" onClick={onAddShift}>+ Add shift</button>
        <button type="button" className="cockpit-roster-action-btn cockpit-roster-action-btn--ghost" onClick={onClearRoster}>Clear</button>
      </div>
    </div>
  )
}

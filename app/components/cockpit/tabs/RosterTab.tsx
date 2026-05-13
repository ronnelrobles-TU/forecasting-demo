'use client'

import { useMemo, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { RosterGantt } from '../roster/RosterGantt'
import { CoverageLine } from '../roster/CoverageLine'
import { OptimizerControls } from '../roster/OptimizerControls'
import { RosterPreview } from '../roster/RosterPreview'
import { runOptimize } from '@/app/workers/optimizerClient'
import { buildDefaultRoster, totalAgentHours } from '@/lib/kernel/roster'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import type { RosterShift } from '@/lib/types'
import { TabIntroStrip } from '../onboarding/TabIntroStrip'
import { TabIntroReopenLink } from '../onboarding/TabIntroReopenLink'

const TOTAL_ITER = 300

function newShiftId(): string {
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`
}

export function RosterTab() {
  const { scenario, setRoster, addShift, removeShift, updateShift } = useScenario()
  const [iter, setIter] = useState<number | null>(null)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  // Default budget: peak Erlang C × HOOP hours
  const defaultBudget = useMemo(() => {
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const peakCalls = Math.max(0.001, ...calls)
    const { N } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    const hoopHours = (scenario.hoop.endMin - scenario.hoop.startMin) / 60
    return Math.max(100, Math.round(scheduled * hoopHours))
  }, [scenario])

  const [budget, setBudget] = useState<number>(defaultBudget)

  const roster: RosterShift[] = scenario.roster ?? []
  const usedHours = totalAgentHours(roster)

  function handleAutoGenerate() {
    setRunning(true)
    setIter(0)
    setBestScore(null)
    runOptimize({
      scenario,
      budgetAgentHours: budget,
      iterations: TOTAL_ITER,
      emitEvery: 20,
      optSeed: scenario.rngSeed,
      onProgress: (i, best, score) => {
        setIter(i)
        setBestScore(score)
        setRoster(best)
      },
    })
      .then(final => {
        setRoster(final)
        setRunning(false)
      })
      .catch(() => {
        setRunning(false)
      })
  }

  function handleAddShift() {
    const start = scenario.hoop.startMin
    const end = Math.min(scenario.hoop.endMin, start + 480)   // default 8h
    addShift({
      id: newShiftId(),
      startMin: start,
      endMin: end,
      agentCount: 10,
      breaks: [],
    })
  }

  function handleClear() {
    setRoster(null)
    setIter(null)
    setBestScore(null)
  }

  return (
    <div className="cockpit-viewport cockpit-roster-viewport">
      <div className="cockpit-viewport-header">
        <span>Roster Designer</span>
        <span className="cockpit-viewport-sub">
          {roster.length === 0
            ? 'no roster, kernel falling back to Erlang C auto-staffing'
            : `${roster.length} shift${roster.length === 1 ? '' : 's'} · ${usedHours.toFixed(0)} / ${budget} agent-hours`}
          {' '}<TabIntroReopenLink tab="roster" />
        </span>
      </div>
      <TabIntroStrip tab="roster" />
      <div className="cockpit-viewport-body cockpit-roster-body">
        <OptimizerControls
          budgetAgentHours={budget}
          onBudgetChange={setBudget}
          iter={iter}
          totalIter={TOTAL_ITER}
          bestScore={bestScore}
          onAutoGenerate={handleAutoGenerate}
          onAddShift={handleAddShift}
          onClearRoster={handleClear}
          running={running}
        />
        <div className="cockpit-roster-grid">
          <div className="cockpit-roster-grid-left">
            <div className="cockpit-roster-gantt-frame">
              <RosterGantt
                roster={roster}
                onUpdateShift={updateShift}
                onRemoveShift={removeShift}
              />
            </div>
            <div className="cockpit-roster-coverage-frame">
              <CoverageLine scenario={scenario} roster={roster} />
            </div>
          </div>
          <RosterPreview />
        </div>
      </div>
    </div>
  )
}

// Suppress unused import warning for buildDefaultRoster, it's exposed for future use
// (e.g., a "Reset to default" button). Remove this line once consumed.
void buildDefaultRoster

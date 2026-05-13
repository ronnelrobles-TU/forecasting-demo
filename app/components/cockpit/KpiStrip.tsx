'use client'

import React, { useMemo } from 'react'
import { useScenario } from './ScenarioContext'
import { JargonTerm } from './onboarding/JargonTerm'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents, serviceLevel, avgWait } from '@/lib/erlang'
import type { IntervalStat } from '@/lib/types'

interface KpiStripProps {
  /** When provided, the strip renders TWO rows: top = peak Erlang C plan, bottom = live snapshot at simTimeMin. */
  live?: { stats: IntervalStat; abandons: number; simTimeMin: number; scheduledHC: number } | null
}

interface PlanKpis {
  N: number
  scheduled: number
  sl: number
  occ: number
  asa: number
}

function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.floor(min) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Plain-text tooltips for each KPI label. Native HTML `title` attributes, // no custom popover. The user reported confusion about why "Active agents
// (Live)" doesn't match "At desks" in the office viz; the difference is the
// shrinkage activities (break, training, etc.). These tooltips spell out
// each metric's definition so the relationship is discoverable on hover.
const KPI_TIPS = {
  erlangC: 'The productive headcount required by Erlang C math at peak demand',
  scheduledPlan: 'Total headcount you need to schedule (Erlang ÷ (1−shrink) ÷ (1−abs)) to net the required productive count',
  activeLive: 'Number of agents currently scheduled / in the office at this moment in the simulation',
  scheduledLive: 'Live scheduled headcount for the current interval, accounting for shrinkage and absenteeism',
  sl: 'Percentage of calls answered within the SL threshold (current interval)',
  occ: 'Percentage of available agent-time spent on calls (high = overloaded)',
  asa: 'Average speed of answer (seconds calls wait before being answered)',
  abandons: 'Calls where the customer hung up before being answered',
} as const

export function KpiStrip({ live = null }: KpiStripProps = {}) {
  const { scenario } = useScenario()

  const plan: PlanKpis = useMemo(() => {
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const peakCalls = Math.max(0.001, ...calls)
    if (peakCalls <= 0.01) return { N: 0, scheduled: 0, sl: 1, occ: 0, asa: 0 }
    const { N, A } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    const sl = serviceLevel(N, A, scenario.aht, scenario.asa)
    const occ = Math.min(1, A / N)
    const asa = avgWait(N, A, scenario.aht)
    return { N, scheduled, sl, occ, asa }
  }, [scenario])

  if (!live) {
    return (
      <div className="cockpit-kpi-strip">
        <PlanCells plan={plan} />
      </div>
    )
  }

  return (
    <div className="cockpit-kpi-stack">
      <div className="cockpit-kpi-strip cockpit-kpi-strip--with-prefix">
        <div className="cockpit-kpi-prefix">PLAN</div>
        <PlanCells plan={plan} />
      </div>
      <div className="cockpit-kpi-strip cockpit-kpi-strip--with-prefix cockpit-kpi-strip--live">
        <div className="cockpit-kpi-prefix">LIVE · {fmtTime(live.simTimeMin)}</div>
        <Kpi label="Active agents"                                                      value={String(live.stats.agents)}      tip={KPI_TIPS.activeLive} />
        <Kpi label="Scheduled HC"                                                       value={String(live.scheduledHC)}       tip={KPI_TIPS.scheduledLive} />
        <Kpi label={<JargonTerm term="sl">Service Level</JargonTerm>}                   value={`${(live.stats.sl * 100).toFixed(1)}%`} accent="green" tip={KPI_TIPS.sl} />
        <Kpi label={<JargonTerm term="occupancy">Occupancy</JargonTerm>}                value={`${(live.stats.occ * 100).toFixed(1)}%`} accent="amber" tip={KPI_TIPS.occ} />
        <Kpi label={<JargonTerm term="abandons">Abandons</JargonTerm>}                  value={String(live.abandons)}          tip={KPI_TIPS.abandons} />
      </div>
    </div>
  )
}

function PlanCells({ plan }: { plan: PlanKpis }) {
  return (
    <>
      <Kpi label={<JargonTerm term="erlang-c">Erlang C agents</JargonTerm>}          value={String(plan.N)}         tip={KPI_TIPS.erlangC} />
      <Kpi label="Scheduled HC"                                                       value={String(plan.scheduled)} tip={KPI_TIPS.scheduledPlan} />
      <Kpi label={<JargonTerm term="sl">Service Level</JargonTerm>}                  value={`${(plan.sl * 100).toFixed(1)}%`} accent="green" tip={KPI_TIPS.sl} />
      <Kpi label={<JargonTerm term="occupancy">Occupancy</JargonTerm>}               value={`${(plan.occ * 100).toFixed(1)}%`} accent="amber" tip={KPI_TIPS.occ} />
      <Kpi label={<JargonTerm term="asa">Avg ASA</JargonTerm>}                       value={`${Math.round(plan.asa)}s`}       tip={KPI_TIPS.asa} />
    </>
  )
}

function Kpi({ label, value, accent, muted, tip }: { label: React.ReactNode; value: string; accent?: 'green' | 'amber'; muted?: boolean; tip?: string }) {
  // `tip` becomes a native HTML title attribute on the cell so hovering
  // anywhere on the KPI (label or value) shows the tooltip. Intentionally
  // unobtrusive, no popovers, no JS, just discoverable plain-text help.
  return (
    <div className={`cockpit-kpi ${muted ? 'cockpit-kpi--muted' : ''}`} title={tip}>
      <div className="cockpit-kpi-label">{label}</div>
      <div className={`cockpit-kpi-value cockpit-kpi-${accent ?? 'neutral'}`}>{value}</div>
    </div>
  )
}

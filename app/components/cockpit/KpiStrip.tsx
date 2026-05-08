'use client'

import React, { useMemo } from 'react'
import { useScenario } from './ScenarioContext'
import { JargonTerm } from './onboarding/JargonTerm'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents, serviceLevel, avgWait } from '@/lib/erlang'
import type { IntervalStat } from '@/lib/types'

interface KpiStripProps {
  /** When provided, the strip renders TWO rows: top = peak Erlang C plan, bottom = live snapshot at simTimeMin. */
  live?: { stats: IntervalStat; abandons: number; simTimeMin: number } | null
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
        <Kpi label="Active agents"                                                      value={String(live.stats.agents)} />
        <Kpi label="Scheduled HC"                                                        value="—" muted />
        <Kpi label={<JargonTerm term="sl">Service Level</JargonTerm>}                   value={`${(live.stats.sl * 100).toFixed(1)}%`} accent="green" />
        <Kpi label={<JargonTerm term="occupancy">Occupancy</JargonTerm>}                value={`${(live.stats.occ * 100).toFixed(1)}%`} accent="amber" />
        <Kpi label={<JargonTerm term="abandons">Abandons</JargonTerm>}                  value={String(live.abandons)} />
      </div>
    </div>
  )
}

function PlanCells({ plan }: { plan: PlanKpis }) {
  return (
    <>
      <Kpi label={<JargonTerm term="erlang-c">Erlang C agents</JargonTerm>}          value={String(plan.N)} />
      <Kpi label="Scheduled HC"                                                       value={String(plan.scheduled)} />
      <Kpi label={<JargonTerm term="sl">Service Level</JargonTerm>}                  value={`${(plan.sl * 100).toFixed(1)}%`} accent="green" />
      <Kpi label={<JargonTerm term="occupancy">Occupancy</JargonTerm>}               value={`${(plan.occ * 100).toFixed(1)}%`} accent="amber" />
      <Kpi label={<JargonTerm term="asa">Avg ASA</JargonTerm>}                       value={`${Math.round(plan.asa)}s`} />
    </>
  )
}

function Kpi({ label, value, accent, muted }: { label: React.ReactNode; value: string; accent?: 'green' | 'amber'; muted?: boolean }) {
  return (
    <div className={`cockpit-kpi ${muted ? 'cockpit-kpi--muted' : ''}`}>
      <div className="cockpit-kpi-label">{label}</div>
      <div className={`cockpit-kpi-value cockpit-kpi-${accent ?? 'neutral'}`}>{value}</div>
    </div>
  )
}

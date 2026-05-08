'use client'

import { useMemo } from 'react'
import { useScenario } from './ScenarioContext'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents, serviceLevel, avgWait } from '@/lib/erlang'

export function KpiStrip() {
  const { scenario } = useScenario()

  const kpis = useMemo(() => {
    // Use the peak interval as the headline KPI (matches industry convention)
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const peakIdx = calls.indexOf(Math.max(...calls))
    const peakCalls = calls[peakIdx]
    if (peakCalls <= 0) {
      return { N: 0, scheduled: 0, sl: 1, occ: 0, asa: 0 }
    }
    const { N, A } = requiredAgents(peakCalls, scenario.aht, scenario.sl / 100, scenario.asa)
    const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    const sl = serviceLevel(N, A, scenario.aht, scenario.asa)
    const occ = Math.min(1, A / N)
    const asa = avgWait(N, A, scenario.aht)
    return { N, scheduled, sl, occ, asa }
  }, [scenario])

  return (
    <div className="cockpit-kpi-strip">
      <Kpi label="Erlang C agents" value={String(kpis.N)} />
      <Kpi label="Scheduled HC"    value={String(kpis.scheduled)} />
      <Kpi label="Service Level"   value={`${(kpis.sl * 100).toFixed(1)}%`} accent="green" />
      <Kpi label="Occupancy"       value={`${(kpis.occ * 100).toFixed(1)}%`} accent="amber" />
      <Kpi label="Avg ASA"         value={`${Math.round(kpis.asa)}s`} />
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'amber' }) {
  return (
    <div className="cockpit-kpi">
      <div className="cockpit-kpi-label">{label}</div>
      <div className={`cockpit-kpi-value cockpit-kpi-${accent ?? 'neutral'}`}>{value}</div>
    </div>
  )
}

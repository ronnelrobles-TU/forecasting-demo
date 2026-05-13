'use client'

import { useMemo, useState } from 'react'
import { useScenario } from './ScenarioContext'
import { campaigns } from '@/lib/campaigns'
import { HoopSlider } from './controls/HoopSlider'
import { CurveEditor } from './controls/CurveEditor'
import { DailyTotalInput } from './controls/DailyTotalInput'
import { SliderRow } from './controls/SliderRow'
import { InjectEventModal } from './inject/InjectEventModal'
import { JargonTerm } from './onboarding/JargonTerm'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import type { CampaignKey } from '@/lib/types'

interface SidebarProps {
  currentSimTimeMin: number
}

export function Sidebar({ currentSimTimeMin }: SidebarProps) {
  const { scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, addInjection, clearInjections } = useScenario()
  const [modalOpen, setModalOpen] = useState(false)

  // Mirror the kernel's peak-agent calc so the desk-capacity slider has a
  // sensible default + range. Cheap to recompute (plan-level, not per-event).
  const peakAgents = useMemo(() => {
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    let peak = 1
    for (const c of calls) {
      if (c <= 0) continue
      const { N } = requiredAgents(c, scenario.aht, scenario.sl / 100, scenario.asa)
      const scheduled = Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
      if (scheduled > peak) peak = scheduled
    }
    return peak
  }, [scenario.curve, scenario.hoop, scenario.dailyTotal, scenario.aht, scenario.sl, scenario.asa, scenario.shrink, scenario.abs])

  const deskCapacity = scenario.deskCapacity ?? peakAgents
  const deskCapacityMax = Math.max(peakAgents, Math.ceil(peakAgents * 2))

  return (
    <aside className="cockpit-sidebar">

      <div className="cockpit-section">
        <div className="cockpit-section-label">Scenario</div>
        <select
          className="cockpit-select"
          value={scenario.campaignKey}
          onChange={e => setCampaign(e.target.value as CampaignKey)}
        >
          {Object.values(campaigns).map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label"><JargonTerm term="hoop">HOOP</JargonTerm></div>
        <HoopSlider value={scenario.hoop} onChange={setHoop} />
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">Intraday curve</div>
        <DailyTotalInput value={scenario.dailyTotal} onChange={setDailyTotal} />
        <CurveEditor curve={scenario.curve} hoop={scenario.hoop} onChange={setCurve} />
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">Inputs</div>
        <SliderRow label={<><JargonTerm term="aht">AHT</JargonTerm> (s)</>}                     value={scenario.aht}    min={120} max={900}  step={10} onChange={v => setNumeric('aht', v)} />
        <SliderRow label={<><JargonTerm term="sl">SL target</JargonTerm> (%)</>}                value={scenario.sl}     min={60}  max={95}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('sl', v)} />
        <SliderRow label={<JargonTerm term="sl-threshold">SL threshold</JargonTerm>}            value={scenario.asa}    min={10}  max={60}   step={1}  format={v => `${v}s`}   onChange={v => setNumeric('asa', v)} />
        <SliderRow label={<><JargonTerm term="shrinkage">Shrinkage</JargonTerm> (%)</>}         value={scenario.shrink} min={10}  max={45}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('shrink', v)} />
        <SliderRow label="Absent. (%)"                                                          value={scenario.abs}    min={0}   max={20}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('abs', v)} />
        <SliderRow
          label="Desk capacity"
          value={deskCapacity}
          min={peakAgents}
          max={deskCapacityMax}
          step={1}
          format={v => `${v} desks`}
          onChange={v => setNumeric('deskCapacity', v)}
        />
      </div>

      {scenario.injectedEvents.length > 0 && (
        <div className="cockpit-section">
          <div className="cockpit-section-label">Active injections ({scenario.injectedEvents.length})</div>
          <button type="button" className="cockpit-clear-injections" onClick={clearInjections}>Clear all</button>
        </div>
      )}

      <button
        type="button"
        className="cockpit-inject-btn"
        onClick={() => setModalOpen(true)}
      >
        ⚡ Inject event…
      </button>

      <InjectEventModal
        open={modalOpen}
        fireAtMin={currentSimTimeMin}
        onClose={() => setModalOpen(false)}
        onSubmit={events => {
          for (const ev of events) addInjection(ev)
        }}
      />

    </aside>
  )
}

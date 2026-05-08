'use client'

import { useState } from 'react'
import { useScenario } from './ScenarioContext'
import { campaigns } from '@/lib/campaigns'
import { HoopSlider } from './controls/HoopSlider'
import { CurveEditor } from './controls/CurveEditor'
import { DailyTotalInput } from './controls/DailyTotalInput'
import { SliderRow } from './controls/SliderRow'
import { InjectEventModal } from './inject/InjectEventModal'
import type { CampaignKey } from '@/lib/types'

interface SidebarProps {
  currentSimTimeMin: number
}

export function Sidebar({ currentSimTimeMin }: SidebarProps) {
  const { scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, addInjection, clearInjections } = useScenario()
  const [modalOpen, setModalOpen] = useState(false)

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
        <div className="cockpit-section-label">HOOP</div>
        <HoopSlider value={scenario.hoop} onChange={setHoop} />
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">Intraday curve</div>
        <DailyTotalInput value={scenario.dailyTotal} onChange={setDailyTotal} />
        <CurveEditor curve={scenario.curve} hoop={scenario.hoop} onChange={setCurve} />
      </div>

      <div className="cockpit-section">
        <div className="cockpit-section-label">Inputs</div>
        <SliderRow label="AHT (s)"        value={scenario.aht}    min={120} max={900}  step={10} onChange={v => setNumeric('aht', v)} />
        <SliderRow label="SL target (%)"  value={scenario.sl}     min={60}  max={95}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('sl', v)} />
        <SliderRow label="SL threshold"   value={scenario.asa}    min={10}  max={60}   step={1}  format={v => `${v}s`}   onChange={v => setNumeric('asa', v)} />
        <SliderRow label="Shrinkage (%)"  value={scenario.shrink} min={10}  max={45}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('shrink', v)} />
        <SliderRow label="Absent. (%)"    value={scenario.abs}    min={0}   max={20}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('abs', v)} />
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
        onPick={preset => addInjection(preset.build(currentSimTimeMin))}
      />

    </aside>
  )
}

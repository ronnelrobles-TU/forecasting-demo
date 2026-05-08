'use client'

import { useState } from 'react'
import { ScenarioProvider } from './ScenarioContext'
import { Header, type TabKey } from './Header'
import { Sidebar } from './Sidebar'
import { KpiStrip } from './KpiStrip'
import { LiveSimTab } from './tabs/LiveSimTab'
import { MonteCarloTab } from './tabs/MonteCarloTab'
import { RosterTab } from './tabs/RosterTab'
import { ClassicTab } from './tabs/ClassicTab'

export function Cockpit() {
  const [tab, setTab] = useState<TabKey>('live')

  return (
    <ScenarioProvider>
      <div className="cockpit">
        <Header active={tab} onChange={setTab} />
        <div className="cockpit-body">
          <Sidebar />
          <main className="cockpit-main">
            {tab === 'live'    && <LiveSimTab />}
            {tab === 'monte'   && <MonteCarloTab />}
            {tab === 'roster'  && <RosterTab />}
            {tab === 'classic' && <ClassicTab />}
          </main>
        </div>
        <KpiStrip />
      </div>
    </ScenarioProvider>
  )
}

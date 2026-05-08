'use client'

import { useState } from 'react'
import { ScenarioProvider, useScenario } from './ScenarioContext'
import { Header, type TabKey } from './Header'
import { Sidebar } from './Sidebar'
import { KpiStrip } from './KpiStrip'
import { LiveSimTab, type LiveSimTabProps } from './tabs/LiveSimTab'
import { MonteCarloTab } from './tabs/MonteCarloTab'
import { RosterTab } from './tabs/RosterTab'
import { ClassicTab } from './tabs/ClassicTab'
import type { IntervalStat } from '@/lib/types'

interface LiveData {
  stats: IntervalStat
  abandons: number
  simTimeMin: number
}

function CockpitInner() {
  const [tab, setTab] = useState<TabKey>('live')
  const [live, setLive] = useState<LiveData | null>(null)
  const { setRngSeed } = useScenario()

  const liveProps: LiveSimTabProps = { onLiveChange: setLive }
  const simTimeMin = live?.simTimeMin ?? 0

  function handleReplayWorstDay(seed: number) {
    setRngSeed(seed)
    setTab('live')
  }

  return (
    <div className="cockpit">
      <Header active={tab} onChange={setTab} />
      <div className="cockpit-body">
        <Sidebar currentSimTimeMin={tab === 'live' ? simTimeMin : 0} />
        <main className="cockpit-main">
          {tab === 'live'    && <LiveSimTab {...liveProps} />}
          {tab === 'monte'   && <MonteCarloTab onReplayWorstDay={handleReplayWorstDay} />}
          {tab === 'roster'  && <RosterTab />}
          {tab === 'classic' && <ClassicTab />}
        </main>
      </div>
      <KpiStrip live={tab === 'live' && live ? { stats: live.stats, abandons: live.abandons } : null} />
    </div>
  )
}

export function Cockpit() {
  return (
    <ScenarioProvider>
      <CockpitInner />
    </ScenarioProvider>
  )
}

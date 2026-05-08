'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Scenario, CampaignKey, HoopWindow } from '@/lib/types'
import { campaigns } from '@/lib/campaigns'

function scenarioFromCampaign(key: CampaignKey, seed = 42): Scenario {
  const c = campaigns[key]
  return {
    campaignKey: key,
    hoop: { ...c.hoop },
    curve: c.curveTemplate.slice(),
    dailyTotal: c.dailyTotal,
    aht: c.aht,
    sl: c.sl,
    asa: c.asa,
    shrink: c.shrink,
    abs: c.abs,
    roster: null,
    rngSeed: seed,
    injectedEvents: [],
  }
}

interface ScenarioContextValue {
  scenario: Scenario
  setCampaign: (key: CampaignKey) => void
  setHoop: (hoop: HoopWindow) => void
  setCurve: (curve: number[]) => void
  setDailyTotal: (n: number) => void
  setNumeric: (field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs', value: number) => void
  reseed: () => void
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>(() => scenarioFromCampaign('us_telco_manila'))

  const setCampaign = useCallback((key: CampaignKey) => {
    setScenario(scenarioFromCampaign(key))
  }, [])

  const setHoop = useCallback((hoop: HoopWindow) => {
    setScenario(s => ({ ...s, hoop }))
  }, [])

  const setCurve = useCallback((curve: number[]) => {
    setScenario(s => ({ ...s, curve }))
  }, [])

  const setDailyTotal = useCallback((n: number) => {
    setScenario(s => ({ ...s, dailyTotal: n }))
  }, [])

  const setNumeric = useCallback((field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs', value: number) => {
    setScenario(s => ({ ...s, [field]: value }))
  }, [])

  const reseed = useCallback(() => {
    setScenario(s => ({ ...s, rngSeed: Math.floor(Math.random() * 1_000_000) }))
  }, [])

  return (
    <ScenarioContext.Provider value={{ scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed }}>
      {children}
    </ScenarioContext.Provider>
  )
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext)
  if (!ctx) throw new Error('useScenario must be used inside ScenarioProvider')
  return ctx
}

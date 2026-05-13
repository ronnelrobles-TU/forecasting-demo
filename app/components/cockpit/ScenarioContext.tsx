'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Scenario, CampaignKey, HoopWindow, InjectedEvent, RosterShift } from '@/lib/types'
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

export type ThemeKey = 'dots' | 'office' | 'office-hd'

const THEME_STORAGE_KEY = 'wfm.cockpit.theme'
const VALID_THEMES: readonly ThemeKey[] = ['dots', 'office', 'office-hd']

function isValidTheme(s: string | null): s is ThemeKey {
  return s !== null && (VALID_THEMES as readonly string[]).includes(s)
}

interface ScenarioContextValue {
  scenario: Scenario
  setCampaign: (key: CampaignKey) => void
  setHoop: (hoop: HoopWindow) => void
  setCurve: (curve: number[]) => void
  setDailyTotal: (n: number) => void
  setNumeric: (field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs' | 'deskCapacity', value: number) => void
  reseed: () => void
  setRngSeed: (seed: number) => void
  addInjection: (ev: InjectedEvent) => void
  clearInjections: () => void
  setRoster: (roster: RosterShift[] | null) => void
  addShift: (shift: RosterShift) => void
  removeShift: (id: string) => void
  updateShift: (id: string, partial: Partial<RosterShift>) => void
  theme: ThemeKey
  setTheme: (theme: ThemeKey) => void
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>(() => scenarioFromCampaign('us_telco_manila'))

  // Theme: SSR-safe default; useEffect hydrates from localStorage on mount
  const [theme, setThemeState] = useState<ThemeKey>('office-hd')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    // Migrate stored 'office' (v1 prototype) to 'office-hd' since 'office' is
    // unlinked from the picker. Keeps the 'office' code in place for safekeeping.
    if (stored === 'office') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration
      setThemeState('office-hd')
      window.localStorage.setItem(THEME_STORAGE_KEY, 'office-hd')
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration
    if (isValidTheme(stored)) setThemeState(stored)
  }, [])

  const setTheme = useCallback((t: ThemeKey) => {
    setThemeState(t)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, t)
    }
  }, [])

  const setCampaign = useCallback((key: CampaignKey) => setScenario(scenarioFromCampaign(key)), [])
  const setHoop = useCallback((hoop: HoopWindow) => setScenario(s => ({ ...s, hoop })), [])
  const setCurve = useCallback((curve: number[]) => setScenario(s => ({ ...s, curve })), [])
  const setDailyTotal = useCallback((n: number) => setScenario(s => ({ ...s, dailyTotal: n })), [])
  const setNumeric = useCallback((field: 'aht' | 'sl' | 'asa' | 'shrink' | 'abs' | 'deskCapacity', value: number) => {
    setScenario(s => ({ ...s, [field]: value }))
  }, [])
  const reseed = useCallback(() => setScenario(s => ({ ...s, rngSeed: Math.floor(Math.random() * 1_000_000) })), [])
  const setRngSeed = useCallback((seed: number) => setScenario(s => ({ ...s, rngSeed: seed })), [])
  const addInjection = useCallback((ev: InjectedEvent) => {
    setScenario(s => ({ ...s, injectedEvents: [...s.injectedEvents, ev] }))
  }, [])
  const clearInjections = useCallback(() => setScenario(s => ({ ...s, injectedEvents: [] })), [])

  const setRoster = useCallback((roster: RosterShift[] | null) => setScenario(s => ({ ...s, roster })), [])
  const addShift = useCallback((shift: RosterShift) => {
    setScenario(s => ({ ...s, roster: [...(s.roster ?? []), shift] }))
  }, [])
  const removeShift = useCallback((id: string) => {
    setScenario(s => ({ ...s, roster: (s.roster ?? []).filter(x => x.id !== id) }))
  }, [])
  const updateShift = useCallback((id: string, partial: Partial<RosterShift>) => {
    setScenario(s => ({
      ...s,
      roster: (s.roster ?? []).map(x => x.id === id ? { ...x, ...partial } : x),
    }))
  }, [])

  return (
    <ScenarioContext.Provider value={{
      scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed, setRngSeed,
      addInjection, clearInjections, setRoster, addShift, removeShift, updateShift,
      theme, setTheme,
    }}>
      {children}
    </ScenarioContext.Provider>
  )
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext)
  if (!ctx) throw new Error('useScenario must be used inside ScenarioProvider')
  return ctx
}

export type CampaignKey =
  | 'us_telco_manila'
  | 'au_retail_cebu'
  | 'uk_fintech_manila'
  | 'us_healthcare_clark'
  | 'ph_telco_davao'

export interface HoopWindow {
  startMin: number  // minutes from midnight (0..1440)
  endMin: number    // exclusive; e.g. 1320 = 22:00
}

export interface Campaign {
  key: CampaignKey
  label: string
  hoop: HoopWindow
  curveTemplate: number[]  // length 48; relative weights per 30-min interval
  dailyTotal: number       // total calls/day
  aht: number              // seconds
  sl: number               // 0..100 target percent
  asa: number              // SL threshold seconds
  shrink: number           // 0..100
  abs: number              // 0..100
  abandonThresholdSec: number    // caller leaves if wait > this (default 60)
  abandonCurveBeta: number       // ramp steepness, P(abandon | wait) ≈ 1 - exp(-beta * (wait - threshold))
  rules: string
}

export interface RosterShift {
  id: string
  startMin: number          // minutes from midnight
  endMin: number            // exclusive
  agentCount: number        // number of agents working this shift template
  breaks: { startMin: number; durationMin: number }[]   // shared break windows; auto-staggered by kernel
}

export interface Scenario {
  campaignKey: CampaignKey
  hoop: HoopWindow
  curve: number[]             // length 48; intervals outside HOOP forced to 0
  dailyTotal: number
  aht: number
  sl: number
  asa: number
  shrink: number
  abs: number
  /**
   * Number of desks to render in the office visualization. Defaults to
   * `peakAgents` (so existing behavior is preserved if unset). Setting it
   * higher lets users SEE morning ramp — empty desks at midnight, agents
   * arriving via the door, desks filling up.
   * Visualization only — kernel ignores this field.
   */
  deskCapacity?: number
  roster: RosterShift[] | null   // null → kernel derives from Erlang C
  rngSeed: number
  injectedEvents: InjectedEvent[]
}

export type SimEventType =
  | 'call_arrive'
  | 'call_answer'
  | 'call_end'
  | 'call_abandon'
  | 'agent_break_start'
  | 'agent_break_end'
  | 'agent_shift_start'
  | 'agent_shift_end'
  | 'event_inject'

export interface SimEvent {
  timeMin: number
  type: SimEventType
  agentId?: string
  callId?: string
  waitMs?: number
  payload?: Record<string, unknown>
}

export interface IntervalStat {
  sl: number
  agents: number
  queueLen: number
  abandons: number
  occ: number
}

export interface SimResult {
  perInterval: IntervalStat[]   // length 48
  events: SimEvent[]
  totals: {
    sl: number
    occ: number
    asa: number
    abandons: number
    cost: number
  }
}

export interface InjectedEvent {
  fireAtMin: number
  type: 'volume_surge' | 'aht_spike' | 'staff_drop' | 'flash_absent' | 'custom'
  durationMin?: number
  magnitude: number
}

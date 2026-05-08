import type { SimEvent, SimEventType } from '@/lib/types'

export type AgentVisualState = 'idle' | 'on_call' | 'on_break' | 'off_shift'

export interface AgentTimelineEntry {
  timeMin: number
  state: AgentVisualState
}

export type AgentTimelines = Record<string, AgentTimelineEntry[]>

const STATE_FOR: Partial<Record<SimEventType, AgentVisualState>> = {
  agent_shift_start: 'idle',
  agent_shift_end: 'off_shift',
  agent_break_start: 'on_break',
  agent_break_end: 'idle',
  call_answer: 'on_call',
  call_end: 'idle',
}

export function buildAgentTimelines(events: SimEvent[], peakAgents: number): AgentTimelines {
  const timelines: AgentTimelines = {}
  for (let i = 0; i < peakAgents; i++) {
    // Default: agents start idle at minute 0 (Phase 1 + 2 model: agent pool exists from start)
    timelines[`A${i}`] = [{ timeMin: 0, state: 'idle' }]
  }
  for (const ev of events) {
    if (!ev.agentId) continue
    const state = STATE_FOR[ev.type]
    if (!state) continue
    const tl = timelines[ev.agentId]
    if (!tl) continue
    tl.push({ timeMin: ev.timeMin, state })
  }
  // Sort each agent's timeline by time (events are usually mostly-sorted but not guaranteed)
  for (const key of Object.keys(timelines)) {
    timelines[key].sort((a, b) => a.timeMin - b.timeMin)
  }
  return timelines
}

// Binary search for last entry with timeMin <= t
export function agentStateAt(timeline: AgentTimelineEntry[], simTimeMin: number): AgentVisualState {
  if (timeline.length === 0) return 'idle'
  let lo = 0
  let hi = timeline.length - 1
  if (simTimeMin < timeline[0].timeMin) return timeline[0].state
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (timeline[mid].timeMin <= simTimeMin) lo = mid
    else hi = mid - 1
  }
  return timeline[lo].state
}

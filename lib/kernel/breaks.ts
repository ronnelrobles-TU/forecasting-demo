import type { HoopWindow } from '@/lib/types'
import { makeRng } from '@/lib/rng'

export interface AgentBreak {
  agentId: string
  startMin: number
  durationMin: number
}

const BREAK_DURATION_MIN = 15
const BREAK_BUFFER_MIN = 30  // don't schedule a break in the first or last 30 min of HOOP

export function scheduleBreaks(numAgents: number, hoop: HoopWindow, seed: number): AgentBreak[] {
  if (numAgents <= 0) return []
  const rng = makeRng(seed * 1000 + 7)  // distinct stream from main sim
  const earliest = hoop.startMin + BREAK_BUFFER_MIN
  const latest = hoop.endMin - BREAK_DURATION_MIN - BREAK_BUFFER_MIN
  if (latest <= earliest) {
    // HOOP too short — give everyone a break right after start
    return Array.from({ length: numAgents }, (_, i) => ({
      agentId: `A${i}`,
      startMin: hoop.startMin,
      durationMin: BREAK_DURATION_MIN,
    }))
  }
  return Array.from({ length: numAgents }, (_, i) => ({
    agentId: `A${i}`,
    startMin: earliest + Math.floor(rng() * (latest - earliest)),
    durationMin: BREAK_DURATION_MIN,
  }))
}

import type { Scenario, SimEvent, SimResult, IntervalStat } from '@/lib/types'
import { applyHoop, callsPerInterval, intervalIndexForMinute } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import { makeRng, poisson, logNormal } from '@/lib/rng'

interface AgentState {
  id: string
  busyUntilMin: number   // 0 = idle now
}

const ACW_SECONDS = 30      // wrap-up after each call
const SIGMA_AHT = 0.4       // log-normal shape parameter

export function runDay(scenario: Scenario): SimResult {
  const rng = makeRng(scenario.rngSeed)
  const curveAfterHoop = applyHoop(scenario.curve, scenario.hoop)
  const callsPer30 = callsPerInterval(curveAfterHoop, scenario.dailyTotal)

  // Determine agent count per interval via Erlang C (Phase 1 staffing source)
  const slTarget = scenario.sl / 100
  const agentsPerInterval = callsPer30.map(calls => {
    if (calls <= 0) return 0
    const { N } = requiredAgents(calls, scenario.aht, slTarget, scenario.asa)
    return Math.max(1, Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100)))
  })

  // Build agent pool sized to the peak interval; agents simulated as state machine slots.
  const peakAgents = Math.max(1, ...agentsPerInterval)
  const agents: AgentState[] = Array.from({ length: peakAgents }, (_, i) => ({
    id: `A${i}`,
    busyUntilMin: 0,
  }))

  const events: SimEvent[] = []
  const perInterval: IntervalStat[] = Array.from({ length: 48 }, () => ({
    sl: 0, agents: 0, queueLen: 0, abandons: 0, occ: 0,
  }))

  // Per-interval counters
  const callsAnswered = new Array(48).fill(0)
  const callsInThreshold = new Array(48).fill(0)
  const totalWaitMs = new Array(48).fill(0)
  const totalBusyMin = new Array(48).fill(0)

  let queue: { arriveMin: number; callId: string }[] = []
  let callCounter = 0

  // Step minute-by-minute. 1440 minutes/day.
  for (let min = 0; min < 1440; min++) {
    const intervalIdx = intervalIndexForMinute(min)
    const callsThisMin = poisson(rng, callsPer30[intervalIdx] / 30)

    for (let c = 0; c < callsThisMin; c++) {
      const callId = `C${callCounter++}`
      events.push({ timeMin: min, type: 'call_arrive', callId })
      queue.push({ arriveMin: min, callId })
    }

    // How many agents are "active" right now (within an active interval cap)?
    const activeAgentCap = agentsPerInterval[intervalIdx]
    const activeAgents = agents.slice(0, activeAgentCap)

    // Assign queued calls to free agents
    queue = queue.filter(qc => {
      const free = activeAgents.find(a => a.busyUntilMin <= min)
      if (!free) return true  // still queued
      const waitMs = (min - qc.arriveMin) * 60_000
      const ahtSec = logNormal(rng, scenario.aht, SIGMA_AHT)
      free.busyUntilMin = min + (ahtSec + ACW_SECONDS) / 60
      events.push({ timeMin: min, type: 'call_answer', callId: qc.callId, agentId: free.id, waitMs })
      callsAnswered[intervalIdx]++
      totalWaitMs[intervalIdx] += waitMs
      if (waitMs / 1000 <= scenario.asa) callsInThreshold[intervalIdx]++
      return false
    })

    // Emit call_end events for any agent finishing this minute
    for (const a of activeAgents) {
      if (a.busyUntilMin > min - 1 && a.busyUntilMin <= min) {
        events.push({ timeMin: min, type: 'call_end', agentId: a.id })
      }
      if (a.busyUntilMin > min) totalBusyMin[intervalIdx]++  // counts toward occupancy
    }

    perInterval[intervalIdx].queueLen = Math.max(perInterval[intervalIdx].queueLen, queue.length)
    perInterval[intervalIdx].agents = activeAgentCap
  }

  // Aggregate per-interval stats
  let totalSlNum = 0, totalSlDen = 0
  let totalWait = 0, totalAns = 0
  let totalBusy = 0, totalAvail = 0

  for (let i = 0; i < 48; i++) {
    const ans = callsAnswered[i]
    const ith = callsInThreshold[i]
    perInterval[i].sl = ans > 0 ? ith / ans : 1
    perInterval[i].occ = perInterval[i].agents > 0 ? totalBusyMin[i] / (perInterval[i].agents * 30) : 0
    totalSlNum += ith
    totalSlDen += ans
    totalWait += totalWaitMs[i]
    totalAns += ans
    totalBusy += totalBusyMin[i]
    totalAvail += perInterval[i].agents * 30
  }

  return {
    perInterval,
    events,
    totals: {
      sl: totalSlDen > 0 ? totalSlNum / totalSlDen : 1,
      occ: totalAvail > 0 ? totalBusy / totalAvail : 0,
      asa: totalAns > 0 ? totalWait / totalAns / 1000 : 0,
      abandons: 0,  // Phase 2
      cost: 0,      // Phase 4
    },
  }
}

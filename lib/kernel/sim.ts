import type { Scenario, SimEvent, SimResult, IntervalStat } from '@/lib/types'
import { applyHoop, callsPerInterval, intervalIndexForMinute } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'
import { makeRng, poisson, logNormal } from '@/lib/rng'
import { activePerturbations } from './inject'
import { scheduleBreaks, type AgentBreak } from './breaks'
import { campaigns } from '@/lib/campaigns'

interface AgentState {
  id: string
  busyUntilMin: number     // 0 = idle now
  onBreakUntilMin: number  // 0 = not on break
  active: boolean          // false after staff_drop / flash_absent removed them
}

const ACW_SECONDS = 30
const SIGMA_AHT = 0.4
// Cap agent pool per interval so extreme dailyTotal values create realistic overload (and abandons).
// At the default campaign scale (≤15k calls/day) peak intervals stay well under this limit.
const MAX_AGENTS_PER_INTERVAL = 300

function abandonProbability(waitSec: number, thresholdSec: number, beta: number): number {
  if (waitSec <= thresholdSec) return 0
  return 1 - Math.exp(-beta * (waitSec - thresholdSec))
}

export function runDay(scenario: Scenario): SimResult {
  const rng = makeRng(scenario.rngSeed)
  const campaign = campaigns[scenario.campaignKey]
  const abandonThresholdSec = campaign.abandonThresholdSec
  const abandonBeta = campaign.abandonCurveBeta

  const curveAfterHoop = applyHoop(scenario.curve, scenario.hoop)
  const callsPer30 = callsPerInterval(curveAfterHoop, scenario.dailyTotal)

  const slTarget = scenario.sl / 100
  const agentsPerInterval = callsPer30.map(calls => {
    if (calls <= 0) return 0
    const { N } = requiredAgents(calls, scenario.aht, slTarget, scenario.asa)
    return Math.min(
      MAX_AGENTS_PER_INTERVAL,
      Math.max(1, Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))),
    )
  })

  const peakAgents = Math.max(1, ...agentsPerInterval)
  const agents: AgentState[] = Array.from({ length: peakAgents }, (_, i) => ({
    id: `A${i}`,
    busyUntilMin: 0,
    onBreakUntilMin: 0,
    active: true,
  }))

  // Pre-schedule breaks
  const breaksByAgent = new Map<string, AgentBreak>()
  for (const br of scheduleBreaks(peakAgents, scenario.hoop, scenario.rngSeed)) {
    breaksByAgent.set(br.agentId, br)
  }

  const events: SimEvent[] = []
  const perInterval: IntervalStat[] = Array.from({ length: 48 }, () => ({
    sl: 0, agents: 0, queueLen: 0, abandons: 0, occ: 0,
  }))

  const callsAnswered = new Array(48).fill(0)
  const callsInThreshold = new Array(48).fill(0)
  const callsAbandoned = new Array(48).fill(0)
  const totalWaitMs = new Array(48).fill(0)
  const totalBusyMin = new Array(48).fill(0)
  const totalAvailMin = new Array(48).fill(0)

  const permanentlyRemoved = new Set<string>()

  let queue: { arriveMin: number; callId: string }[] = []
  let callCounter = 0

  for (let min = 0; min < 1440; min++) {
    const intervalIdx = intervalIndexForMinute(min)
    const pert = activePerturbations(scenario.injectedEvents, min)

    // Apply staff_drop / flash_absent
    if (pert.flashAbsentJustFired > 0) {
      let removed = 0
      for (const a of agents) {
        if (a.active && removed < pert.flashAbsentJustFired) {
          a.active = false
          permanentlyRemoved.add(a.id)
          events.push({ timeMin: min, type: 'agent_shift_end', agentId: a.id })
          removed++
        }
      }
    }

    // Compute effective active cap (interval staffing - staff_drop fraction).
    // The deactivation/reactivation loop only runs when an injection is actively
    // reducing staffing.  During normal operation all peakAgents stay available so
    // that lightly-loaded scenarios are never overwhelmed by micro-bursts.
    const intervalCap = agentsPerInterval[intervalIdx]
    const effectiveCap = Math.max(0, Math.floor(intervalCap * (1 - pert.agentReductionFraction)))
    let activeCount = agents.filter(a => a.active).length
    if (pert.agentReductionFraction > 0) {
      // Emit shift_end for any active agents above the new cap
      activeCount = 0
      for (const a of agents) {
        if (!a.active) continue
        if (activeCount >= effectiveCap) {
          a.active = false
          events.push({ timeMin: min, type: 'agent_shift_end', agentId: a.id })
          continue
        }
        activeCount++
      }
      // Re-activate agents when cap rises back (surge ended, etc.)
      if (activeCount < effectiveCap) {
        for (const a of agents) {
          if (a.active) continue
          if (permanentlyRemoved.has(a.id)) continue   // flash_absent victims stay out
          a.active = true
          activeCount++
          events.push({ timeMin: min, type: 'agent_shift_start', agentId: a.id })
          if (activeCount >= effectiveCap) break
        }
      }
    }

    // Break entry/exit
    for (const a of agents) {
      const br = breaksByAgent.get(a.id)
      if (!br) continue
      if (a.onBreakUntilMin === 0 && min === br.startMin && a.active) {
        a.onBreakUntilMin = min + br.durationMin
        events.push({ timeMin: min, type: 'agent_break_start', agentId: a.id })
      }
      if (a.onBreakUntilMin > 0 && min >= a.onBreakUntilMin) {
        events.push({ timeMin: min, type: 'agent_break_end', agentId: a.id })
        a.onBreakUntilMin = 0
      }
    }

    // Arrivals (with volume perturbation)
    const arrivalRate = (callsPer30[intervalIdx] / 30) * pert.volumeMultiplier
    const callsThisMin = poisson(rng, arrivalRate)
    for (let c = 0; c < callsThisMin; c++) {
      const callId = `C${callCounter++}`
      events.push({ timeMin: min, type: 'call_arrive', callId })
      queue.push({ arriveMin: min, callId })
    }

    // Abandons — drop callers whose wait exceeds threshold (probabilistic ramp)
    const effectiveAht = scenario.aht * pert.ahtMultiplier
    const beforeQueue = queue
    queue = []
    for (const qc of beforeQueue) {
      const waitSec = (min - qc.arriveMin) * 60
      const pAbandon = abandonProbability(waitSec, abandonThresholdSec, abandonBeta)
      if (pAbandon > 0 && rng() < pAbandon) {
        events.push({ timeMin: min, type: 'call_abandon', callId: qc.callId, waitMs: waitSec * 1000 })
        callsAbandoned[intervalIdx]++
      } else {
        queue.push(qc)
      }
    }

    // Assign queued calls to free, active, non-break agents
    queue = queue.filter(qc => {
      const free = agents.find(a => a.active && a.busyUntilMin <= min && a.onBreakUntilMin === 0)
      if (!free) return true
      const waitMs = (min - qc.arriveMin) * 60_000
      const ahtSec = logNormal(rng, effectiveAht, SIGMA_AHT)
      free.busyUntilMin = min + (ahtSec + ACW_SECONDS) / 60
      events.push({ timeMin: min, type: 'call_answer', callId: qc.callId, agentId: free.id, waitMs })
      callsAnswered[intervalIdx]++
      totalWaitMs[intervalIdx] += waitMs
      if (waitMs / 1000 <= scenario.asa) callsInThreshold[intervalIdx]++
      return false
    })

    // Occupancy bookkeeping
    for (const a of agents) {
      if (!a.active || a.onBreakUntilMin > 0) continue
      if (a.busyUntilMin > min) totalBusyMin[intervalIdx]++
    }

    perInterval[intervalIdx].queueLen = Math.max(perInterval[intervalIdx].queueLen, queue.length)
    totalAvailMin[intervalIdx] += effectiveCap
  }

  // Aggregate
  let totalSlNum = 0, totalSlDen = 0
  let totalWait = 0, totalAns = 0
  let totalBusy = 0, totalAvail = 0
  let totalAbandons = 0

  for (let i = 0; i < 48; i++) {
    const ans = callsAnswered[i]
    const ith = callsInThreshold[i]
    const aban = callsAbandoned[i]
    perInterval[i].sl = ans > 0 ? ith / ans : 1
    perInterval[i].abandons = aban
    perInterval[i].agents = Math.round(totalAvailMin[i] / 30)
    perInterval[i].occ = totalAvailMin[i] > 0 ? totalBusyMin[i] / totalAvailMin[i] : 0
    totalSlNum += ith
    totalSlDen += ans
    totalWait += totalWaitMs[i]
    totalAns += ans
    totalAbandons += aban
    totalBusy += totalBusyMin[i]
    totalAvail += totalAvailMin[i]
  }

  return {
    perInterval,
    events,
    totals: {
      sl: totalSlDen > 0 ? totalSlNum / totalSlDen : 1,
      occ: totalAvail > 0 ? totalBusy / totalAvail : 0,
      asa: totalAns > 0 ? totalWait / totalAns / 1000 : 0,
      abandons: totalAbandons,
      cost: 0,
    },
  }
}

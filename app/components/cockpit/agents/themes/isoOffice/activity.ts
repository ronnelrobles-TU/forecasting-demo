// Activity scheduler — distributes IDLE agents to other rooms (training,
// gym, restroom, chatting in aisles, water cooler) using deterministic
// per-window hashes. The scheduler is a pure function called every render
// with the current agents array and simTimeMin; assignments are stable
// within a 30-min sim window so agents don't teleport between rooms every
// frame.
//
// All routing is purely visual fluff — the simulation kernel only knows
// about idle/on_call/on_break/off_shift. Visual activity is layered on top.
//
// Round 7.1: the scheduler now accepts a partition of agent indices into
// PRODUCTIVE (Erlang-required at-desk count) and SHRINKAGE (extra in-
// office population doing non-desk activities). Productive agents always
// stay at desks (Erlang counts them as available for calls); shrinkage
// agents are deterministically distributed across the non-desk rooms.
// This fixes the double-counting where productive agents were being
// pulled into gym/training/break and the on-screen "At desks" count
// undershot the KPI strip's "Active Agents" total.

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from './geometry'

export type DisplayActivity =
  | 'at_desk'
  | 'in_training'
  | 'in_gym'
  | 'in_restroom'      // not visually rendered (occupies a "hidden" slot)
  | 'chatting'         // standing near a coworker in an aisle
  | 'at_water_cooler'  // standing near the water dispenser informally
  | 'at_break_table'   // on_break agents, rendered by BreakRoom at table seats

export interface ActivityAssignment {
  activity: DisplayActivity
  // Where to render the agent. For in_restroom, this is the desk position
  // (but renderers should hide the agent based on activity). For at_break_table
  // it's the assigned seat.
  position: ScreenPoint
}

// Window length (sim minutes) over which activity assignments are stable.
// Round 4: shortened from 30 -> 8 minutes so visible transitions happen often
// and the floor never feels static. Per-agent windows are STAGGERED by hash
// so we don't get a synchronous shuffle of every agent at the same boundary
// (which would look chaotic).
export const WINDOW_MIN = 8

// FNV-1a hash, returns float in [0, 1).
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 2 ** 32
}

interface AgentLite { id: string; state: AgentVisualState }

// Legacy probability mix used when no allocation sets are provided. Kept so
// existing callers / tests that don't pass the partition continue to work.
// When the renderer DOES pass productive/shrinkage sets (the Round 7.1
// path) all shrinkage agents are forced into a non-desk activity instead.
const PROBS = {
  in_training:     0.08,
  in_gym:          0.06,
  chatting:        0.06,
  at_water_cooler: 0.05,
  in_restroom:     0.08,
} as const

// Round 7.1 distribution for forced shrinkage routing (sums to 1.0). Keeps
// the rough visual proportions the legacy mix produced, scaled up to fill
// the entire shrinkage population:
//   training 25, gym 20, break 20, smoking patio chat 15, water cooler 10,
//   restroom 10.
const SHRINKAGE_CDF: Array<{ activity: NonDeskActivity; cum: number }> = [
  { activity: 'in_training',     cum: 0.25 },
  { activity: 'in_gym',          cum: 0.45 },
  { activity: 'at_break_table',  cum: 0.65 },
  { activity: 'chatting',        cum: 0.80 },
  { activity: 'at_water_cooler', cum: 0.90 },
  { activity: 'in_restroom',     cum: 1.00 },
]

type NonDeskActivity =
  | 'in_training'
  | 'in_gym'
  | 'at_break_table'
  | 'chatting'
  | 'at_water_cooler'
  | 'in_restroom'

// Per-agent window phase offset, so not every agent flips at the same
// boundary. Returns an offset in [0, WINDOW_MIN).
function windowPhaseOffset(agentId: string): number {
  return hash(`${agentId}|window-phase`) * WINDOW_MIN
}

// Pick a stable shrinkage activity for an agent given the current sim
// window. Uses the per-agent phase-offset window so transitions ripple.
function pickShrinkageActivity(agentId: string, simTimeMin: number): NonDeskActivity {
  const agentWindow = Math.floor((simTimeMin + windowPhaseOffset(agentId)) / WINDOW_MIN)
  const r = hash(`${agentId}|${agentWindow}|shrinkage`)
  for (const slot of SHRINKAGE_CDF) {
    if (r < slot.cum) return slot.activity
  }
  return 'at_break_table'
}

export interface ActivityAllocation {
  // Agent indices that must stay at desks (Erlang productive count).
  productive: ReadonlySet<number>
  // Agent indices that must be in a non-desk activity (shrinkage uplift).
  shrinkage: ReadonlySet<number>
}

export function computeActivityAssignments(
  agents: ReadonlyArray<AgentLite>,
  simTimeMin: number,
  layout: BuildingLayout,
  allocation?: ActivityAllocation,
): Record<string, ActivityAssignment> {
  const out: Record<string, ActivityAssignment> = {}
  const deskPositions = layout.deskPositions

  // First pass: classify each agent. Collect IDs grouped by activity so we
  // can deterministically assign slots within each room.
  const trainingIds: string[] = []
  const gymIds: string[] = []
  const restroomIds: string[] = []
  const chattingIds: string[] = []
  const waterCoolerIds: string[] = []
  const breakRoomIds: string[] = []
  const desks: Record<string, ScreenPoint> = {}

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]
    desks[a.id] = deskPositions[i] ?? deskPositions[deskPositions.length - 1] ?? { x: 0, y: 0 }

    // Non-idle agents have fixed activities driven by simulation state.
    if (a.state === 'on_break') {
      // BreakRoom owns the rendering; we just record the activity.
      out[a.id] = { activity: 'at_break_table', position: desks[a.id] }
      continue
    }
    if (a.state === 'on_call' || a.state === 'off_shift') {
      out[a.id] = { activity: 'at_desk', position: desks[a.id] }
      continue
    }

    // Round 7.1 allocation path: productive agents stay at desks, shrinkage
    // agents are FORCED into a non-desk activity. The scheduler is no longer
    // free to scatter productive agents into shrinkage rooms.
    if (allocation) {
      if (allocation.productive.has(i)) {
        out[a.id] = { activity: 'at_desk', position: desks[a.id] }
        continue
      }
      if (allocation.shrinkage.has(i)) {
        const activity = pickShrinkageActivity(a.id, simTimeMin)
        if (activity === 'in_training') trainingIds.push(a.id)
        else if (activity === 'in_gym') gymIds.push(a.id)
        else if (activity === 'in_restroom') restroomIds.push(a.id)
        else if (activity === 'chatting') chattingIds.push(a.id)
        else if (activity === 'at_water_cooler') waterCoolerIds.push(a.id)
        else if (activity === 'at_break_table') breakRoomIds.push(a.id)
        continue
      }
      // Off-shift / absent — render at desk slot (the renderer's
      // isActiveByIndex / absent-tail logic hides them anyway).
      out[a.id] = { activity: 'at_desk', position: desks[a.id] }
      continue
    }

    // Legacy path (no allocation): hash-based scatter. Each agent's window
    // is offset by a stable per-agent phase, so activity changes ripple
    // through the floor instead of all flipping at the same minute.
    const agentWindow = Math.floor((simTimeMin + windowPhaseOffset(a.id)) / WINDOW_MIN)
    const r = hash(`${a.id}|${agentWindow}|act`)
    let acc = 0
    let activity: DisplayActivity = 'at_desk'
    if (r < (acc += PROBS.in_training)) activity = 'in_training'
    else if (r < (acc += PROBS.in_gym)) activity = 'in_gym'
    else if (r < (acc += PROBS.chatting)) activity = 'chatting'
    else if (r < (acc += PROBS.at_water_cooler)) activity = 'at_water_cooler'
    else if (r < (acc += PROBS.in_restroom)) activity = 'in_restroom'

    if (activity === 'in_training') trainingIds.push(a.id)
    else if (activity === 'in_gym') gymIds.push(a.id)
    else if (activity === 'in_restroom') restroomIds.push(a.id)
    else if (activity === 'chatting') chattingIds.push(a.id)
    else if (activity === 'at_water_cooler') waterCoolerIds.push(a.id)
    else out[a.id] = { activity: 'at_desk', position: desks[a.id] }
  }

  // Training: assign UNIQUE student seats. Overflow stays at desk.
  const trainingSeats = layout.rooms.trainingRoom.studentSeats
  trainingIds.sort()
  trainingIds.forEach((id, idx) => {
    if (trainingSeats.length === 0) {
      out[id] = { activity: 'at_desk', position: desks[id] }
      return
    }
    if (idx < trainingSeats.length) {
      out[id] = { activity: 'in_training', position: trainingSeats[idx] }
    } else {
      out[id] = { activity: 'at_desk', position: desks[id] }
    }
  })

  // Gym: distribute across the workout spots. Overflow stays at desk.
  const gym = layout.rooms.gym
  const gymSpots = gym.workoutSpots ?? [gym.treadmillPosition, gym.weightsPosition]
  gymIds.sort()
  gymIds.forEach((id, idx) => {
    if (idx < gymSpots.length) {
      out[id] = { activity: 'in_gym', position: gymSpots[idx] }
    } else {
      out[id] = { activity: 'at_desk', position: desks[id] }
    }
  })

  // Water cooler: assign UNIQUE positions. Overflow stays at desk.
  const cluster = layout.rooms.breakRoom.waterCoolerCluster
  waterCoolerIds.sort()
  waterCoolerIds.forEach((id, idx) => {
    if (cluster.length > 0 && idx < cluster.length) {
      out[id] = { activity: 'at_water_cooler', position: cluster[idx] }
    } else {
      out[id] = { activity: 'at_desk', position: desks[id] }
    }
  })

  // Restroom: hidden — activity records but position is desk (will not be
  // rendered anywhere).
  restroomIds.forEach(id => {
    out[id] = { activity: 'in_restroom', position: desks[id] }
  })

  // Chatting: route to the patio's standing positions (one agent per slot).
  // Overflow first cascades to aisle hotspots, then back to desks.
  const patioPositions = layout.rooms.smokingPatio?.standingPositions ?? []
  const aisleHotspots = layout.rooms.agentFloor.chattingHotspots
  // Flatten aisle hotspot pairs into individual standing positions.
  const aislePositions: ScreenPoint[] = []
  for (const [pA, pB] of aisleHotspots) {
    aislePositions.push(pA)
    aislePositions.push(pB)
  }
  const chatPositions = [...patioPositions, ...aislePositions]
  chattingIds.sort()
  chattingIds.forEach((id, idx) => {
    if (idx < chatPositions.length) {
      out[id] = { activity: 'chatting', position: chatPositions[idx] }
    } else {
      out[id] = { activity: 'at_desk', position: desks[id] }
    }
  })

  // Break room (Round 7.1): shrinkage agents routed to break-table seats.
  // The seat positions are owned by BreakRoom; we record at_break_table
  // with the agent's desk position (BreakRoom looks up its own seat slot
  // by agent id, the position field is unused for break-table rendering).
  // Overflow cascades to desks.
  const breakSeatCount = layout.rooms.breakRoom.seatPositions?.length ?? 0
  breakRoomIds.sort()
  breakRoomIds.forEach((id, idx) => {
    if (idx < breakSeatCount) {
      out[id] = { activity: 'at_break_table', position: desks[id] }
    } else {
      out[id] = { activity: 'at_desk', position: desks[id] }
    }
  })

  return out
}

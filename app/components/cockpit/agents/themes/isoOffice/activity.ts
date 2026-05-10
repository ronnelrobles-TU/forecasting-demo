// Activity scheduler — distributes IDLE agents to other rooms (training,
// gym, restroom, chatting in aisles, water cooler) using deterministic
// per-window hashes. The scheduler is a pure function called every render
// with the current agents array and simTimeMin; assignments are stable
// within a 30-min sim window so agents don't teleport between rooms every
// frame.
//
// All routing is purely visual fluff — the simulation kernel only knows
// about idle/on_call/on_break/off_shift. Visual activity is layered on top.

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
const WINDOW_MIN = 30

// Activity mix for IDLE agents. Probabilities must sum to <=1; remainder is
// at_desk. Tweak these to change office vibes.
const PROBS = {
  in_training:     0.08,
  in_gym:          0.06,
  chatting:        0.06,
  at_water_cooler: 0.05,
  in_restroom:     0.05,
} as const

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

export function computeActivityAssignments(
  agents: ReadonlyArray<AgentLite>,
  simTimeMin: number,
  layout: BuildingLayout,
): Record<string, ActivityAssignment> {
  const window = Math.floor(simTimeMin / WINDOW_MIN)
  const out: Record<string, ActivityAssignment> = {}
  const deskPositions = layout.deskPositions

  // First pass: classify each agent. Collect IDs grouped by activity so we
  // can deterministically assign slots within each room.
  const trainingIds: string[] = []
  const gymIds: string[] = []
  const restroomIds: string[] = []
  const chattingIds: string[] = []
  const waterCoolerIds: string[] = []
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
    // idle — hash-based scatter.
    const r = hash(`${a.id}|${window}|act`)
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

  // Training: assign each agent to a student seat (cycle through if more
  // agents than seats).
  const trainingSeats = layout.rooms.trainingRoom.studentSeats
  trainingIds.sort()
  trainingIds.forEach((id, idx) => {
    const seat = trainingSeats.length > 0
      ? trainingSeats[idx % trainingSeats.length]
      : desks[id]
    out[id] = { activity: 'in_training', position: seat }
  })

  // Gym: alternate between treadmill and weights, with small offsets so
  // multiple agents at the same equipment don't perfectly overlap.
  const gym = layout.rooms.gym
  gymIds.sort()
  gymIds.forEach((id, idx) => {
    const base = idx % 2 === 0 ? gym.treadmillPosition : gym.weightsPosition
    const stack = Math.floor(idx / 2)
    const offset = stack === 0 ? { x: 0, y: 0 } : { x: (stack % 2 === 0 ? -1 : 1) * 8 + stack * 0.5, y: stack * 4 }
    out[id] = { activity: 'in_gym', position: { x: base.x + offset.x, y: base.y + offset.y } }
  })

  // Water cooler: cluster agents at the standing positions near the cooler.
  const cluster = layout.rooms.breakRoom.waterCoolerCluster
  waterCoolerIds.sort()
  waterCoolerIds.forEach((id, idx) => {
    const pos = cluster.length > 0
      ? cluster[idx % cluster.length]
      : layout.rooms.breakRoom.waterCoolerPosition
    out[id] = { activity: 'at_water_cooler', position: pos }
  })

  // Restroom: hidden — activity records but position is desk (will not be
  // rendered anywhere).
  restroomIds.forEach(id => {
    out[id] = { activity: 'in_restroom', position: desks[id] }
  })

  // Chatting: pair agents up by sorted id and assign each pair to a hotspot.
  // Each pair gets the two points of one hotspot. Loners (odd count) stand
  // alone at the next available hotspot's first point.
  const hotspots = layout.rooms.agentFloor.chattingHotspots
  chattingIds.sort()
  if (hotspots.length === 0) {
    // No hotspots available — fall back to desk for chatting agents.
    chattingIds.forEach(id => {
      out[id] = { activity: 'at_desk', position: desks[id] }
    })
  } else {
    let i = 0
    while (i < chattingIds.length) {
      const hotspotIdx = Math.floor(i / 2) % hotspots.length
      const [pA, pB] = hotspots[hotspotIdx]
      const idA = chattingIds[i]
      const idB = chattingIds[i + 1]
      out[idA] = { activity: 'chatting', position: pA }
      if (idB !== undefined) {
        out[idB] = { activity: 'chatting', position: pB }
        i += 2
      } else {
        i += 1
      }
    }
  }

  return out
}

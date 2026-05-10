'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRendererProps } from './AgentRenderer'
import { Building, BuildingDefs } from './isoOffice/Building'
import { AgentFloor } from './isoOffice/AgentFloor'
import { ManagerOffices } from './isoOffice/ManagerOffices'
import { Reception, ReceptionDefs } from './isoOffice/Reception'
import { BreakRoom } from './isoOffice/BreakRoom'
import { TrainingRoom } from './isoOffice/TrainingRoom'
import { Restrooms } from './isoOffice/Restrooms'
import { Gym } from './isoOffice/Gym'
import { SmokingPatio } from './isoOffice/SmokingPatio'
import { Janitor } from './isoOffice/Janitor'
import { ExecutiveWalker } from './isoOffice/ExecutiveWalker'
import { DeliveryPerson } from './isoOffice/DeliveryPerson'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { computeBuildingLayout, type BuildingLayout, type ScreenPoint } from './isoOffice/geometry'
import { computeActivityAssignments, type ActivityAssignment } from './isoOffice/activity'
import {
  makeJourney,
  tickJourney,
  transitionJourney,
  startWalkToRoom,
  startWalkBackToDesk,
  isWalkingPhase,
  journeyPosition,
  type VisualJourney,
  type RoomKind,
} from './isoOffice/journey'
import { computeJourneyLookahead, breakDurationFor, hasUpcomingShiftEnd } from './isoOffice/lookahead'
import { computeLighting, quantizeLightingTime } from './isoOffice/lighting'
import { activeAgentIndices, peakInOfficeCount } from './isoOffice/shiftModel'
import { SceneClock } from './isoOffice/SceneClock'
import { StatusLegend } from './isoOffice/StatusLegend'
import { ActivityCounter, type ActivityCounts } from './isoOffice/ActivityCounter'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

const SHIFT_END_LOOKAHEAD_MIN = 3

// Stable empty assignments map used in fast mode. Must be a single
// top-level reference so memoised consumers don't see it as "changed"
// every render.
const EMPTY_ACTIVITIES: Record<string, ActivityAssignment> = {}

export interface RenderedPosition { pos: ScreenPoint; opacity: number; visible: boolean }

export function IsoRenderer({ agents, simTimeMin, events, deskCapacity, absenteeismPct, shrinkPct, perInterval, simSpeed }: AgentRendererProps) {
  // Fast mode: at sim speeds > 1× the user is fast-forwarding, and journey
  // animations (1.5s walks, 2.5s break sits, 4s lunch outside) take longer
  // in real time than the actual sim event they're meant to depict — the
  // viz lies about timing. Flip to a static "agents-at-desks-with-shirt-
  // colors" mode that's accurate to the kernel's tick.
  const fastMode = (simSpeed ?? 1) > 1

  // Compute which agent indices are currently "on shift" using the Erlang
  // scheduled-agent count from the per-interval stats. Without this, the
  // agentTimeline kernel defaults every agent to idle at minute 0 — so at
  // midnight the office is full of idle agents, which is nonsense. With
  // this overlay, only the night-shift skeleton is visible at midnight,
  // and the floor ramps in/out through the day matching call volume.
  // Per-agent micro-offsets stagger arrivals so the 15-min boundary
  // doesn't bunch.
  // Round 5.7: peak in-office count = ceil(maxErlang / (1 - shrink/100)).
  // Indices [peakInOffice .. agents.length) are "today's absentees" — they
  // never come in. Their desks render with the AbsentMarker so the user sees
  // the absenteeism rate at a glance. This is the slice between the in-office
  // population (~234) and the total scheduled HC (~257) for a typical 159-
  // Erlang scenario.
  const peakInOffice = useMemo(
    () => peakInOfficeCount(perInterval, shrinkPct),
    [perInterval, shrinkPct],
  )
  const absentSlots = Math.max(0, agents.length - peakInOffice)
  const isActiveByIndex = useMemo(
    () => {
      // Force the "absentee" tail (last `absentSlots` indices) to inactive
      // for the entire day. The first `peakInOffice` agents follow the
      // schedule curve.
      const arr = activeAgentIndices(agents.length, perInterval, simTimeMin, shrinkPct)
      for (let i = agents.length - absentSlots; i < agents.length; i++) {
        if (i >= 0) arr[i] = false
      }
      return arr
    },
    [agents.length, perInterval, simTimeMin, shrinkPct, absentSlots],
  )
  // Effective desk count: caller-supplied capacity, or one per agent. Layout
  // grows to fit `deskCount` so users can SEE empty desks fill in as the
  // morning shift ramps up.
  const deskCount = Math.max(agents.length, deskCapacity ?? agents.length)
  // Compute building layout once per (agent count, desk count) pair.
  const layout: BuildingLayout = useMemo(
    () => computeBuildingLayout(agents.length, deskCount),
    [agents.length, deskCount],
  )

  // Time-of-day lighting. Quantize sim time to 5-min steps so the sky doesn't
  // recompute every frame (the colour is barely changing minute-to-minute).
  const lightingTime = quantizeLightingTime(simTimeMin, 5)
  const lighting = useMemo(
    () => computeLighting(lightingTime, layout.viewBox),
    [lightingTime, layout.viewBox],
  )

  // Activity assignments — pure, stable within a 30-min sim window.
  const activities: Record<string, ActivityAssignment> = useMemo(
    () => computeActivityAssignments(agents, simTimeMin, layout),
    [agents, simTimeMin, layout],
  )

  // Lookahead: per-agent break durations + shift_end times derived from events.
  const lookahead = useMemo(
    () => computeJourneyLookahead(events ?? []),
    [events],
  )

  // Per-agent visual journeys.
  const journeysRef = useRef<Record<string, VisualJourney>>({})
  const [journeySnapshot, setJourneySnapshot] = useState<Record<string, VisualJourney>>({})
  // Frame-time-resolved render positions. Updated alongside the snapshot.
  const [positions, setPositions] = useState<Record<string, RenderedPosition>>({})
  const prevStatesRef = useRef<Record<string, AgentVisualState>>({})
  const prevActivitiesRef = useRef<Record<string, string>>({})
  const prevAgentCountRef = useRef<number>(0)

  function resolvePositions(journeys: Record<string, VisualJourney>, now: number): Record<string, RenderedPosition> {
    const out: Record<string, RenderedPosition> = {}
    for (const id of Object.keys(journeys)) {
      out[id] = journeyPosition(journeys[id], now)
    }
    return out
  }

  // Initialize / re-initialize journeys when agent count changes.
  useEffect(() => {
    if (prevAgentCountRef.current !== agents.length) {
      const now = performance.now()
      const journeys: Record<string, VisualJourney> = {}
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i]
        const desk = layout.deskPositions[i] ?? layout.deskPositions[layout.deskPositions.length - 1] ?? { x: 0, y: 0 }
        const existing = journeysRef.current[a.id]
        journeys[a.id] = existing ?? makeJourney(a.id, desk, a.state, now)
      }
      journeysRef.current = journeys
      setJourneySnapshot(journeys)
      setPositions(resolvePositions(journeys, now))
      prevAgentCountRef.current = agents.length
    }
  }, [agents, layout])

  // React to sim-state changes for each agent. Also overlays the Erlang-
  // schedule "is this agent currently on shift?" decision: if not, force
  // their effectiveState to off_shift so journey.ts dispatches a
  // walk-to-door + gone (visible exodus). When the schedule ramps back up
  // and an agent becomes active again, their state flips back to idle/
  // on_call/etc. and the journey machinery walks them in from the door.
  useEffect(() => {
    const now = performance.now()
    const prev = prevStatesRef.current
    let changed = false
    const next: Record<string, VisualJourney> = { ...journeysRef.current }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]
      const desk = next[a.id]?.homeDeskPosition
        ?? layout.deskPositions[Number(a.id.replace(/^A/, '')) || 0]
        ?? { x: 0, y: 0 }
      if (!next[a.id]) {
        // First-ever sight of this agent. If they're inactive at sim start
        // (e.g. midnight skeleton + 200 agents), spawn them as `gone` so
        // they don't pop into existence at their desks before walking out.
        const initial: AgentVisualState = isActiveByIndex[i] ? a.state : 'off_shift'
        next[a.id] = makeJourney(a.id, desk, initial, now)
        changed = true
      }
      const prevState = prev[a.id]

      let effectiveState: AgentVisualState = a.state
      if (!isActiveByIndex[i]) {
        // Inactive (off the schedule's roster for this minute) — force
        // off_shift, which dispatches walk-to-door → gone. The journey
        // machinery already handles the visible exit.
        effectiveState = 'off_shift'
      } else if (
        a.state !== 'off_shift'
        && hasUpcomingShiftEnd(lookahead, a.id, simTimeMin, SHIFT_END_LOOKAHEAD_MIN)
      ) {
        effectiveState = 'off_shift'
      }

      if (prevState !== effectiveState) {
        const breakDur = effectiveState === 'on_break'
          ? breakDurationFor(lookahead, a.id, simTimeMin)
          : undefined
        next[a.id] = transitionJourney(next[a.id], effectiveState, layout, now, breakDur)
        changed = true
      }
      prev[a.id] = effectiveState
    }
    if (changed) {
      journeysRef.current = next
      setJourneySnapshot(next)
      setPositions(resolvePositions(next, now))
    }
  }, [agents, simTimeMin, layout, lookahead, isActiveByIndex])

  // React to *display activity* changes (gym/training/restroom/chat/water_cooler).
  // These don't show up in sim state — they're a visual fluff layer — so we
  // dispatch journey walks here so every transition is a visible walk
  // (no teleports). When activity flips back to at_desk, we walk back from
  // wherever the agent currently is.
  //
  // Fast-mode skip: at sim speeds > 1× we suppress activity scatter entirely
  // (Issue 4 fix). Walks would lie about timing because their real duration
  // exceeds the sim duration of an entire on_call/break phase. Agents stay
  // at desks with shirt colors that track sim state.
  useEffect(() => {
    if (fastMode) {
      // Wipe activity history so when speed drops back to ≤ 1× the next
      // tick re-evaluates everyone (no stale prev-activity preventing a
      // dispatch).
      prevActivitiesRef.current = {}
      return
    }
    const now = performance.now()
    const prev = prevActivitiesRef.current
    let changed = false
    const next: Record<string, VisualJourney> = { ...journeysRef.current }
    for (const a of agents) {
      // Don't drive activity-walks for non-idle agents — sim state owns them.
      if (a.state !== 'idle') {
        prev[a.id] = activities[a.id]?.activity ?? 'at_desk'
        continue
      }
      const newActivity = activities[a.id]?.activity ?? 'at_desk'
      const prevActivity = prev[a.id]
      if (prevActivity === newActivity) continue
      prev[a.id] = newActivity
      const j = next[a.id]
      if (!j) continue
      const target = activities[a.id]?.position
      if (newActivity === 'at_desk') {
        // Walk back from wherever we are.
        const updated = startWalkBackToDesk(j, now)
        if (updated !== j) {
          next[a.id] = updated
          changed = true
        }
      } else if (target) {
        // Map activity to a RoomKind.
        const roomKind: RoomKind | null =
            newActivity === 'in_gym'         ? 'gym'
          : newActivity === 'in_training'    ? 'training'
          : newActivity === 'in_restroom'    ? 'restroom'
          : newActivity === 'chatting'       ? 'chat'
          : newActivity === 'at_water_cooler'? 'water_cooler'
          : null
        if (roomKind) {
          const updated = startWalkToRoom(j, roomKind, target, now)
          if (updated !== j) {
            next[a.id] = updated
            changed = true
          }
        }
      }
    }
    if (changed) {
      journeysRef.current = next
      setJourneySnapshot(next)
      setPositions(resolvePositions(next, now))
    }
  }, [agents, activities, fastMode])

  // Per-frame tick: advance in-flight phases AND refresh resolved positions
  // while anything is mid-walk.
  useEffect(() => {
    let raf = 0
    function tick(now: number) {
      let phaseChanged = false
      const cur = journeysRef.current
      const nextJ: Record<string, VisualJourney> = {}
      let anyWalking = false
      for (const id of Object.keys(cur)) {
        const before = cur[id]
        const after = tickJourney(before, layout, now)
        nextJ[id] = after
        if (after !== before) phaseChanged = true
        if (isWalkingPhase(after.phase)) anyWalking = true
      }
      if (phaseChanged) {
        journeysRef.current = nextJ
        setJourneySnapshot(nextJ)
      }
      // Re-resolve positions only when something is walking (otherwise nothing
      // moves frame-to-frame; CSS bob is GPU-only).
      if (anyWalking || phaseChanged) {
        setPositions(resolvePositions(journeysRef.current, now))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [layout])

  const walkingIds = useMemo(() => {
    const out = new Set<string>()
    for (const id of Object.keys(journeySnapshot)) {
      if (isWalkingPhase(journeySnapshot[id].phase)) out.add(id)
    }
    return out
  }, [journeySnapshot])

  // Restroom occupancy — count agents currently in any restroom-related
  // phase OR with `in_restroom` activity assigned. Drives the stall-door
  // "occupied" red dots and (when stalls are full) the small queue of
  // waiting agents painted outside the doors. Without this signal the
  // bathroom looked dead even when agents were nominally inside (Round 5.6
  // user complaint: "no one is also going to the bathroom").
  const restroomOccupancy = useMemo(() => {
    let n = 0
    for (const id of Object.keys(journeySnapshot)) {
      const k = journeySnapshot[id].phase.kind
      if (
        k === 'walking_to_restroom_door'
        || k === 'entering_restroom'
        || k === 'inside_restroom'
        || k === 'exiting_restroom'
      ) n++
    }
    // Also count anyone whose activity says in_restroom but who hasn't
    // started journeying yet. (Most of the time the journey is already
    // dispatched, so this is a small additive correction.)
    for (const id of Object.keys(activities)) {
      if (activities[id]?.activity !== 'in_restroom') continue
      const k = journeySnapshot[id]?.phase.kind
      if (k === 'at_desk' || k === 'on_call_at_desk' || k == null) {
        // Pre-walk; already counted journeys above.
        n++
      }
    }
    return n
  }, [journeySnapshot, activities])

  // Effective activities: in fast mode, suppress all activity scatter so
  // agents stay at their desks and the simulation timing isn't lied about.
  // The room components and the activity-effect see an empty map.
  const effectiveActivities = fastMode ? EMPTY_ACTIVITIES : activities

  // Round 5.7: live activity counts for the on-canvas overlay. Counted from
  // current journey phases (the source of truth for where each agent is) +
  // pre-walk activity assignments. Cheap O(N) per render.
  const activityCounts: ActivityCounts = useMemo(() => {
    const counts: ActivityCounts = {
      atDesks: 0, inTraining: 0, inGym: 0, onBreak: 0,
      smoking: 0, chatting: 0, waterCooler: 0, restroom: 0, walking: 0,
    }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]
      const j = journeySnapshot[a.id]
      const k = j?.phase.kind
      if (k === 'gone' || a.state === 'off_shift') continue // not in office
      // Walking phases (visible transit) — bucketed first.
      if (k && (
        k === 'walking_to_break' || k === 'walking_back_to_desk'
        || k === 'walking_to_door_for_lunch' || k === 'walking_back_from_lunch'
        || k === 'walking_to_door_for_shift_end' || k === 'arriving_at_door'
        || k === 'walking_to_room' || k === 'walking_back_from_room'
        || k === 'walking_to_restroom_door' || k === 'walking_back_from_restroom'
        || k === 'walking_to_chat_spot' || k === 'walking_back_from_chat'
      )) { counts.walking++; continue }
      // Resting phases.
      if (k === 'at_break_table' || a.state === 'on_break') { counts.onBreak++; continue }
      if (k === 'outside_for_lunch') { counts.onBreak++; continue }
      if (k === 'inside_restroom' || k === 'entering_restroom' || k === 'exiting_restroom') {
        counts.restroom++; continue
      }
      if (k === 'in_room') {
        const room = j?.phase.kind === 'in_room' ? j.phase.targetRoom : null
        if (room === 'training') counts.inTraining++
        else if (room === 'gym') counts.inGym++
        else if (room === 'water_cooler') counts.waterCooler++
        else if (room === 'patio') counts.smoking++
        else if (room === 'chat') counts.chatting++
        else counts.atDesks++
        continue
      }
      if (k === 'at_chat_spot') { counts.chatting++; continue }
      // Default: at desk (covers at_desk, on_call_at_desk, undefined).
      counts.atDesks++
    }
    return counts
  }, [agents, journeySnapshot])

  return (
    <>
    <svg
      viewBox={`0 0 ${layout.viewBox.w} ${layout.viewBox.h}`}
      style={{ width: '100%', height: '100%', display: 'block', background: lighting.skyColor }}
    >
      <BuildingDefs/>
      <ReceptionDefs/>
      <defs><TileGlowDefs/></defs>

      {/* Sky-color background rect (covers the full viewBox so PNG export and
          containers without `background` still see the sky). */}
      <rect
        x={0} y={0}
        width={layout.viewBox.w}
        height={layout.viewBox.h}
        fill={lighting.skyColor}
      />

      {/* Sun or moon arcing across the sky. Hidden during transitional twilight. */}
      {lighting.sunPosition.visible && (
        lighting.celestialBody === 'sun'
          ? <g transform={`translate(${lighting.sunPosition.x}, ${lighting.sunPosition.y})`}>
              <circle r={11} fill="#fde68a" opacity={0.4}/>
              <circle r={7} fill="#fbbf24"/>
            </g>
          : <g transform={`translate(${lighting.sunPosition.x}, ${lighting.sunPosition.y})`}>
              <circle r={6} fill="#f1f5f9"/>
              <circle r={5.5} cx={1.6} fill={lighting.skyColor}/>
            </g>
      )}

      <Building layout={layout} lighting={lighting}/>

      <TrainingRoom layout={layout} agents={agents} activities={effectiveActivities} journeys={journeySnapshot} walkingIds={walkingIds}/>
      <BreakRoom agents={agents} journeys={journeySnapshot} positions={positions} layout={layout} activities={effectiveActivities} walkingIds={walkingIds}/>
      <Restrooms layout={layout} occupiedCount={restroomOccupancy}/>
      <Gym layout={layout} agents={agents} activities={effectiveActivities} journeys={journeySnapshot} walkingIds={walkingIds}/>

      <ManagerOffices layout={layout}/>

      <AgentFloor
        agents={agents}
        journeys={journeySnapshot}
        positions={positions}
        layout={layout}
        activities={effectiveActivities}
        absenteeismPct={absenteeismPct}
        absentTailStart={agents.length - absentSlots}
      />

      <SmokingPatio layout={layout} agents={agents} activities={effectiveActivities} journeys={journeySnapshot}/>

      <Janitor layout={layout} simTimeMin={simTimeMin}/>
      <ExecutiveWalker layout={layout}/>
      <DeliveryPerson layout={layout} simTimeMin={simTimeMin}/>

      <Reception layout={layout}/>
    </svg>

    {/* Round 5.7 clarity overlays. HTML siblings of the SVG, absolutely
        positioned inside the .cockpit-agent-scene container. Subtle,
        non-interfering, dismissible — purely informational for new users. */}
    <div className="cockpit-scene-overlay cockpit-scene-overlay--top-left">
      <SceneClock simTimeMin={simTimeMin}/>
      <ActivityCounter counts={activityCounts}/>
    </div>
    <div className="cockpit-scene-overlay cockpit-scene-overlay--top-right-lower">
      <StatusLegend/>
    </div>
    </>
  )
}

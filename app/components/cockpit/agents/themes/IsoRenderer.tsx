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
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

const SHIFT_END_LOOKAHEAD_MIN = 3

export interface RenderedPosition { pos: ScreenPoint; opacity: number; visible: boolean }

export function IsoRenderer({ agents, simTimeMin, events }: AgentRendererProps) {
  // Compute building layout once per agent count.
  const layout: BuildingLayout = useMemo(() => computeBuildingLayout(agents.length), [agents.length])

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

  // React to sim-state changes for each agent.
  useEffect(() => {
    const now = performance.now()
    const prev = prevStatesRef.current
    let changed = false
    const next: Record<string, VisualJourney> = { ...journeysRef.current }
    for (const a of agents) {
      const desk = next[a.id]?.homeDeskPosition
        ?? layout.deskPositions[Number(a.id.replace(/^A/, '')) || 0]
        ?? { x: 0, y: 0 }
      if (!next[a.id]) {
        next[a.id] = makeJourney(a.id, desk, a.state, now)
        changed = true
      }
      const prevState = prev[a.id]

      let effectiveState: AgentVisualState = a.state
      if (
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
  }, [agents, simTimeMin, layout, lookahead])

  // React to *display activity* changes (gym/training/restroom/chat/water_cooler).
  // These don't show up in sim state — they're a visual fluff layer — so we
  // dispatch journey walks here so every transition is a visible walk
  // (no teleports). When activity flips back to at_desk, we walk back from
  // wherever the agent currently is.
  useEffect(() => {
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
  }, [agents, activities])

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

  return (
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

      <TrainingRoom layout={layout} agents={agents} activities={activities} journeys={journeySnapshot} walkingIds={walkingIds}/>
      <BreakRoom agents={agents} journeys={journeySnapshot} positions={positions} layout={layout} activities={activities} walkingIds={walkingIds}/>
      <Restrooms layout={layout}/>
      <Gym layout={layout} agents={agents} activities={activities} journeys={journeySnapshot} walkingIds={walkingIds}/>

      <ManagerOffices layout={layout}/>

      <AgentFloor agents={agents} journeys={journeySnapshot} positions={positions} layout={layout} activities={activities}/>

      <SmokingPatio layout={layout} agents={agents} activities={activities} journeys={journeySnapshot}/>

      <Janitor layout={layout} simTimeMin={simTimeMin}/>
      <ExecutiveWalker layout={layout}/>
      <DeliveryPerson layout={layout} simTimeMin={simTimeMin}/>

      <Reception layout={layout}/>
    </svg>
  )
}

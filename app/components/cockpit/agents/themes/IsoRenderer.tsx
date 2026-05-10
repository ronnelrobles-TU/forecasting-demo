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
import { Janitor } from './isoOffice/Janitor'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { computeBuildingLayout, type BuildingLayout } from './isoOffice/geometry'
import { advanceAnimations, detectTransitions, type AnimState, type StateMap, type Transition } from './isoOffice/animation'
import { computeActivityAssignments, type ActivityAssignment, type DisplayActivity } from './isoOffice/activity'

export function IsoRenderer({ agents, simTimeMin }: AgentRendererProps) {
  // Compute building layout once per render based on agent count. Floor + walls
  // + viewBox all derive from this — high counts produce a larger building and
  // a bigger viewBox, scaled to fit the panel via xMidYMid meet (zoom-out
  // effect).
  const layout: BuildingLayout = useMemo(() => computeBuildingLayout(agents.length), [agents.length])

  // Activity assignments — recomputed every render but cheap (pure function,
  // hashes are O(1) per agent). Stable within a 30-min sim window so agents
  // don't ping-pong between rooms each frame.
  const activities: Record<string, ActivityAssignment> = useMemo(
    () => computeActivityAssignments(agents, simTimeMin, layout),
    [agents, simTimeMin, layout],
  )

  const prevStatesRef = useRef<StateMap>({})
  const prevActivitiesRef = useRef<Record<string, DisplayActivity>>({})
  const animRef = useRef<AnimState>({})
  const lastTickRef = useRef<number | null>(null)
  // animSnapshot mirrors animRef.current, set inside the rAF loop / transition
  // detector. We read this (not the ref) during render so we don't violate
  // react-hooks/refs while still letting the rAF loop mutate animRef freely.
  const [animSnapshot, setAnimSnapshot] = useState<AnimState>({})

  // Build current state map keyed by agent id
  const currStates: StateMap = {}
  for (const a of agents) currStates[a.id] = a.state

  // Detect transitions: state changes (off_shift→idle ⇒ door_to_desk;
  // idle→off_shift ⇒ desk_to_door; idle/on_call↔on_break ⇒ desk_to_break)
  // and ACTIVITY changes (at_desk↔in_room ⇒ desk_to_room / room_to_desk).
  useEffect(() => {
    const transitions: Transition[] = []
    const baseTransitions = detectTransitions(prevStatesRef.current, currStates)

    // Replace shift_start fade_in with door_to_desk and shift_end fade_out
    // with desk_to_door so agents walk across the lobby instead of teleporting.
    for (const t of baseTransitions) {
      if (t.kind === 'fade_in') {
        transitions.push({
          agentId: t.agentId,
          kind: 'door_to_desk',
          targetPosition: layout.rooms.reception.doorPosition,
        })
      } else if (t.kind === 'fade_out') {
        transitions.push({
          agentId: t.agentId,
          kind: 'desk_to_door',
          targetPosition: layout.rooms.reception.doorPosition,
        })
      } else {
        transitions.push(t)
      }
    }

    // Activity transitions for idle agents. We only animate when an agent's
    // activity flipped between at_desk and a room-bound activity (skip
    // chatting — they just appear/disappear in aisles, no walking yet).
    for (const id of Object.keys(activities)) {
      const prevAct = prevActivitiesRef.current[id]
      const currAct = activities[id].activity
      if (!prevAct || prevAct === currAct) continue
      // Don't fight state-change animations
      if (transitions.some(t => t.agentId === id)) continue
      // Skip activity changes when state is on_break or off_shift (those are
      // owned by other transitions).
      const state = currStates[id]
      if (state === 'on_break' || state === 'off_shift') continue

      const wasAtDesk = prevAct === 'at_desk'
      const isAtDesk = currAct === 'at_desk'
      if (wasAtDesk && !isAtDesk && currAct !== 'in_restroom' && currAct !== 'at_break_table') {
        transitions.push({
          agentId: id,
          kind: 'desk_to_room',
          targetPosition: activities[id].position,
        })
      } else if (!wasAtDesk && isAtDesk && prevAct !== 'in_restroom' && prevAct !== 'at_break_table') {
        // We need to know where they came from. Use prev activity slot via
        // a ref of last-known positions — but to keep this simple, look up
        // the position they were assigned LAST window: we don't have it
        // anymore, so just lerp from a sensible source. Best approximation:
        // use the new desk position - a small offset toward the room they
        // were in. As a pragmatic shortcut, just snap (no walk) for now.
        // Simpler: treat returning trips with a tiny delay so they don't
        // pop, by also dispatching room_to_desk with the prev position
        // unknown — fall back to door if we can't infer.
        // Use the door as a generic "came from somewhere" source.
        transitions.push({
          agentId: id,
          kind: 'room_to_desk',
          targetPosition: layout.rooms.reception.doorPosition,
        })
      }
    }

    if (transitions.length > 0) {
      animRef.current = advanceAnimations(animRef.current, 0, transitions, performance.now())
      setAnimSnapshot(animRef.current)
    }
    prevStatesRef.current = currStates
    const nextActMap: Record<string, DisplayActivity> = {}
    for (const id of Object.keys(activities)) nextActMap[id] = activities[id].activity
    prevActivitiesRef.current = nextActMap
  }, [simTimeMin]) // eslint-disable-line react-hooks/exhaustive-deps -- intentional: only react to sim time advance

  // requestAnimationFrame loop: advance in-flight transitions only.
  // Idle bob is a pure CSS animation, so the loop only does React work when
  // there are active transitions. A static office (everyone at desks) costs
  // ~0 React work — only the GPU animates.
  useEffect(() => {
    let raf = 0
    function tick(now: number) {
      const dt = lastTickRef.current === null ? 0 : (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      const before = Object.keys(animRef.current).length
      if (before > 0) {
        animRef.current = advanceAnimations(animRef.current, dt)
        setAnimSnapshot(animRef.current)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      viewBox={`0 0 ${layout.viewBox.w} ${layout.viewBox.h}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <BuildingDefs/>
      <ReceptionDefs/>
      <defs><TileGlowDefs/></defs>

      {/* Building shell: perimeter walls, floor, room tints, interior dividers, windows, front door cut-out. */}
      <Building layout={layout}/>

      {/* NW back wing: training, break, restrooms, gym (drawn back-to-front). */}
      <TrainingRoom layout={layout} agents={agents} activities={activities} anim={animSnapshot}/>
      <BreakRoom agents={agents} anim={animSnapshot} layout={layout} activities={activities}/>
      <Restrooms layout={layout}/>
      <Gym layout={layout} agents={agents} activities={activities} anim={animSnapshot}/>

      {/* Manager mini-offices along the NE strip. */}
      <ManagerOffices layout={layout}/>

      {/* Agent floor: cubicle pods + desks + agents. */}
      <AgentFloor agents={agents} anim={animSnapshot} layout={layout} activities={activities}/>

      {/* Janitor NPC walking the perimeter loop. */}
      <Janitor layout={layout} simTimeMin={simTimeMin}/>

      {/* Reception at the front (drawn last so it sits on top of the front wall door cut-out). */}
      <Reception layout={layout}/>
    </svg>
  )
}

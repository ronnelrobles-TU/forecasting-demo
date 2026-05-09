'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { Desks } from './isoOffice/Desks'
import { BreakRoom } from './isoOffice/BreakRoom'
import { Manager } from './isoOffice/Manager'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { VIEWBOX } from './isoOffice/geometry'
import { advanceAnimations, detectTransitions, type AnimState, type StateMap } from './isoOffice/animation'

export function IsoRenderer({ agents, simTimeMin }: AgentRendererProps) {
  const prevStatesRef = useRef<StateMap>({})
  const animRef = useRef<AnimState>({})
  const lastTickRef = useRef<number | null>(null)
  // animSnapshot mirrors animRef.current, set inside the rAF loop / transition
  // detector. We read this (not the ref) during render so we don't violate
  // react-hooks/refs while still letting the rAF loop mutate animRef freely.
  const [animSnapshot, setAnimSnapshot] = useState<AnimState>({})

  // Build current state map keyed by agent id
  const currStates: StateMap = {}
  for (const a of agents) currStates[a.id] = a.state

  // Detect new transitions whenever currStates changes (sim time advanced)
  useEffect(() => {
    const transitions = detectTransitions(prevStatesRef.current, currStates)
    if (transitions.length > 0) {
      animRef.current = advanceAnimations(animRef.current, 0, transitions, performance.now())
      setAnimSnapshot(animRef.current)
    }
    prevStatesRef.current = currStates
  }, [simTimeMin]) // eslint-disable-line react-hooks/exhaustive-deps -- currStates derived from agents/simTimeMin; avoid object identity churn

  // requestAnimationFrame loop: advance in-flight transitions only.
  // The idle bob is now a pure CSS animation (.cockpit-iso-bob), so the loop
  // only does React work when there are active transitions. A static office
  // (everyone at their desk) costs ~0 React work — only the GPU animates.
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
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <defs><TileGlowDefs/></defs>
      <Room/>
      <BreakRoom agents={agents} anim={animSnapshot}/>
      <Desks agents={agents} anim={animSnapshot}/>
      <Manager/>
    </svg>
  )
}

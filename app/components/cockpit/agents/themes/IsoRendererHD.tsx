'use client'

// Office HD theme — Pixi.js / WebGL renderer. Same scene content as the SVG
// `IsoRenderer` but drawn via Pixi v8 so we can paint thousands of sprites
// without taxing the React reconciler. The shared journey/shift/activity/
// lighting modules are reused as-is — only the "what to paint and where" is
// different. The SVG renderer remains the safe fallback.
//
// What the HD theme covers in this first cut:
//   - Building shell (floor, walls, partitions, room tints, windows, desks)
//   - Per-agent sprite (shadow + body + head) with shirt color tied to sim state
//   - Status bubbles via PIXI.Text
//   - Camera pan + zoom (mouse drag, wheel, + / - / 0 keyboard)
//   - Time-of-day lighting (sky color, window glow, wall warmth, sun/moon)
//   - Injected-event tints (surge / outage / flash absent)
//
// Deliberately deferred to TODOs (the SVG fallback covers them today):
//   - Janitor / executive walker / delivery NPCs
//   - Smoking patio + smoke particles
//   - Activity room scenery (gym treadmill, training whiteboard, etc.)
//   - Restroom queue dots + occupancy markers
//   - Event banners (these still surface via the SVG-overlay DOM siblings)

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRendererProps } from './AgentRenderer'
import { computeBuildingLayout, type BuildingLayout } from './isoOffice/geometry'
import { computeActivityAssignments, type ActivityAssignment } from './isoOffice/activity'
import {
  makeJourney,
  tickJourney,
  transitionJourney,
  startWalkToRoom,
  startWalkBackToDesk,
  type VisualJourney,
  type RoomKind,
} from './isoOffice/journey'
import {
  computeJourneyLookahead,
  breakDurationFor,
  hasUpcomingShiftEnd,
} from './isoOffice/lookahead'
import { computeLighting, quantizeLightingTime } from './isoOffice/lighting'
import { activeAgentIndicesAllocated, peakInOfficeCount } from './isoOffice/shiftModel'
import {
  activeInjectedEvents,
  eventVisualFlags,
} from './isoOffice/injectedEventVisuals'
import { SceneClock } from './isoOffice/SceneClock'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { buildHDScene, destroyHDScene, type HDSceneState } from './isoOfficeHD/scene'
import { updateAgentLayer } from './isoOfficeHD/frame'
import { paintLighting } from './isoOfficeHD/lightingPaint'
import { EventBanner } from './isoOffice/EventBanner'

const SHIFT_END_LOOKAHEAD_MIN = 3
const EMPTY_ACTIVITIES: Record<string, ActivityAssignment> = {}

interface CameraState { scale: number; panX: number; panY: number }
const INITIAL_CAMERA: CameraState = { scale: 1, panX: 0, panY: 0 }

export function IsoRendererHD({
  agents,
  simTimeMin,
  events,
  deskCapacity,
  shrinkPct,
  perInterval,
  simSpeed,
  injectedEvents,
}: AgentRendererProps) {
  const fastMode = (simSpeed ?? 1) > 1

  // ── Schedule overlay (same as SVG IsoRenderer) ────────────────────────
  const peakInOffice = useMemo(
    () => peakInOfficeCount(perInterval, shrinkPct),
    [perInterval, shrinkPct],
  )
  const absentSlots = Math.max(0, agents.length - peakInOffice)

  // Round 7.1: three-tier allocation. Mirrors IsoRenderer.
  const allocation = useMemo(
    () => activeAgentIndicesAllocated(agents.length, perInterval, simTimeMin, shrinkPct),
    [agents.length, perInterval, simTimeMin, shrinkPct],
  )
  const isActiveByIndex = useMemo(() => {
    const arr = new Array<boolean>(agents.length)
    const tailStart = agents.length - absentSlots
    for (let i = 0; i < agents.length; i++) {
      if (i >= tailStart && tailStart >= 0) {
        arr[i] = false
        continue
      }
      arr[i] = allocation.productive.has(i) || allocation.shrinkage.has(i)
    }
    return arr
  }, [agents.length, allocation, absentSlots])

  const deskCount = Math.max(agents.length, deskCapacity ?? agents.length)
  const layout: BuildingLayout = useMemo(
    () => computeBuildingLayout(agents.length, deskCount),
    [agents.length, deskCount],
  )

  // ── Lighting / activity / lookahead — shared modules ──────────────────
  const lightingTime = quantizeLightingTime(simTimeMin, 5)
  const lighting = useMemo(
    () => computeLighting(lightingTime, layout.viewBox),
    [lightingTime, layout.viewBox],
  )
  const activities: Record<string, ActivityAssignment> = useMemo(
    () => computeActivityAssignments(agents, simTimeMin, layout, allocation),
    [agents, simTimeMin, layout, allocation],
  )
  const lookahead = useMemo(
    () => computeJourneyLookahead(events ?? []),
    [events],
  )

  // ── Per-agent visual journeys (mirrors IsoRenderer logic) ─────────────
  const journeysRef = useRef<Record<string, VisualJourney>>({})
  const prevStatesRef = useRef<Record<string, AgentVisualState>>({})
  const prevActivitiesRef = useRef<Record<string, string>>({})
  const prevAgentCountRef = useRef<number>(0)

  // Roster prune.
  useEffect(() => {
    if (prevAgentCountRef.current !== agents.length) {
      const journeys: Record<string, VisualJourney> = {}
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i]
        const existing = journeysRef.current[a.id]
        if (existing) journeys[a.id] = existing
      }
      for (const id of Object.keys(prevStatesRef.current)) {
        if (!journeys[id]) delete prevStatesRef.current[id]
      }
      journeysRef.current = journeys
      prevAgentCountRef.current = agents.length
    }
  }, [agents, layout])

  // Sim-state transitions → journey dispatch.
  useEffect(() => {
    const now = performance.now()
    const prev = prevStatesRef.current
    const next: Record<string, VisualJourney> = { ...journeysRef.current }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]
      const desk = next[a.id]?.homeDeskPosition
        ?? layout.deskPositions[Number(a.id.replace(/^A/, '')) || 0]
        ?? { x: 0, y: 0 }
      let effectiveState: AgentVisualState = a.state
      if (!isActiveByIndex[i]) {
        effectiveState = 'off_shift'
      } else if (
        a.state !== 'off_shift'
        && hasUpcomingShiftEnd(lookahead, a.id, simTimeMin, SHIFT_END_LOOKAHEAD_MIN)
      ) {
        effectiveState = 'off_shift'
      }
      const isFirstSighting = !next[a.id]
      if (isFirstSighting) {
        next[a.id] = makeJourney(a.id, desk, effectiveState, now)
        prev[a.id] = effectiveState
        continue
      }
      const prevState = prev[a.id]
      if (prevState !== effectiveState) {
        const breakDur = effectiveState === 'on_break'
          ? breakDurationFor(lookahead, a.id, simTimeMin)
          : undefined
        next[a.id] = transitionJourney(next[a.id], effectiveState, layout, now, breakDur)
      }
      prev[a.id] = effectiveState
    }
    journeysRef.current = next
  }, [agents, simTimeMin, layout, lookahead, isActiveByIndex])

  // Activity-walks (gym/training/restroom/chat/water_cooler).
  useEffect(() => {
    if (fastMode) {
      prevActivitiesRef.current = {}
      return
    }
    const now = performance.now()
    const prev = prevActivitiesRef.current
    const next: Record<string, VisualJourney> = { ...journeysRef.current }
    for (const a of agents) {
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
        const updated = startWalkBackToDesk(j, now)
        if (updated !== j) next[a.id] = updated
      } else if (target) {
        const roomKind: RoomKind | null =
            newActivity === 'in_gym'         ? 'gym'
          : newActivity === 'in_training'    ? 'training'
          : newActivity === 'in_restroom'    ? 'restroom'
          : newActivity === 'chatting'       ? 'chat'
          : newActivity === 'at_water_cooler'? 'water_cooler'
          : null
        if (roomKind) {
          const updated = startWalkToRoom(j, roomKind, target, now)
          if (updated !== j) next[a.id] = updated
        }
      }
    }
    journeysRef.current = next
  }, [agents, activities, fastMode])

  const effectiveActivities = fastMode ? EMPTY_ACTIVITIES : activities

  // ── Camera state — local to this renderer (the shared useCamera hook is
  //    SVG-typed so we use a small HTML-event variant here). ─────────────
  const [camera, setCamera] = useState<CameraState>(INITIAL_CAMERA)
  const cameraRef = useRef(camera)
  useEffect(() => { cameraRef.current = camera }, [camera])

  // ── Pixi application + scene ─────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<import('pixi.js').Application | null>(null)
  const sceneRef = useRef<HDSceneState | null>(null)
  // Bump this whenever the scene gets rebuilt so dependent effects re-run.
  const [sceneNonce, setSceneNonce] = useState(0)

  // Mount Pixi app + scene whenever the layout changes (size, agent count).
  useEffect(() => {
    let mounted = true
    let createdApp: import('pixi.js').Application | null = null
    async function init() {
      // Dynamic import — Pixi pulls in the WebGL renderer modules and is
      // strictly client-side. Keeping it dynamic also avoids any chance of
      // the SSR pass touching browser globals.
      const PIXI = await import('pixi.js')
      const app = new PIXI.Application()
      await app.init({
        width: layout.viewBox.w,
        height: layout.viewBox.h,
        backgroundColor: 0x0f172a,
        antialias: true,
        autoDensity: true,
        resolution: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
      })
      if (!mounted || !containerRef.current) {
        app.destroy(true, { children: true, texture: true })
        return
      }
      // The init-resolves-after-unmount path leaves a canvas element if we
      // already attached one — clear any previous canvases before appending.
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild)
      }
      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'
      containerRef.current.appendChild(app.canvas)
      const scene = buildHDScene(app, layout)
      appRef.current = app
      createdApp = app
      sceneRef.current = scene
      setSceneNonce(n => (n + 1) & 0xffff)
    }
    init()
    return () => {
      mounted = false
      const a = appRef.current ?? createdApp
      if (a) {
        try {
          if (sceneRef.current) destroyHDScene(sceneRef.current)
          a.destroy(true, { children: true, texture: true })
        } catch {
          // Best-effort teardown — Pixi v8 occasionally throws if the WebGL
          // context was already lost. Swallow so React's cleanup isn't broken.
        }
        appRef.current = null
        sceneRef.current = null
      }
    }
  }, [layout])

  // Per-frame agent updates via Pixi's ticker. We intentionally avoid React
  // setState in the hot loop — sprite mutations happen directly on the Pixi
  // containers and the renderer pushes a single GPU pass per frame.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const ticker = scene.app.ticker
    function onTick() {
      const now = performance.now()
      // Tick journeys forward (handles phase auto-advance like break-table-end).
      const cur = journeysRef.current
      const nextJ: Record<string, VisualJourney> = {}
      let anyChange = false
      for (const id of Object.keys(cur)) {
        const before = cur[id]
        const after = tickJourney(before, layout, now)
        nextJ[id] = after
        if (after !== before) anyChange = true
      }
      if (anyChange) journeysRef.current = nextJ
      const sceneNow = sceneRef.current
      if (!sceneNow) return
      updateAgentLayer(sceneNow, agents, journeysRef.current, effectiveActivities, now)
    }
    ticker.add(onTick)
    return () => { ticker.remove(onTick) }
  }, [sceneNonce, agents, layout, effectiveActivities])

  // Lighting + injected-event overlay paint pass (cheap; runs whenever the
  // lighting state or the active-event flags actually change).
  const activeEvents = useMemo(
    () => activeInjectedEvents(injectedEvents, simTimeMin),
    [injectedEvents, simTimeMin],
  )
  const visualFlags = useMemo(() => eventVisualFlags(activeEvents), [activeEvents])
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    paintLighting(scene, layout, lighting, visualFlags)
  }, [sceneNonce, layout, lighting, visualFlags])

  // Camera transform → cameraLayer transform.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    scene.cameraLayer.scale.set(camera.scale)
    scene.cameraLayer.x = camera.panX
    scene.cameraLayer.y = camera.panY
  }, [sceneNonce, camera])

  // Wheel zoom + drag-pan.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let dragging = false
    let lastX = 0
    let lastY = 0
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setCamera(c => {
        const newScale = Math.max(0.5, Math.min(4, c.scale * factor))
        return { ...c, scale: newScale }
      })
    }
    function onDown(e: MouseEvent) {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    function onMove(e: MouseEvent) {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      setCamera(c => ({ ...c, panX: c.panX + dx, panY: c.panY + dy }))
    }
    function onUp() { dragging = false }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Keyboard zoom / pan (matches the SVG renderer's bindings).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if ((e.target as HTMLElement | null)?.isContentEditable) return
      let handled = true
      setCamera(c => {
        switch (e.key) {
          case '+':
          case '=':
            return { ...c, scale: Math.min(4, c.scale * 1.2) }
          case '-':
          case '_':
            return { ...c, scale: Math.max(0.5, c.scale / 1.2) }
          case '0':
            return { ...INITIAL_CAMERA }
          case 'ArrowLeft':  return { ...c, panX: c.panX + 40 }
          case 'ArrowRight': return { ...c, panX: c.panX - 40 }
          case 'ArrowUp':    return { ...c, panY: c.panY + 40 }
          case 'ArrowDown':  return { ...c, panY: c.panY - 40 }
          default:
            handled = false
            return c
        }
      })
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        className={`cockpit-iso-hd ${camera.scale !== 1 || camera.panX !== 0 || camera.panY !== 0 ? 'cockpit-iso-hd--zoomed' : ''}`}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
      />
      {/* Reuse the DOM-level overlays so HD has the same chrome as SVG. */}
      <div className="cockpit-scene-overlay cockpit-scene-overlay--top-right-lower">
        <SceneClock simTimeMin={simTimeMin}/>
      </div>
      {visualFlags.outageActive && (
        <div className="cockpit-outage-banner" role="status">
          <span aria-hidden="true">⚠️</span>
          <span>SYSTEM SLOWDOWN — calls taking longer than usual</span>
        </div>
      )}
      <EventBanner active={activeEvents}/>
    </>
  )
}

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
import { activeAgentIndicesAllocated, activeAgentIndicesFromRoster, peakInOfficeCount } from './isoOffice/shiftModel'
import {
  activeInjectedEvents,
  eventVisualFlags,
} from './isoOffice/injectedEventVisuals'
import { computeDramaticState, estimateQueueDepth } from './isoOffice/dramaticEffects'
import { updateDramaticLayer } from './isoOfficeHD/dramaticEffectsHD'
import type { ScreenPoint } from './isoOffice/geometry'
import { SceneClock } from './isoOffice/SceneClock'
import { ActivityCounter, type ActivityCounts } from './isoOffice/ActivityCounter'
import { StatusLegend } from './isoOffice/StatusLegend'
import { CameraControls } from './isoOffice/CameraControls'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { buildHDScene, destroyHDScene, type HDSceneState } from './isoOfficeHD/scene'
import { updateAgentLayer } from './isoOfficeHD/frame'
import { paintLighting } from './isoOfficeHD/lightingPaint'
import { paintTileGlows } from './isoOfficeHD/tileGlow'
import { updateNpcs } from './isoOfficeHD/npcs'
import { updateSmokeLayer } from './isoOfficeHD/smoke'
import { EventBanner } from './isoOffice/EventBanner'
import { isWalkingPhase } from './isoOffice/journey'

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
  absenteeismPct,
  perInterval,
  simSpeed,
  injectedEvents,
  roster,
}: AgentRendererProps) {
  const fastMode = (simSpeed ?? 1) > 1

  // ── Schedule overlay (same as SVG IsoRenderer) ────────────────────────
  const peakInOffice = useMemo(
    () => peakInOfficeCount(perInterval, shrinkPct),
    [perInterval, shrinkPct],
  )
  const absentSlots = Math.max(0, agents.length - peakInOffice)

  // Round 7.1: three-tier allocation. Mirrors IsoRenderer.
  // Round 11: roster-driven activation when scenario.roster is set.
  const useRoster = roster != null && roster.length > 0
  const allocation = useMemo(
    () => useRoster
      ? activeAgentIndicesFromRoster(roster!, agents.length, simTimeMin, shrinkPct)
      : activeAgentIndicesAllocated(agents.length, perInterval, simTimeMin, shrinkPct),
    [useRoster, roster, agents.length, perInterval, simTimeMin, shrinkPct],
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

  // Capture the seed values for the scene init in a ref so the mount effect
  // doesn't re-fire when they change minute-to-minute. The scene uses them
  // ONCE at build time (NPC seeding, absent-marker positions); dynamic state
  // is updated through the per-frame ticker instead. The ref is updated in
  // an effect so render stays pure (React 19 react-hooks/refs rule).
  const initSeedRef = useRef({
    simTimeMin,
    agentCount: agents.length,
    absentTailStart: agents.length - absentSlots,
    absenteeismPct,
  })
  useEffect(() => {
    initSeedRef.current = {
      simTimeMin,
      agentCount: agents.length,
      absentTailStart: agents.length - absentSlots,
      absenteeismPct,
    }
  }, [simTimeMin, agents.length, absentSlots, absenteeismPct])

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
      const seed = initSeedRef.current
      const scene = buildHDScene(app, layout, {
        agentCount: seed.agentCount,
        absentTailStart: seed.absentTailStart,
        absenteeismPct: seed.absenteeismPct,
        simTimeMin: seed.simTimeMin,
      })
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

  // ── Active injected events + dramatic state (Round 9) ────────────────
  // Computed up here so the ticker effect (next) can read the latest via
  // refs without re-binding when sim minute or events change.
  const activeEvents = useMemo(
    () => activeInjectedEvents(injectedEvents, simTimeMin),
    [injectedEvents, simTimeMin],
  )
  const dramaticState = useMemo(
    () => computeDramaticState(activeEvents, simTimeMin),
    [activeEvents, simTimeMin],
  )

  // Per-frame agent updates via Pixi's ticker. We intentionally avoid React
  // setState in the hot loop — sprite mutations happen directly on the Pixi
  // containers and the renderer pushes a single GPU pass per frame.
  // Round 8: also drives the NPC layer (janitors / exec / delivery), the
  // smoke particle layer, and per-frame tile glow halos under at-desk agents.
  // Sim minute is read through a ref so the effect doesn't re-register every
  // tick when simTimeMin advances.
  const simTimeMinRef = useRef(simTimeMin)
  useEffect(() => { simTimeMinRef.current = simTimeMin }, [simTimeMin])
  const dramaticStateRef = useRef(dramaticState)
  useEffect(() => { dramaticStateRef.current = dramaticState }, [dramaticState])
  const eventsRef = useRef(events)
  useEffect(() => { eventsRef.current = events }, [events])
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
      paintTileGlows(sceneNow.tileGlows, agents, journeysRef.current, layout.deskPositions)
      updateNpcs(sceneNow.npcs, layout, simTimeMinRef.current, now)
      updateSmokeLayer(sceneNow.smoke, now)
      // Round 9: dramatic-effect particle update. Read positions from the
      // already-updated agent sprites so the lightning bolts anchor to the
      // current screen position of each on-call agent.
      const positions: Record<string, { pos: ScreenPoint; visible: boolean }> = {}
      for (const a of agents) {
        const sp = sceneNow.agentSprites.get(a.id)
        if (sp) {
          positions[a.id] = {
            pos: { x: sp.container.x, y: sp.container.y },
            visible: sp.container.visible,
          }
        }
      }
      updateDramaticLayer(
        sceneNow.dramatic,
        layout,
        dramaticStateRef.current,
        agents,
        positions,
        eventsRef.current,
        now,
      )
    }
    ticker.add(onTick)
    return () => { ticker.remove(onTick) }
  }, [sceneNonce, agents, layout, effectiveActivities])

  // Lighting + injected-event overlay paint pass (cheap; runs whenever the
  // lighting state or the active-event flags actually change).
  const visualFlags = useMemo(() => eventVisualFlags(activeEvents), [activeEvents])
  const liveQueueLen = useMemo(() => {
    const idx = Math.max(0, Math.min(47, Math.floor(simTimeMin / 30)))
    const it = perInterval?.[idx]
    return it?.queueLen ?? null
  }, [perInterval, simTimeMin])
  const queueDepth = dramaticState.surgeActive
    ? estimateQueueDepth(dramaticState.surgeIntensity, dramaticState.surgeMagnitude, liveQueueLen)
    : 0
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

  // ── Activity counts for the on-canvas overlay ─────────────────────────
  // The Pixi ticker mutates `journeysRef.current` directly each frame, so we
  // sample those mutations into a state snapshot every 250 ms (the activity
  // scheduler updates on a sim-minute timescale — far slower than 60fps).
  // This keeps the render path pure (no ref reads during render).
  const [activityCounts, setActivityCounts] = useState<ActivityCounts>(() => ({
    atDesks: 0, inTraining: 0, inGym: 0, onBreak: 0,
    smoking: 0, chatting: 0, waterCooler: 0, restroom: 0, walking: 0,
  }))
  const agentsRef = useRef(agents)
  useEffect(() => { agentsRef.current = agents }, [agents])
  useEffect(() => {
    const id = window.setInterval(() => {
      const journeys = journeysRef.current
      const ags = agentsRef.current
      const counts: ActivityCounts = {
        atDesks: 0, inTraining: 0, inGym: 0, onBreak: 0,
        smoking: 0, chatting: 0, waterCooler: 0, restroom: 0, walking: 0,
      }
      for (let i = 0; i < ags.length; i++) {
        const a = ags[i]
        const j = journeys[a.id]
        const k = j?.phase.kind
        if (k === 'gone' || a.state === 'off_shift') continue
        if (k && isWalkingPhase(j!.phase)) { counts.walking++; continue }
        if (k === 'at_break_table' || a.state === 'on_break') { counts.onBreak++; continue }
        if (k === 'outside_for_lunch') { counts.onBreak++; continue }
        if (k === 'inside_restroom' || k === 'entering_restroom' || k === 'exiting_restroom') {
          counts.restroom++; continue
        }
        if (k === 'in_room') {
          const room = j!.phase.kind === 'in_room' ? j!.phase.targetRoom : null
          if (room === 'training') counts.inTraining++
          else if (room === 'gym') counts.inGym++
          else if (room === 'water_cooler') counts.waterCooler++
          else if (room === 'patio') counts.smoking++
          else if (room === 'chat') counts.chatting++
          else counts.atDesks++
          continue
        }
        if (k === 'at_chat_spot') { counts.chatting++; continue }
        counts.atDesks++
      }
      setActivityCounts(counts)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

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
      {/* Reuse the DOM-level overlays so HD has the same chrome as SVG.
          Round 8: ActivityCounter and StatusLegend are now included so
          HD has the same on-canvas readout strip the SVG theme has. */}
      <div className="cockpit-scene-overlay cockpit-scene-overlay--top-right-lower">
        <SceneClock simTimeMin={simTimeMin}/>
        <ActivityCounter counts={activityCounts}/>
        <StatusLegend/>
      </div>

      {/* Camera controls — reset / +/- buttons. Calls into the local camera
          state setter (HD doesn't use the SVG's useCamera hook). */}
      <div className="cockpit-scene-overlay cockpit-scene-overlay--top-right-camera">
        <CameraControls
          scale={camera.scale}
          onReset={() => setCamera({ ...INITIAL_CAMERA })}
          onZoomIn={() => setCamera(c => ({ ...c, scale: Math.min(4, c.scale * 1.2) }))}
          onZoomOut={() => setCamera(c => ({ ...c, scale: Math.max(0.5, c.scale / 1.2) }))}
        />
      </div>

      {/* Round 9: HTML overlays — same as SVG renderer for parity. */}
      {dramaticState.staffDropActive && (
        <div className="cockpit-storm-overlay" aria-hidden="true"/>
      )}
      {dramaticState.outageActive && (
        <div className="cockpit-emergency-lighting" aria-hidden="true"/>
      )}
      {dramaticState.surgeActive && (
        <div className="cockpit-surge-border" aria-hidden="true"/>
      )}
      {dramaticState.surgeActive && (
        <div className="cockpit-queue-counter" role="status">
          📞 CALLS WAITING: {queueDepth}
        </div>
      )}
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

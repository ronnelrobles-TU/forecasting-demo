'use client'

// Janitor NPCs — free-roaming state machines (Round 4). Each janitor picks a
// random hotspot weighted by its "personality" (one prefers aisles, one room
// visits, one perimeter), walks there in real wall-clock time, pauses to mop /
// look around / visit a room, then picks a new destination. Unlike Round 3
// (fixed loop driven by simTimeMin), the position is decoupled from sim
// playback speed: walks always take 1.5–2 real seconds regardless of how
// fast the day is unfolding.
//
// Determinism: the destination roll uses a PRNG seeded by janitor index +
// floor(simTimeMin / 5), so when the user scrubs the timeline back to a given
// moment the janitor's *current target* is reproducible. The janitor's
// actual walk progress is wall-clock based and re-resolves naturally when
// the component remounts on scrub.

import { useEffect, useReducer, useRef } from 'react'
import type { BuildingLayout, JanitorHotspot, ScreenPoint } from './geometry'

// ---------- Public API ----------

interface JanitorProps {
  layout: BuildingLayout
  simTimeMin: number
}

// ---------- Personalities ----------

interface Personality {
  // Weights per hotspot type. Sum to 1 (renormalised internally).
  aisle: number
  corner: number
  near_room: number
  // Probability of actually entering the room when picking a near_room hotspot.
  enterRoomChance: number
}

const PERSONALITIES: Personality[] = [
  { aisle: 0.60, corner: 0.20, near_room: 0.20, enterRoomChance: 0.10 },
  { aisle: 0.30, corner: 0.20, near_room: 0.50, enterRoomChance: 0.40 },
  { aisle: 0.30, corner: 0.60, near_room: 0.10, enterRoomChance: 0.05 },
]

// ---------- PRNG ----------

// mulberry32 — small, fast, deterministic 32-bit PRNG.
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return function() {
    t = (t + 0x6D2B79F5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Destination picking ----------

interface PickedDestination {
  hotspot: JanitorHotspot
  enterRoom: boolean
}

export function pickDestination(
  janitorIdx: number,
  simTimeMin: number,
  hotspots: ReadonlyArray<JanitorHotspot>,
  legCounter: number,
): PickedDestination {
  if (hotspots.length === 0) {
    return { hotspot: { pos: { x: 0, y: 0 }, type: 'aisle' }, enterRoom: false }
  }
  const seed = janitorIdx * 100000 + Math.floor(simTimeMin / 5) * 1000 + legCounter
  const rng = mulberry32(seed)
  const p = PERSONALITIES[janitorIdx % PERSONALITIES.length]

  // Weighted pick by type.
  const pickType = (): 'aisle' | 'corner' | 'near_room' => {
    const r = rng()
    if (r < p.aisle) return 'aisle'
    if (r < p.aisle + p.corner) return 'corner'
    return 'near_room'
  }
  const wantedType = pickType()
  const candidates = hotspots.filter(h => h.type === wantedType)
  const pool = candidates.length > 0 ? candidates : hotspots
  const idx = Math.floor(rng() * pool.length)
  const hotspot = pool[idx]
  const enterRoom = hotspot.type === 'near_room' && rng() < p.enterRoomChance && !!hotspot.roomCenter
  return { hotspot, enterRoom }
}

// ---------- State machine ----------

type JanitorActivity = 'mopping' | 'looking_around' | 'in_room'

export type JanitorState =
  | {
      kind: 'walking_to'
      from: ScreenPoint
      to: ScreenPoint
      target: 'mop_spot' | 'room_visit'
      targetRoomId?: string
      startedAt: number
      durationMs: number
      legCounter: number
    }
  | {
      kind: 'pausing'
      at: ScreenPoint
      activity: JanitorActivity
      startedAt: number
      durationMs: number
      legCounter: number
    }

const WALK_MS_MIN = 1500
const WALK_MS_MAX = 2000
const PAUSE_MOP_MS = 2500       // ~2.5s
const PAUSE_LOOK_MS = 1200
const PAUSE_INROOM_MS = 4500

function pickWalkMs(rng: () => number): number {
  return WALK_MS_MIN + rng() * (WALK_MS_MAX - WALK_MS_MIN)
}

function pickActivity(rng: () => number): JanitorActivity {
  // 60% mop, 40% look around. (in_room handled separately when entering a room.)
  return rng() < 0.6 ? 'mopping' : 'looking_around'
}

function lerp(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function janitorPos(state: JanitorState, nowMs: number): ScreenPoint {
  if (state.kind === 'pausing') return state.at
  const elapsed = Math.max(0, nowMs - state.startedAt)
  const t = state.durationMs > 0 ? Math.min(1, elapsed / state.durationMs) : 1
  return lerp(state.from, state.to, t)
}

function initialState(janitorIdx: number, simTimeMin: number, hotspots: ReadonlyArray<JanitorHotspot>, nowMs: number): JanitorState {
  // Spawn at a random hotspot, then immediately pick a first destination.
  const seed = janitorIdx * 999991 + Math.floor(simTimeMin)
  const rng = mulberry32(seed)
  const startIdx = Math.floor(rng() * Math.max(1, hotspots.length))
  const start = hotspots[startIdx]?.pos ?? { x: 0, y: 0 }
  const dest = pickDestination(janitorIdx, simTimeMin, hotspots, 0)
  const target = dest.enterRoom && dest.hotspot.roomCenter ? dest.hotspot.roomCenter : dest.hotspot.pos
  return {
    kind: 'walking_to',
    from: start,
    to: target,
    target: dest.enterRoom ? 'room_visit' : 'mop_spot',
    targetRoomId: dest.enterRoom ? dest.hotspot.roomId : undefined,
    startedAt: nowMs,
    durationMs: pickWalkMs(rng),
    legCounter: 0,
  }
}

function advance(
  state: JanitorState,
  janitorIdx: number,
  simTimeMin: number,
  hotspots: ReadonlyArray<JanitorHotspot>,
  nowMs: number,
): JanitorState {
  const elapsed = nowMs - state.startedAt
  if (state.kind === 'walking_to') {
    if (elapsed < state.durationMs) return state
    // Arrived. Decide pause behaviour.
    const rng = mulberry32(janitorIdx * 7919 + state.legCounter * 31 + Math.floor(nowMs))
    if (state.target === 'room_visit') {
      return {
        kind: 'pausing',
        at: state.to,
        activity: 'in_room',
        startedAt: nowMs,
        durationMs: PAUSE_INROOM_MS,
        legCounter: state.legCounter,
      }
    }
    const activity = pickActivity(rng)
    return {
      kind: 'pausing',
      at: state.to,
      activity,
      startedAt: nowMs,
      durationMs: activity === 'mopping' ? PAUSE_MOP_MS : PAUSE_LOOK_MS,
      legCounter: state.legCounter,
    }
  }
  // pausing
  if (elapsed < state.durationMs) return state
  // Pick a new destination.
  const nextLeg = state.legCounter + 1
  const dest = pickDestination(janitorIdx, simTimeMin, hotspots, nextLeg)
  const rng = mulberry32(janitorIdx * 4421 + nextLeg * 17)
  const target = dest.enterRoom && dest.hotspot.roomCenter ? dest.hotspot.roomCenter : dest.hotspot.pos
  return {
    kind: 'walking_to',
    from: state.at,
    to: target,
    target: dest.enterRoom ? 'room_visit' : 'mop_spot',
    targetRoomId: dest.enterRoom ? dest.hotspot.roomId : undefined,
    startedAt: nowMs,
    durationMs: pickWalkMs(rng),
    legCounter: nextLeg,
  }
}

// ---------- Sprite ----------

interface JanitorSpriteProps {
  pos: ScreenPoint
  mode: 'walking' | 'mopping' | 'looking_around' | 'in_room'
}

function JanitorSprite({ pos, mode }: JanitorSpriteProps) {
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <ellipse cx={0} cy={6} rx={4.5} ry={1.4} fill="#1e293b" opacity={0.35}/>
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill="#0d9488" stroke="#0f172a" strokeWidth={0.4}/>
      <rect x={-3.3} y={-1} width={6.6} height={1.2} fill="#f97316"/>
      <ellipse cx={0} cy={-5} rx={2.5} ry={2.3} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      <path d="M-2.6,-7 Q0,-9 2.6,-7 L2.4,-5.5 L-2.4,-5.5 Z" fill="#0d9488" stroke="#0f172a" strokeWidth={0.3}/>
      <circle cx={2.6} cy={-5.3} r={0.8} fill="#1e293b"/>
      {/* Mop. When mopping, CSS sway. Walking — slung over shoulder. */}
      {mode === 'walking' ? (
        <g>
          <line x1={3.5} y1={-2} x2={9} y2={-9} stroke="#92400e" strokeWidth={0.7}/>
          <ellipse cx={9} cy={-9.5} rx={2.2} ry={1.2} fill="#fbbf24" stroke="#92400e" strokeWidth={0.3}/>
          <line x1={7.5} y1={-9} x2={10.5} y2={-10.5} stroke="#92400e" strokeWidth={0.2}/>
        </g>
      ) : (
        <g className={mode === 'mopping' ? 'cockpit-janitor-mop' : ''}>
          <line x1={4} y1={-2} x2={5} y2={6} stroke="#92400e" strokeWidth={0.7}/>
          <ellipse cx={5} cy={6.5} rx={2.5} ry={1.1} fill="#fbbf24" stroke="#92400e" strokeWidth={0.3}/>
          {mode === 'mopping' && (
            <ellipse cx={5} cy={7} rx={3.5} ry={0.7} fill="#94a3b8" opacity={0.45}/>
          )}
        </g>
      )}
    </g>
  )
}

// ---------- Component ----------

const JANITOR_COUNT = 3

export function Janitor({ layout, simTimeMin }: JanitorProps) {
  // Read hotspots fresh each render but key all effects by layout identity
  // (which is stable thanks to IsoRenderer's useMemo on agent count). Reading
  // `hotspots` as a derived value means it can change reference every render
  // — using `layout` as the dep keeps the effect from re-firing.
  const hotspots = layout.rooms.agentFloor.janitorHotspots
  const hotspotsRef = useRef(hotspots)
  hotspotsRef.current = hotspots
  const statesRef = useRef<JanitorState[] | null>(null)
  // forceRender is fired ONLY when we need React to re-paint (e.g. a phase
  // changed, or an active janitor is mid-walk and its position has moved).
  // Every-frame setState in the rAF was triggering React 19's "max update
  // depth" guard whenever the parent (IsoRenderer) was also re-rendering on
  // its own rAF — the two updates compounded into a runaway cycle.
  const [, forceRender] = useReducer((n: number) => (n + 1) & 0xffff, 0)
  const simTimeMinRef = useRef(simTimeMin)
  useEffect(() => { simTimeMinRef.current = simTimeMin }, [simTimeMin])

  // Initialise once when the layout (and therefore hotspots) becomes
  // available, and re-init when the layout reference changes. Using `layout`
  // as the dep is intentional: `layout.rooms.agentFloor.janitorHotspots` is
  // a fresh array reference each render, but `layout` itself is memoized
  // upstream so the effect fires only when the office actually changes.
  useEffect(() => {
    const hs = hotspotsRef.current
    if (hs.length === 0) return
    const now = performance.now()
    const next: JanitorState[] = []
    for (let i = 0; i < JANITOR_COUNT; i++) {
      next.push(initialState(i, simTimeMinRef.current, hs, now + i * 137))
    }
    statesRef.current = next
    forceRender()
  }, [layout])

  // RAF loop: advance state machines on each frame. Critical: only call the
  // forceRender setter when (a) a state machine actually transitioned to a
  // new phase, or (b) at least one janitor is mid-walk (so their position
  // needs to redraw). This caps the setState rate to "actual visual change"
  // and prevents the runaway-update cycle that React 19 was flagging.
  useEffect(() => {
    if (hotspotsRef.current.length === 0) return
    let raf = 0
    function tick(now: number) {
      const cur = statesRef.current
      if (cur) {
        const hs = hotspotsRef.current
        let phaseChanged = false
        let anyWalking = false
        const next = cur.map((s, i) => {
          const after = advance(s, i, simTimeMinRef.current, hs, now)
          if (after !== s) phaseChanged = true
          if (after.kind === 'walking_to') anyWalking = true
          return after
        })
        if (phaseChanged) statesRef.current = next
        if (phaseChanged || anyWalking) forceRender()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [layout])

  if (!statesRef.current) return null
  const now = performance.now()
  return (
    <g>
      {statesRef.current.map((s, i) => {
        const pos = janitorPos(s, now)
        const mode: JanitorSpriteProps['mode'] = s.kind === 'walking_to'
          ? 'walking'
          : s.activity
        return <JanitorSprite key={`jan-${i}`} pos={pos} mode={mode}/>
      })}
    </g>
  )
}

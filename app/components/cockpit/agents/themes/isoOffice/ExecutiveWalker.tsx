'use client'

// ExecutiveWalker — a background NPC that walks between manager office doors,
// pauses 5–15 sec at each (peeking in / chatting), then moves on. Independent
// of the agent state machine. Wall-clock timing so it stays watchable at any
// playback speed.
//
// Render reads from a useState snapshot updated each RAF frame, so the JSX
// stays a pure function of state (no ref reads in render).

import { useEffect, useRef, useState } from 'react'
import type { BuildingLayout, ScreenPoint } from './geometry'
import { mulberry32 } from './Janitor'

interface ExecutiveWalkerProps {
  layout: BuildingLayout
}

type ExecState =
  | { kind: 'walking'; from: ScreenPoint; to: ScreenPoint; startedAt: number; durationMs: number; targetIdx: number; legCounter: number }
  | { kind: 'pausing'; at: ScreenPoint; startedAt: number; durationMs: number; legCounter: number }

interface RenderFrame {
  pos: ScreenPoint
  walking: boolean
}

const WALK_MS_MIN = 1800
const WALK_MS_MAX = 2400
const PAUSE_MS_MIN = 4000
const PAUSE_MS_MAX = 9000

function lerp(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function pickDoorIdx(rng: () => number, count: number, exclude: number): number {
  if (count <= 1) return 0
  let idx = Math.floor(rng() * count)
  if (idx === exclude) idx = (idx + 1) % count
  return idx
}

function execStatePos(s: ExecState, nowMs: number): ScreenPoint {
  if (s.kind === 'pausing') return s.at
  const elapsed = Math.max(0, nowMs - s.startedAt)
  const t = s.durationMs > 0 ? Math.min(1, elapsed / s.durationMs) : 1
  return lerp(s.from, s.to, t)
}

function ExecSprite({ pos, walking }: RenderFrame) {
  // Dark navy suit + tie. Hair off-grey to read as "older / executive".
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <ellipse cx={0} cy={6} rx={4} ry={1.3} fill="#1e293b" opacity={0.35}/>
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill="#1e3a8a" stroke="#0f172a" strokeWidth={0.4}/>
      <path d="M-1,-3 L0,-1 L1,-3 Z" fill="#f8fafc"/>
      <path d="M-0.5,-2 L0.5,-2 L0.7,3 L0,3.5 L-0.7,3 Z" fill="#b91c1c"/>
      <ellipse cx={0} cy={-5} rx={2.4} ry={2.2} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      <path d="M-2.4,-6 Q0,-7.6 2.4,-6 L2.2,-5.2 L-2.2,-5.2 Z" fill="#475569" stroke="#1e293b" strokeWidth={0.3}/>
      {walking ? (
        <g>
          <rect x={2.5} y={-1} width={4} height={3} fill="#7c2d12" stroke="#1e293b" strokeWidth={0.3} rx={0.3}/>
          <line x1={3.5} y1={-1.5} x2={5.5} y2={-1.5} stroke="#1e293b" strokeWidth={0.4}/>
        </g>
      ) : null}
    </g>
  )
}

export function ExecutiveWalker({ layout }: ExecutiveWalkerProps) {
  const offices = layout.rooms.managerOffices
  const stateRef = useRef<ExecState | null>(null)
  const [frame, setFrame] = useState<RenderFrame | null>(null)

  useEffect(() => {
    // Initialise the state machine once when offices become available. We
    // intentionally do NOT setState here — the RAF tick below will publish
    // the first frame, avoiding a cascading render.
    if (offices.length === 0) {
      stateRef.current = null
      return
    }
    if (stateRef.current !== null) return
    const now = performance.now()
    const rng = mulberry32(7331)
    const startIdx = Math.floor(rng() * offices.length)
    const targetIdx = pickDoorIdx(rng, offices.length, startIdx)
    const start = offices[startIdx].doorPosition
    const end = offices[targetIdx].doorPosition
    stateRef.current = {
      kind: 'walking',
      from: start,
      to: end,
      startedAt: now,
      durationMs: WALK_MS_MIN + rng() * (WALK_MS_MAX - WALK_MS_MIN),
      targetIdx,
      legCounter: 0,
    }
  }, [offices])

  useEffect(() => {
    if (offices.length === 0) return
    let raf = 0
    function tick(now: number) {
      const s = stateRef.current
      if (s) {
        const elapsed = now - s.startedAt
        if (elapsed >= s.durationMs) {
          if (s.kind === 'walking') {
            const rng = mulberry32(7331 + s.legCounter * 131)
            stateRef.current = {
              kind: 'pausing',
              at: s.to,
              startedAt: now,
              durationMs: PAUSE_MS_MIN + rng() * (PAUSE_MS_MAX - PAUSE_MS_MIN),
              legCounter: s.legCounter,
            }
          } else {
            const nextLeg = s.legCounter + 1
            const rng = mulberry32(7331 + nextLeg * 131)
            const newTarget = pickDoorIdx(rng, offices.length, s.legCounter % offices.length)
            stateRef.current = {
              kind: 'walking',
              from: s.at,
              to: offices[newTarget].doorPosition,
              startedAt: now,
              durationMs: WALK_MS_MIN + rng() * (WALK_MS_MAX - WALK_MS_MIN),
              targetIdx: newTarget,
              legCounter: nextLeg,
            }
          }
        }
        const cur = stateRef.current
        if (cur) {
          const pos = execStatePos(cur, now)
          setFrame({ pos, walking: cur.kind === 'walking' })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [offices])

  if (!frame) return null
  return <ExecSprite pos={frame.pos} walking={frame.walking}/>
}

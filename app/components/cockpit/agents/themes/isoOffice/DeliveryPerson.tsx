'use client'

// DeliveryPerson — a background NPC that arrives at the front door every
// ~30 sim min, walks to the break room (drops something off), walks back to
// the door, leaves. Brown delivery uniform.
//
// Cadence is driven by SIM time so deliveries actually pace with the office
// day, but each leg is wall-clock so it remains watchable at any speed. The
// render reads from a useState snapshot (not the ref) so the JSX is a pure
// function of state.

import { useEffect, useRef, useState } from 'react'
import type { BuildingLayout, ScreenPoint } from './geometry'

interface DeliveryPersonProps {
  layout: BuildingLayout
  simTimeMin: number
}

type DelState =
  | { kind: 'idle' }
  | { kind: 'walking_in'; from: ScreenPoint; to: ScreenPoint; startedAt: number; durationMs: number }
  | { kind: 'dropping'; at: ScreenPoint; startedAt: number; durationMs: number }
  | { kind: 'walking_out'; from: ScreenPoint; to: ScreenPoint; startedAt: number; durationMs: number }

interface RenderFrame {
  pos: ScreenPoint
  carrying: boolean
}

const WALK_MS = 2200
const DROP_MS = 1500
const SIM_INTERVAL_MIN = 30
const SIM_FIRST = 540

function lerp(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function delStateFrame(s: DelState, nowMs: number, door: ScreenPoint): RenderFrame | null {
  if (s.kind === 'idle') return null
  const elapsed = Math.max(0, nowMs - s.startedAt)
  if (s.kind === 'walking_in') {
    const t = s.durationMs > 0 ? Math.min(1, elapsed / s.durationMs) : 1
    return { pos: lerp(s.from, s.to, t), carrying: true }
  }
  if (s.kind === 'dropping') {
    return { pos: s.at, carrying: true }
  }
  const t = s.durationMs > 0 ? Math.min(1, elapsed / s.durationMs) : 1
  return { pos: lerp(s.from, s.to, t), carrying: false }
  // door referenced for completeness — kept as a parameter so future variants
  // (e.g. fade-out at the door) can use it without resignature.
  void door
}

function DeliverySprite({ pos, carrying }: RenderFrame) {
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <ellipse cx={0} cy={6} rx={4.2} ry={1.3} fill="#1e293b" opacity={0.35}/>
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill="#7c2d12" stroke="#1c0a02" strokeWidth={0.4}/>
      <rect x={-3.3} y={-1.5} width={6.6} height={1.0} fill="#fcd34d"/>
      <ellipse cx={0} cy={-5} rx={2.4} ry={2.2} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      <path d="M-2.6,-7 Q0,-8.5 2.6,-7 L2.4,-5.6 L-2.4,-5.6 Z" fill="#7c2d12" stroke="#1c0a02" strokeWidth={0.3}/>
      <rect x={-2.6} y={-6.5} width={5.2} height={0.6} fill="#1c0a02"/>
      {carrying ? (
        <rect x={-3} y={0} width={6} height={4} fill="#a16207" stroke="#451a03" strokeWidth={0.3} rx={0.3}/>
      ) : null}
    </g>
  )
}

export function DeliveryPerson({ layout, simTimeMin }: DeliveryPersonProps) {
  const door = layout.rooms.reception.doorPosition
  const dropTarget = layout.rooms.breakRoom.vendingMachinePosition
  const stateRef = useRef<DelState>({ kind: 'idle' })
  const lastDeliverySimRef = useRef<number>(-Infinity)
  const [frame, setFrame] = useState<RenderFrame | null>(null)

  useEffect(() => {
    if (stateRef.current.kind !== 'idle') return
    const sinceFirst = simTimeMin - SIM_FIRST
    if (sinceFirst < 0) return
    const dueWindow = Math.floor(sinceFirst / SIM_INTERVAL_MIN)
    const lastWindow = Math.floor((lastDeliverySimRef.current - SIM_FIRST) / SIM_INTERVAL_MIN)
    if (dueWindow > lastWindow) {
      lastDeliverySimRef.current = simTimeMin
      stateRef.current = {
        kind: 'walking_in',
        from: door,
        to: dropTarget,
        startedAt: performance.now(),
        durationMs: WALK_MS,
      }
      setFrame({ pos: door, carrying: true })
    }
  }, [simTimeMin, door, dropTarget])

  useEffect(() => {
    let raf = 0
    function tick(now: number) {
      const s = stateRef.current
      if (s.kind !== 'idle') {
        const elapsed = now - s.startedAt
        if (elapsed >= s.durationMs) {
          if (s.kind === 'walking_in') {
            stateRef.current = {
              kind: 'dropping',
              at: s.to,
              startedAt: now,
              durationMs: DROP_MS,
            }
          } else if (s.kind === 'dropping') {
            stateRef.current = {
              kind: 'walking_out',
              from: s.at,
              to: door,
              startedAt: now,
              durationMs: WALK_MS,
            }
          } else {
            stateRef.current = { kind: 'idle' }
            setFrame(null)
          }
        }
        const cur = stateRef.current
        if (cur.kind !== 'idle') {
          setFrame(delStateFrame(cur, now, door))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [door])

  if (!frame) return null
  return <DeliverySprite pos={frame.pos} carrying={frame.carrying}/>
}

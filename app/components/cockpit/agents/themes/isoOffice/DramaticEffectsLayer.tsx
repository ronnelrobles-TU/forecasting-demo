'use client'

// Round 9: dramatic injected-event visuals for the SVG IsoRenderer.
//
// Renders inside the SVG viewBox so it pans/zooms with the camera. Spawns
// short-lived particle-style visuals using `requestAnimationFrame` and a
// small ref-managed pool (no React state in the hot loop). Each effect type
// keeps its own array so a single rAF can update all of them in a single
// pass.
//
// What this layer paints:
//
//   • Surge: phone particles flying from the front door to random desks
//     along bezier arcs; floating "📞✕" abandons rising from the agent floor
//     when the kernel records a call_abandon during the surge window.
//
//   • Outage: lightning bolts pulsing above on-call agents whose call has
//     been "stuck" for an unusually long time (proxied via rAF age).
//
//   • Flash absent: short-lived puff bursts at the *just-vacated* desks
//     (3–4 grey/white circles expanding + fading), plus brief red "?" marks.

import { useEffect, useRef } from 'react'
import type { BuildingLayout, ScreenPoint } from './geometry'
import type { DramaticEffectState } from './dramaticEffects'
import type { SimEvent } from '@/lib/types'

// ── Tunables ─────────────────────────────────────────────────────────────
const PHONE_PARTICLE_MAX     = 30
const PHONE_PARTICLE_DUR_MS  = 1500
const PHONE_SPAWN_INTERVAL_MS = 150

const ABANDON_PARTICLE_MAX   = 24
const ABANDON_DUR_MS         = 1700

const LIGHTNING_MAX          = 10
const LIGHTNING_DUR_MS       = 700
const LIGHTNING_SPAWN_INTERVAL_MS = 650

const PUFF_MAX               = 60
const PUFF_DUR_MS            = 900
const QUESTION_MARK_DUR_MS   = 1200

interface PhoneParticle { id: number; spawnAt: number; from: ScreenPoint; to: ScreenPoint; ctrl: ScreenPoint }
interface AbandonParticle { id: number; spawnAt: number; at: ScreenPoint }
interface LightningParticle { id: number; spawnAt: number; at: ScreenPoint }
interface PuffParticle { id: number; spawnAt: number; at: ScreenPoint; offsetX: number; offsetY: number }
interface QuestionMark { id: number; spawnAt: number; at: ScreenPoint }

interface AgentLite { id: string; state: string }

interface Props {
  layout: BuildingLayout
  state: DramaticEffectState
  agents: AgentLite[]
  /** Most recent sim events — used to detect call_abandon during surge. */
  events?: SimEvent[]
  /** Stable map of agent id → screen position (resolved each frame). */
  positions: Record<string, { pos: ScreenPoint; visible: boolean }>
}

let particleId = 0

export function DramaticEffectsLayer({ layout, state, agents, events, positions }: Props) {
  const gRef = useRef<SVGGElement | null>(null)

  // Per-effect particle pools.
  const phonesRef    = useRef<PhoneParticle[]>([])
  const abandonsRef  = useRef<AbandonParticle[]>([])
  const boltsRef     = useRef<LightningParticle[]>([])
  const puffsRef     = useRef<PuffParticle[]>([])
  const questionsRef = useRef<QuestionMark[]>([])

  // Track which event ids we've already spawned puffs for (so an event only
  // bursts once even though `flashAbsentRecent` is true for several minutes).
  const puffsSpawnedFor = useRef<Set<string>>(new Set())

  // Track the index of the last sim event we've consumed for abandon spawning.
  // We use a non-state ref to avoid re-render thrash in the hot path.
  const lastEventIdxRef = useRef<number>(0)
  // When events array is replaced (new sim run), reset.
  const eventsRefIdentity = useRef<SimEvent[] | undefined>(events)

  // Capture frequently-changing inputs in refs so the rAF loop can read the
  // latest without re-binding. Updates are done in effects so render stays
  // pure (project lint rule).
  const stateRef     = useRef(state)
  const agentsRef    = useRef(agents)
  const positionsRef = useRef(positions)
  const layoutRef    = useRef(layout)
  const eventsRef    = useRef(events)
  useEffect(() => { stateRef.current     = state },     [state])
  useEffect(() => { agentsRef.current    = agents },    [agents])
  useEffect(() => { positionsRef.current = positions }, [positions])
  useEffect(() => { layoutRef.current    = layout },    [layout])
  useEffect(() => {
    if (events !== eventsRefIdentity.current) {
      lastEventIdxRef.current = 0
      eventsRefIdentity.current = events
    }
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    let raf = 0
    let lastPhoneSpawn = 0
    let lastBoltSpawn = 0

    function tick(now: number) {
      const s = stateRef.current
      const lay = layoutRef.current
      const door = lay.rooms.reception.doorPosition
      const desks = lay.deskPositions

      // ── Surge: phone particles from door → random desk ─────────────────
      if (s.surgeActive && desks.length > 0) {
        if (now - lastPhoneSpawn > PHONE_SPAWN_INTERVAL_MS / Math.max(0.5, s.surgeIntensity)) {
          if (phonesRef.current.length < PHONE_PARTICLE_MAX) {
            const target = desks[Math.floor(Math.random() * desks.length)]
            const ctrlX = (door.x + target.x) / 2 + (Math.random() - 0.5) * 60
            const ctrlY = Math.min(door.y, target.y) - 60 - Math.random() * 30
            phonesRef.current.push({
              id: ++particleId,
              spawnAt: now,
              from: { x: door.x, y: door.y - 4 },
              to:   { x: target.x, y: target.y - 8 },
              ctrl: { x: ctrlX, y: ctrlY },
            })
          }
          lastPhoneSpawn = now
        }

        // Consume new abandon events for floating "📞✕" risers on the floor.
        const evList = eventsRef.current ?? []
        for (let i = lastEventIdxRef.current; i < evList.length; i++) {
          const ev = evList[i]
          if (ev.type === 'call_abandon' && abandonsRef.current.length < ABANDON_PARTICLE_MAX) {
            // Anchor at a random spot inside the agent floor zone polygon's
            // bbox (good-enough — the visual is just a vertical riser).
            const zp = lay.rooms.agentFloor.zonePoints
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
            for (const p of zp) {
              if (p.x < minX) minX = p.x
              if (p.x > maxX) maxX = p.x
              if (p.y < minY) minY = p.y
              if (p.y > maxY) maxY = p.y
            }
            abandonsRef.current.push({
              id: ++particleId,
              spawnAt: now,
              at: {
                x: minX + Math.random() * (maxX - minX),
                y: minY + Math.random() * (maxY - minY),
              },
            })
          }
        }
        lastEventIdxRef.current = evList.length
      } else {
        // Drain the pointer when surge isn't active so when it next fires we
        // start consuming from the current event tail.
        const evList = eventsRef.current ?? []
        lastEventIdxRef.current = evList.length
      }

      // ── Outage: lightning bolts above on-call agents ───────────────────
      if (s.outageActive && agentsRef.current.length > 0) {
        if (now - lastBoltSpawn > LIGHTNING_SPAWN_INTERVAL_MS) {
          if (boltsRef.current.length < LIGHTNING_MAX) {
            // Pick a random on-call agent; if none, drop.
            const onCalls: string[] = []
            for (const a of agentsRef.current) {
              if (a.state === 'on_call') onCalls.push(a.id)
            }
            if (onCalls.length > 0) {
              const id = onCalls[Math.floor(Math.random() * onCalls.length)]
              const p = positionsRef.current[id]
              if (p && p.visible) {
                boltsRef.current.push({
                  id: ++particleId,
                  spawnAt: now,
                  at: { x: p.pos.x, y: p.pos.y - 26 },
                })
              }
            }
          }
          lastBoltSpawn = now
        }
      }

      // ── Flash absent: spawn puff bursts once per event ─────────────────
      if (s.flashAbsentRecent && s.flashAbsentEvents.length > 0) {
        for (const fe of s.flashAbsentEvents) {
          if (puffsSpawnedFor.current.has(fe.id)) continue
          puffsSpawnedFor.current.add(fe.id)
          // Pick `count` random desks (capped) and burst a puff at each.
          const count = Math.min(Math.round(fe.count), 30)
          for (let n = 0; n < count; n++) {
            const target = desks[Math.floor(Math.random() * Math.max(1, desks.length))]
            if (!target) continue
            // 4 puffs per desk (radial).
            for (let k = 0; k < 4; k++) {
              if (puffsRef.current.length >= PUFF_MAX) break
              const angle = (Math.PI * 2 * k) / 4 + Math.random() * 0.4
              puffsRef.current.push({
                id: ++particleId,
                spawnAt: now + k * 60,
                at: target,
                offsetX: Math.cos(angle) * (4 + Math.random() * 6),
                offsetY: Math.sin(angle) * (4 + Math.random() * 6) - 4,
              })
            }
            // One question mark per affected desk.
            questionsRef.current.push({
              id: ++particleId,
              spawnAt: now + 200,
              at: { x: target.x, y: target.y - 18 },
            })
          }
        }
      } else if (!s.flashAbsentRecent) {
        puffsSpawnedFor.current.clear()
      }

      // ── Drain expired ──────────────────────────────────────────────────
      phonesRef.current    = phonesRef.current.filter(p => now - p.spawnAt < PHONE_PARTICLE_DUR_MS)
      abandonsRef.current  = abandonsRef.current.filter(p => now - p.spawnAt < ABANDON_DUR_MS)
      boltsRef.current     = boltsRef.current.filter(p => now - p.spawnAt < LIGHTNING_DUR_MS)
      puffsRef.current     = puffsRef.current.filter(p => now - p.spawnAt < PUFF_DUR_MS)
      questionsRef.current = questionsRef.current.filter(p => now - p.spawnAt < QUESTION_MARK_DUR_MS)

      // Direct DOM paint into the <g> — no React reconciler.
      paintParticles(now)
      raf = requestAnimationFrame(tick)
    }

    function paintParticles(now: number) {
      const g = gRef.current
      if (!g) return
      const NS = 'http://www.w3.org/2000/svg'
      // Wholesale wipe — particle counts are bounded (≤120 nodes) so it's cheap.
      while (g.firstChild) g.removeChild(g.firstChild)

      // Phones
      for (const p of phonesRef.current) {
        const t = Math.min(1, (now - p.spawnAt) / PHONE_PARTICLE_DUR_MS)
        const x = bezier(p.from.x, p.ctrl.x, p.to.x, t)
        const y = bezier(p.from.y, p.ctrl.y, p.to.y, t)
        const text = document.createElementNS(NS, 'text')
        text.setAttribute('x', String(x))
        text.setAttribute('y', String(y))
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('font-size', '14')
        text.setAttribute('opacity', String(t < 0.85 ? 0.95 : 0.95 * (1 - (t - 0.85) / 0.15)))
        text.textContent = '📞'
        g.appendChild(text)
      }

      // Abandons (rising + fading)
      for (const a of abandonsRef.current) {
        const t = Math.min(1, (now - a.spawnAt) / ABANDON_DUR_MS)
        const text = document.createElementNS(NS, 'text')
        text.setAttribute('x', String(a.at.x))
        text.setAttribute('y', String(a.at.y - t * 40))
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('font-size', '11')
        text.setAttribute('font-weight', '800')
        text.setAttribute('fill', '#dc2626')
        text.setAttribute('opacity', String(1 - t))
        text.textContent = '📞✕'
        g.appendChild(text)
      }

      // Lightning bolts (scale up + fade)
      for (const b of boltsRef.current) {
        const t = Math.min(1, (now - b.spawnAt) / LIGHTNING_DUR_MS)
        const opacity = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7
        const text = document.createElementNS(NS, 'text')
        text.setAttribute('x', String(b.at.x))
        text.setAttribute('y', String(b.at.y))
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('font-size', String(14 + t * 10))
        text.setAttribute('opacity', String(Math.max(0, opacity)))
        text.textContent = '⚡'
        g.appendChild(text)
      }

      // Puffs
      for (const p of puffsRef.current) {
        const t = Math.min(1, Math.max(0, (now - p.spawnAt) / PUFF_DUR_MS))
        if (t <= 0) continue
        const r = 3 + t * 12
        const opacity = (1 - t) * 0.7
        const c = document.createElementNS(NS, 'circle')
        c.setAttribute('cx', String(p.at.x + p.offsetX))
        c.setAttribute('cy', String(p.at.y + p.offsetY))
        c.setAttribute('r', String(r))
        c.setAttribute('fill', '#e2e8f0')
        c.setAttribute('opacity', String(opacity))
        g.appendChild(c)
      }

      // Question marks
      for (const q of questionsRef.current) {
        const t = Math.min(1, Math.max(0, (now - q.spawnAt) / QUESTION_MARK_DUR_MS))
        if (t <= 0) continue
        const opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3)
        const text = document.createElementNS(NS, 'text')
        text.setAttribute('x', String(q.at.x))
        text.setAttribute('y', String(q.at.y - t * 12))
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('font-size', '14')
        text.setAttribute('font-weight', '900')
        text.setAttribute('fill', '#dc2626')
        text.setAttribute('opacity', String(opacity))
        text.textContent = '?'
        g.appendChild(text)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <g ref={gRef} className="cockpit-dramatic-effects" pointerEvents="none"/>
}

function bezier(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * p1 + t * t * p2
}

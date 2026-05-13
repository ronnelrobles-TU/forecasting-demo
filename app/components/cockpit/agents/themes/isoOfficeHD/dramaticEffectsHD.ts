// Round 9: dramatic injected-event visuals for the HD (Pixi) renderer.
//
// Mirrors `isoOffice/DramaticEffectsLayer.tsx` but uses Pixi v8 Containers
// and Graphics / Text instead of SVG nodes. Same pool sizes, same behaviours,
// so SVG and HD users see the same drama.
//
// Effects:
//   • Surge: phone particles arc from front door to random desks;
//     red "📞✕" abandons rise + fade from the agent floor whenever the kernel
//     emits a `call_abandon` while the surge is active.
//   • Outage: ⚡ lightning bolts pulse above on-call agents.
//   • Flash absent: grey/white puff bursts at affected desks + brief red "?"
//     marks above the empty desks.

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { BuildingLayout, ScreenPoint } from '../isoOffice/geometry'
import type { DramaticEffectState } from '../isoOffice/dramaticEffects'
import type { SimEvent } from '@/lib/types'

const PHONE_MAX = 30
const PHONE_DUR_MS = 1500
const PHONE_SPAWN_INTERVAL_MS = 150

const ABANDON_MAX = 24
const ABANDON_DUR_MS = 1700

const LIGHTNING_MAX = 10
const LIGHTNING_DUR_MS = 700
const LIGHTNING_SPAWN_INTERVAL_MS = 650

const PUFF_MAX = 60
// Round 15: bumped puff lifetime from 900ms → 2500ms and `?` markers from
// 1.2s → 4s so flash_absent feedback persists long enough to be noticed.
const PUFF_DUR_MS = 2500
const QUESTION_DUR_MS = 4000

interface PhoneP { gfx: Text; spawnAt: number; from: ScreenPoint; to: ScreenPoint; ctrl: ScreenPoint }
interface AbandonP { gfx: Text; spawnAt: number; at: ScreenPoint }
interface LightningP { gfx: Text; spawnAt: number; at: ScreenPoint }
interface PuffP { gfx: Graphics; spawnAt: number; at: ScreenPoint; offsetX: number; offsetY: number }
interface QuestionP { gfx: Text; spawnAt: number; at: ScreenPoint }

export interface DramaticLayerHD {
  container: Container
  phones: PhoneP[]
  abandons: AbandonP[]
  bolts: LightningP[]
  puffs: PuffP[]
  questions: QuestionP[]
  // Internal scheduler state
  lastPhoneSpawn: number
  lastBoltSpawn: number
  lastEventIdx: number
  /** Track the prev events identity so a swap resets the consume index. */
  lastEventsRef: SimEvent[] | null
  /** Track which flash_absent ids we've already burst puffs for. */
  spawnedPuffsFor: Set<string>
}

export function buildDramaticLayer(): DramaticLayerHD {
  const container = new Container()
  container.sortableChildren = false
  return {
    container,
    phones: [],
    abandons: [],
    bolts: [],
    puffs: [],
    questions: [],
    lastPhoneSpawn: 0,
    lastBoltSpawn: 0,
    lastEventIdx: 0,
    lastEventsRef: null,
    spawnedPuffsFor: new Set(),
  }
}

export function destroyDramaticLayer(layer: DramaticLayerHD): void {
  layer.container.destroy({ children: true })
  layer.phones.length = 0
  layer.abandons.length = 0
  layer.bolts.length = 0
  layer.puffs.length = 0
  layer.questions.length = 0
}

interface AgentLite { id: string; state: string }
interface PosLite { pos: ScreenPoint; visible: boolean }

const phoneStyle = new TextStyle({ fontSize: 14 })
const abandonStyle = new TextStyle({ fontSize: 11, fontWeight: '800', fill: 0xdc2626 })
const lightningStyle = new TextStyle({ fontSize: 18 })
const questionStyle = new TextStyle({ fontSize: 22, fontWeight: '900', fill: 0xdc2626, stroke: { color: 0xffffff, width: 1 } })

// Round 13: super-sample dramatic-effect text for HD crispness. Same logic
// as the agent bubble TEXT_RESOLUTION in agents.ts, bake the glyph texture
// at >= 4× device-pixel density so the floating phones / lightning bolts /
// abandon markers stay sharp at the user's typical zoom level.
const FX_TEXT_RESOLUTION = typeof window !== 'undefined'
  ? Math.min(8, Math.max(4, (window.devicePixelRatio || 1) * 2))
  : 4

function bezier(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t
  return u * u * p0 + 2 * u * t * p1 + t * t * p2
}

export function updateDramaticLayer(
  layer: DramaticLayerHD,
  layout: BuildingLayout,
  state: DramaticEffectState,
  agents: ReadonlyArray<AgentLite>,
  positions: Record<string, PosLite>,
  events: SimEvent[] | undefined,
  nowMs: number,
): void {
  // ── Reset event-consume cursor on a fresh event array identity ─────────
  if (events !== layer.lastEventsRef) {
    layer.lastEventIdx = 0
    layer.lastEventsRef = events ?? null
  }

  const door = layout.rooms.reception.doorPosition
  const desks = layout.deskPositions

  // ── Surge: spawn phone particles ───────────────────────────────────────
  if (state.surgeActive && desks.length > 0) {
    if (
      nowMs - layer.lastPhoneSpawn
        > PHONE_SPAWN_INTERVAL_MS / Math.max(0.5, state.surgeIntensity)
    ) {
      if (layer.phones.length < PHONE_MAX) {
        const target = desks[Math.floor(Math.random() * desks.length)]
        const ctrlX = (door.x + target.x) / 2 + (Math.random() - 0.5) * 60
        const ctrlY = Math.min(door.y, target.y) - 60 - Math.random() * 30
        const t = new Text({ text: '📞', style: phoneStyle, resolution: FX_TEXT_RESOLUTION })
        t.anchor.set(0.5, 0.5)
        t.x = door.x
        t.y = door.y - 4
        layer.container.addChild(t)
        layer.phones.push({
          gfx: t, spawnAt: nowMs,
          from: { x: door.x, y: door.y - 4 },
          to:   { x: target.x, y: target.y - 8 },
          ctrl: { x: ctrlX, y: ctrlY },
        })
      }
      layer.lastPhoneSpawn = nowMs
    }

    // Spawn abandon risers from new call_abandon events.
    const evList = events ?? []
    for (let i = layer.lastEventIdx; i < evList.length; i++) {
      const ev = evList[i]
      if (ev.type === 'call_abandon' && layer.abandons.length < ABANDON_MAX) {
        const zp = layout.rooms.agentFloor.zonePoints
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const p of zp) {
          if (p.x < minX) minX = p.x
          if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y
          if (p.y > maxY) maxY = p.y
        }
        const at: ScreenPoint = {
          x: minX + Math.random() * (maxX - minX),
          y: minY + Math.random() * (maxY - minY),
        }
        const t = new Text({ text: '📞✕', style: abandonStyle, resolution: FX_TEXT_RESOLUTION })
        t.anchor.set(0.5, 0.5)
        t.x = at.x
        t.y = at.y
        layer.container.addChild(t)
        layer.abandons.push({ gfx: t, spawnAt: nowMs, at })
      }
    }
    layer.lastEventIdx = evList.length
  } else {
    // Drain consume pointer so when surge re-fires we start from the new tail.
    const evList = events ?? []
    layer.lastEventIdx = evList.length
  }

  // ── Outage: spawn lightning bolts above on-call agents ─────────────────
  if (state.outageActive && agents.length > 0) {
    if (nowMs - layer.lastBoltSpawn > LIGHTNING_SPAWN_INTERVAL_MS) {
      if (layer.bolts.length < LIGHTNING_MAX) {
        // Sample an on-call agent.
        const onCalls: string[] = []
        for (const a of agents) {
          if (a.state === 'on_call') onCalls.push(a.id)
        }
        if (onCalls.length > 0) {
          const id = onCalls[Math.floor(Math.random() * onCalls.length)]
          const p = positions[id]
          if (p && p.visible) {
            const at: ScreenPoint = { x: p.pos.x, y: p.pos.y - 26 }
            const t = new Text({ text: '⚡', style: lightningStyle, resolution: FX_TEXT_RESOLUTION })
            t.anchor.set(0.5, 0.5)
            t.x = at.x
            t.y = at.y
            layer.container.addChild(t)
            layer.bolts.push({ gfx: t, spawnAt: nowMs, at })
          }
        }
      }
      layer.lastBoltSpawn = nowMs
    }
  }

  // ── Flash absent: spawn puff bursts once per event ─────────────────────
  if (state.flashAbsentRecent && state.flashAbsentEvents.length > 0) {
    for (const fe of state.flashAbsentEvents) {
      if (layer.spawnedPuffsFor.has(fe.id)) continue
      layer.spawnedPuffsFor.add(fe.id)
      const count = Math.min(Math.round(fe.count), 30)
      for (let n = 0; n < count; n++) {
        const target = desks[Math.floor(Math.random() * Math.max(1, desks.length))]
        if (!target) continue
        for (let k = 0; k < 4; k++) {
          if (layer.puffs.length >= PUFF_MAX) break
          const angle = (Math.PI * 2 * k) / 4 + Math.random() * 0.4
          const offsetX = Math.cos(angle) * (4 + Math.random() * 6)
          const offsetY = Math.sin(angle) * (4 + Math.random() * 6) - 4
          const g = new Graphics()
          g.circle(0, 0, 1).fill({ color: 0xe2e8f0 })
          g.x = target.x + offsetX
          g.y = target.y + offsetY
          g.alpha = 0.7
          layer.container.addChild(g)
          layer.puffs.push({
            gfx: g, spawnAt: nowMs + k * 60,
            at: target, offsetX, offsetY,
          })
        }
        const qt = new Text({ text: '?', style: questionStyle, resolution: FX_TEXT_RESOLUTION })
        qt.anchor.set(0.5, 0.5)
        qt.x = target.x
        qt.y = target.y - 18
        layer.container.addChild(qt)
        layer.questions.push({ gfx: qt, spawnAt: nowMs + 200, at: { x: target.x, y: target.y - 18 } })
      }
    }
  } else if (!state.flashAbsentRecent) {
    layer.spawnedPuffsFor.clear()
  }

  // ── Tick all particles ─────────────────────────────────────────────────
  for (let i = layer.phones.length - 1; i >= 0; i--) {
    const p = layer.phones[i]
    const t = (nowMs - p.spawnAt) / PHONE_DUR_MS
    if (t >= 1) {
      p.gfx.destroy()
      layer.phones.splice(i, 1)
      continue
    }
    p.gfx.x = bezier(p.from.x, p.ctrl.x, p.to.x, t)
    p.gfx.y = bezier(p.from.y, p.ctrl.y, p.to.y, t)
    p.gfx.alpha = t < 0.85 ? 0.95 : 0.95 * (1 - (t - 0.85) / 0.15)
  }
  for (let i = layer.abandons.length - 1; i >= 0; i--) {
    const a = layer.abandons[i]
    const t = (nowMs - a.spawnAt) / ABANDON_DUR_MS
    if (t >= 1) {
      a.gfx.destroy()
      layer.abandons.splice(i, 1)
      continue
    }
    a.gfx.x = a.at.x
    a.gfx.y = a.at.y - t * 40
    a.gfx.alpha = 1 - t
  }
  for (let i = layer.bolts.length - 1; i >= 0; i--) {
    const b = layer.bolts[i]
    const t = (nowMs - b.spawnAt) / LIGHTNING_DUR_MS
    if (t >= 1) {
      b.gfx.destroy()
      layer.bolts.splice(i, 1)
      continue
    }
    b.gfx.x = b.at.x
    b.gfx.y = b.at.y
    const opacity = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7
    b.gfx.alpha = Math.max(0, opacity)
    b.gfx.scale.set(1 + t * 0.6)
  }
  for (let i = layer.puffs.length - 1; i >= 0; i--) {
    const p = layer.puffs[i]
    const t = Math.max(0, (nowMs - p.spawnAt) / PUFF_DUR_MS)
    if (t >= 1) {
      p.gfx.destroy()
      layer.puffs.splice(i, 1)
      continue
    }
    if (t <= 0) continue
    // Round 15: bigger expansion + slower fade so the longer-lived puff
    // stays readable across the whole 2.5s window.
    const r = 4 + t * 22
    p.gfx.x = p.at.x + p.offsetX
    p.gfx.y = p.at.y + p.offsetY
    p.gfx.scale.set(r)
    p.gfx.alpha = t < 0.25 ? 0.85 : Math.max(0, 0.85 * (1 - (t - 0.25) / 0.75))
  }
  for (let i = layer.questions.length - 1; i >= 0; i--) {
    const q = layer.questions[i]
    const t = Math.max(0, (nowMs - q.spawnAt) / QUESTION_DUR_MS)
    if (t >= 1) {
      q.gfx.destroy()
      layer.questions.splice(i, 1)
      continue
    }
    if (t <= 0) continue
    q.gfx.x = q.at.x
    q.gfx.y = q.at.y - t * 24
    // Round 15: hold full opacity for first 75% of the 4s life, then fade.
    q.gfx.alpha = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25)
    q.gfx.scale.set(1 + t * 0.4)
  }
}

// HD (Pixi) NPC layer — janitors, executive walker, delivery person.
//
// Mirrors the SVG components but as Pixi `Container`s built once and mutated
// per frame. State machines come from `isoOffice/npcs.ts` so the SVG and HD
// themes share behaviour (same destinations, same wall-clock pacing).

import { Container, Graphics } from 'pixi.js'
import type { BuildingLayout, ScreenPoint } from '../isoOffice/geometry'
import {
  type JanitorState,
  type ExecState,
  type DeliveryState,
  JANITOR_COUNT,
  initialJanitorState,
  advanceJanitorState,
  janitorPosition,
  initialExecState,
  advanceExecState,
  execPosition,
  advanceDeliveryState,
  deliveryFrame,
  maybeStartDelivery,
} from '../isoOffice/npcs'

// ---------- janitor sprite ----------

interface JanitorSprite {
  container: Container
  body: Graphics
  /** Mop slung-over-shoulder (walking) */
  walkingMop: Graphics
  /** Mop pushed against floor (mopping / looking) */
  groundMop: Graphics
  /** Faint mop streak under the mop head when actively mopping */
  mopStreak: Graphics
  /** Cached last mode so we skip visibility flips when nothing changed */
  lastMode: 'walking' | 'mopping' | 'looking_around' | 'in_room' | null
}

function buildJanitorSprite(): JanitorSprite {
  const container = new Container()
  const body = new Graphics()
  // Shadow
  body.ellipse(0, 6, 4.5, 1.4).fill({ color: 0x1e293b, alpha: 0.35 })
  // Shirt (teal coverall)
  body
    .moveTo(-3.5, -3)
    .quadraticCurveTo(-3.5, 3, -1.5, 4)
    .lineTo(1.5, 4)
    .quadraticCurveTo(3.5, 3, 3.5, -3)
    .closePath()
    .fill({ color: 0x0d9488 }).stroke({ color: 0x0f172a, width: 0.4 })
  // Tool belt
  body.rect(-3.3, -1, 6.6, 1.2).fill({ color: 0xf97316 })
  // Head
  body.ellipse(0, -5, 2.5, 2.3).fill({ color: 0xfde4b8 }).stroke({ color: 0x92400e, width: 0.3 })
  // Cap
  body
    .moveTo(-2.6, -7)
    .quadraticCurveTo(0, -9, 2.6, -7)
    .lineTo(2.4, -5.5)
    .lineTo(-2.4, -5.5)
    .closePath()
    .fill({ color: 0x0d9488 }).stroke({ color: 0x0f172a, width: 0.3 })
  // Ear
  body.circle(2.6, -5.3, 0.8).fill({ color: 0x1e293b })

  const walkingMop = new Graphics()
  // Handle slung over shoulder
  walkingMop.moveTo(3.5, -2).lineTo(9, -9).stroke({ color: 0x92400e, width: 0.7 })
  walkingMop.ellipse(9, -9.5, 2.2, 1.2).fill({ color: 0xfbbf24 }).stroke({ color: 0x92400e, width: 0.3 })
  walkingMop.moveTo(7.5, -9).lineTo(10.5, -10.5).stroke({ color: 0x92400e, width: 0.2 })

  const groundMop = new Graphics()
  groundMop.moveTo(4, -2).lineTo(5, 6).stroke({ color: 0x92400e, width: 0.7 })
  groundMop.ellipse(5, 6.5, 2.5, 1.1).fill({ color: 0xfbbf24 }).stroke({ color: 0x92400e, width: 0.3 })

  const mopStreak = new Graphics()
  mopStreak.ellipse(5, 7, 3.5, 0.7).fill({ color: 0x94a3b8, alpha: 0.45 })

  walkingMop.visible = false
  groundMop.visible = false
  mopStreak.visible = false

  container.addChild(body, walkingMop, groundMop, mopStreak)
  return { container, body, walkingMop, groundMop, mopStreak, lastMode: null }
}

function setJanitorMode(s: JanitorSprite, mode: 'walking' | 'mopping' | 'looking_around' | 'in_room') {
  if (s.lastMode === mode) return
  s.lastMode = mode
  if (mode === 'walking') {
    s.walkingMop.visible = true
    s.groundMop.visible = false
    s.mopStreak.visible = false
  } else {
    s.walkingMop.visible = false
    s.groundMop.visible = true
    s.mopStreak.visible = mode === 'mopping'
  }
}

// ---------- executive sprite ----------

interface ExecSprite {
  container: Container
  body: Graphics
  briefcase: Graphics
  lastWalking: boolean | null
}

function buildExecSprite(): ExecSprite {
  const container = new Container()
  const body = new Graphics()
  body.ellipse(0, 6, 4, 1.3).fill({ color: 0x1e293b, alpha: 0.35 })
  body
    .moveTo(-3.5, -3)
    .quadraticCurveTo(-3.5, 3, -1.5, 4)
    .lineTo(1.5, 4)
    .quadraticCurveTo(3.5, 3, 3.5, -3)
    .closePath()
    .fill({ color: 0x1e3a8a }).stroke({ color: 0x0f172a, width: 0.4 })
  // Shirt collar V
  body.poly([-1, -3, 0, -1, 1, -3]).fill({ color: 0xf8fafc })
  // Tie
  body.poly([-0.5, -2, 0.5, -2, 0.7, 3, 0, 3.5, -0.7, 3]).fill({ color: 0xb91c1c })
  // Head
  body.ellipse(0, -5, 2.4, 2.2).fill({ color: 0xfde4b8 }).stroke({ color: 0x92400e, width: 0.3 })
  // Grey hair
  body
    .moveTo(-2.4, -6)
    .quadraticCurveTo(0, -7.6, 2.4, -6)
    .lineTo(2.2, -5.2)
    .lineTo(-2.2, -5.2)
    .closePath()
    .fill({ color: 0x475569 }).stroke({ color: 0x1e293b, width: 0.3 })

  const briefcase = new Graphics()
  briefcase.rect(2.5, -1, 4, 3).fill({ color: 0x7c2d12 }).stroke({ color: 0x1e293b, width: 0.3 })
  briefcase.moveTo(3.5, -1.5).lineTo(5.5, -1.5).stroke({ color: 0x1e293b, width: 0.4 })
  briefcase.visible = false

  container.addChild(body, briefcase)
  return { container, body, briefcase, lastWalking: null }
}

function setExecMode(s: ExecSprite, walking: boolean) {
  if (s.lastWalking === walking) return
  s.lastWalking = walking
  s.briefcase.visible = walking
}

// ---------- delivery sprite ----------

interface DeliverySprite {
  container: Container
  body: Graphics
  parcel: Graphics
  lastCarrying: boolean | null
}

function buildDeliverySprite(): DeliverySprite {
  const container = new Container()
  const body = new Graphics()
  body.ellipse(0, 6, 4.2, 1.3).fill({ color: 0x1e293b, alpha: 0.35 })
  body
    .moveTo(-3.5, -3)
    .quadraticCurveTo(-3.5, 3, -1.5, 4)
    .lineTo(1.5, 4)
    .quadraticCurveTo(3.5, 3, 3.5, -3)
    .closePath()
    .fill({ color: 0x7c2d12 }).stroke({ color: 0x1c0a02, width: 0.4 })
  // Belt
  body.rect(-3.3, -1.5, 6.6, 1.0).fill({ color: 0xfcd34d })
  // Head
  body.ellipse(0, -5, 2.4, 2.2).fill({ color: 0xfde4b8 }).stroke({ color: 0x92400e, width: 0.3 })
  // Brown cap
  body
    .moveTo(-2.6, -7)
    .quadraticCurveTo(0, -8.5, 2.6, -7)
    .lineTo(2.4, -5.6)
    .lineTo(-2.4, -5.6)
    .closePath()
    .fill({ color: 0x7c2d12 }).stroke({ color: 0x1c0a02, width: 0.3 })
  body.rect(-2.6, -6.5, 5.2, 0.6).fill({ color: 0x1c0a02 })

  const parcel = new Graphics()
  parcel.rect(-3, 0, 6, 4).fill({ color: 0xa16207 }).stroke({ color: 0x451a03, width: 0.3 })
  parcel.visible = false

  container.addChild(body, parcel)
  return { container, body, parcel, lastCarrying: null }
}

function setDeliveryCarrying(s: DeliverySprite, carrying: boolean) {
  if (s.lastCarrying === carrying) return
  s.lastCarrying = carrying
  s.parcel.visible = carrying
}

// ---------- public layer ----------

export interface NpcLayer {
  container: Container
  janitorSprites: JanitorSprite[]
  janitorStates: JanitorState[]
  execSprite: ExecSprite | null
  execState: ExecState | null
  execDoors: ScreenPoint[]
  deliverySprite: DeliverySprite
  deliveryState: DeliveryState
  /** Last sim minute we triggered a delivery. -Infinity = none yet. */
  lastDeliverySimTime: number
  door: ScreenPoint
  dropTarget: ScreenPoint
}

/** Build the NPC layer. The caller adds `container` to the camera layer and
 *  feeds frame updates through `updateNpcs`. */
export function buildNpcLayer(layout: BuildingLayout, simTimeMin: number, nowMs: number): NpcLayer {
  const container = new Container()
  container.sortableChildren = false

  // Janitors.
  const janitorSprites: JanitorSprite[] = []
  const janitorStates: JanitorState[] = []
  const hotspots = layout.rooms.agentFloor.janitorHotspots
  for (let i = 0; i < JANITOR_COUNT; i++) {
    const sprite = buildJanitorSprite()
    container.addChild(sprite.container)
    janitorSprites.push(sprite)
    janitorStates.push(initialJanitorState(i, simTimeMin, hotspots, nowMs + i * 137))
  }

  // Executive walker.
  const execDoors = layout.rooms.managerOffices.map(o => o.doorPosition)
  const execState = initialExecState(execDoors, nowMs)
  let execSprite: ExecSprite | null = null
  if (execState) {
    execSprite = buildExecSprite()
    container.addChild(execSprite.container)
  }

  // Delivery person.
  const deliverySprite = buildDeliverySprite()
  deliverySprite.container.visible = false
  container.addChild(deliverySprite.container)

  return {
    container,
    janitorSprites,
    janitorStates,
    execSprite,
    execState,
    execDoors,
    deliverySprite,
    deliveryState: { kind: 'idle' },
    lastDeliverySimTime: -Infinity,
    door: layout.rooms.reception.doorPosition,
    dropTarget: layout.rooms.breakRoom.vendingMachinePosition,
  }
}

/** Per-frame update: advance state machines, position sprites. Pure mutation. */
export function updateNpcs(
  layer: NpcLayer,
  layout: BuildingLayout,
  simTimeMin: number,
  nowMs: number,
): void {
  // Janitors.
  const hotspots = layout.rooms.agentFloor.janitorHotspots
  for (let i = 0; i < layer.janitorSprites.length; i++) {
    layer.janitorStates[i] = advanceJanitorState(
      layer.janitorStates[i],
      i,
      simTimeMin,
      hotspots,
      nowMs,
    )
    const s = layer.janitorStates[i]
    const pos = janitorPosition(s, nowMs)
    const sprite = layer.janitorSprites[i]
    sprite.container.x = pos.x
    sprite.container.y = pos.y
    const mode = s.kind === 'walking_to' ? 'walking' : s.activity
    setJanitorMode(sprite, mode)
  }

  // Executive walker.
  if (layer.execSprite && layer.execState) {
    layer.execState = advanceExecState(layer.execState, layer.execDoors, nowMs)
    const pos = execPosition(layer.execState, nowMs)
    layer.execSprite.container.x = pos.x
    layer.execSprite.container.y = pos.y
    setExecMode(layer.execSprite, layer.execState.kind === 'walking')
  }

  // Delivery person.
  const started = maybeStartDelivery(
    layer.deliveryState,
    simTimeMin,
    layer.lastDeliverySimTime,
    layer.door,
    layer.dropTarget,
    nowMs,
  )
  if (started) {
    layer.deliveryState = started
    layer.lastDeliverySimTime = simTimeMin
  }
  layer.deliveryState = advanceDeliveryState(layer.deliveryState, layer.door, nowMs)
  const frame = deliveryFrame(layer.deliveryState, nowMs)
  if (frame) {
    layer.deliverySprite.container.visible = true
    layer.deliverySprite.container.x = frame.pos.x
    layer.deliverySprite.container.y = frame.pos.y
    setDeliveryCarrying(layer.deliverySprite, frame.carrying)
  } else {
    layer.deliverySprite.container.visible = false
  }
}

export function destroyNpcLayer(layer: NpcLayer): void {
  layer.container.destroy({ children: true })
}

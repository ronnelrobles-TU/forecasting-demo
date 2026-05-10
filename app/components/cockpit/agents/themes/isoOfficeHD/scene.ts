// Pixi scene assembly for the Office HD theme. Owns the top-level container
// hierarchy and exposes the imperative API the IsoRendererHD component
// drives each frame. Pure functions only — the React component owns the
// `Application` lifecycle and passes the app in.

import { Application, Container, Graphics } from 'pixi.js'
import type { BuildingLayout } from '../isoOffice/geometry'
import { buildScenery, type SceneryLayer } from './scenery'
import type { AgentSpriteHD } from './agents'
import { buildNpcLayer, destroyNpcLayer, type NpcLayer } from './npcs'
import { buildSmokeLayer, destroySmokeLayer, type SmokeLayer } from './smoke'
import { buildTileGlowLayer, type TileGlowLayer } from './tileGlow'

export interface HDSceneState {
  app: Application
  /** Root transform — apply pan/zoom to this container, not the stage. */
  cameraLayer: Container
  /** Static building shell (floor, walls, partitions, desks). */
  scenery: SceneryLayer
  /** Per-frame tile glow + always-absent markers. Drawn UNDER agents. */
  tileGlows: TileGlowLayer
  /** Per-agent sprite parent. */
  agentLayer: Container
  /** NPC layer (janitors, exec, delivery). Drawn above agents so they sit
   *  visually on top when crossing aisles. */
  npcs: NpcLayer
  /** Smoke particle layer for the smoking patio. */
  smoke: SmokeLayer
  /** Effect overlays (lighting tint, event flashes). Drawn above agents. */
  effectLayer: Container
  /** Lighting overlay graphics — wall warmth, surge tint, outage tint. */
  lightingOverlay: Graphics
  /** Sun / moon icon (re-positioned per lighting tick). */
  celestial: Graphics
  /** Per-agent sprite cache, keyed by agent id. */
  agentSprites: Map<string, AgentSpriteHD>
}

export interface BuildSceneOptions {
  /** Total agent count (for absent-tail calculation). */
  agentCount: number
  /** Index where today's absent agents start. */
  absentTailStart: number
  /** 0..100 — fraction of empty desks marked absent. */
  absenteeismPct: number | undefined
  /** Sim minute the scene was created at — used to seed NPC initial states. */
  simTimeMin: number
}

/** Build the scene graph and attach it to the Application stage. */
export function buildHDScene(
  app: Application,
  layout: BuildingLayout,
  opts: BuildSceneOptions,
): HDSceneState {
  const cameraLayer = new Container()
  app.stage.addChild(cameraLayer)

  const scenery = buildScenery(layout)
  const tileGlows = buildTileGlowLayer(
    layout,
    opts.agentCount,
    opts.absentTailStart,
    opts.absenteeismPct,
  )
  const agentLayer = new Container()
  agentLayer.sortableChildren = false
  const now = performance.now()
  const npcs = buildNpcLayer(layout, opts.simTimeMin, now)
  const smoke = buildSmokeLayer(
    // Emitters at the patio standing positions — give roughly 4 wisps for
    // the typical pair clustering.
    layout.rooms.smokingPatio.standingPositions
      .slice(0, 8)
      .map(p => ({ x: p.x, y: p.y - 3 })),
  )
  const effectLayer = new Container()
  effectLayer.sortableChildren = false
  const lightingOverlay = new Graphics()
  const celestial = new Graphics()

  cameraLayer.addChild(
    scenery.container,
    tileGlows.container,
    agentLayer,
    npcs.container,
    smoke.container,
    lightingOverlay,
    effectLayer,
    celestial,
  )

  return {
    app,
    cameraLayer,
    scenery,
    tileGlows,
    agentLayer,
    npcs,
    smoke,
    effectLayer,
    lightingOverlay,
    celestial,
    agentSprites: new Map(),
  }
}

/** Tear down — call before unmounting the renderer. The Application itself is
 *  destroyed by the React component. */
export function destroyHDScene(scene: HDSceneState): void {
  for (const sprite of scene.agentSprites.values()) {
    sprite.container.destroy({ children: true })
  }
  scene.agentSprites.clear()
  destroyNpcLayer(scene.npcs)
  destroySmokeLayer(scene.smoke)
}

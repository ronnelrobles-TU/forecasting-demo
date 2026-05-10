// Pixi scene assembly for the Office HD theme. Owns the top-level container
// hierarchy and exposes the imperative API the IsoRendererHD component
// drives each frame. Pure functions only — the React component owns the
// `Application` lifecycle and passes the app in.

import { Application, Container, Graphics } from 'pixi.js'
import type { BuildingLayout } from '../isoOffice/geometry'
import { buildScenery, type SceneryLayer } from './scenery'
import type { AgentSpriteHD } from './agents'

export interface HDSceneState {
  app: Application
  /** Root transform — apply pan/zoom to this container, not the stage. */
  cameraLayer: Container
  /** Static building shell (floor, walls, partitions, desks). */
  scenery: SceneryLayer
  /** Per-agent sprite parent. */
  agentLayer: Container
  /** Effect overlays (lighting tint, event flashes). Drawn above agents. */
  effectLayer: Container
  /** Lighting overlay graphics — wall warmth, surge tint, outage tint. */
  lightingOverlay: Graphics
  /** Sun / moon icon (re-positioned per lighting tick). */
  celestial: Graphics
  /** Per-agent sprite cache, keyed by agent id. */
  agentSprites: Map<string, AgentSpriteHD>
}

/** Build the scene graph and attach it to the Application stage. */
export function buildHDScene(app: Application, layout: BuildingLayout): HDSceneState {
  const cameraLayer = new Container()
  app.stage.addChild(cameraLayer)

  const scenery = buildScenery(layout)
  const agentLayer = new Container()
  // Round 1 perf: agents are drawn back-to-front but we don't need per-frame
  // depth sort for the call-center scene — agents stay roughly on the same
  // floor plane. Skip Pixi's sortChildren cost.
  agentLayer.sortableChildren = false
  const effectLayer = new Container()
  effectLayer.sortableChildren = false

  const lightingOverlay = new Graphics()
  const celestial = new Graphics()

  cameraLayer.addChild(scenery.container, agentLayer, lightingOverlay, effectLayer, celestial)

  return {
    app,
    cameraLayer,
    scenery,
    agentLayer,
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
}

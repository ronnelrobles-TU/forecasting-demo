// Lighting + event-overlay paint pass for the Office HD theme. Translates the
// shared `LightingState` (computed by isoOffice/lighting.ts) into Pixi paint
// updates: background color, window tint, wall warmth, sun/moon arc, and the
// surge / outage / flash-absent injected-event overlays.
//
// Pure mutations on the scene state; safe to call per frame.

import type { BuildingLayout } from '../isoOffice/geometry'
import { WALL_HEIGHT } from '../isoOffice/geometry'
import type { LightingState } from '../isoOffice/lighting'
import type { HDSceneState } from './scene'
import { hexStringToNumber } from './colors'
import { repaintWindows } from './scenery'

// FNV-ish window hash — matches Building.tsx's deterministic pattern so window
// glow lays down consistently between SVG and HD themes.
function windowHash(seed: number): number {
  let h = (seed * 2654435761) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export interface VisualFlags {
  surgeActive: boolean
  outageActive: boolean
  flashAbsentActive: boolean
}

export function paintLighting(
  scene: HDSceneState,
  layout: BuildingLayout,
  lighting: LightingState,
  flags: VisualFlags,
): void {
  // Background sky color.
  const skyColor = hexStringToNumber(lighting.skyColor)
  scene.app.renderer.background.color = skyColor

  // Windows — tint with the lighting fill, glowing yellow at night for a
  // deterministic fraction.
  const windowFill = hexStringToNumber(lighting.windowFill)
  const windowStroke = hexStringToNumber(lighting.windowStroke)
  const litThreshold = Math.round(lighting.litWindowFraction * 100)
  repaintWindows(
    scene.scenery,
    layout,
    windowFill,
    windowStroke,
    0xfbbf24,
    0xb45309,
    (i) => lighting.isNight && (windowHash(i * 7919 + 13) % 100) < litThreshold,
  )

  // Lighting + event overlays — drawn into a single Graphics each frame.
  const overlay = scene.lightingOverlay
  overlay.clear()

  const corners = layout.buildingCorners

  // Wall warmth (yellow wash over the floor at night).
  if (lighting.wallWarmth > 0) {
    overlay
      .poly([
        corners.N.x, corners.N.y,
        corners.E.x, corners.E.y,
        corners.S.x, corners.S.y,
        corners.W.x, corners.W.y,
      ])
      .fill({ color: 0xfde68a, alpha: lighting.wallWarmth })
  }

  // Surge: pulsing red glow at door, plus red wash over agent floor.
  if (flags.surgeActive) {
    const door = layout.rooms.reception.doorPosition
    overlay.circle(door.x, door.y - 6, 36).fill({ color: 0xdc2626, alpha: 0.18 })
    const fp = layout.rooms.agentFloor.zonePoints
    const flat: number[] = []
    for (const p of fp) { flat.push(p.x, p.y) }
    overlay.poly(flat).fill({ color: 0xdc2626, alpha: 0.10 })
  }

  // Outage: dim the whole building with a red-tinted overlay.
  if (flags.outageActive) {
    overlay
      .rect(0, 0, layout.viewBox.w, layout.viewBox.h)
      .fill({ color: 0x7f1d1d, alpha: 0.18 })
  }

  // Flash-absent: short red flash over the agent floor (no animation here —
  // the active-event window keeps it visible for a few seconds).
  if (flags.flashAbsentActive) {
    const fp = layout.rooms.agentFloor.zonePoints
    const flat: number[] = []
    for (const p of fp) { flat.push(p.x, p.y) }
    overlay.poly(flat).fill({ color: 0xef4444, alpha: 0.25 })
  }

  // Celestial body (sun or moon).
  scene.celestial.clear()
  if (lighting.sunPosition.visible) {
    if (lighting.celestialBody === 'sun') {
      scene.celestial
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 11).fill({ color: 0xfde68a, alpha: 0.4 })
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 7).fill({ color: 0xfbbf24 })
    } else {
      scene.celestial
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 6).fill({ color: 0xf1f5f9 })
        .circle(lighting.sunPosition.x + 1.6, lighting.sunPosition.y, 5.5).fill({ color: skyColor })
    }
  }

  // (Static walls already include the wall outline — nothing else needed here.)
  void WALL_HEIGHT
}

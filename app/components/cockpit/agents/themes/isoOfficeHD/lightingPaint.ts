// Lighting + event-overlay paint pass for the Office HD theme. Translates the
// shared `LightingState` (computed by isoOffice/lighting.ts) into Pixi paint
// updates: background color, window tint, wall warmth, sun/moon arc, and the
// surge / outage / flash-absent injected-event overlays.
//
// Pure mutations on the scene state; safe to call per frame.

import { AdvancedBloomFilter } from 'pixi-filters'
import type { BuildingLayout } from '../isoOffice/geometry'
import { WALL_HEIGHT } from '../isoOffice/geometry'
import type { LightingState } from '../isoOffice/lighting'
import type { HDSceneState } from './scene'
import { hexStringToNumber } from './colors'
import { repaintWindows } from './scenery'

// Single shared bloom filter instance for the sun/moon. Lazily constructed
// because the AdvancedBloomFilter constructor touches the WebGL context
// (which doesn't exist under jsdom). Pixi caches the shader program once
// the instance is built so reusing it is cheap.
let _celestialBloom: AdvancedBloomFilter | null = null
function getCelestialBloom(): AdvancedBloomFilter {
  if (!_celestialBloom) {
    _celestialBloom = new AdvancedBloomFilter({
      threshold: 0.3,
      bloomScale: 1.6,
      brightness: 1.0,
      blur: 6,
      quality: 4,
    })
  }
  return _celestialBloom
}

let celestialBloomAttached = false

// FNV-ish window hash, matches Building.tsx's deterministic pattern so window
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

  // Windows, tint with the lighting fill, glowing yellow at night for a
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

  // Lighting + event overlays, drawn into a single Graphics each frame.
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

  // Flash-absent: short red flash over the agent floor (no animation here, // the active-event window keeps it visible for a few seconds).
  if (flags.flashAbsentActive) {
    const fp = layout.rooms.agentFloor.zonePoints
    const flat: number[] = []
    for (const p of fp) { flat.push(p.x, p.y) }
    overlay.poly(flat).fill({ color: 0xef4444, alpha: 0.25 })
  }

  // Celestial body (sun or moon). HD-only: AdvancedBloomFilter on the sun
  // gives it the atmospheric "glare" feel that SVG can't match. Attached
  // lazily on first paint so the cost is paid once per scene mount.
  scene.celestial.clear()
  if (lighting.sunPosition.visible) {
    if (lighting.celestialBody === 'sun') {
      // Triple-ring sun: dim outer halo + warm inner glow + bright core.
      // The bloom filter then smears the bright core across the halo.
      scene.celestial
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 16).fill({ color: 0xfef3c7, alpha: 0.18 })
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 11).fill({ color: 0xfde68a, alpha: 0.55 })
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 7).fill({ color: 0xfbbf24 })
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 4).fill({ color: 0xfffbe8 })
    } else {
      // Moon: cool halo + crescent.
      scene.celestial
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 11).fill({ color: 0xe2e8f0, alpha: 0.25 })
        .circle(lighting.sunPosition.x, lighting.sunPosition.y, 6).fill({ color: 0xf1f5f9 })
        .circle(lighting.sunPosition.x + 1.6, lighting.sunPosition.y, 5.5).fill({ color: skyColor })
    }
    if (!celestialBloomAttached) {
      scene.celestial.filters = [getCelestialBloom()]
      celestialBloomAttached = true
    }
  }

  // HD-only: warm radial glow halos under each lit window at night. The
  // existing windows graphic gets the yellow fill via repaintWindows above;
  // here we add the soft outer glow that bleeds past the wall outline so
  // the lit windows feel like real warm interior lighting rather than a
  // flat yellow rectangle. Keeping it as a Graphics paint (not a filter)
  // means there's no per-frame shader cost.
  const glow = scene.windowGlow
  glow.clear()
  if (lighting.isNight) {
    const litThresholdInner = Math.round(lighting.litWindowFraction * 100)
    for (let i = 0; i < scene.scenery.windowCenters.length; i++) {
      if ((windowHash(i * 7919 + 13) % 100) >= litThresholdInner) continue
      const c = scene.scenery.windowCenters[i]
      // Two layered discs, outer atmospheric glow + tighter warm core.
      glow
        .circle(c.x, c.y, 9).fill({ color: 0xfde68a, alpha: 0.18 })
        .circle(c.x, c.y, 5.5).fill({ color: 0xfbbf24, alpha: 0.32 })
    }
  }

  // (Static walls already include the wall outline, nothing else needed here.)
  void WALL_HEIGHT
}

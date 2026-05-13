// Per-frame tile glow + absent marker overlay layer for the HD theme.
//
// This is a single Pixi `Graphics` that's cleared and re-drawn each frame.
// At our scale (~1k agents) clearing-and-redrawing a few hundred ellipses
// is cheap (Pixi v8 batches them into one draw call). Keeping it in one
// graphics avoids the overhead of managing one sprite per agent.

import { Container, Graphics } from 'pixi.js'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { BuildingLayout, ScreenPoint } from '../isoOffice/geometry'
import type { VisualJourney } from '../isoOffice/journey'
import { drawAbsentMarker } from './furniture'

export interface TileGlowLayer {
  container: Container
  /** Graphics for the per-agent state glows under desks. */
  glows: Graphics
  /** Graphics for the static absent markers on always-absent desks +
   *  empty desks. Drawn once at build time, never per-frame (the index
   *  set is stable for a given (peakInOffice, agentCount) pair). */
  absentMarkers: Graphics
}

/** Build the glow + absent marker layer. The marker positions are baked in
 *  on build because they're a function of the static layout + agent
 *  count, they never change between renders. */
export function buildTileGlowLayer(
  layout: BuildingLayout,
  agentCount: number,
  absentTailStart: number,
  absenteeismPct: number | undefined,
): TileGlowLayer {
  const container = new Container()
  container.sortableChildren = false
  const glows = new Graphics()
  const absentMarkers = new Graphics()

  // Pre-bake absent markers exactly the same way AgentFloor.tsx does:
  //   - Empty desks past agentCount → optional subset based on absenteeismPct.
  //   - Tail agents in [absentTailStart, agentCount) → marked as scheduled-
  //     but-absent.
  const deskPositions = layout.deskPositions
  const emptyStart = agentCount
  const emptyCount = Math.max(0, deskPositions.length - emptyStart)
  const absentTarget = Math.round(
    emptyCount * Math.max(0, Math.min(100, absenteeismPct ?? 0)) / 100
  )
  const absentDeskIdx = new Set<number>()
  if (absentTarget > 0 && emptyCount > 0) {
    const stride = emptyCount / absentTarget
    for (let k = 0; k < absentTarget; k++) {
      const idx = emptyStart + Math.floor(k * stride + stride / 2)
      if (idx < deskPositions.length) absentDeskIdx.add(idx)
    }
  }
  const tailStart = Math.max(0, Math.min(agentCount, absentTailStart))
  for (let i = tailStart; i < agentCount; i++) {
    if (i < deskPositions.length) absentDeskIdx.add(i)
  }
  for (const idx of absentDeskIdx) {
    const dp = deskPositions[idx]
    drawAbsentMarker(absentMarkers, dp.x - 1, dp.y + 1)
  }

  container.addChild(glows, absentMarkers)
  return { container, glows, absentMarkers }
}

/** Clear and repaint per-agent glows. Call from the per-frame ticker. */
export function paintTileGlows(
  layer: TileGlowLayer,
  agents: ReadonlyArray<{ id: string; state: AgentVisualState }>,
  journeys: Record<string, VisualJourney>,
  deskPositions: ReadonlyArray<ScreenPoint>,
): void {
  const g = layer.glows
  g.clear()
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]
    const j = journeys[a.id]
    if (!j) continue
    const k = j.phase.kind
    if (k !== 'at_desk' && k !== 'on_call_at_desk') continue
    if (a.state === 'off_shift') continue
    const dp = deskPositions[i]
    if (!dp) continue
    if (a.state === 'on_call') {
      g.ellipse(dp.x, dp.y - 5, 20, 10).fill({ color: 0xdc2626, alpha: 0.20 })
      g.ellipse(dp.x, dp.y - 5, 12, 6).fill({ color: 0xdc2626, alpha: 0.30 })
    } else if (a.state === 'idle') {
      g.ellipse(dp.x, dp.y - 5, 20, 10).fill({ color: 0x22c55e, alpha: 0.18 })
      g.ellipse(dp.x, dp.y - 5, 12, 6).fill({ color: 0x22c55e, alpha: 0.25 })
    }
  }
}

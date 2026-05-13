// Color helpers shared across the HD (Pixi.js) theme. Pixi v8 uses 32-bit
// integer colors throughout (0xRRGGBB) — these helpers convert from the
// hex-string palette used by the SVG renderer so we keep one source of
// truth for visual states.

import type { AgentVisualState } from '@/lib/animation/agentTimeline'

/** Parse a CSS hex string (`#22c55e`, `22c55e`) into a Pixi number. */
export function hexStringToNumber(hex: string): number {
  if (!hex) return 0x000000
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  // Support shorthand (#abc) and 6-digit forms only.
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    return (r << 16) | (g << 8) | b
  }
  if (h.length === 6) {
    return parseInt(h, 16) >>> 0
  }
  return 0x000000
}

/** Per-state shirt color (matches SVG AgentFloor.SHIRT_COLOR). */
export const SHIRT_COLOR_HEX: Record<AgentVisualState, number> = {
  idle:      0x22c55e,
  on_call:   0xdc2626,
  on_break:  0xd97706,
  off_shift: 0x475569,
}

/** Skin / outline tones used by the HD agent body. */
export const AGENT_HEAD_FILL = 0xfde4b8
export const AGENT_HEAD_STROKE = 0x92400e
export const AGENT_SHIRT_STROKE = 0x0f172a
export const AGENT_HAIR = 0x0f172a
export const AGENT_EAR = 0x1e293b
export const SHADOW_FILL = 0x1e293b

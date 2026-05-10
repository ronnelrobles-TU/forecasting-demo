// Per-agent Pixi sprites for the Office HD theme. We model each agent as a
// `Container` holding a shadow ellipse, a body (shirt), a head, and an
// optional emoji status bubble. Recoloring (sim state changing the shirt) is
// done by rebuilding the body Graphics — Pixi v8 batches Graphics updates
// efficiently and at our scale (≤ 1k agents) the overhead is negligible.
//
// All draw helpers are pure: they accept a Graphics target plus coordinates
// so the scene module can decide which container to draw into. Bubble emoji
// uses PIXI.Text with the system color-emoji font; one Text instance is
// created per agent and shown/hidden as states change.

import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import {
  AGENT_HEAD_FILL,
  AGENT_HEAD_STROKE,
  AGENT_SHIRT_STROKE,
  AGENT_HAIR,
  AGENT_EAR,
  SHADOW_FILL,
} from './colors'

// HD-only flex: a subtle red GlowFilter applied to the body of on-call
// agents so they pop against the rest of the floor. Lazily constructed on
// first use and shared across every on-call sprite — pixi-filters batches
// sprites that share the same filter instance, so this is the cheap path
// even at 200+ agents. Lazy init matters because the GlowFilter constructor
// touches the WebGL context, which doesn't exist under jsdom (test env).
let _onCallGlow: GlowFilter | null = null
function getOnCallGlow(): GlowFilter {
  if (!_onCallGlow) {
    _onCallGlow = new GlowFilter({
      color: 0xff4444,
      distance: 4,
      outerStrength: 1.4,
      innerStrength: 0.4,
      quality: 0.2,
      alpha: 0.9,
    })
  }
  return _onCallGlow
}

// Cached devicePixelRatio for crisp text — captured once per sprite build
// instead of on every getter call (it doesn't change at runtime).
const TEXT_RESOLUTION = typeof window !== 'undefined'
  ? Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 2))
  : 2

// System emoji font stack — order matters so each platform picks its native
// color-emoji face (Apple, Microsoft, Google) before falling back.
const EMOJI_FONT_STACK
  = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

export interface AgentSpriteHD {
  /** Container — translate this to position the agent. */
  container: Container
  /** Body graphics — re-drawn whenever the shirt color changes. */
  body: Graphics
  /** Head + accessories. Drawn once. */
  head: Graphics
  /** Shadow ellipse. Drawn once. */
  shadow: Graphics
  /** Emoji status bubble. Created lazily on first show. */
  bubble: Container | null
  /** Cached last shirt color so we skip redraws on no-op state changes. */
  lastShirtColor: number
  /** Cached last bubble emoji + stroke so we skip rebuilding identical bubbles. */
  lastBubbleKey: string | null
}

/** Construct a fresh agent sprite. The caller is responsible for adding the
 *  container to the agent layer and translating it to the right position. */
export function createAgentSprite(): AgentSpriteHD {
  const container = new Container()
  // Subpixel positioning is on by default in Pixi v8 — Container.x/y accept
  // floats and the renderer transforms them without snapping. We rely on
  // that here so walk animations stay buttery.
  // Pixi v8 prefers explicit zIndex sorting when needed; we draw shadow→body→head
  // by add order which is good enough.
  // HD shadow: layered ellipses (large soft + small dark) approximate a
  // gaussian shadow without the cost of a real DropShadowFilter per sprite.
  // Cheap and looks noticeably softer than the original single ellipse.
  const shadow = new Graphics()
  shadow
    .ellipse(0, 6.4, 5.4, 1.9).fill({ color: SHADOW_FILL, alpha: 0.14 })
    .ellipse(0, 6.2, 4.6, 1.55).fill({ color: SHADOW_FILL, alpha: 0.22 })
    .ellipse(0, 6.0, 3.6, 1.15).fill({ color: SHADOW_FILL, alpha: 0.32 })
  const body = new Graphics()
  // Default shirt: idle green (caller will repaint immediately).
  drawBody(body, 0x22c55e)
  const head = new Graphics()
  drawHead(head)
  container.addChild(shadow, body, head)
  return {
    container,
    body,
    head,
    shadow,
    bubble: null,
    lastShirtColor: 0x22c55e,
    lastBubbleKey: null,
  }
}

/** Toggle the HD-exclusive on-call glow on the agent body. Idempotent — if
 *  the desired state already matches the current filter list we no-op so
 *  the per-frame call path stays cheap. */
export function setOnCallGlow(sprite: AgentSpriteHD, on: boolean): void {
  const cur = sprite.body.filters
  const has = Array.isArray(cur) && cur.length > 0
  if (on === has) return
  // Pixi v8 Filter type — assign directly. We share a single filter instance
  // across every on-call sprite so the renderer can batch them.
  sprite.body.filters = on ? [getOnCallGlow()] : []
}

/** Repaint the body if the color has actually changed. Cheap no-op when called
 *  with the cached color. */
export function setShirtColor(sprite: AgentSpriteHD, color: number): void {
  if (sprite.lastShirtColor === color) return
  drawBody(sprite.body, color)
  sprite.lastShirtColor = color
}

/** Position helper. Pixi containers are mutable; we set x/y/alpha directly. */
export function positionSprite(sprite: AgentSpriteHD, x: number, y: number, alpha: number): void {
  sprite.container.x = x
  sprite.container.y = y
  sprite.container.alpha = alpha
  sprite.container.visible = alpha > 0.001
}

/** Show or hide the status bubble. Bubble is created lazily on first show. */
export function setStatusBubble(
  sprite: AgentSpriteHD,
  emoji: string | null,
  strokeColor: number,
): void {
  // null emoji => hide
  if (emoji === null) {
    if (sprite.bubble) sprite.bubble.visible = false
    sprite.lastBubbleKey = null
    return
  }
  const key = `${emoji}|${strokeColor.toString(16)}`
  if (sprite.lastBubbleKey === key && sprite.bubble) {
    sprite.bubble.visible = true
    return
  }
  // Build (or rebuild) the bubble.
  if (!sprite.bubble) {
    sprite.bubble = new Container()
    sprite.container.addChild(sprite.bubble)
  } else {
    sprite.bubble.removeChildren()
  }
  // Soft drop shadow under the bubble (a darker offset disc) — gives the
  // bubble depth so it doesn't look pasted on. Cheap (one circle) and
  // doesn't require a DropShadowFilter pass per agent.
  const shadow = new Graphics()
  shadow.circle(0.4, -14.6, 5.2).fill({ color: 0x0f172a, alpha: 0.22 })
  sprite.bubble.addChild(shadow)
  // White circle with colored stroke. Slightly larger (5.2) so the stroke
  // doesn't crowd the emoji.
  const bg = new Graphics()
  bg.circle(0, -15, 5.2).fill({ color: 0xffffff }).stroke({ color: strokeColor, width: 1.1 })
  sprite.bubble.addChild(bg)
  // Emoji text. Larger fontSize (8) renders at native emoji resolution
  // before being downscaled by Pixi's transform — this is what makes the
  // glyphs look crisp on retina. resolution=devicePixelRatio*2 (capped at
  // 4) bakes the texture at 2× the screen density so zooming reveals
  // detail rather than mush.
  const text = new Text({
    text: emoji,
    style: {
      fontFamily: EMOJI_FONT_STACK,
      fontSize: 8,
      fill: 0xffffff,
    },
    resolution: TEXT_RESOLUTION,
  })
  text.anchor.set(0.5, 0.5)
  text.x = 0
  text.y = -15
  // Render the emoji at a fraction of its native size so we get the high-res
  // texture but the visual size still matches the bubble (~5px radius).
  text.scale.set(0.78)
  sprite.bubble.addChild(text)
  sprite.bubble.visible = true
  sprite.lastBubbleKey = key
}

/** Tear down a sprite — removes from parent and destroys all owned graphics. */
export function destroyAgentSprite(sprite: AgentSpriteHD): void {
  if (sprite.container.parent) sprite.container.parent.removeChild(sprite.container)
  sprite.container.destroy({ children: true })
}

// ── Internal draw primitives ──────────────────────────────────────────────

function drawBody(g: Graphics, shirtColor: number): void {
  g.clear()
  // Mirrors the SVG path: M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z
  g.moveTo(-3.5, -3)
   .quadraticCurveTo(-3.5, 3, -1.5, 4)
   .lineTo(1.5, 4)
   .quadraticCurveTo(3.5, 3, 3.5, -3)
   .closePath()
   .fill({ color: shirtColor })
   .stroke({ color: AGENT_SHIRT_STROKE, width: 0.4 })
}

function drawHead(g: Graphics): void {
  // Skin
  g.ellipse(0, -5, 2.5, 2.3).fill({ color: AGENT_HEAD_FILL }).stroke({ color: AGENT_HEAD_STROKE, width: 0.3 })
  // Hair
  g.moveTo(-2.5, -6)
   .quadraticCurveTo(0, -8.5, 2.5, -6)
   .stroke({ color: AGENT_HAIR, width: 0.5 })
  // Ear
  g.circle(2.6, -5.3, 0.8).fill({ color: AGENT_EAR })
}

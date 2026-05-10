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
import {
  AGENT_HEAD_FILL,
  AGENT_HEAD_STROKE,
  AGENT_SHIRT_STROKE,
  AGENT_HAIR,
  AGENT_EAR,
  SHADOW_FILL,
} from './colors'

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
  // Pixi v8 prefers explicit zIndex sorting when needed; we draw shadow→body→head
  // by add order which is good enough.
  const shadow = new Graphics()
  shadow.ellipse(0, 6, 4.5, 1.4).fill({ color: SHADOW_FILL, alpha: 0.35 })
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
  // White circle with colored stroke, sized to match the SVG bubble (~5px radius).
  const bg = new Graphics()
  bg.circle(0, -15, 5).fill({ color: 0xffffff }).stroke({ color: strokeColor, width: 1 })
  sprite.bubble.addChild(bg)
  // Emoji text. fontSize=6 matches the SVG; resolution=2 keeps emoji crisp.
  const text = new Text({
    text: emoji,
    style: {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
      fontSize: 6,
      fill: 0xffffff,
    },
    resolution: 2,
  })
  text.anchor.set(0.5, 0.5)
  text.x = 0
  text.y = -15
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

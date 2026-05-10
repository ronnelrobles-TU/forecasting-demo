// Per-frame update for the Office HD agent layer. Walks the journeys map,
// resolves each agent's screen position via journeyPosition(), updates the
// matching Pixi sprite (creating one on first sight, destroying any whose
// agent id has disappeared from the roster), and applies the shirt color +
// status bubble for the current visual state.

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { ActivityAssignment } from '../isoOffice/activity'
import {
  isWalkingPhase,
  journeyPosition,
  type VisualJourney,
} from '../isoOffice/journey'
import type { HDSceneState } from './scene'
import {
  createAgentSprite,
  destroyAgentSprite,
  positionSprite,
  setShirtColor,
  setStatusBubble,
} from './agents'
import { SHIRT_COLOR_HEX } from './colors'
import { pickBubble } from './bubbles'

export interface AgentSnapshot {
  id: string
  state: AgentVisualState
}

export function updateAgentLayer(
  scene: HDSceneState,
  agents: ReadonlyArray<AgentSnapshot>,
  journeys: Record<string, VisualJourney>,
  activities: Record<string, ActivityAssignment>,
  nowMs: number,
): void {
  const seen = new Set<string>()

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]
    seen.add(a.id)
    const journey = journeys[a.id]
    if (!journey) continue

    let sprite = scene.agentSprites.get(a.id)
    if (!sprite) {
      sprite = createAgentSprite()
      scene.agentSprites.set(a.id, sprite)
      scene.agentLayer.addChild(sprite.container)
    }

    // Position from current journey phase.
    const { pos, opacity, visible } = journeyPosition(journey, nowMs)
    const phase = journey.phase
    let x = pos.x
    let y = pos.y - 1   // Match SVG: agent body sits 1px above the desk surface.
    let alpha = opacity

    // Resting-at-desk phases use the desk position directly.
    if (phase.kind === 'at_desk' || phase.kind === 'on_call_at_desk') {
      x = phase.pos.x
      y = phase.pos.y - 1
      alpha = 1
    } else if (!visible) {
      alpha = 0
    } else if (!isWalkingPhase(phase)
        && phase.kind !== 'entering_restroom'
        && phase.kind !== 'exiting_restroom') {
      // In-room / at-break-table / chat-spot: render at the static phase pos.
      alpha = 1
    }

    positionSprite(sprite, x, y, alpha)

    // Shirt color from sim state.
    const shirt = SHIRT_COLOR_HEX[a.state] ?? 0x22c55e
    setShirtColor(sprite, shirt)

    // Bubble — only when at-desk and visible. Walking agents drop the bubble
    // (matches the SVG version which only shows StatusBubble when at desk).
    const showBubble = alpha > 0.2
      && (phase.kind === 'at_desk' || phase.kind === 'on_call_at_desk' || phase.kind === 'in_room' || phase.kind === 'at_break_table' || phase.kind === 'at_chat_spot')
      && a.state !== 'off_shift'
    if (showBubble) {
      const activity = activities[a.id]?.activity
      const spec = pickBubble(a.state, activity)
      if (spec) {
        setStatusBubble(sprite, spec.emoji, spec.strokeColor)
      } else {
        setStatusBubble(sprite, null, 0)
      }
    } else {
      setStatusBubble(sprite, null, 0)
    }
  }

  // Sweep: drop sprites whose agent id is no longer in the roster.
  for (const [id, sprite] of scene.agentSprites) {
    if (!seen.has(id)) {
      destroyAgentSprite(sprite)
      scene.agentSprites.delete(id)
    }
  }
}

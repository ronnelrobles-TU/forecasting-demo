'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { JourneyPhase } from './journey'

interface StatusBubbleProps {
  x: number
  y: number
  state: AgentVisualState
  /**
   * Journey phase — the SOURCE OF TRUTH for "what is this agent currently
   * doing and where are they". The bubble is a pure function of the phase
   * (and sim state, used only as a fallback when at-desk).
   *
   * Previously the bubble was driven by the activity-assignment lookup
   * which can churn frame-to-frame at productive/shrinkage allocation
   * boundaries — that produced the breakroom flicker (☕ ↔ 💧 ↔ 💬 every
   * frame during play). Reading from the phase keeps the bubble locked
   * to whatever the journey state machine says the agent is actually
   * doing right now.
   */
  phase?: JourneyPhase
}

interface BubbleStyle { emoji: string; stroke: string }

const STATE_BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, BubbleStyle> = {
  idle:    { emoji: '💤', stroke: '#22c55e' },
  on_call: { emoji: '📞', stroke: '#dc2626' },
  on_break:{ emoji: '☕', stroke: '#d97706' },
}

// Resolve the bubble for a phase. Returns null when no bubble should render
// (walking, hidden inside the restroom, gone, etc.). At-desk phases delegate
// to the sim-state bubble.
export function bubbleStyleForPhase(
  state: AgentVisualState,
  phase: JourneyPhase | undefined,
): BubbleStyle | null {
  if (state === 'off_shift') return null
  if (!phase) {
    // Defensive fallback before journeys hydrate. Use sim-state bubble.
    return STATE_BUBBLE[state] ?? null
  }
  switch (phase.kind) {
    case 'at_desk':
      return STATE_BUBBLE[state] ?? null
    case 'on_call_at_desk':
      // Always show the call bubble, even if sim state hasn't caught up.
      return STATE_BUBBLE.on_call
    case 'at_break_table':
      return { emoji: '☕', stroke: '#d97706' }
    case 'at_chat_spot':
      return { emoji: '💬', stroke: '#3b82f6' }
    case 'in_room': {
      switch (phase.targetRoom) {
        case 'gym':          return { emoji: '💪', stroke: '#dc2626' }
        case 'training':     return { emoji: '📚', stroke: '#22c55e' }
        case 'water_cooler': return { emoji: '💧', stroke: '#06b6d4' }
        case 'patio':        return { emoji: '💬', stroke: '#3b82f6' }
        case 'chat':         return { emoji: '💬', stroke: '#3b82f6' }
        case 'restroom':     return null
        default:             return null
      }
    }
    // Hidden / transient phases — no bubble.
    case 'inside_restroom':
    case 'entering_restroom':
    case 'exiting_restroom':
    case 'gone':
    case 'outside_for_lunch':
      return null
    // Walking phases — no bubble (matches the SVG renderer's existing
    // "drop bubble while walking" behaviour).
    case 'arriving_at_door':
    case 'walking_to_break':
    case 'walking_back_to_desk':
    case 'walking_to_door_for_lunch':
    case 'walking_back_from_lunch':
    case 'walking_to_door_for_shift_end':
    case 'walking_to_room':
    case 'walking_back_from_room':
    case 'walking_to_restroom_door':
    case 'walking_back_from_restroom':
    case 'walking_to_chat_spot':
    case 'walking_back_from_chat':
      return null
  }
}

export function StatusBubble({ x, y, state, phase }: StatusBubbleProps) {
  const style = bubbleStyleForPhase(state, phase)
  if (!style) return null
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={0} cy={-15} r={5} fill="#fff" stroke={style.stroke} strokeWidth={1}/>
      <text x={0} y={-12} textAnchor="middle" fontSize={6}>{style.emoji}</text>
    </g>
  )
}

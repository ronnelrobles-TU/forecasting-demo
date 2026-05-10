'use client'

// Round 8: Dots theme refresh.
// Originally a perf-safe fallback that renders every `peakAgents` agent in a
// flat grid with the four kernel sim states. The shift / activity / lighting
// modules now exist, so the Dots theme picks them up too:
//
//  - Shift model (`activeAgentIndicesAllocated`) decides which agents are in
//    the office at the current minute. Off-shift agents render as faint dots
//    (or are hidden); the morning ramp now shows up as the grid filling in.
//  - Activity scheduler (`computeActivityAssignments`) picks an emoji for
//    each in-office agent (📚 training / 💪 gym / 💬 chatting / 💧 cooler /
//    🚽 restroom / ☕ break / 📞 on_call / 😊 idle).
//  - Lighting model paints the background sky color so time-of-day reads
//    even in the abstract view.
//  - Same SceneClock + ActivityCounter overlays as the SVG / HD themes, so
//    users get the exact same context strip regardless of theme.

import { useMemo } from 'react'
import type { AgentRendererProps } from './AgentRenderer'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { computeBuildingLayout } from './isoOffice/geometry'
import { computeActivityAssignments } from './isoOffice/activity'
import {
  activeAgentIndicesAllocated,
  peakInOfficeCount,
} from './isoOffice/shiftModel'
import { computeLighting, quantizeLightingTime } from './isoOffice/lighting'
import { SceneClock } from './isoOffice/SceneClock'
import { ActivityCounter, type ActivityCounts } from './isoOffice/ActivityCounter'

const STATE_EMOJI: Record<AgentVisualState, string | null> = {
  idle: '😊',
  on_call: '📞',
  on_break: '☕',
  off_shift: null,
}

const STATE_FILL: Record<AgentVisualState, string> = {
  idle: 'url(#dA-idle)',
  on_call: 'url(#dA-call)',
  on_break: 'url(#dA-brk)',
  off_shift: 'url(#dA-off)',
}

// Activity → emoji. Mirrors the StatusBubble selections used by Office /
// Office HD. Activity wins over the kernel sim state when the agent is in
// a recognisable activity room.
const ACTIVITY_EMOJI: Record<string, string> = {
  in_training: '📚',
  in_gym: '💪',
  chatting: '💬',
  at_water_cooler: '💧',
  in_restroom: '🚽',
  at_break_table: '☕',
}

export function DotsRenderer({
  agents,
  peakAgents,
  simTimeMin,
  perInterval,
  shrinkPct,
}: AgentRendererProps) {
  // ── Layout: roughly 16:9 grid sized for peakAgents. Stable across renders.
  const W = 320
  const H = 180
  const aspect = W / H
  const cols = Math.max(1, Math.ceil(Math.sqrt(peakAgents * aspect)))
  const rows = Math.max(1, Math.ceil(peakAgents / cols))
  const cellW = W / cols
  const cellH = H / rows
  const r = Math.max(3, Math.min(cellW, cellH) * 0.32)

  // ── Shift model — only render in-office agents (productive + shrinkage).
  // Falls back to "all agents present" when perInterval isn't supplied, so
  // existing callers (and the original test cases) still work.
  const allocation = useMemo(
    () => activeAgentIndicesAllocated(agents.length, perInterval, simTimeMin, shrinkPct),
    [agents.length, perInterval, simTimeMin, shrinkPct],
  )
  const peakInOffice = useMemo(
    () => peakInOfficeCount(perInterval, shrinkPct),
    [perInterval, shrinkPct],
  )
  const absentSlots = perInterval && perInterval.length > 0
    ? Math.max(0, agents.length - peakInOffice)
    : 0

  // ── Lighting — sky color tracks the simulation time. Quantized to 5 mins
  // so we don't recompute every frame.
  const lightingTime = quantizeLightingTime(simTimeMin, 5)
  const lighting = useMemo(
    () => computeLighting(lightingTime, { w: W, h: H }),
    [lightingTime],
  )

  // ── Activity assignments. Compute against a synthetic building layout so
  // we can reuse `computeActivityAssignments` exactly the way Office does;
  // we only consume the `.activity` field, never the screen positions.
  const layout = useMemo(
    () => computeBuildingLayout(Math.max(1, agents.length)),
    [agents.length],
  )
  const activities = useMemo(
    () => computeActivityAssignments(agents, simTimeMin, layout, allocation),
    [agents, simTimeMin, layout, allocation],
  )

  // ── Per-agent visibility / emoji.
  const tailStart = agents.length - absentSlots
  function renderInfo(i: number, a: { id: string; state: AgentVisualState }): {
    visible: boolean
    state: AgentVisualState
    emoji: string | null
  } {
    if (!perInterval || perInterval.length === 0) {
      return { visible: true, state: a.state, emoji: STATE_EMOJI[a.state] }
    }
    if (i >= tailStart) return { visible: false, state: 'off_shift', emoji: null }
    const inOffice = allocation.productive.has(i) || allocation.shrinkage.has(i)
    if (!inOffice) return { visible: false, state: 'off_shift', emoji: null }
    const activity = activities[a.id]?.activity
    const activityEmoji = activity ? ACTIVITY_EMOJI[activity] : undefined
    if (activityEmoji) return { visible: true, state: a.state, emoji: activityEmoji }
    return { visible: true, state: a.state, emoji: STATE_EMOJI[a.state] }
  }

  // ── Activity counts for the on-canvas overlay. Counted from the same
  // activity / state info that drives rendering.
  const activityCounts: ActivityCounts = useMemo(() => {
    const counts: ActivityCounts = {
      atDesks: 0, inTraining: 0, inGym: 0, onBreak: 0,
      smoking: 0, chatting: 0, waterCooler: 0, restroom: 0, walking: 0,
    }
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]
      const info = renderInfo(i, a)
      if (!info.visible) continue
      const activity = activities[a.id]?.activity
      if (a.state === 'on_break' || activity === 'at_break_table') counts.onBreak++
      else if (activity === 'in_training') counts.inTraining++
      else if (activity === 'in_gym') counts.inGym++
      else if (activity === 'chatting') counts.chatting++
      else if (activity === 'at_water_cooler') counts.waterCooler++
      else if (activity === 'in_restroom') counts.restroom++
      else counts.atDesks++
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, activities, allocation, perInterval, tailStart])

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block', background: lighting.skyColor }}
      >
        <defs>
          <radialGradient id="dA-idle" cx="35%" cy="35%"><stop offset="0%" stopColor="#86efac"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
          <radialGradient id="dA-call" cx="35%" cy="35%"><stop offset="0%" stopColor="#fca5a5"/><stop offset="100%" stopColor="#dc2626"/></radialGradient>
          <radialGradient id="dA-brk" cx="35%" cy="35%"><stop offset="0%" stopColor="#fde68a"/><stop offset="100%" stopColor="#d97706"/></radialGradient>
          <radialGradient id="dA-off" cx="35%" cy="35%"><stop offset="0%" stopColor="#475569"/><stop offset="100%" stopColor="#1e293b"/></radialGradient>
        </defs>
        {/* Sky color background — explicit rect so PNG export and dark
            container backgrounds still see the sky. */}
        <rect x={0} y={0} width={W} height={H} fill={lighting.skyColor}/>
        {/* Optional sun/moon corner icon — small so it doesn't crowd dots. */}
        {lighting.sunPosition.visible && (
          lighting.celestialBody === 'sun'
            ? <circle cx={W - 14} cy={14} r={5} fill="#fbbf24"/>
            : <g transform={`translate(${W - 14}, 14)`}>
                <circle r={4.5} fill="#f1f5f9"/>
                <circle r={3.8} cx={1.4} fill={lighting.skyColor}/>
              </g>
        )}
        {agents.map((a, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const cx = (col + 0.5) * cellW
          const cy = (row + 0.5) * cellH
          const info = renderInfo(i, a)
          if (!info.visible) {
            // Faint cell so the user can still read the grid shape.
            return (
              <circle
                key={a.id}
                cx={cx} cy={cy} r={r}
                fill={STATE_FILL.off_shift}
                opacity="0.25"
              />
            )
          }
          const opacity = a.state === 'off_shift' ? '0.5' : '1'
          return (
            <g key={a.id}>
              <circle cx={cx} cy={cy} r={r} fill={STATE_FILL[info.state]} opacity={opacity}/>
              {info.emoji && (
                <text x={cx} y={cy + r * 0.35} textAnchor="middle" fontSize={r} fill="#fff">
                  {info.emoji}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* Same on-canvas chrome the Office / Office HD themes show. */}
      <div className="cockpit-scene-overlay cockpit-scene-overlay--top-right-lower">
        <SceneClock simTimeMin={simTimeMin}/>
        <ActivityCounter counts={activityCounts}/>
      </div>
    </>
  )
}

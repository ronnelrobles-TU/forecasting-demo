'use client'

// Round 5.7: live counts of how many agents are at each location. Sits
// under the SceneClock in the top-left and gives users a numeric read-out
// of what the activity scatter is doing — so the visualization isn't only
// "cool to look at" but also clearly shows the breakdown.
//
// Counts are derived from journey phases (the source of truth for where an
// agent currently IS) plus activity assignments for agents who haven't
// started their journey yet. Pure render — counting happens in the parent.

interface ActivityCounts {
  atDesks: number
  inTraining: number
  inGym: number
  onBreak: number
  smoking: number
  chatting: number
  waterCooler: number
  restroom: number
  walking: number
}

interface ActivityCounterProps {
  counts: ActivityCounts
}

const ROWS: Array<{ key: keyof ActivityCounts; label: string; emoji: string }> = [
  { key: 'atDesks',     label: 'At desks',      emoji: '💼' },
  { key: 'onBreak',     label: 'On break',      emoji: '☕' },
  { key: 'inTraining',  label: 'Training',      emoji: '📚' },
  { key: 'inGym',       label: 'Gym',           emoji: '💪' },
  { key: 'smoking',     label: 'Smoking patio', emoji: '🚬' },
  { key: 'chatting',    label: 'Chatting',      emoji: '💬' },
  { key: 'waterCooler', label: 'Water cooler',  emoji: '💧' },
  { key: 'restroom',    label: 'Restroom',      emoji: '🚽' },
  { key: 'walking',     label: 'Walking',       emoji: '🚶' },
]

export function ActivityCounter({ counts }: ActivityCounterProps) {
  return (
    <div className="cockpit-activity-counter" aria-label="Live agent activity counts">
      <div className="cockpit-activity-counter-title">Where they are</div>
      <ul>
        {ROWS.map(r => (
          <li key={r.key}>
            <span className="cockpit-activity-counter-emoji" aria-hidden="true">{r.emoji}</span>
            <span className="cockpit-activity-counter-label">{r.label}</span>
            <span className="cockpit-activity-counter-num">{counts[r.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type { ActivityCounts }

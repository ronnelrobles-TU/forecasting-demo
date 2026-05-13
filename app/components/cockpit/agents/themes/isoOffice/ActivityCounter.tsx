'use client'

// Round 5.7: live counts of how many agents are at each location. Sits
// under the SceneClock in the top-right and gives users a numeric read-out
// of what the activity scatter is doing — so the visualization isn't only
// "cool to look at" but also clearly shows the breakdown.
//
// Counts are derived from journey phases (the source of truth for where an
// agent currently IS) plus activity assignments for agents who haven't
// started their journey yet. Pure render — counting happens in the parent.
//
// Round 5.8: switched from a 3-column grid to a 2-column flex row
// ([icon][label] -- [count]) with `white-space: nowrap` so multi-word
// labels like "Smoking patio" or "Water cooler" can never wrap onto a
// second line and counts always right-align cleanly.

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

// `tip` becomes a native HTML title attribute on the row, explaining what
// each activity bucket counts. The user reported confusion about why
// "Active agents (Live)" doesn't equal "At desks" — the difference is the
// shrinkage activities below (break / training / etc.).
const ROWS: Array<{ key: keyof ActivityCounts; label: string; emoji: string; tip: string }> = [
  { key: 'atDesks',     label: 'At desks',      emoji: '💼', tip: 'Agents physically sitting at their desk (productive — taking calls or in idle ready)' },
  { key: 'onBreak',     label: 'On break',      emoji: '☕', tip: 'Agents currently sitting at the break room table on a coffee break' },
  { key: 'inTraining',  label: 'Training',      emoji: '📚', tip: 'Agents in the training room (counted as shrinkage, not productive)' },
  { key: 'inGym',       label: 'Gym',           emoji: '💪', tip: 'Agents in the on-site gym (shrinkage)' },
  { key: 'smoking',     label: 'Smoking patio', emoji: '🚬', tip: 'Agents on the outdoor smoking patio (shrinkage)' },
  { key: 'chatting',    label: 'Chatting',      emoji: '💬', tip: 'Agents standing in informal chat clusters on the floor (shrinkage)' },
  { key: 'waterCooler', label: 'Water cooler',  emoji: '💧', tip: 'Agents at the water cooler (shrinkage)' },
  { key: 'restroom',    label: 'Restroom',      emoji: '🚽', tip: 'Agents currently inside one of the restrooms (shrinkage)' },
  { key: 'walking',     label: 'Walking',       emoji: '🚶', tip: 'Agents in transit between locations (visible movement — door, between desks, to a break, etc.)' },
]

export function ActivityCounter({ counts }: ActivityCounterProps) {
  return (
    <div className="cockpit-activity-counter" aria-label="Live agent activity counts">
      <div
        className="cockpit-activity-counter-title"
        title="Live counts of where each agent currently is. The sum of all rows = 'Active agents (Live)' on the KPI strip."
      >Where they are</div>
      <ul>
        {ROWS.map(r => (
          <li key={r.key} title={r.tip}>
            <span className="cockpit-activity-counter-left">
              <span className="cockpit-activity-counter-emoji" aria-hidden="true">{r.emoji}</span>
              <span className="cockpit-activity-counter-label">{r.label}</span>
            </span>
            <span className="cockpit-activity-counter-num">{counts[r.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type { ActivityCounts }

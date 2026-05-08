/**
 * Onboarding content module — single source of truth for tab intro blurbs
 * and jargon term definitions. Edit here, not in components.
 *
 * Bumping STRIP_VERSION invalidates every user's stored collapse state, so
 * everyone sees the strips again on next load. Use sparingly — only when a
 * blurb meaningfully changes.
 */

export const STRIP_VERSION = 1

export type TabKey = 'live' | 'monte' | 'roster' | 'classic'
export type TermKey =
  | 'hoop'
  | 'erlang-c'
  | 'aht'
  | 'sl'
  | 'sl-threshold'
  | 'occupancy'
  | 'asa'
  | 'shrinkage'
  | 'abandons'

export interface TabIntro {
  title: string
  body: string
  learnAnchor: string  // appended to `/learn`
}

export interface JargonDef {
  label: string
  body: string
  learnAnchor: string  // appended to `/learn`
}

export const TAB_INTROS: Record<TabKey, TabIntro> = {
  live: {
    title: 'What is this view?',
    body:
      'This tab plays your call center day as a 60-second movie. Each colored dot is one agent — green = idle, red = on a call, yellow = wrap-up, grey = on break. Press play, drag the timeline to skip around, or hit "Inject event" to drop a typhoon mid-day and watch what happens.',
    learnAnchor: '#live-sim',
  },
  monte: {
    title: 'What is this view?',
    body:
      'Real days are noisy — even a perfect schedule has bad-luck days. This tab simulates 1,000 versions of today and shows the spread. The blue band is the middle 80% of outcomes; the red dashed line is your worst day. Click "Replay worst day" to jump back to Live Sim and watch the disaster play out.',
    learnAnchor: '#monte-carlo',
  },
  roster: {
    title: 'What is this view?',
    body:
      'Schedules don\'t write themselves. Drag the shift bars to design a roster by hand, or hit "Auto-generate" and watch an algorithm search for the best schedule given your demand curve and budget. Once you have a roster, the Live Sim and Monte Carlo tabs use it automatically.',
    learnAnchor: '#roster',
  },
  classic: {
    title: 'What is this view?',
    body:
      'The original demo before the cockpit shipped — same Erlang C math, single-page view, no animation. Useful as a sanity-check baseline if a number on another tab looks weird.',
    learnAnchor: '#classic',
  },
}

export const JARGON: Record<TermKey, JargonDef> = {
  hoop: {
    label: 'HOOP',
    body: 'Hours of Operation. The window when your contact center is open. Outside the HOOP, no agents are scheduled and no calls are expected.',
    learnAnchor: '#hoop',
  },
  'erlang-c': {
    label: 'Erlang C',
    body: 'A 1917 queueing formula. Given calls, AHT, and your SL target, it computes the minimum number of agents needed. The whole cockpit\'s math foundation.',
    learnAnchor: '#erlang-c',
  },
  aht: {
    label: 'AHT',
    body: 'Average Handle Time. Talk + hold + after-call work, per call. Cutting AHT by 60 seconds can save 8+ agents at scale.',
    learnAnchor: '#aht',
  },
  sl: {
    label: 'SL',
    body: 'Service Level. The % of calls answered within your threshold. Industry default: 80/20 (80% answered within 20s). Your primary quality KPI.',
    learnAnchor: '#sl',
  },
  'sl-threshold': {
    label: 'SL threshold',
    body: 'The "within X seconds" half of your SL target. Tighter thresholds (10s vs 30s) need significantly more agents for the same SL %.',
    learnAnchor: '#sl-threshold',
  },
  occupancy: {
    label: 'Occupancy',
    body: 'Fraction of logged-in time agents spend actually on calls. 80–88% is healthy; above 90% agents burn out, below 75% you\'re overstaffed.',
    learnAnchor: '#occupancy',
  },
  asa: {
    label: 'ASA',
    body: 'Average Speed of Answer. Mean wait time across all calls. Even with a great SL, ASA can be ugly if a long tail of calls waits forever.',
    learnAnchor: '#asa',
  },
  shrinkage: {
    label: 'Shrinkage',
    body: '% of paid agent time NOT on the phones — breaks, training, meetings, downtime. 30% is typical. If shrinkage is 30%, you schedule ~14 to get 10 on calls.',
    learnAnchor: '#shrinkage',
  },
  abandons: {
    label: 'Abandons',
    body: 'Callers who hang up before being answered. Industry convention: abandons are removed from SL math (they never got a chance).',
    learnAnchor: '#abandons',
  },
}

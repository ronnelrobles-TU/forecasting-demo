'use client'

export type Verdict = 'robust' | 'healthy' | 'fragile' | 'risky'

export function computeVerdict(p10Sl: number, targetSl: number): Verdict {
  const gap = p10Sl - targetSl
  if (gap >= 0) return 'robust'
  if (gap >= -0.05) return 'healthy'
  if (gap >= -0.15) return 'fragile'
  return 'risky'
}

interface VerdictMeta {
  label: string
  color: string
  desc: string
  action: string
}

const VERDICT_META: Record<Verdict, VerdictMeta> = {
  robust: {
    label: 'ROBUST PLAN',
    color: '#22c55e',
    desc: 'P10 days still meet your SL target.',
    action: 'Plan looks robust — current staffing absorbs typical volume swings.',
  },
  healthy: {
    label: 'HEALTHY PLAN',
    color: '#84cc16',
    desc: 'Most days meet target; bad days dip a few points.',
    action: 'Healthy — consider a light buffer agent on peak intervals if SL matters.',
  },
  fragile: {
    label: 'FRAGILE PLAN',
    color: '#f59e0b',
    desc: '1 in 10 days will miss target by 5–15 points.',
    action: 'Fragile — add 1–2 agents to peak intervals to harden the plan.',
  },
  risky: {
    label: 'RISKY PLAN',
    color: '#ef4444',
    desc: '1 in 10 days will miss target by more than 15 points.',
    action: 'Risky — add agents or lower SL target; current plan misses badly on bad days.',
  },
}

interface RiskVerdictProps {
  p10Sl: number       // 0..1 — P10 of daily SL
  targetSl: number    // 0..1
  daysBelowSl: number
  totalDays: number
}

export function RiskVerdict({ p10Sl, targetSl, daysBelowSl, totalDays }: RiskVerdictProps) {
  const verdict = computeVerdict(p10Sl, targetSl)
  const meta = VERDICT_META[verdict]
  const pctBelow = totalDays > 0 ? (daysBelowSl / totalDays) * 100 : 0
  return (
    <div className="cockpit-monte-verdict" style={{ borderColor: meta.color }}>
      <div className="cockpit-monte-verdict-badge" style={{ background: meta.color }}>
        {meta.label}
      </div>
      <div className="cockpit-monte-verdict-body">
        <div className="cockpit-monte-verdict-desc">{meta.desc}</div>
        <div className="cockpit-monte-verdict-action">{meta.action}</div>
      </div>
      <div className="cockpit-monte-verdict-stat">
        <strong>{pctBelow.toFixed(1)}%</strong>
        <span> of days miss SL ({daysBelowSl} of {totalDays})</span>
      </div>
    </div>
  )
}

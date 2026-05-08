'use client'

import Link from 'next/link'

export type TabKey = 'live' | 'monte' | 'roster' | 'classic'

interface HeaderProps {
  active: TabKey
  onChange: (tab: TabKey) => void
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'live',    label: '▶ Live Sim' },
  { key: 'monte',   label: '⚡ Monte Carlo' },
  { key: 'roster',  label: '📋 Roster' },
  { key: 'classic', label: '📊 Classic' },
]

export function Header({ active, onChange }: HeaderProps) {
  return (
    <header className="cockpit-header">
      <div className="cockpit-title">
        <span className="cockpit-title-name">WFM Cockpit</span>
        <span className="cockpit-title-sub">Erlang C · DES kernel · live</span>
      </div>
      <nav className="cockpit-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`cockpit-tab ${active === t.key ? 'cockpit-tab--active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
        <Link href="/learn" className="cockpit-tab cockpit-tab--link">📚 Learn</Link>
      </nav>
    </header>
  )
}

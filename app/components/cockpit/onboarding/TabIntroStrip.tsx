'use client'

import Link from 'next/link'
import { TAB_INTROS, type TabKey } from '@/lib/onboarding/copy'
import { usePersistedCollapse } from '@/lib/onboarding/usePersistedCollapse'

interface TabIntroStripProps {
  tab: TabKey
}

export function TabIntroStrip({ tab }: TabIntroStripProps) {
  const { collapsed, collapse } = usePersistedCollapse(tab)
  if (collapsed) return null

  const intro = TAB_INTROS[tab]
  return (
    <div className="cockpit-onboarding-strip" role="region" aria-label="View introduction">
      <span className="cockpit-onboarding-strip-icon">💡</span>
      <div className="cockpit-onboarding-strip-body">
        <div className="cockpit-onboarding-strip-title">{intro.title}</div>
        <p className="cockpit-onboarding-strip-text">
          {intro.body}{' '}
          <Link href={`/learn${intro.learnAnchor}`} className="cockpit-onboarding-strip-link">
            Show me the math →
          </Link>
        </p>
      </div>
      <button
        type="button"
        className="cockpit-onboarding-strip-close"
        onClick={collapse}
        aria-label="Dismiss intro"
      >✕</button>
    </div>
  )
}

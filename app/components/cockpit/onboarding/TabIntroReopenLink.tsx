'use client'

import { type TabKey } from '@/lib/onboarding/copy'
import { usePersistedCollapse } from '@/lib/onboarding/usePersistedCollapse'

interface TabIntroReopenLinkProps {
  tab: TabKey
}

export function TabIntroReopenLink({ tab }: TabIntroReopenLinkProps) {
  const { collapsed, expand } = usePersistedCollapse(tab)
  if (!collapsed) return null

  return (
    <button
      type="button"
      className="cockpit-onboarding-reopen"
      onClick={expand}
      title="Re-open the intro"
    >
      ⓘ What is this?
    </button>
  )
}

import WFMDemo from '@/app/components/WFMDemo'
import { TabIntroStrip } from '../onboarding/TabIntroStrip'
import { TabIntroReopenLink } from '../onboarding/TabIntroReopenLink'

export function ClassicTab() {
  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header">
        <span>Classic view</span>
        <span className="cockpit-viewport-sub">
          <TabIntroReopenLink tab="classic" />
        </span>
      </div>
      <TabIntroStrip tab="classic" />
      <div className="cockpit-viewport-body">
        <WFMDemo />
      </div>
    </div>
  )
}

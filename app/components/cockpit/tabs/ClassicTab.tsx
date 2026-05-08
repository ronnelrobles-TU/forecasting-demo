import WFMDemo from '@/app/components/WFMDemo'

export function ClassicTab() {
  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header"><span>Classic view</span></div>
      <div className="cockpit-viewport-body">
        <WFMDemo />
      </div>
    </div>
  )
}

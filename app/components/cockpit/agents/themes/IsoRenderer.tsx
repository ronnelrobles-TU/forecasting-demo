'use client'

import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { VIEWBOX } from './isoOffice/geometry'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function IsoRenderer(_props: AgentRendererProps) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <Room/>
    </svg>
  )
}

'use client'

import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { Desks } from './isoOffice/Desks'
import { BreakRoom } from './isoOffice/BreakRoom'
import { Manager } from './isoOffice/Manager'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { VIEWBOX } from './isoOffice/geometry'

export function IsoRenderer({ agents }: AgentRendererProps) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <defs><TileGlowDefs/></defs>
      <Room/>
      <BreakRoom agents={agents}/>
      <Desks agents={agents}/>
      <Manager/>
    </svg>
  )
}

'use client'

// Janitor NPCs — multiple instances walking different paths around the agent
// floor at different speeds. Each janitor periodically pauses to "mop" with a
// small swaying animation and (rarely) diverts inside a room for a visit.
// Position is derived from simTimeMin so the path replays deterministically
// as the user scrubs the time machine.

import type { BuildingLayout, ScreenPoint } from './geometry'

interface JanitorProps {
  layout: BuildingLayout
  simTimeMin: number
}

// Per-janitor config: which path to use, how many sim minutes per loop, an
// initial phase offset, and how often to pause/mop or divert into a room.
interface JanitorConfig {
  pathIndex: number
  loopMin: number
  phaseOffsetMin: number
  // Mop pause every `mopEveryMin` sim min for `mopDurationMin` sim min.
  mopEveryMin: number
  mopDurationMin: number
  // Room visit every `visitEveryMin` sim min for `visitDurationMin` sim min.
  // Picks a deterministic visit from layout.rooms.agentFloor.janitorRoomVisits.
  visitEveryMin: number
  visitDurationMin: number
  visitOffsetMin: number
  visitIndex: number
}

const JANITOR_CONFIGS: JanitorConfig[] = [
  { pathIndex: 0, loopMin: 28, phaseOffsetMin: 0,  mopEveryMin: 6, mopDurationMin: 2, visitEveryMin: 35, visitDurationMin: 4, visitOffsetMin: 5,  visitIndex: 0 },
  { pathIndex: 1, loopMin: 22, phaseOffsetMin: 7,  mopEveryMin: 5, mopDurationMin: 2, visitEveryMin: 40, visitDurationMin: 4, visitOffsetMin: 18, visitIndex: 1 },
  { pathIndex: 2, loopMin: 34, phaseOffsetMin: 13, mopEveryMin: 7, mopDurationMin: 2, visitEveryMin: 45, visitDurationMin: 5, visitOffsetMin: 30, visitIndex: 2 },
]

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }

function pathPositionAt(path: ScreenPoint[], simTimeMin: number, loopMin: number): ScreenPoint {
  if (path.length === 0) return { x: 0, y: 0 }
  const u = ((simTimeMin % loopMin) + loopMin) % loopMin / loopMin
  const segCount = path.length
  const segIndex = Math.floor(u * segCount)
  const segT = (u * segCount) - segIndex
  const a = path[segIndex]
  const b = path[(segIndex + 1) % segCount]
  return { x: lerp(a.x, b.x, segT), y: lerp(a.y, b.y, segT) }
}

interface JanitorPose {
  pos: ScreenPoint
  // 'walking' | 'mopping' | 'visiting'
  mode: 'walking' | 'mopping' | 'visiting'
  // When mopping, a small sway angle in degrees (oscillates with simTimeMin).
  swayDeg: number
}

function janitorPoseAt(cfg: JanitorConfig, layout: BuildingLayout, simTimeMin: number): JanitorPose {
  const t = simTimeMin + cfg.phaseOffsetMin
  // Are we currently in a "visit" window? (rare diversion into a room)
  const visitCycle = ((t - cfg.visitOffsetMin) % cfg.visitEveryMin + cfg.visitEveryMin) % cfg.visitEveryMin
  if (visitCycle < cfg.visitDurationMin) {
    const visits = layout.rooms.agentFloor.janitorRoomVisits
    const visit = visits[cfg.visitIndex % Math.max(1, visits.length)]
    if (visit) {
      const sway = Math.sin(simTimeMin * 1.7) * 6
      return { pos: visit.pos, mode: 'visiting', swayDeg: sway }
    }
  }
  // Are we currently in a "mop" window?
  const mopCycle = (t % cfg.mopEveryMin + cfg.mopEveryMin) % cfg.mopEveryMin
  if (mopCycle < cfg.mopDurationMin) {
    // Hold position: freeze at the path position computed at the start of
    // the mop interval (so the janitor doesn't keep sliding while mopping).
    const freezeT = t - mopCycle
    const path = layout.rooms.agentFloor.janitorPaths[cfg.pathIndex] ?? layout.rooms.agentFloor.janitorPath
    const pos = pathPositionAt(path, freezeT, cfg.loopMin)
    const sway = Math.sin(simTimeMin * 2.3) * 8
    return { pos, mode: 'mopping', swayDeg: sway }
  }
  // Default: walking the loop.
  const path = layout.rooms.agentFloor.janitorPaths[cfg.pathIndex] ?? layout.rooms.agentFloor.janitorPath
  const pos = pathPositionAt(path, t, cfg.loopMin)
  return { pos, mode: 'walking', swayDeg: 0 }
}

interface JanitorSpriteProps { pose: JanitorPose }

function JanitorSprite({ pose }: JanitorSpriteProps) {
  const { pos, mode, swayDeg } = pose
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      {/* Shadow */}
      <ellipse cx={0} cy={6} rx={4.5} ry={1.4} fill="#1e293b" opacity={0.35}/>
      {/* Body — teal uniform */}
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill="#0d9488" stroke="#0f172a" strokeWidth={0.4}/>
      {/* Orange chest stripe */}
      <rect x={-3.3} y={-1} width={6.6} height={1.2} fill="#f97316"/>
      {/* Head */}
      <ellipse cx={0} cy={-5} rx={2.5} ry={2.3} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      {/* Cap */}
      <path d="M-2.6,-7 Q0,-9 2.6,-7 L2.4,-5.5 L-2.4,-5.5 Z" fill="#0d9488" stroke="#0f172a" strokeWidth={0.3}/>
      {/* Eyes */}
      <circle cx={2.6} cy={-5.3} r={0.8} fill="#1e293b"/>
      {/* Mop — when mopping, sways. When visiting, held vertical. When walking, slung over shoulder. */}
      <g transform={mode === 'mopping' ? `rotate(${swayDeg}, 5, -2)` : (mode === 'visiting' ? `rotate(0, 5, -2)` : '')}>
        {mode === 'walking' ? (
          <>
            <line x1={3.5} y1={-2} x2={9} y2={-9} stroke="#92400e" strokeWidth={0.7}/>
            <ellipse cx={9} cy={-9.5} rx={2.2} ry={1.2} fill="#fbbf24" stroke="#92400e" strokeWidth={0.3}/>
            <line x1={7.5} y1={-9} x2={10.5} y2={-10.5} stroke="#92400e" strokeWidth={0.2}/>
          </>
        ) : (
          <>
            <line x1={4} y1={-2} x2={5} y2={6} stroke="#92400e" strokeWidth={0.7}/>
            <ellipse cx={5} cy={6.5} rx={2.5} ry={1.1} fill="#fbbf24" stroke="#92400e" strokeWidth={0.3}/>
            {mode === 'mopping' && (
              <ellipse cx={5} cy={7} rx={3.5} ry={0.7} fill="#94a3b8" opacity={0.45}/>
            )}
          </>
        )}
      </g>
    </g>
  )
}

export function Janitor({ layout, simTimeMin }: JanitorProps) {
  return (
    <g>
      {JANITOR_CONFIGS.map((cfg, i) => {
        const pose = janitorPoseAt(cfg, layout, simTimeMin)
        return <JanitorSprite key={`jan-${i}`} pose={pose}/>
      })}
    </g>
  )
}

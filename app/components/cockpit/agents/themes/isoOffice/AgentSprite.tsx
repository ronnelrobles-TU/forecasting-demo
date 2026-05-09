'use client'

interface AgentSpriteProps {
  x: number
  y: number
  shirtColor: string
  bobOffset?: number      // pixels of vertical bob (driven by parent for on_call agents)
  opacity?: number        // for fade in/out
  scale?: number          // uniform scale for LOD tiers (1 = full, 0.5 = medium, 0.25 = tiny)
}

export function AgentSprite({ x, y, shirtColor, bobOffset = 0, opacity = 1, scale = 1 }: AgentSpriteProps) {
  const transform =
    scale === 1
      ? `translate(${x}, ${y + bobOffset})`
      : `translate(${x}, ${y + bobOffset}) scale(${scale})`
  return (
    <g transform={transform} opacity={opacity}>
      <ellipse cx={0} cy={6} rx={4.5} ry={1.4} fill="#1e293b" opacity={0.35}/>
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill={shirtColor} stroke="#0f172a" strokeWidth={0.4}/>
      <ellipse cx={0} cy={-5} rx={2.5} ry={2.3} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      <path d="M-2.5,-6 Q0,-8.5 2.5,-6" stroke="#0f172a" strokeWidth={0.5} fill="none"/>
      <circle cx={2.6} cy={-5.3} r={0.8} fill="#1e293b"/>
    </g>
  )
}

'use client'

interface AgentSpriteProps {
  x: number
  y: number
  shirtColor: string
  bob?: boolean           // when true, applies CSS-driven idle bob (GPU-composited, no React re-render)
  opacity?: number        // for fade in/out
}

export function AgentSprite({ x, y, shirtColor, bob = false, opacity = 1 }: AgentSpriteProps) {
  const inner = (
    <>
      <ellipse cx={0} cy={6} rx={4.5} ry={1.4} fill="#1e293b" opacity={0.35}/>
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill={shirtColor} stroke="#0f172a" strokeWidth={0.4}/>
      <ellipse cx={0} cy={-5} rx={2.5} ry={2.3} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      <path d="M-2.5,-6 Q0,-8.5 2.5,-6" stroke="#0f172a" strokeWidth={0.5} fill="none"/>
      <circle cx={2.6} cy={-5.3} r={0.8} fill="#1e293b"/>
    </>
  )
  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      {bob ? <g className="cockpit-iso-bob">{inner}</g> : inner}
    </g>
  )
}

'use client'

import type { BuildingLayout } from './geometry'
import { AgentSprite } from './AgentSprite'

interface ReceptionProps { layout: BuildingLayout }

function SecurityDesk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Long counter (longer than a regular desk). */}
      <polygon points="0,-4 28,6 0,16 -28,6" fill="#475569" stroke="#1e293b" strokeWidth={0.5}/>
      <polygon points="-28,6 -28,9 0,19 0,16" fill="#334155"/>
      <polygon points="28,6 28,9 0,19 0,16" fill="#1e293b"/>
      {/* Monitor */}
      <rect x={-3} y={-1} width={6} height={4} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <polygon points="-3.5,3 3.5,3 1.5,4.5 -1.5,4.5" fill="#475569"/>
      {/* Sign-in book */}
      <rect x={-15} y={3} width={4} height={3} fill="#f1f5f9" stroke="#475569" strokeWidth={0.3}/>
      {/* Phone */}
      <rect x={10} y={3} width={3} height={2} fill="#0f172a"/>
    </g>
  )
}

function DoubleDoor({ x, y }: { x: number; y: number }) {
  // A wide double-door rendered straddling the wall position. Two glass panels
  // with frames, slightly opened lookahead.
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Outer frame */}
      <rect x={-22} y={-22} width={44} height={22} fill="none" stroke="#1e293b" strokeWidth={0.8}/>
      {/* Left door */}
      <rect x={-22} y={-22} width={22} height={22} fill="url(#vO-doorGlass)" stroke="#1e293b" strokeWidth={0.5}/>
      {/* Right door */}
      <rect x={0} y={-22} width={22} height={22} fill="url(#vO-doorGlass)" stroke="#1e293b" strokeWidth={0.5}/>
      {/* Door handles */}
      <rect x={-3} y={-12} width={1.2} height={5} fill="#fbbf24"/>
      <rect x={1.8} y={-12} width={1.2} height={5} fill="#fbbf24"/>
      {/* Top mullion */}
      <line x1={-22} y1={-15} x2={22} y2={-15} stroke="#1e293b" strokeWidth={0.5}/>
      {/* Welcome mat at the floor in front of door */}
      <ellipse cx={0} cy={5} rx={20} ry={4} fill="#7f1d1d" opacity={0.4}/>
    </g>
  )
}

export function Reception({ layout }: ReceptionProps) {
  const r = layout.rooms.reception
  return (
    <g>
      {/* Security desk */}
      <SecurityDesk x={r.securityDeskPosition.x} y={r.securityDeskPosition.y}/>
      {/* Security guard sprite (purple-blue uniform) */}
      <AgentSprite x={r.guardPosition.x} y={r.guardPosition.y} shirtColor="#4f46e5"/>
      {/* Front double doors */}
      <DoubleDoor x={r.doorPosition.x} y={r.doorPosition.y}/>
    </g>
  )
}

export function ReceptionDefs() {
  return (
    <defs>
      <linearGradient id="vO-doorGlass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bfdbfe"/>
        <stop offset="50%" stopColor="#7dd3fc"/>
        <stop offset="100%" stopColor="#dbeafe"/>
      </linearGradient>
    </defs>
  )
}

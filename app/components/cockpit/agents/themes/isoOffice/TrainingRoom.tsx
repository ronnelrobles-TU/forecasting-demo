'use client'

import type { BuildingLayout } from './geometry'

interface TrainingRoomProps { layout: BuildingLayout }

function StudentChair({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon points="-3,1 3,1 2.5,3 -2.5,3" fill="#1e293b"/>
      <rect x={-2.8} y={-2.5} width={5.6} height={3.5} fill="#475569" stroke="#1e293b" strokeWidth={0.3} rx={0.3}/>
    </g>
  )
}

function Whiteboard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-18} y={-22} width={36} height={14} fill="#f8fafc" stroke="#1e293b" strokeWidth={0.6}/>
      <line x1={-15} y1={-19} x2={-5} y2={-19} stroke="#3b82f6" strokeWidth={0.5}/>
      <line x1={-15} y1={-17} x2={5} y2={-17} stroke="#3b82f6" strokeWidth={0.5}/>
      <line x1={-15} y1={-15} x2={2} y2={-15} stroke="#dc2626" strokeWidth={0.5}/>
      <line x1={-15} y1={-13} x2={8} y2={-13} stroke="#16a34a" strokeWidth={0.5}/>
      <rect x={-18.5} y={-9} width={37} height={1.5} fill="#94a3b8"/>
      {/* Easel/stand */}
      <line x1={-12} y1={-7} x2={-14} y2={2} stroke="#475569" strokeWidth={0.4}/>
      <line x1={12} y1={-7} x2={14} y2={2} stroke="#475569" strokeWidth={0.4}/>
    </g>
  )
}

export function TrainingRoom({ layout }: TrainingRoomProps) {
  const t = layout.rooms.trainingRoom
  return (
    <g>
      <Whiteboard x={t.whiteboardPosition.x} y={t.whiteboardPosition.y}/>
      {t.studentSeats.map((s, i) => (
        <StudentChair key={`tc${i}`} x={s.x} y={s.y}/>
      ))}
    </g>
  )
}

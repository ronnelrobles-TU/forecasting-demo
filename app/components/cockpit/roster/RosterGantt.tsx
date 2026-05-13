'use client'

import { useEffect, useRef, useState } from 'react'
import type { RosterShift } from '@/lib/types'

interface RosterGanttProps {
  roster: RosterShift[]
  onUpdateShift: (id: string, partial: Partial<RosterShift>) => void
  onRemoveShift: (id: string) => void
}

const STEP_MIN = 30
const MIN_LEN_MIN = 240        // 4h
const MAX_LEN_MIN = 600        // 10h
const COLORS = ['#3b82f6', '#10b981', '#fbbf24', '#a855f7', '#ef4444', '#06b6d4']

function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snap(min: number): number {
  return Math.round(min / STEP_MIN) * STEP_MIN
}

interface DragState {
  shiftId: string
  mode: 'move' | 'resize-right'
  startX: number
  origStart: number
  origEnd: number
}

export function RosterGantt({ roster, onUpdateShift, onRemoveShift }: RosterGanttProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    if (!drag) return
    function onMove(e: PointerEvent) {
      if (!drag || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dxPx = e.clientX - drag.startX
      const dxMin = (dxPx / rect.width) * 1440
      if (drag.mode === 'move') {
        const len = drag.origEnd - drag.origStart
        const newStart = Math.max(0, Math.min(1440 - len, snap(drag.origStart + dxMin)))
        onUpdateShift(drag.shiftId, { startMin: newStart, endMin: newStart + len })
      } else {
        const newEnd = Math.max(drag.origStart + MIN_LEN_MIN, Math.min(1440, snap(drag.origEnd + dxMin)))
        const len = newEnd - drag.origStart
        if (len >= MIN_LEN_MIN && len <= MAX_LEN_MIN) {
          onUpdateShift(drag.shiftId, { endMin: newEnd })
        }
      }
    }
    function onUp() { setDrag(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, onUpdateShift])

  function startDrag(e: React.PointerEvent, shift: RosterShift, mode: 'move' | 'resize-right') {
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      shiftId: shift.id,
      mode,
      startX: e.clientX,
      origStart: shift.startMin,
      origEnd: shift.endMin,
    })
  }

  return (
    <div ref={containerRef} className="cockpit-roster-gantt">
      <div className="cockpit-roster-gantt-axis">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i}>{String(i * 6).padStart(2, '0')}:00</span>
        ))}
        <span>24:00</span>
      </div>
      <div className="cockpit-roster-gantt-rows">
        {roster.length === 0 && (
          <div className="cockpit-roster-gantt-empty">No shifts. Use Auto-generate or add one.</div>
        )}
        {roster.map((s, i) => {
          const leftPct = (s.startMin / 1440) * 100
          const widthPct = ((s.endMin - s.startMin) / 1440) * 100
          const color = COLORS[i % COLORS.length]
          return (
            <div key={s.id} className="cockpit-roster-gantt-row">
              <div className="cockpit-roster-gantt-row-track">
                <div
                  className="cockpit-roster-gantt-bar"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }}
                  onPointerDown={e => startDrag(e, s, 'move')}
                >
                  <span className="cockpit-roster-gantt-bar-label">
                    {fmt(s.startMin)}-{fmt(s.endMin)} · {s.agentCount}
                  </span>
                  <div
                    className="cockpit-roster-gantt-bar-resize"
                    onPointerDown={e => startDrag(e, s, 'resize-right')}
                  />
                </div>
              </div>
              <button
                type="button"
                className="cockpit-roster-gantt-remove"
                onClick={() => onRemoveShift(s.id)}
                title="Remove shift"
              >×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

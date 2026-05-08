'use client'

import { useRef, useState, useEffect } from 'react'
import type { HoopWindow } from '@/lib/types'

const HANDLE_HOURS = [3, 7, 11, 15, 19, 23]
const HANDLE_INDICES = HANDLE_HOURS.map(h => h * 2)  // each handle sits on a 30-min interval

interface CurveEditorProps {
  curve: number[]
  hoop: HoopWindow
  onChange: (curve: number[]) => void
}

export function CurveEditor({ curve, hoop, onChange }: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  // Reshape: when a handle is dragged, set its interval to the new value and smooth-interpolate
  // adjacent intervals via cosine interpolation.
  function reshape(handleIdx: number, newValue: number) {
    const next = curve.slice()
    next[HANDLE_INDICES[handleIdx]] = Math.max(0, newValue)
    // Interpolate between adjacent handles
    for (let h = 0; h < HANDLE_INDICES.length - 1; h++) {
      const i0 = HANDLE_INDICES[h]
      const i1 = HANDLE_INDICES[h + 1]
      const v0 = next[i0]
      const v1 = next[i1]
      for (let i = i0 + 1; i < i1; i++) {
        const t = (i - i0) / (i1 - i0)
        const ct = (1 - Math.cos(Math.PI * t)) / 2  // cosine ease
        next[i] = v0 * (1 - ct) + v1 * ct
      }
    }
    onChange(next)
  }

  useEffect(() => {
    if (dragging === null) return
    function onMove(e: PointerEvent) {
      if (!svgRef.current || dragging === null) return
      const rect = svgRef.current.getBoundingClientRect()
      const y = e.clientY - rect.top
      const v = Math.max(0, 1 - y / rect.height) * 1.2  // map 0..top → 1.2; floor → 0
      reshape(dragging, v)
    }
    function onUp() { setDragging(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, curve])

  const max = Math.max(0.001, ...curve)
  const startIdx = Math.floor(hoop.startMin / 30)
  const endIdx = Math.floor(hoop.endMin / 30)

  // Build the polyline path
  const d = curve.map((v, i) => {
    const x = (i / 47) * 200
    const y = 50 - (v / max) * 45
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`
  }).join(' ')

  return (
    <div className="cockpit-curve">
      <svg ref={svgRef} viewBox="0 0 200 50" className="cockpit-curve-svg" style={{ width: '100%', height: 50, touchAction: 'none' }}>
        {/* HOOP shading: dim outside */}
        <rect x={0} y={0} width={(startIdx / 47) * 200} height={50} fill="rgba(0,0,0,0.4)" />
        <rect x={(endIdx / 47) * 200} y={0} width={200 - (endIdx / 47) * 200} height={50} fill="rgba(0,0,0,0.4)" />
        <path d={d} stroke="#3b82f6" strokeWidth={1.5} fill="none" />
        {HANDLE_INDICES.map((intervalIdx, h) => {
          const x = (intervalIdx / 47) * 200
          const v = curve[intervalIdx]
          const y = 50 - (v / max) * 45
          const insideHoop = intervalIdx >= startIdx && intervalIdx < endIdx
          return (
            <circle
              key={h}
              cx={x}
              cy={y}
              r={4}
              fill={insideHoop ? '#fff' : '#64748b'}
              stroke="#3b82f6"
              strokeWidth={1.5}
              style={{ cursor: 'ns-resize' }}
              onPointerDown={e => { e.preventDefault(); setDragging(h) }}
            />
          )
        })}
      </svg>
      <div className="cockpit-curve-hint">Drag handles · {hoop.endMin - hoop.startMin > 0 ? `${Math.round((hoop.endMin - hoop.startMin) / 60)}h HOOP` : 'closed'}</div>
    </div>
  )
}

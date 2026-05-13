'use client'

import { useEffect, useRef } from 'react'
import type { InjectedEvent } from '@/lib/types'

interface TimelineScrubberProps {
  simTimeMin: number
  curve: number[]                    // length 48, normalized weights
  injectedEvents: InjectedEvent[]
  onSeek: (n: number) => void
}

export function TimelineScrubber({ simTimeMin, curve, injectedEvents, onSeek }: TimelineScrubberProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingRef = useRef(false)
  // Latest-ref pattern: keep the freshest onSeek in a ref so the global
  // pointermove listener can be registered ONCE on mount.
  const onSeekRef = useRef(onSeek)
  useEffect(() => { onSeekRef.current = onSeek }, [onSeek])
  // rAF throttling state: collapse a storm of pointermove events into one
  // setState per animation frame. Fast back-and-forth scrubbing in React 19
  // can otherwise queue setState calls faster than React commits them, which
  // trips "Maximum update depth exceeded" through downstream effect chains
  // (simTimeMin → LiveSimTab effect → setLive → re-render → repeat).
  const rafIdRef = useRef<number | null>(null)
  const pendingTargetRef = useRef<number>(0)

  useEffect(() => {
    function flush() {
      rafIdRef.current = null
      onSeekRef.current(pendingTargetRef.current)
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      pendingTargetRef.current = (x / rect.width) * 1440
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flush)
      }
    }
    function onUp() { draggingRef.current = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])

  const max = Math.max(0.001, ...curve)
  const path = curve.map((v, i) => {
    const x = (i / 47) * 600
    const y = 40 - (v / max) * 35
    return `${i === 0 ? 'M' : 'L'} ${x},${y}`
  }).join(' ')
  const cursorX = (simTimeMin / 1440) * 600

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    draggingRef.current = true
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    onSeek((x / rect.width) * 1440)
  }

  return (
    <div className="cockpit-scrubber">
      <svg
        ref={svgRef}
        viewBox="0 0 600 50"
        style={{ width: '100%', height: 50, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
      >
        <path d={path} stroke="#3b82f6" strokeWidth={1.5} fill="none" opacity={0.5} />
        {injectedEvents.map((ev, i) => {
          const x = (ev.fireAtMin / 1440) * 600
          return <line key={i} x1={x} y1={0} x2={x} y2={50} stroke="#ef4444" strokeWidth={1} strokeDasharray="2,2" />
        })}
        <line x1={cursorX} y1={0} x2={cursorX} y2={50} stroke="#fff" strokeWidth={2} />
        <circle cx={cursorX} cy={5} r={4} fill="#fff" />
      </svg>
      <div className="cockpit-scrubber-axis">
        <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { SimEvent } from '@/lib/types'
import { agentStateAt, buildAgentTimelines, type AgentVisualState } from '@/lib/animation/agentTimeline'

interface AgentDotCanvasProps {
  events: SimEvent[]
  peakAgents: number
  simTimeMin: number
}

const COLOR: Record<AgentVisualState, string> = {
  idle: '#10b981',     // green
  on_call: '#ef4444',  // red
  on_break: '#64748b', // grey
  off_shift: '#1e293b',// near-bg dim
}

export function AgentDotCanvas({ events, peakAgents, simTimeMin }: AgentDotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const timelines = useMemo(() => buildAgentTimelines(events, peakAgents), [events, peakAgents])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const cssWidth = container.clientWidth
    const cssHeight = container.clientHeight
    canvas.width = cssWidth * dpr
    canvas.height = cssHeight * dpr
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Compute grid layout that fits peakAgents into the canvas with roughly square cells
    const aspect = cssWidth / cssHeight
    const cols = Math.max(1, Math.ceil(Math.sqrt(peakAgents * aspect)))
    const rows = Math.max(1, Math.ceil(peakAgents / cols))
    const cellW = cssWidth / cols
    const cellH = cssHeight / rows
    const radius = Math.max(2, Math.min(cellW, cellH) * 0.35)

    ctx.clearRect(0, 0, cssWidth, cssHeight)
    for (let i = 0; i < peakAgents; i++) {
      const tl = timelines[`A${i}`]
      const state = tl ? agentStateAt(tl, simTimeMin) : 'idle'
      ctx.fillStyle = COLOR[state]
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = (col + 0.5) * cellW
      const cy = (row + 0.5) * cellH
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
      ctx.fill()
    }
  }, [timelines, peakAgents, simTimeMin])

  return (
    <div ref={containerRef} className="cockpit-agent-canvas-container">
      <canvas ref={canvasRef} />
    </div>
  )
}

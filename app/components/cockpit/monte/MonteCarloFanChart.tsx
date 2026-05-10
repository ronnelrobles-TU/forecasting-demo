'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import type { FanIntervalStat, MetricKey } from '@/lib/animation/fanStats'

interface MonteCarloFanChartProps {
  perInterval: FanIntervalStat[]
  /** Daily samples for the SAME metric, one entry per sampled day, length = intervalCount. */
  spaghettiSamples?: number[][]
  /** SL target (0..1). Only rendered as a horizontal line when metric === 'sl'. */
  targetSl: number
  showWorstDay: boolean
  metric: MetricKey
}

interface MetricRender {
  axisLabel: string
  /** Multiplier applied to raw values before plotting (e.g. 100 for percentage scales). */
  scale: number
  /** Optional fixed min for y-axis. */
  yMin?: number
  /** Optional fixed max for y-axis. */
  yMax?: number
  /** When yMax not fixed, pad max-of-data by this factor. */
  yPad?: number
}

function metricRender(metric: MetricKey): MetricRender {
  switch (metric) {
    case 'sl':
      return { axisLabel: 'Service Level (%)', scale: 100, yMin: 0, yMax: 100 }
    case 'occupancy':
      return { axisLabel: 'Occupancy (%)', scale: 100, yMin: 0, yMax: 100 }
    case 'abandons':
      return { axisLabel: 'Abandons (count)', scale: 1, yMin: 0, yPad: 1.1 }
    case 'asa':
      return { axisLabel: 'Avg ASA (seconds)', scale: 1, yMin: 0, yPad: 1.1 }
  }
}

function SpaghettiBackground({
  samples, intervalCount, scale, yMin, yMax,
}: {
  samples: number[][]
  intervalCount: number
  scale: number
  yMin: number
  yMax: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    c.width = Math.floor(rect.width * dpr)
    c.height = Math.floor(rect.height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)
    if (samples.length === 0 || intervalCount <= 1) return

    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 0.5

    const span = Math.max(1e-9, yMax - yMin)
    for (const sample of samples) {
      ctx.beginPath()
      const len = Math.min(sample.length, intervalCount)
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * rect.width
        const v = sample[i] * scale
        const yNorm = (v - yMin) / span
        const y = (1 - Math.max(0, Math.min(1, yNorm))) * rect.height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }, [samples, intervalCount, scale, yMin, yMax])

  return (
    <canvas
      ref={canvasRef}
      className="cockpit-monte-spaghetti-canvas"
      aria-hidden
    />
  )
}

export function MonteCarloFanChart({
  perInterval, spaghettiSamples, targetSl, showWorstDay, metric,
}: MonteCarloFanChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const render = metricRender(metric)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const labels = Array.from({ length: perInterval.length }, (_, i) =>
      i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}` : ''
    )

    const p10 = perInterval.map(s => s.p10 * render.scale)
    const p50 = perInterval.map(s => s.p50 * render.scale)
    const p90 = perInterval.map(s => s.p90 * render.scale)
    const worst = perInterval.map(s => s.worstDay * render.scale)

    const isSl = metric === 'sl'

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'P10',
            data: p10,
            borderColor: 'rgba(59,130,246,0.4)',
            backgroundColor: 'rgba(59,130,246,0.0)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'P10–P90 band',
            data: p90,
            borderColor: 'rgba(59,130,246,0.4)',
            backgroundColor: 'rgba(59,130,246,0.18)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.3,
            fill: '-1',
          },
          {
            label: 'P50 (median)',
            data: p50,
            borderColor: '#fff',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          },
          ...(showWorstDay ? [{
            label: 'Worst day',
            data: worst,
            borderColor: '#ef4444',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [4, 3],
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          }] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: {
            min: render.yMin,
            max: render.yMax,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            title: { display: true, text: render.axisLabel, color: '#94a3b8' },
          },
        },
      },
      plugins: isSl ? [
        {
          id: 'targetLine',
          afterDraw(chart) {
            const { ctx, chartArea, scales } = chart
            const yScale = scales.y
            const y = yScale.getPixelForValue(targetSl * 100)
            ctx.save()
            ctx.strokeStyle = '#10b981'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            ctx.moveTo(chartArea.left, y)
            ctx.lineTo(chartArea.right, y)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.fillStyle = '#10b981'
            ctx.font = '10px system-ui'
            ctx.fillText(`SL target ${(targetSl * 100).toFixed(0)}%`, chartArea.left + 4, y - 4)
            ctx.restore()
          },
        },
      ] : [],
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [perInterval, targetSl, showWorstDay, metric, render.axisLabel, render.scale, render.yMin, render.yMax])

  // Compute spaghetti y-range that mirrors the chart's effective scale.
  // For metrics with a fixed yMax we use it directly; otherwise derive from data.
  const intervalCount = perInterval.length
  const spagYMin = render.yMin ?? 0
  let spagYMax = render.yMax ?? 0
  if (render.yMax === undefined) {
    let dataMax = 0
    for (const s of perInterval) {
      if (s.p90 > dataMax) dataMax = s.p90
      if (s.worstDay > dataMax) dataMax = s.worstDay
    }
    spagYMax = (dataMax * render.scale) * (render.yPad ?? 1.1) || 1
  }

  return (
    <div className="cockpit-monte-fan-container">
      {spaghettiSamples && spaghettiSamples.length > 0 && intervalCount > 0 && (
        <SpaghettiBackground
          samples={spaghettiSamples}
          intervalCount={intervalCount}
          scale={render.scale}
          yMin={spagYMin}
          yMax={spagYMax}
        />
      )}
      <canvas ref={canvasRef} className="cockpit-monte-fan-canvas" />
    </div>
  )
}

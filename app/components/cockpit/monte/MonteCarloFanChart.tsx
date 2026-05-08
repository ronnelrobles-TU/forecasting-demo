'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import type { FanIntervalStat } from '@/lib/animation/fanStats'

interface MonteCarloFanChartProps {
  perInterval: FanIntervalStat[]
  targetSl: number
  showWorstDay: boolean
}

export function MonteCarloFanChart({ perInterval, targetSl, showWorstDay }: MonteCarloFanChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const labels = Array.from({ length: perInterval.length }, (_, i) =>
      i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}` : ''
    )

    const p10 = perInterval.map(s => s.p10 * 100)
    const p50 = perInterval.map(s => s.p50 * 100)
    const p90 = perInterval.map(s => s.p90 * 100)
    const worst = perInterval.map(s => s.worstDay * 100)

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
            min: 0, max: 100,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            title: { display: true, text: 'Service Level (%)', color: '#94a3b8' },
          },
        },
      },
      plugins: [
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
      ],
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [perInterval, targetSl, showWorstDay])

  return (
    <div className="cockpit-monte-fan-container">
      <canvas ref={canvasRef} />
    </div>
  )
}

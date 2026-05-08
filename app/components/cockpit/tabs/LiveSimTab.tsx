'use client'

import { useEffect, useRef, useState } from 'react'
import { useScenario } from '../ScenarioContext'
import { runDayInWorker } from '@/app/workers/kernelClient'
import type { SimResult } from '@/lib/types'
import Chart from 'chart.js/auto'

export function LiveSimTab() {
  const { scenario } = useScenario()
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    setRunning(true)
    runDayInWorker(scenario).then(r => {
      setResult(r)
      setRunning(false)
    })
  }, [scenario])

  useEffect(() => {
    if (!canvasRef.current || !result) return
    if (chartRef.current) chartRef.current.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: Array.from({ length: 48 }, (_, i) => i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}` : ''),
        datasets: [
          {
            label: 'Service Level (%)',
            data: result.perInterval.map(s => s.sl * 100),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { min: 0, max: 100, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [result])

  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header">
        <span>Live Sim — Phase 1 preview</span>
        <span className="cockpit-viewport-sub">{running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}%`}</span>
      </div>
      <div className="cockpit-viewport-body">
        <p className="cockpit-viewport-note">Full live animation arrives in Phase 2. This view runs the kernel once per scenario change to verify the pipeline.</p>
        <div className="cockpit-chart-container">
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import type { RosterShift, Scenario } from '@/lib/types'
import { agentsActiveAt } from '@/lib/kernel/roster'
import { applyHoop, callsPerInterval } from '@/lib/curve'
import { requiredAgents } from '@/lib/erlang'

interface CoverageLineProps {
  scenario: Scenario
  roster: RosterShift[]
}

export function CoverageLine({ scenario, roster }: CoverageLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const labels = Array.from({ length: 48 }, (_, i) =>
      i % 4 === 0 ? `${String(Math.floor(i / 2)).padStart(2, '0')}:00` : ''
    )
    const curve = applyHoop(scenario.curve, scenario.hoop)
    const calls = callsPerInterval(curve, scenario.dailyTotal)
    const slTarget = scenario.sl / 100
    const required = calls.map(c => {
      if (c <= 0) return 0
      const { N } = requiredAgents(c, scenario.aht, slTarget, scenario.asa)
      return Math.ceil(N / (1 - scenario.shrink / 100) / (1 - scenario.abs / 100))
    })
    const scheduled = Array.from({ length: 48 }, (_, i) => agentsActiveAt(roster, i * 30 + 15))

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Required',
            data: required,
            borderColor: 'rgba(255,255,255,0.5)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointRadius: 0,
            tension: 0.2,
            fill: false,
          },
          {
            label: 'Scheduled',
            data: scheduled,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.15)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
            fill: 'origin',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: {
            beginAtZero: true,
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            title: { display: true, text: 'Agents', color: '#94a3b8' },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [scenario, roster])

  return (
    <div className="cockpit-roster-coverage-container">
      <canvas ref={canvasRef} />
    </div>
  )
}

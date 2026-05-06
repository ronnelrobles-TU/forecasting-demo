'use client'

import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'

type CampaignKey = 'us_telco_manila' | 'au_retail_cebu' | 'uk_fintech_manila' | 'us_healthcare_clark' | 'ph_telco_davao'

interface Campaign {
  label: string
  volume: number
  aht: number
  sl: number
  asa: number
  shrink: number
  abs: number
  rules: string
}

const campaigns: Record<CampaignKey, Campaign> = {
  us_telco_manila:     { label: 'US Telco Inbound – Manila',  volume: 620, aht: 420, sl: 80, asa: 20, shrink: 32, abs: 9,  rules: 'Voice inbound · Tier 1 troubleshoot · 24/7 follow-the-sun · ESL premium tagging' },
  au_retail_cebu:      { label: 'AU Retail Chat – Cebu',      volume: 280, aht: 240, sl: 85, asa: 30, shrink: 28, abs: 7,  rules: 'Chat (2 concurrent) · AEST coverage · holiday surge model · post-sales focus' },
  uk_fintech_manila:   { label: 'UK Fintech Voice – Manila',  volume: 380, aht: 540, sl: 90, asa: 15, shrink: 35, abs: 8,  rules: 'Voice · KYC compliance · GMT coverage · senior-tier only · strict QA' },
  us_healthcare_clark: { label: 'US Healthcare – Clark',      volume: 210, aht: 600, sl: 90, asa: 30, shrink: 38, abs: 10, rules: 'Voice · HIPAA · EST/CST split · seasonal Q4 enrollment surge' },
  ph_telco_davao:      { label: 'PH Telco Local – Davao',     volume: 740, aht: 300, sl: 75, asa: 25, shrink: 30, abs: 12, rules: 'Voice · Bisaya/Tagalog dual · local hours · weather-event flex (typhoon)' },
}

function erlangC(N: number, A: number): number {
  if (N <= A) return 1
  let sum = 0
  let term = 1
  for (let k = 0; k < N; k++) {
    if (k > 0) term = (term * A) / k
    sum += term
  }
  const lastTerm = (term * A) / N
  const numerator = (lastTerm * N) / (N - A)
  return numerator / (sum + numerator)
}

function serviceLevel(N: number, A: number, ahtSec: number, thresholdSec: number): number {
  if (N <= A) return 0
  const pw = erlangC(N, A)
  return 1 - pw * Math.exp((-(N - A) * thresholdSec) / ahtSec)
}

function avgWait(N: number, A: number, ahtSec: number): number {
  if (N <= A) return 999
  const pw = erlangC(N, A)
  return (pw * ahtSec) / (N - A)
}

function requiredAgents(callsPerHalfHour: number, ahtSec: number, slTarget: number, thresholdSec: number): { N: number; A: number } {
  const lambda = callsPerHalfHour / 1800
  const A = lambda * ahtSec
  let N = Math.max(1, Math.ceil(A) + 1)
  while (serviceLevel(N, A, ahtSec, thresholdSec) < slTarget && N < 5000) N++
  return { N, A }
}

const pattern: number[] = Array.from({ length: 48 }, (_, i) => {
  const h = i / 2
  return (
    0.18 +
    Math.exp(-Math.pow((h - 10) / 2.2, 2)) +
    0.85 * Math.exp(-Math.pow((h - 15) / 2.4, 2)) +
    0.45 * Math.exp(-Math.pow((h - 20) / 2.0, 2))
  )
})
const patternMax = Math.max(...pattern)

const chartLabels = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  return h % 6 === 0 && m === '00' ? `${String(h).padStart(2, '0')}:${m}` : ''
})

interface DemoState {
  campaignKey: CampaignKey
  volume: number
  aht: number
  sl: number
  asa: number
  shrink: number
  abs: number
}

const init = campaigns.us_telco_manila
const initialState: DemoState = {
  campaignKey: 'us_telco_manila',
  volume: init.volume,
  aht: init.aht,
  sl: init.sl,
  asa: init.asa,
  shrink: init.shrink,
  abs: init.abs,
}

export default function WFMDemo() {
  const [state, setState] = useState<DemoState>(initialState)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const textColor = isDark ? '#a1a1aa' : '#71717a'
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Required agents',
            data: [],
            borderColor: '#185FA5',
            backgroundColor: 'rgba(24,95,165,0.12)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
          },
          {
            label: 'Scheduled HC',
            data: [],
            borderColor: '#0F6E56',
            borderWidth: 2,
            borderDash: [4, 4],
            fill: false,
            tension: 0.35,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor, font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 16 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const { volume, aht, sl, asa, shrink, abs } = state
    const required = pattern.map(p => requiredAgents(Math.max(20, Math.round(volume * (p / patternMax))), aht, sl / 100, asa).N)
    const sched = required.map(r => Math.ceil(r / (1 - shrink / 100) / (1 - abs / 100)))
    chart.data.datasets[0].data = required
    chart.data.datasets[1].data = sched
    chart.update('none')
  }, [state])

  function applyCampaign(key: string) {
    const c = campaigns[key as CampaignKey]
    setState({ campaignKey: key as CampaignKey, volume: c.volume, aht: c.aht, sl: c.sl, asa: c.asa, shrink: c.shrink, abs: c.abs })
  }

  function set(field: keyof Omit<DemoState, 'campaignKey'>, value: number) {
    setState(s => ({ ...s, [field]: value }))
  }

  const { N, A } = requiredAgents(state.volume, state.aht, state.sl / 100, state.asa)
  const actualSL = serviceLevel(N, A, state.aht, state.asa)
  const occ = Math.min(1, A / N)
  const asaActual = avgWait(N, A, state.aht)
  const scheduled = Math.ceil(N / (1 - state.shrink / 100) / (1 - state.abs / 100))
  const campaign = campaigns[state.campaignKey]

  const sliders: { label: string; field: keyof Omit<DemoState, 'campaignKey'>; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
    { label: 'Calls / 30 min',    field: 'volume', min: 50,  max: 1500, step: 10, fmt: v => String(v) },
    { label: 'AHT (sec)',          field: 'aht',    min: 120, max: 900,  step: 10, fmt: v => String(v) },
    { label: 'SL target (%)',      field: 'sl',     min: 60,  max: 95,   step: 1,  fmt: v => `${v}%` },
    { label: 'SL threshold (sec)', field: 'asa',    min: 10,  max: 60,   step: 1,  fmt: v => `${v}s` },
    { label: 'Shrinkage (%)',      field: 'shrink', min: 10,  max: 45,   step: 1,  fmt: v => `${v}%` },
    { label: 'Absenteeism (%)',    field: 'abs',    min: 0,   max: 20,   step: 1,  fmt: v => `${v}%` },
  ]

  const kpis = [
    { label: 'Erlang C agents', value: N,                              sub: 'required on phones' },
    { label: 'Scheduled HC',    value: scheduled,                      sub: 'after shrink + absent' },
    { label: 'Service level',   value: `${(actualSL * 100).toFixed(1)}%`, sub: 'in threshold' },
    { label: 'Occupancy',       value: `${(occ * 100).toFixed(1)}%`,  sub: 'utilization' },
    { label: 'Avg ASA',         value: `${Math.round(asaActual)}s`,   sub: 'seconds to answer' },
  ]

  return (
    <div className="wfm-demo">
      {/* Header */}
      <div className="wfm-header">
        <div>
          <div className="wfm-title">WFM Forecasting – Live Staffing Engine</div>
          <div className="wfm-subtitle">Erlang C + geo / campaign rules + KPI sensitivity</div>
        </div>
        <div className="wfm-campaign-select">
          <span className="wfm-label">Campaign</span>
          <select value={state.campaignKey} onChange={e => applyCampaign(e.target.value)} className="wfm-select">
            <option value="us_telco_manila">US Telco Inbound – Manila</option>
            <option value="au_retail_cebu">AU Retail Chat – Cebu</option>
            <option value="uk_fintech_manila">UK Fintech Voice – Manila</option>
            <option value="us_healthcare_clark">US Healthcare – Clark</option>
            <option value="ph_telco_davao">PH Telco Local – Davao</option>
          </select>
        </div>
      </div>

      {/* Info cards */}
      <div className="wfm-info-grid">
        <div className="wfm-card">
          <div className="wfm-card-label">Campaign rule layer</div>
          <div className="wfm-card-body">{campaign.rules}</div>
        </div>
        <div className="wfm-card">
          <div className="wfm-card-label">Service level target</div>
          <div className="wfm-card-body">
            {state.sl}% of calls answered in {state.asa}s · {(state.aht / 60).toFixed(1)}-min average handle time
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div className="wfm-panel">
        <div className="wfm-panel-title">Demand &amp; handle inputs</div>
        {sliders.map(({ label, field, min, max, step, fmt }) => (
          <div key={field} className="wfm-slider-row">
            <label className="wfm-slider-label">{label}</label>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={state[field]}
              onChange={e => set(field, Number(e.target.value))}
              className="wfm-range"
            />
            <span className="wfm-slider-value">{fmt(state[field] as number)}</span>
          </div>
        ))}
      </div>

      {/* KPI cards */}
      <div className="wfm-kpi-grid">
        {kpis.map(({ label, value, sub }) => (
          <div key={label} className="wfm-kpi-card">
            <div className="wfm-kpi-label">{label}</div>
            <div className="wfm-kpi-value">{value}</div>
            <div className="wfm-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="wfm-panel">
        <div className="wfm-chart-header">
          <div className="wfm-panel-title">Intraday staffing curve</div>
          <div className="wfm-label">required agents per 30-min interval</div>
        </div>
        <div className="wfm-chart-container">
          <canvas ref={canvasRef} />
        </div>
      </div>

    </div>
  )
}

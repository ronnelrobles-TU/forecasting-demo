# WFM Cockpit — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Owner:** Matthew (matthewnrobles@gmail.com)

## 1. Overview

Evolve the existing single-page WFM forecasting demo into a **simulation-driven cockpit** that turns the static Erlang C calculator into a live, animated, event-driven workforce planning instrument. The audience is internal stakeholders, executives, and prospects who saw the original demo and asked "how does the tool determine the schedules and HOOPs?" — the cockpit answers that question by *showing the algorithm work*, not by surfacing a static result.

The cockpit is one page, four lenses on a single shared simulation kernel:

- **Live Sim + Time Machine** — animated agent-by-agent day, scrubber, mid-day event injection
- **Monte Carlo** — 1,000 simulated days, P10/P50/P90 distribution, replay-the-worst-day
- **Roster Designer + Optimizer** — drag-to-edit shift Gantt with live coverage feedback and an auto-generator that visibly searches
- **Classic** — preserves the existing single-chart view so the original demo isn't lost

## 2. Goals & success criteria

The cockpit is "successful" when:

1. A demo-driver can answer "how does it determine schedules and HOOPs?" by clicking the Roster tab and pressing **Auto-generate**, and the room watches the optimizer assemble shifts in real time.
2. A demo-driver can play through a simulated day, pause mid-day, inject a "Typhoon" event, and the audience visibly sees the queue grow, agent dots pulse red, SL dial drop — then resume and watch the system collapse or absorb.
3. A demo-driver can switch between Live, Monte Carlo, and Roster tabs without changing scenario inputs, and the room sees the same scenario from three angles.
4. The killer demo move (Live → inject Typhoon → Roster → re-optimize → back to Live → re-run) is doable in under 90 seconds of clicks, end to end.

## 3. Constraints

- **Deployment:** Client-side static (Next.js static export to Vercel). All compute in the browser. The simulation kernel ships as a pure-TypeScript module with no DOM/React/browser dependencies, so it could move to a Node backend later if real ops adoption happens.
- **Tech baseline:** Next.js 16, React 19, TypeScript 5, Chart.js 4, Tailwind 4 (all already in `package.json`). Adds: native Web Workers, Canvas 2D, and `seedrandom` (~3 KB) — nothing else.
- **Next.js 16 caveat:** Per `AGENTS.md`, Next.js 16 has breaking changes from training-data Next.js. The implementation must consult `node_modules/next/dist/docs/` for current Web Worker integration and static-export rules before writing Worker glue code.
- **Keep `/learn`:** The educational page is untouched. The new cockpit replaces `/` (current `WFMDemo`); the original chart view becomes the "Classic" tab inside the cockpit.

## 4. Architecture

### 4.1 Layered model

```
Layer 1 · Configuration
  Campaign + Geo · HOOP window · Per-interval volume curve · AHT, SL, shrink, abs
        ↓
Layer 2 · Roster Optimizer (feature C)
  Generates Shift[] from HOOP + demand curve
        ↓
Layer 3 · Simulation Kernel (shared core, Web Worker)
  Discrete-event sim: Poisson arrivals, log-normal AHT, agent FSM, abandons, breaks
        ↓
Layer 4 · Three viewports
  ├─ Live Sim + Time Machine (single day, animated)
  ├─ Monte Carlo (1,000 days, parallel worker pool)
  └─ Roster Designer (drag-edit + auto-generate)
```

### 4.2 Compute placement

| Component         | Where it runs       | Notes                                                   |
| ----------------- | ------------------- | ------------------------------------------------------- |
| UI                | Main thread (React) | Canvas rendering, Chart.js, drag handles, slider state  |
| Single-day sim    | Kernel Worker       | Streams events to UI for live animation; ~25k events/day, <100ms |
| Monte Carlo       | Worker Pool ×4      | 1,000 days in 5–10s, progress streams to fan chart       |
| Roster optimizer  | Optimizer Worker    | Simulated annealing; streams best-so-far each iteration |

### 4.3 Page structure

Single cockpit page replaces current `/`:

- **Header:** title + 4 tabs (Live Sim / Monte Carlo / Roster / Classic) + link to Learn
- **Sidebar (240px, persistent):** Campaign picker · HOOP slider · Draggable curve · Slider inputs (AHT/SL/threshold/shrink/abs) · "Inject event" button
- **Main viewport (changes per tab):** Active visualization
- **KPI strip (persistent, bottom):** Erlang C agents · Scheduled HC · Service Level · Occupancy · Avg ASA. Updates live during simulation playback.

Dark theme ("mission control" aesthetic) — makes the colored agent dots pop.

## 5. Data model

```ts
type CampaignKey = 'us_telco_manila' | 'au_retail_cebu' | 'uk_fintech_manila' | 'us_healthcare_clark' | 'ph_telco_davao'

interface Campaign {                  // preset baseline (extends existing)
  label: string
  hoop: { startMin: number; endMin: number }   // minutes from midnight, e.g. 240–1320 = 04:00–22:00
  curveTemplate: number[]              // 48 normalized weights (one per 30-min interval)
  dailyTotal: number                   // total calls/day (replaces existing calls/30min)
  aht: number                          // seconds
  sl: number                           // 0–100 (target %)
  asa: number                          // SL threshold seconds
  shrink: number                       // 0–100
  abs: number                          // 0–100
  rules: string                        // (existing description)
}

interface Scenario {                   // live editable state in React
  campaignKey: CampaignKey
  hoop: { startMin: number; endMin: number }   // edited by HOOP slider
  curve: number[]                      // length 48; intervals outside HOOP are forced to 0
  dailyTotal: number                   // separate sidebar input; not derived from curve
  aht: number; sl: number; asa: number; shrink: number; abs: number
  roster: Shift[] | null               // null → kernel derives count from Erlang C per interval
  rngSeed: number                      // reproducibility
}

interface Shift {
  id: string
  agentId: string
  startMin: number
  endMin: number
  breaks: { startMin: number; durationMin: number }[]
}

type SimEventType =
  | 'call_arrive' | 'call_answer' | 'call_end' | 'call_abandon'
  | 'agent_break_start' | 'agent_break_end'
  | 'agent_shift_start' | 'agent_shift_end'
  | 'event_inject'                     // user-injected perturbation

interface SimEvent {
  timeMin: number                      // simulated minute since midnight
  type: SimEventType
  agentId?: string
  callId?: string
  waitMs?: number
  payload?: Record<string, unknown>
}

interface SimResult {
  perInterval: Array<{
    sl: number; agents: number; queueLen: number; abandons: number; occ: number
  }>                                   // length 48
  events: SimEvent[]                   // for animation playback
  totals: { sl: number; occ: number; asa: number; abandons: number; cost: number }
}

interface InjectedEvent {              // mid-sim perturbations
  fireAtMin: number
  type: 'volume_surge' | 'aht_spike' | 'staff_drop' | 'flash_absent' | 'custom'
  durationMin?: number
  magnitude: number                    // e.g. +0.30 for +30% volume
}
```

## 6. Simulation kernel

### 6.1 What it simulates

- **Call arrivals**: Poisson process. Per-interval rate = `(curve[i] / sum(curve)) × dailyTotal / 30 minutes`. HOOP edges trim the curve.
- **Service times**: log-normal distribution centered on `aht`, σ = 0.4 × aht (configurable later).
- **Agent state machine**: `idle → on_call → ACW → idle`, with `on_break` and `off_shift` transitions driven by the roster.
- **Queue assignment**: longest-idle agent picks up first; FIFO when all busy.
- **Abandons**: if queue wait > abandon threshold (configurable per campaign, default 60s), caller leaves with probability ramping with wait time.
- **Breaks/lunch**: fired on schedule per shift. Default break placement = mid-shift 15-min + lunch 30-min for shifts ≥ 6h.
- **Shrinkage**: applied as random off-phone minutes throughout the shift, totaling `shrink%` of paid time.
- **Absenteeism**: trims roster on day-init by `abs%` (random).

### 6.2 Why DES (vs interval Erlang C)

- The animation IS the data — every dot reflects a real event, not a tweened illustration.
- Captures variance — Monte Carlo gets a real distribution, not a smoothed mean.
- Handles HOOP edges, shift starts, breaks natively.
- Event injection is just another `SimEvent`.
- Same kernel for live sim AND Monte Carlo — single source of truth.

### 6.3 Public API

```ts
// kernel/index.ts (pure TS, no DOM)
export function runDay(scenario: Scenario, opts?: { stream?: (e: SimEvent) => void }): SimResult
export function runMonteCarlo(scenario: Scenario, days: number, onProgress: (done: number, total: number) => void): SimResult[]
export function optimizeRoster(scenario: Scenario, opts: { maxIters: number; onIter: (best: Shift[], score: number) => void }): Shift[]
```

### 6.4 Performance budgets

- 1 day @ ~158 agents @ ~12,400 calls = ~25k events. Target: <100 ms in Worker.
- 1,000 days = ~25M events across pool of 4 workers. Target: <10 seconds total, with streaming progress.
- Optimizer: 200 iterations of simulated annealing, each running a 1-day sim. Target: <5 seconds total, with streaming best-so-far every 10 iterations.

## 7. Input controls (Section A item C: hybrid preset + drag)

- **Campaign picker** (sidebar select) — loads HOOP, curve, all sliders from the preset
- **HOOP slider** — dual-thumb range slider in the sidebar (e.g. 04:00–22:00). Dragging either thumb truncates the curve and reflows downstream calculations.
- **Daily total input** — numeric input above the curve, e.g. `12,400 calls/day`. Independent of curve shape.
- **Draggable curve** — small SVG in sidebar showing the 48-interval curve; each interval has a draggable handle. Vertical drag changes the *shape* (relative weights); the kernel multiplies normalized weights × `dailyTotal` to get per-interval calls. Intervals outside HOOP are zeroed and visually dimmed.
- **Slider inputs** — AHT, SL%, SL threshold, Shrinkage, Absenteeism (existing sliders, restyled into the dark sidebar).
- **Inject event button** — opens a modal with preset perturbations (Surge / Outage / Typhoon / Flash absent / Custom). Only enabled when Live Sim is paused or playing.

Every preset is a starting point; every control is editable. The demo never hits a "we can't show that" wall.

## 8. Viewport details

### 8.1 Live Sim + Time Machine

- **Header strip**: current sim time (e.g. "14:23"), play/pause, speed selector (1× / 10× / 60×).
- **Agent-dot canvas**: grid of N dots (auto-sized to roster size). Color: red = on call · green = idle · yellow = ACW · grey = break/off-shift. Rendered on Canvas 2D for smooth 60fps even at 500+ agents.
- **Queue indicator**: subtitle text — `"NN agents · QUEUE: NN waiting · LONGEST WAIT: NNs"`.
- **Timeline scrubber**: SVG mini-chart showing demand curve underlaid; current time is a vertical line; user can drag to seek.
- **Live KPI strip** (footer): updates as events stream from the worker.

### 8.2 Monte Carlo

- **Fan chart** (left, 2/3): Chart.js area chart with two confidence bands (P10–P90 lighter, P25–P75 darker), median line, target line, optional worst-day overlay.
- **Stats column** (right, 1/3): "Days below SL", "P50 SL", "P10 SL · bad day".
- **"Replay worst day" button**: switches to Live Sim tab with that day's `rngSeed` loaded.

### 8.3 Roster Designer

- **Top bar**: Auto-generate button, optimizer status text ("iteration 47 · best SL coverage: 96.2%"), Add shift / Clear buttons.
- **Demand curve overlay** above the Gantt — provides visual context for shift placement.
- **Shift Gantt rows**: each shift is a colored bar on a 24h timeline. Drag horizontally to move start time. Drag right edge to resize. Click to expand for break editing.
- **Coverage line** below the Gantt: green = scheduled coverage; white dashed = required (Erlang C). When scheduled drops below required, the gap shades red.
- **Optimizer**: simulated annealing over shift placement. Constraints: min 4h shift, max 10h shift, mandatory break for shifts ≥ 6h, HOOP coverage. **Total HC budget** defaults to the Erlang-C-derived Scheduled HC (see KPI strip) and is editable via a slider in the Roster top bar — letting the user ask "what if I only have 140 agents instead of 158?" Streams `best-so-far` to UI every 10 iterations so the search visibly improves.

### 8.4 Classic (preservation)

- The existing `WFMDemo` chart and KPI cards, ported into the cockpit chrome.
- Reads from the same `Scenario` state, so changing a slider in the sidebar updates Classic too.
- No simulation — pure Erlang C interval calc, like today.

## 9. Phasing

| Phase | Scope                                                   | Days | Demo-able output                                                   |
| ----- | ------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| 1     | Cockpit shell, data model, HOOP/curve controls, kernel v1 (no abandons), Classic tab | ~5   | Cockpit with new HOOP/curve controls feeding the existing math    |
| 2     | Canvas agent dots, scrubber, event injection, kernel v2 (abandons, breaks, ACW)      | ~5   | Full Live Sim — already mind-blowing on its own                   |
| 3     | Worker pool, fan chart, replay-worst-day                                              | ~3   | Monte Carlo tab functional                                        |
| 4     | Gantt shift editor, optimizer worker (simulated annealing), live coverage line       | ~5   | Full Roster Designer + auto-generate                              |

Total: ~18 build days, ~3–4 calendar weeks. Each phase ends in a demo-able state.

## 10. Tech stack

**Keep:**
- Next.js 16 (static export — current setup, do not change)
- React 19, TypeScript 5
- Chart.js 4 (for fan chart and demand curves)
- Tailwind 4

**Add:**
- Native Web Workers (no library)
- Canvas 2D for agent-dot grid (perf vs SVG/divs)
- `seedrandom` (~3 KB) for reproducible RNG

No other dependencies.

## 11. Out of scope (explicitly)

- Multi-day rosters / weekly view (single-day only for v1)
- Multi-skill routing (single-skill queue only)
- Real ACD data ingestion (presets + slider-driven inputs only)
- Multi-user collaboration / persistence beyond `localStorage`
- Outbound campaigns / blended modes
- Authentication / accounts
- Cost optimization beyond a derived "agents × hourly rate" total

## 12. Open questions for implementation phase

- Exact simulated-annealing parameters (cooling schedule, neighborhood definition) — will tune empirically in Phase 4.
- Abandon curve shape (linear ramp vs sigmoid) — decide during kernel v2 in Phase 2.
- Event-injection magnitudes for each preset — will draft sensible defaults during Phase 2 and tune via demo rehearsal.

---

## Appendix A · Killer demo script

1. Open cockpit → US Telco Manila is loaded by default.
2. **Live Sim tab**, press play at 60×. Watch the morning ramp — agent dots flip red as call volume rises. KPI strip shows SL holding at 82%.
3. Pause at 14:23. Click **Inject event → Typhoon**. Roster trims by 25%. Resume.
4. Audience watches dots go grey, queue counter spike to 50+, SL dial drop into the red.
5. Switch to **Monte Carlo tab**. The 1,000-day chart shows that 17% of days fall below SL. Click "Replay worst day" — back to Live Sim, that bad day plays out.
6. Switch to **Roster tab**. Click **Auto-generate**. Optimizer streams improvements — the room watches shifts slide into place. Final coverage matches demand.
7. Back to **Live Sim**. Re-run the typhoon scenario with the new roster. SL holds at 78%. The system absorbed the shock.

That's the 90-second demo. Three tabs, one scenario, full story.

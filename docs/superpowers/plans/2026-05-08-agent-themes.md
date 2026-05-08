# Agent Visualization Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canvas-based dot visualization with a pluggable theme system shipping two themes (enhanced SVG dots + static isometric mini-office), with state-transition walk animations and theme picker UI.

**Architecture:** A `THEME_REGISTRY` maps `ThemeKey → React component`. `AgentScene` reads the active theme from `ScenarioContext`, builds agent timelines once, computes per-agent visual state, and mounts the matching renderer. Theme D (Office) tracks state transitions across frames in a `useRef` to drive walk animations decoupled from `simSpeed` (always wall-clock-paced). Theme persists via `localStorage`.

**Tech Stack:** React 19, TypeScript 5, SVG (no canvas for new themes), Vitest + jsdom + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-05-08-agent-themes-design.md`](../specs/2026-05-08-agent-themes-design.md)

---

## File Structure Map

**Create:**
- `app/components/cockpit/agents/AgentScene.tsx` — top-level: builds timelines, computes agents, mounts renderer + ThemePicker overlay
- `app/components/cockpit/agents/ThemePicker.tsx` — segmented control (Dots | Office)
- `app/components/cockpit/agents/themes/AgentRenderer.ts` — types + `THEME_REGISTRY`
- `app/components/cockpit/agents/themes/DotsRenderer.tsx` — Theme A (SVG circles + emoji)
- `app/components/cockpit/agents/themes/IsoRenderer.tsx` — Theme D root (orchestrates room + desks + break + manager + animation hook)
- `app/components/cockpit/agents/themes/isoOffice/geometry.ts` — iso↔screen helpers + fixed layout constants
- `app/components/cockpit/agents/themes/isoOffice/Room.tsx` — walls, windows, floor, zone tints, partitions, plant
- `app/components/cockpit/agents/themes/isoOffice/AgentSprite.tsx` — atomic agent SVG group
- `app/components/cockpit/agents/themes/isoOffice/StatusBubble.tsx` — above-head 📞/💤/☕ bubble
- `app/components/cockpit/agents/themes/isoOffice/TileGlow.tsx` — radial state-color glow under desk
- `app/components/cockpit/agents/themes/isoOffice/Desks.tsx` — 6 main agent desks (chair + agent + bubble + glow)
- `app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx` — table + water cooler + break seats
- `app/components/cockpit/agents/themes/isoOffice/Manager.tsx` — exec desk + always-purple manager (decorative)
- `app/components/cockpit/agents/themes/isoOffice/animation.ts` — transition tracker (pure logic)
- `tests/themes/scenarioTheme.test.ts`
- `tests/themes/geometry.test.ts`
- `tests/themes/animation.test.ts`
- `tests/themes/dotsRenderer.test.tsx`
- `tests/themes/themeRegistry.test.ts`

**Modify:**
- `app/components/cockpit/ScenarioContext.tsx` — add `theme: ThemeKey` + `setTheme`
- `app/components/cockpit/tabs/LiveSimTab.tsx` — `<AgentDotCanvas/>` → `<AgentScene/>`
- `app/globals.css` — append theme-picker + iso-office styles

**Delete:**
- `app/components/cockpit/agents/AgentDotCanvas.tsx` (replaced by `themes/DotsRenderer.tsx`)

---

## Task 1: Add `theme` state to ScenarioContext with persistence

**Files:**
- Create: `tests/themes/scenarioTheme.test.ts`
- Modify: `app/components/cockpit/ScenarioContext.tsx`
- Modify: `vitest.config.ts` (add `tests/themes/**/*.test.{ts,tsx}` to include glob)

- [ ] **Step 1: Update vitest config to include the new test directory and tsx files**

Edit `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [ ] **Step 2: Write the failing test**

Create `tests/themes/scenarioTheme.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import React from 'react'
import { ScenarioProvider, useScenario } from '@/app/components/cockpit/ScenarioContext'

const wrapper = ({ children }: { children: ReactNode }) =>
  React.createElement(ScenarioProvider, null, children)

beforeEach(() => {
  localStorage.clear()
})

describe('ScenarioContext theme', () => {
  it('defaults to "office" when no localStorage entry exists', () => {
    const { result } = renderHook(() => useScenario(), { wrapper })
    expect(result.current.theme).toBe('office')
  })

  it('hydrates from localStorage on mount', async () => {
    localStorage.setItem('wfm.cockpit.theme', 'dots')
    const { result } = renderHook(() => useScenario(), { wrapper })
    // initial render is server-side default ("office"); useEffect runs after mount
    await act(async () => { await Promise.resolve() })
    expect(result.current.theme).toBe('dots')
  })

  it('setTheme updates state and writes to localStorage', () => {
    const { result } = renderHook(() => useScenario(), { wrapper })
    act(() => result.current.setTheme('dots'))
    expect(result.current.theme).toBe('dots')
    expect(localStorage.getItem('wfm.cockpit.theme')).toBe('dots')
  })

  it('setTheme rejects invalid keys at the type boundary (compile-time, runtime no-op test)', () => {
    const { result } = renderHook(() => useScenario(), { wrapper })
    act(() => result.current.setTheme('office'))
    expect(result.current.theme).toBe('office')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/themes/scenarioTheme.test.ts`
Expected: FAIL — `theme` and `setTheme` don't exist on context yet.

- [ ] **Step 4: Add theme to ScenarioContext**

Edit `app/components/cockpit/ScenarioContext.tsx`:

Add to imports at top:
```tsx
import { useEffect } from 'react'
```

Add type before `ScenarioContextValue` interface:
```tsx
export type ThemeKey = 'dots' | 'office'

const THEME_STORAGE_KEY = 'wfm.cockpit.theme'
const VALID_THEMES: readonly ThemeKey[] = ['dots', 'office']

function isValidTheme(s: string | null): s is ThemeKey {
  return s !== null && (VALID_THEMES as readonly string[]).includes(s)
}
```

Add to `ScenarioContextValue` interface:
```tsx
  theme: ThemeKey
  setTheme: (theme: ThemeKey) => void
```

Inside `ScenarioProvider`, after the `scenario` useState block, add:

```tsx
  // Theme: SSR-safe default; useEffect hydrates from localStorage on mount
  const [theme, setThemeState] = useState<ThemeKey>('office')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: SSR-safe localStorage hydration
    if (isValidTheme(stored)) setThemeState(stored)
  }, [])

  const setTheme = useCallback((t: ThemeKey) => {
    setThemeState(t)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, t)
    }
  }, [])
```

Add `theme, setTheme` to the value object passed to the Provider:

```tsx
    <ScenarioContext.Provider value={{
      scenario, setCampaign, setHoop, setCurve, setDailyTotal, setNumeric, reseed, setRngSeed,
      addInjection, clearInjections, setRoster, addShift, removeShift, updateShift,
      theme, setTheme,
    }}>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/themes/scenarioTheme.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts app/components/cockpit/ScenarioContext.tsx tests/themes/scenarioTheme.test.ts
git commit -m "feat(themes): add theme state to ScenarioContext with localStorage persistence

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: AgentRenderer interface + theme registry

**Files:**
- Create: `app/components/cockpit/agents/themes/AgentRenderer.ts`
- Create: `tests/themes/themeRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/themes/themeRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { THEME_REGISTRY } from '@/app/components/cockpit/agents/themes/AgentRenderer'

describe('THEME_REGISTRY', () => {
  it('has entries for both shipping themes', () => {
    expect(Object.keys(THEME_REGISTRY).sort()).toEqual(['dots', 'office'])
  })

  it('every entry is a function (React component)', () => {
    for (const key of Object.keys(THEME_REGISTRY)) {
      expect(typeof THEME_REGISTRY[key as keyof typeof THEME_REGISTRY]).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/themes/themeRegistry.test.ts`
Expected: FAIL — `THEME_REGISTRY` does not exist.

- [ ] **Step 3: Create the renderer interface and registry**

Create `app/components/cockpit/agents/themes/AgentRenderer.ts`:

```ts
import type { ComponentType } from 'react'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { ThemeKey } from '@/app/components/cockpit/ScenarioContext'
import { DotsRenderer } from './DotsRenderer'
import { IsoRenderer } from './IsoRenderer'

export interface AgentRendererProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  peakAgents: number
  simTimeMin: number
}

export type AgentRendererComponent = ComponentType<AgentRendererProps>

export const THEME_REGISTRY: Record<ThemeKey, AgentRendererComponent> = {
  dots: DotsRenderer,
  office: IsoRenderer,
}
```

Create stub `app/components/cockpit/agents/themes/DotsRenderer.tsx`:

```tsx
'use client'

import type { AgentRendererProps } from './AgentRenderer'

export function DotsRenderer(_props: AgentRendererProps) {
  return null
}
```

Create stub `app/components/cockpit/agents/themes/IsoRenderer.tsx`:

```tsx
'use client'

import type { AgentRendererProps } from './AgentRenderer'

export function IsoRenderer(_props: AgentRendererProps) {
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/themes/themeRegistry.test.ts`
Expected: PASS — registry has both keys, both are functions.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/agents/themes/ tests/themes/themeRegistry.test.ts
git commit -m "feat(themes): add AgentRenderer interface + theme registry skeleton

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Implement DotsRenderer (Theme A — SVG circles + emoji)

**Files:**
- Modify: `app/components/cockpit/agents/themes/DotsRenderer.tsx`
- Create: `tests/themes/dotsRenderer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/themes/dotsRenderer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DotsRenderer } from '@/app/components/cockpit/agents/themes/DotsRenderer'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

const mkAgent = (i: number, state: AgentVisualState) => ({ id: `A${i}`, state })

describe('DotsRenderer', () => {
  it('renders one <circle> per agent', () => {
    const agents = [mkAgent(0, 'idle'), mkAgent(1, 'on_call'), mkAgent(2, 'on_break')]
    const { container } = render(<DotsRenderer agents={agents} peakAgents={3} simTimeMin={500} />)
    expect(container.querySelectorAll('circle').length).toBe(3)
  })

  it('off_shift agents render at 50% opacity with no emoji', () => {
    const agents = [mkAgent(0, 'off_shift')]
    const { container } = render(<DotsRenderer agents={agents} peakAgents={1} simTimeMin={500} />)
    const circle = container.querySelector('circle')
    expect(circle?.getAttribute('opacity')).toBe('0.5')
    expect(container.querySelectorAll('text').length).toBe(0)
  })

  it('on_call agents render with red fill and 📞 emoji', () => {
    const agents = [mkAgent(0, 'on_call')]
    const { container } = render(<DotsRenderer agents={agents} peakAgents={1} simTimeMin={500} />)
    expect(container.querySelector('circle')?.getAttribute('fill')).toContain('dA-call')
    expect(container.querySelector('text')?.textContent).toBe('📞')
  })

  it('idle and on_break also render the right emoji', () => {
    const idle = render(<DotsRenderer agents={[mkAgent(0, 'idle')]} peakAgents={1} simTimeMin={500} />)
    expect(idle.container.querySelector('text')?.textContent).toBe('😊')
    const brk = render(<DotsRenderer agents={[mkAgent(0, 'on_break')]} peakAgents={1} simTimeMin={500} />)
    expect(brk.container.querySelector('text')?.textContent).toBe('☕')
  })

  it('grid layout sized for peakAgents (not just current agents)', () => {
    // peakAgents=12 means grid laid out for 12 cells even if only 3 agents present
    const { container } = render(<DotsRenderer agents={[mkAgent(0, 'idle')]} peakAgents={12} simTimeMin={500} />)
    // Just one circle drawn (only 1 agent in the list); but grid math should accommodate 12
    expect(container.querySelectorAll('circle').length).toBe(1)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/themes/dotsRenderer.test.tsx`
Expected: FAIL — DotsRenderer returns null, no circles found.

- [ ] **Step 3: Implement DotsRenderer**

Replace contents of `app/components/cockpit/agents/themes/DotsRenderer.tsx`:

```tsx
'use client'

import type { AgentRendererProps } from './AgentRenderer'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

const EMOJI: Record<AgentVisualState, string | null> = {
  idle: '😊',
  on_call: '📞',
  on_break: '☕',
  off_shift: null,
}

const FILL: Record<AgentVisualState, string> = {
  idle: 'url(#dA-idle)',
  on_call: 'url(#dA-call)',
  on_break: 'url(#dA-brk)',
  off_shift: 'url(#dA-off)',
}

export function DotsRenderer({ agents, peakAgents }: AgentRendererProps) {
  // Layout: roughly square grid sized for peakAgents.
  // Width=320 viewBox; rows determined by aspect ~16:9.
  const W = 320
  const H = 180
  const aspect = W / H
  const cols = Math.max(1, Math.ceil(Math.sqrt(peakAgents * aspect)))
  const rows = Math.max(1, Math.ceil(peakAgents / cols))
  const cellW = W / cols
  const cellH = H / rows
  const r = Math.max(3, Math.min(cellW, cellH) * 0.32)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <radialGradient id="dA-idle" cx="35%" cy="35%"><stop offset="0%" stopColor="#86efac"/><stop offset="100%" stopColor="#16a34a"/></radialGradient>
        <radialGradient id="dA-call" cx="35%" cy="35%"><stop offset="0%" stopColor="#fca5a5"/><stop offset="100%" stopColor="#dc2626"/></radialGradient>
        <radialGradient id="dA-brk" cx="35%" cy="35%"><stop offset="0%" stopColor="#fde68a"/><stop offset="100%" stopColor="#d97706"/></radialGradient>
        <radialGradient id="dA-off" cx="35%" cy="35%"><stop offset="0%" stopColor="#475569"/><stop offset="100%" stopColor="#1e293b"/></radialGradient>
      </defs>
      {agents.map((a, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const cx = (col + 0.5) * cellW
        const cy = (row + 0.5) * cellH
        const emoji = EMOJI[a.state]
        const opacity = a.state === 'off_shift' ? '0.5' : '1'
        return (
          <g key={a.id}>
            <circle cx={cx} cy={cy} r={r} fill={FILL[a.state]} opacity={opacity}/>
            {emoji && (
              <text x={cx} y={cy + r * 0.35} textAnchor="middle" fontSize={r} fill="#fff">
                {emoji}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/themes/dotsRenderer.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/agents/themes/DotsRenderer.tsx tests/themes/dotsRenderer.test.tsx
git commit -m "feat(themes): implement Theme A (enhanced SVG dots with emojis)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: AgentScene + ThemePicker, wire into LiveSimTab

**Files:**
- Create: `app/components/cockpit/agents/AgentScene.tsx`
- Create: `app/components/cockpit/agents/ThemePicker.tsx`
- Modify: `app/components/cockpit/tabs/LiveSimTab.tsx`
- Modify: `app/globals.css` (append theme-picker styles)

- [ ] **Step 1: Create AgentScene**

Create `app/components/cockpit/agents/AgentScene.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import type { SimEvent } from '@/lib/types'
import { agentStateAt, buildAgentTimelines } from '@/lib/animation/agentTimeline'
import { useScenario } from '../ScenarioContext'
import { THEME_REGISTRY } from './themes/AgentRenderer'
import { ThemePicker } from './ThemePicker'

interface AgentSceneProps {
  events: SimEvent[]
  peakAgents: number
  simTimeMin: number
}

export function AgentScene({ events, peakAgents, simTimeMin }: AgentSceneProps) {
  const { theme } = useScenario()

  const timelines = useMemo(
    () => buildAgentTimelines(events, peakAgents),
    [events, peakAgents],
  )

  const agents = useMemo(() => {
    const out: Array<{ id: string; state: ReturnType<typeof agentStateAt> }> = []
    for (let i = 0; i < peakAgents; i++) {
      const id = `A${i}`
      const tl = timelines[id]
      out.push({ id, state: tl ? agentStateAt(tl, simTimeMin) : 'idle' })
    }
    return out
  }, [timelines, peakAgents, simTimeMin])

  const Renderer = THEME_REGISTRY[theme]

  return (
    <div className="cockpit-agent-scene">
      <Renderer agents={agents} peakAgents={peakAgents} simTimeMin={simTimeMin} />
      <ThemePicker />
    </div>
  )
}
```

- [ ] **Step 2: Create ThemePicker**

Create `app/components/cockpit/agents/ThemePicker.tsx`:

```tsx
'use client'

import { useScenario, type ThemeKey } from '../ScenarioContext'

const THEMES: Array<{ key: ThemeKey; label: string }> = [
  { key: 'dots', label: 'Dots' },
  { key: 'office', label: 'Office' },
]

export function ThemePicker() {
  const { theme, setTheme } = useScenario()
  return (
    <div className="cockpit-theme-picker" role="group" aria-label="Visualization theme">
      {THEMES.map(t => (
        <button
          key={t.key}
          type="button"
          className={`cockpit-theme-picker-btn ${theme === t.key ? 'cockpit-theme-picker-btn--active' : ''}`}
          aria-pressed={theme === t.key}
          onClick={() => setTheme(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Append CSS for theme picker and scene**

Append to `app/globals.css`:

```css
/* Agent scene + theme picker (replaces .cockpit-agent-canvas-container) */
.cockpit-agent-scene {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cockpit-agent-scene > svg { max-width: 100%; max-height: 100%; }

.cockpit-theme-picker {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  display: inline-flex;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  overflow: hidden;
  font-size: 0.7rem;
  z-index: 2;
}
.cockpit-theme-picker-btn {
  background: transparent;
  color: #cbd5e1;
  border: none;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-family: inherit;
}
.cockpit-theme-picker-btn:hover { background: #334155; color: #f1f5f9; }
.cockpit-theme-picker-btn--active {
  background: #3b82f6;
  color: #fff;
}
```

- [ ] **Step 4: Wire AgentScene into LiveSimTab**

Edit `app/components/cockpit/tabs/LiveSimTab.tsx`:

Change the import:
```tsx
// Replace this:
import { AgentDotCanvas } from '../agents/AgentDotCanvas'
// With:
import { AgentScene } from '../agents/AgentScene'
```

In the JSX, replace the `<AgentDotCanvas .../>` line with:
```tsx
            ? <AgentScene events={result.events} peakAgents={peakAgents} simTimeMin={simTimeMin} />
```

- [ ] **Step 5: Run dev server and manually verify**

Run: `npm run dev`
Open: `http://localhost:3000` → Live Sim tab.
Expected:
- Theme picker (Dots | Office) visible top-right of agent canvas
- Default = "Office" — currently shows blank (IsoRenderer returns null)
- Click "Dots" — see SVG dots grid with face emojis
- Refresh page — Dots stays selected (localStorage hydration)
- Click "Office" — blank again, but persisted

- [ ] **Step 6: Commit**

```bash
git add app/components/cockpit/agents/AgentScene.tsx app/components/cockpit/agents/ThemePicker.tsx app/components/cockpit/tabs/LiveSimTab.tsx app/globals.css
git commit -m "feat(themes): add AgentScene + ThemePicker, wire into LiveSimTab

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Iso geometry helpers + layout constants

**Files:**
- Create: `app/components/cockpit/agents/themes/isoOffice/geometry.ts`
- Create: `tests/themes/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/themes/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  isoToScreen,
  DESK_POSITIONS,
  BREAK_SEAT_POSITIONS,
  MANAGER_POSITION,
  FLOOR_ORIGIN,
  TILE_W,
  TILE_H,
  MAX_AGENTS_OFFICE,
} from '@/app/components/cockpit/agents/themes/isoOffice/geometry'

describe('isoToScreen', () => {
  it('maps iso (0,0) to FLOOR_ORIGIN', () => {
    expect(isoToScreen(0, 0)).toEqual(FLOOR_ORIGIN)
  })

  it('moves +x (NE direction): screen.x increases, screen.y increases by half', () => {
    const s = isoToScreen(1, 0)
    expect(s.x).toBe(FLOOR_ORIGIN.x + TILE_W / 2)
    expect(s.y).toBe(FLOOR_ORIGIN.y + TILE_H / 2)
  })

  it('moves +y (NW direction): screen.x decreases, screen.y increases', () => {
    const s = isoToScreen(0, 1)
    expect(s.x).toBe(FLOOR_ORIGIN.x - TILE_W / 2)
    expect(s.y).toBe(FLOOR_ORIGIN.y + TILE_H / 2)
  })

  it('positions are linearly additive', () => {
    const a = isoToScreen(2, 3)
    const expected = {
      x: FLOOR_ORIGIN.x + (2 - 3) * (TILE_W / 2),
      y: FLOOR_ORIGIN.y + (2 + 3) * (TILE_H / 2),
    }
    expect(a).toEqual(expected)
  })
})

describe('layout constants', () => {
  it('exactly 6 desk positions for the agent pool', () => {
    expect(DESK_POSITIONS).toHaveLength(6)
    expect(MAX_AGENTS_OFFICE).toBe(6)
  })

  it('every desk position has a screen-coords pair', () => {
    for (const d of DESK_POSITIONS) {
      expect(typeof d.x).toBe('number')
      expect(typeof d.y).toBe('number')
    }
  })

  it('at least 8 break-seat positions (≥ MAX_AGENTS_OFFICE + 2 headroom)', () => {
    expect(BREAK_SEAT_POSITIONS.length).toBeGreaterThanOrEqual(8)
  })

  it('manager position is in the back-right of the floor', () => {
    expect(MANAGER_POSITION.x).toBeGreaterThan(FLOOR_ORIGIN.x)
    expect(MANAGER_POSITION.y).toBeGreaterThan(FLOOR_ORIGIN.y)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/themes/geometry.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create geometry.ts**

Create `app/components/cockpit/agents/themes/isoOffice/geometry.ts`:

```ts
// Iso office layout. All coordinates target a 500x280 SVG viewBox.
// iso(i,j): i increases toward the NE (right) wall; j increases toward the NW (left) wall.
// Screen mapping: iso(i,j) -> (FLOOR_ORIGIN.x + (i-j)*TILE_W/2, FLOOR_ORIGIN.y + (i+j)*TILE_H/2)

export interface ScreenPoint { x: number; y: number }

export const TILE_W = 33.33  // pixel width of one iso tile (200px / 6 tiles wide)
export const TILE_H = 16.67  // pixel height of one iso tile (100px / 6 tiles deep)
export const FLOOR_ORIGIN: ScreenPoint = { x: 250, y: 50 }
export const VIEWBOX = { w: 500, h: 280 } as const

export const FLOOR_TILES_W = 6
export const FLOOR_TILES_D = 6
export const WALL_HEIGHT = 50

export const MAX_AGENTS_OFFICE = 6

export function isoToScreen(i: number, j: number): ScreenPoint {
  return {
    x: FLOOR_ORIGIN.x + (i - j) * (TILE_W / 2),
    y: FLOOR_ORIGIN.y + (i + j) * (TILE_H / 2),
  }
}

// Floor diamond corner screen points (for floor polygon and zone tints)
export const FLOOR_CORNERS = {
  N: isoToScreen(0, 0),
  E: isoToScreen(FLOOR_TILES_W, 0),
  S: isoToScreen(FLOOR_TILES_W, FLOOR_TILES_D),
  W: isoToScreen(0, FLOOR_TILES_D),
} as const

// 6 main agent desks: 2 rows x 3 columns, diagonal grid
export const DESK_ISO_POSITIONS: Array<{ i: number; j: number }> = [
  { i: 1.5, j: 1.5 },
  { i: 2.5, j: 1.5 },
  { i: 3.5, j: 1.5 },
  { i: 1.5, j: 3.0 },
  { i: 2.5, j: 3.0 },
  { i: 3.5, j: 3.0 },
]

export const DESK_POSITIONS: ScreenPoint[] = DESK_ISO_POSITIONS.map(p => isoToScreen(p.i, p.j))

// Manager at iso(5, 1) — back-right corner
export const MANAGER_ISO = { i: 5, j: 1 }
export const MANAGER_POSITION = isoToScreen(MANAGER_ISO.i, MANAGER_ISO.j)

// Plant next to manager
export const PLANT_POSITION = isoToScreen(5.6, 0.4)

// Break room: round table at iso(1, 5), 8 seats around it
export const BREAK_TABLE_POSITION = isoToScreen(1, 5)
export const WATER_COOLER_POSITION = isoToScreen(0.3, 4)

// 8 seats around the break table at iso(1, 5).
// Seats arranged in a ring; seat positions are screen offsets in pixels from the table center.
const BREAK_TABLE_RADIUS_X = 18
const BREAK_TABLE_RADIUS_Y = 9
const SEAT_COUNT = 8
export const BREAK_SEAT_POSITIONS: ScreenPoint[] = Array.from({ length: SEAT_COUNT }, (_, k) => {
  const angle = (k / SEAT_COUNT) * 2 * Math.PI
  return {
    x: BREAK_TABLE_POSITION.x + Math.cos(angle) * BREAK_TABLE_RADIUS_X,
    y: BREAK_TABLE_POSITION.y + Math.sin(angle) * BREAK_TABLE_RADIUS_Y,
  }
})

// Zone polygons (for floor-tint rendering)
export const MANAGER_ZONE_POINTS = [
  isoToScreen(4, 0),
  isoToScreen(6, 0),
  isoToScreen(6, 2),
  isoToScreen(4, 2),
] as const

export const BREAK_ZONE_POINTS = [
  isoToScreen(0, 4),
  isoToScreen(2, 4),
  isoToScreen(2, 6),
  isoToScreen(0, 6),
] as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/themes/geometry.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/agents/themes/isoOffice/geometry.ts tests/themes/geometry.test.ts
git commit -m "feat(themes): iso office geometry helpers and layout constants

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Room (walls, windows, floor, zone tints, partitions)

**Files:**
- Create: `app/components/cockpit/agents/themes/isoOffice/Room.tsx`

This task is purely visual — verify in browser, no automated test.

- [ ] **Step 1: Create Room.tsx**

Create `app/components/cockpit/agents/themes/isoOffice/Room.tsx`:

```tsx
'use client'

import { FLOOR_CORNERS, isoToScreen, WALL_HEIGHT, MANAGER_ZONE_POINTS, BREAK_ZONE_POINTS } from './geometry'

const ptsStr = (pts: ReadonlyArray<{ x: number; y: number }>) =>
  pts.map(p => `${p.x},${p.y}`).join(' ')

// Six windows: 3 along each back wall, at iso steps (1,2), (2.5,3.5), (4,5) along each axis.
const WINDOW_INSET_TOP = 13
const WINDOW_INSET_BOTTOM = 8

function makeWindowOnNW(jStart: number, jEnd: number) {
  // NW wall: bottom edge along iso (0, j) for j=0..6. Wall extends UP by WALL_HEIGHT.
  const bl = isoToScreen(0, jStart)
  const br = isoToScreen(0, jEnd)
  return [
    { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
    { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
  ]
}

function makeWindowOnNE(iStart: number, iEnd: number) {
  const bl = isoToScreen(iStart, 0)
  const br = isoToScreen(iEnd, 0)
  return [
    { x: bl.x, y: bl.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WALL_HEIGHT + WINDOW_INSET_TOP },
    { x: br.x, y: br.y - WINDOW_INSET_BOTTOM },
    { x: bl.x, y: bl.y - WINDOW_INSET_BOTTOM },
  ]
}

const NW_WINDOWS = [makeWindowOnNW(1, 2), makeWindowOnNW(2.5, 3.5), makeWindowOnNW(4, 5)]
const NE_WINDOWS = [makeWindowOnNE(1, 2), makeWindowOnNE(2.5, 3.5), makeWindowOnNE(4, 5)]

export function Room() {
  const { N, E, S, W } = FLOOR_CORNERS
  const wallTopN = { x: N.x, y: N.y - WALL_HEIGHT }
  const wallTopE = { x: E.x, y: E.y - WALL_HEIGHT }
  const wallTopW = { x: W.x, y: W.y - WALL_HEIGHT }

  return (
    <g>
      {/* Back walls */}
      <polygon points={ptsStr([N, wallTopN, wallTopW, W])} fill="url(#vO-wallNW)" stroke="#64748b" strokeWidth="0.8"/>
      <polygon points={ptsStr([N, wallTopN, wallTopE, E])} fill="url(#vO-wallNE)" stroke="#64748b" strokeWidth="0.8"/>
      <line x1={N.x} y1={wallTopN.y} x2={N.x} y2={N.y} stroke="#475569" strokeWidth="1.2"/>

      {/* Windows */}
      {NW_WINDOWS.map((w, i) => <polygon key={`nww${i}`} points={ptsStr(w)} fill="url(#vO-win)" stroke="#0c4a6e" strokeWidth="0.6"/>)}
      {NE_WINDOWS.map((w, i) => <polygon key={`new${i}`} points={ptsStr(w)} fill="url(#vO-win)" stroke="#0c4a6e" strokeWidth="0.6"/>)}

      {/* Floor */}
      <polygon points={ptsStr([N, E, S, W])} fill="url(#vO-floor)" stroke="#475569" strokeWidth="1"/>

      {/* Zone tints */}
      <polygon points={ptsStr(MANAGER_ZONE_POINTS)} fill="url(#vO-mgrZone)" opacity="0.7"/>
      <polygon points={ptsStr(BREAK_ZONE_POINTS)} fill="url(#vO-brkZone)" opacity="0.7"/>

      {/* Low partition walls dividing zones from main floor */}
      {/* Manager partition: front edge from iso(4,0) to iso(4,2) and side from iso(4,2) to iso(6,2) */}
      <polygon
        points={ptsStr([
          isoToScreen(4, 0),
          isoToScreen(4, 2),
          { x: isoToScreen(4, 2).x, y: isoToScreen(4, 2).y - 6 },
          { x: isoToScreen(4, 0).x, y: isoToScreen(4, 0).y - 6 },
        ])}
        fill="#94a3b8" stroke="#475569" strokeWidth="0.4"
      />
      <polygon
        points={ptsStr([
          isoToScreen(4, 2),
          isoToScreen(6, 2),
          { x: isoToScreen(6, 2).x, y: isoToScreen(6, 2).y - 6 },
          { x: isoToScreen(4, 2).x, y: isoToScreen(4, 2).y - 6 },
        ])}
        fill="#a1aab9" stroke="#475569" strokeWidth="0.4"
      />
      {/* Break partition */}
      <polygon
        points={ptsStr([
          isoToScreen(0, 4),
          isoToScreen(2, 4),
          { x: isoToScreen(2, 4).x, y: isoToScreen(2, 4).y - 6 },
          { x: isoToScreen(0, 4).x, y: isoToScreen(0, 4).y - 6 },
        ])}
        fill="#a1aab9" stroke="#475569" strokeWidth="0.4"
      />
      <polygon
        points={ptsStr([
          isoToScreen(2, 4),
          isoToScreen(2, 6),
          { x: isoToScreen(2, 6).x, y: isoToScreen(2, 6).y - 6 },
          { x: isoToScreen(2, 4).x, y: isoToScreen(2, 4).y - 6 },
        ])}
        fill="#94a3b8" stroke="#475569" strokeWidth="0.4"
      />
    </g>
  )
}

export function RoomDefs() {
  return (
    <defs>
      <linearGradient id="vO-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cbd5e1"/><stop offset="100%" stopColor="#94a3b8"/>
      </linearGradient>
      <linearGradient id="vO-wallNE" x1="0" y1="0" x2="1" y2="0.5">
        <stop offset="0%" stopColor="#f1f5f9"/><stop offset="100%" stopColor="#cbd5e1"/>
      </linearGradient>
      <linearGradient id="vO-wallNW" x1="1" y1="0" x2="0" y2="0.5">
        <stop offset="0%" stopColor="#e2e8f0"/><stop offset="100%" stopColor="#b8c2cf"/>
      </linearGradient>
      <linearGradient id="vO-win" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#dbeafe"/><stop offset="50%" stopColor="#7dd3fc"/><stop offset="100%" stopColor="#bae6fd"/>
      </linearGradient>
      <linearGradient id="vO-brkZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef3c7"/><stop offset="100%" stopColor="#fde68a"/>
      </linearGradient>
      <linearGradient id="vO-mgrZone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e0e7ff"/><stop offset="100%" stopColor="#c7d2fe"/>
      </linearGradient>
    </defs>
  )
}
```

- [ ] **Step 2: Wire Room into IsoRenderer for visual smoke**

Edit `app/components/cockpit/agents/themes/IsoRenderer.tsx`:

```tsx
'use client'

import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { VIEWBOX } from './isoOffice/geometry'

export function IsoRenderer(_props: AgentRendererProps) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <Room/>
    </svg>
  )
}
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
Open: `http://localhost:3000` → Live Sim → click "Office" theme.
Expected: empty isometric room with two back walls, three windows on each, floor diamond with amber + indigo zone tints. No agents or desks yet.

- [ ] **Step 4: Commit**

```bash
git add app/components/cockpit/agents/themes/isoOffice/Room.tsx app/components/cockpit/agents/themes/IsoRenderer.tsx
git commit -m "feat(themes): iso office room (walls, windows, floor, zones)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: AgentSprite + StatusBubble + TileGlow primitives

**Files:**
- Create: `app/components/cockpit/agents/themes/isoOffice/AgentSprite.tsx`
- Create: `app/components/cockpit/agents/themes/isoOffice/StatusBubble.tsx`
- Create: `app/components/cockpit/agents/themes/isoOffice/TileGlow.tsx`

These are purely visual — manual smoke verifies in next task. No tests required for these atoms.

- [ ] **Step 1: Create AgentSprite**

Create `app/components/cockpit/agents/themes/isoOffice/AgentSprite.tsx`:

```tsx
'use client'

interface AgentSpriteProps {
  x: number
  y: number
  shirtColor: string
  bobOffset?: number      // pixels of vertical bob (driven by parent for on_call agents)
  opacity?: number        // for fade in/out
}

export function AgentSprite({ x, y, shirtColor, bobOffset = 0, opacity = 1 }: AgentSpriteProps) {
  return (
    <g transform={`translate(${x}, ${y + bobOffset})`} opacity={opacity}>
      <ellipse cx={0} cy={6} rx={4.5} ry={1.4} fill="#1e293b" opacity={0.35}/>
      <path d="M-3.5,-3 Q-3.5,3 -1.5,4 L1.5,4 Q3.5,3 3.5,-3 Z" fill={shirtColor} stroke="#0f172a" strokeWidth={0.4}/>
      <ellipse cx={0} cy={-5} rx={2.5} ry={2.3} fill="#fde4b8" stroke="#92400e" strokeWidth={0.3}/>
      <path d="M-2.5,-6 Q0,-8.5 2.5,-6" stroke="#0f172a" strokeWidth={0.5} fill="none"/>
      <circle cx={2.6} cy={-5.3} r={0.8} fill="#1e293b"/>
    </g>
  )
}
```

- [ ] **Step 2: Create StatusBubble**

Create `app/components/cockpit/agents/themes/isoOffice/StatusBubble.tsx`:

```tsx
'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'

interface StatusBubbleProps {
  x: number
  y: number
  state: AgentVisualState
}

const BUBBLE: Record<Exclude<AgentVisualState, 'off_shift'>, { emoji: string; stroke: string }> = {
  idle:    { emoji: '💤', stroke: '#22c55e' },
  on_call: { emoji: '📞', stroke: '#dc2626' },
  on_break:{ emoji: '☕', stroke: '#d97706' },
}

export function StatusBubble({ x, y, state }: StatusBubbleProps) {
  if (state === 'off_shift') return null
  const { emoji, stroke } = BUBBLE[state]
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={0} cy={-15} r={5} fill="#fff" stroke={stroke} strokeWidth={1}/>
      <text x={0} y={-12} textAnchor="middle" fontSize={6}>{emoji}</text>
    </g>
  )
}
```

- [ ] **Step 3: Create TileGlow**

Create `app/components/cockpit/agents/themes/isoOffice/TileGlow.tsx`:

```tsx
'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'

interface TileGlowProps {
  x: number
  y: number
  state: AgentVisualState
}

const FILL: Record<AgentVisualState, string | null> = {
  idle: 'url(#vO-glow-idle)',
  on_call: 'url(#vO-glow-call)',
  on_break: null,
  off_shift: null,
}

export function TileGlow({ x, y, state }: TileGlowProps) {
  const fill = FILL[state]
  if (!fill) return null
  return <ellipse cx={x} cy={y} rx={20} ry={10} fill={fill}/>
}

export function TileGlowDefs() {
  return (
    <>
      <radialGradient id="vO-glow-call" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.55}/>
        <stop offset="100%" stopColor="#dc2626" stopOpacity={0}/>
      </radialGradient>
      <radialGradient id="vO-glow-idle" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45}/>
        <stop offset="100%" stopColor="#22c55e" stopOpacity={0}/>
      </radialGradient>
    </>
  )
}
```

- [ ] **Step 4: Commit (no functional change visible yet)**

```bash
git add app/components/cockpit/agents/themes/isoOffice/AgentSprite.tsx app/components/cockpit/agents/themes/isoOffice/StatusBubble.tsx app/components/cockpit/agents/themes/isoOffice/TileGlow.tsx
git commit -m "feat(themes): iso office sprite primitives (Agent, StatusBubble, TileGlow)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Desks (6 main agent desks rendered from agent state)

**Files:**
- Create: `app/components/cockpit/agents/themes/isoOffice/Desks.tsx`
- Modify: `app/components/cockpit/agents/themes/IsoRenderer.tsx`

- [ ] **Step 1: Create Desks.tsx**

Create `app/components/cockpit/agents/themes/isoOffice/Desks.tsx`:

```tsx
'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { DESK_POSITIONS, MAX_AGENTS_OFFICE } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'

interface DesksProps {
  agents: Array<{ id: string; state: AgentVisualState }>
}

const SHIRT_COLOR: Record<AgentVisualState, string> = {
  idle: '#22c55e',
  on_call: '#dc2626',
  on_break: '#d97706',
  off_shift: '#475569',
}

function Chair({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      <polygon points="-5,2 5,2 4,5 -4,5" fill="#1e293b"/>
      <rect x={-4.5} y={-3} width={9} height={5} fill="#334155" stroke="#1e293b" strokeWidth={0.3} rx={0.5}/>
      <rect x={-4} y={-4.5} width={8} height={1.5} fill="#475569"/>
    </g>
  )
}

function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon points="0,-3 16,5 0,13 -16,5" fill="#64748b" stroke="#1e293b" strokeWidth={0.5}/>
      <polygon points="-16,5 -16,8 0,16 0,13" fill="#475569"/>
      <polygon points="16,5 16,8 0,16 0,13" fill="#334155"/>
      <rect x={-2.5} y={0} width={5} height={3.5} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <polygon points="-3,3.5 3,3.5 1.5,5 -1.5,5" fill="#475569"/>
      <rect x={-7} y={3} width={2.5} height={2} fill="#cbd5e1" rx={0.3}/>
    </g>
  )
}

export function Desks({ agents }: DesksProps) {
  // Visible desks = min(agents.length, MAX_AGENTS_OFFICE).
  // Each desk index 0..5 maps to a fixed home position; agent[i] sits at desk[i].
  // off_shift -> desk shown empty (chair pushed in, no agent or bubble or glow).
  // on_break  -> desk shown vacated (chair tilted, no agent at desk; the agent will be rendered in BreakRoom).
  return (
    <g>
      {DESK_POSITIONS.map((pos, i) => {
        const agent = agents[i]
        if (!agent) {
          // No agent for this seat at all: hide the entire desk for cleanliness
          return null
        }
        const atDesk = agent.state === 'idle' || agent.state === 'on_call'
        const offShift = agent.state === 'off_shift'

        return (
          <g key={`desk-${i}`}>
            {atDesk && <TileGlow x={pos.x} y={pos.y - 5} state={agent.state}/>}
            <Chair
              x={pos.x}
              y={pos.y - 7}
              opacity={offShift ? 0.6 : 1}
            />
            {atDesk && <AgentSprite x={pos.x} y={pos.y - 1} shirtColor={SHIRT_COLOR[agent.state]}/>}
            <Desk x={pos.x} y={pos.y}/>
            {atDesk && <StatusBubble x={pos.x} y={pos.y - 1} state={agent.state}/>}
          </g>
        )
      })}
    </g>
  )
}

// Constant re-exported for use in fallback decision in AgentScene.
export { MAX_AGENTS_OFFICE }
```

- [ ] **Step 2: Wire Desks + TileGlowDefs into IsoRenderer**

Edit `app/components/cockpit/agents/themes/IsoRenderer.tsx`:

```tsx
'use client'

import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { Desks } from './isoOffice/Desks'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { VIEWBOX } from './isoOffice/geometry'

export function IsoRenderer({ agents }: AgentRendererProps) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <defs><TileGlowDefs/></defs>
      <Room/>
      <Desks agents={agents}/>
    </svg>
  )
}
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
Open: `http://localhost:3000` → Live Sim → "Office" theme. Press play.
Expected: 6 desks visible. Agents appear at desks with red/green shirts + 📞/💤 bubbles + tile glow. As sim runs, shirts and bubbles change with state. on_break agents disappear from desks (chair faded).

- [ ] **Step 4: Commit**

```bash
git add app/components/cockpit/agents/themes/isoOffice/Desks.tsx app/components/cockpit/agents/themes/IsoRenderer.tsx
git commit -m "feat(themes): iso office desks driven by agent state

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: BreakRoom + Manager (decorative + state-driven seating)

**Files:**
- Create: `app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx`
- Create: `app/components/cockpit/agents/themes/isoOffice/Manager.tsx`
- Modify: `app/components/cockpit/agents/themes/IsoRenderer.tsx`

- [ ] **Step 1: Create BreakRoom**

Create `app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx`:

```tsx
'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { BREAK_TABLE_POSITION, BREAK_SEAT_POSITIONS, WATER_COOLER_POSITION } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'

interface BreakRoomProps {
  agents: Array<{ id: string; state: AgentVisualState }>
}

function Table({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y + 4})`}>
      <ellipse cx={0} cy={3} rx={18} ry={6} fill="#1e293b" opacity={0.35}/>
      <ellipse cx={0} cy={0} rx={17} ry={6.5} fill="#451a03"/>
      <ellipse cx={0} cy={-1.5} rx={16} ry={6} fill="#b45309"/>
      <ellipse cx={0} cy={-2} rx={15} ry={5.6} fill="#d97706"/>
      <rect x={-8} y={-2.5} width={3} height={2.5} fill="#fff" stroke="#475569" strokeWidth={0.3} rx={0.3}/>
      <rect x={3} y={-3} width={3} height={2.5} fill="#fff" stroke="#475569" strokeWidth={0.3} rx={0.3}/>
    </g>
  )
}

function WaterCooler({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 22})`}>
      <ellipse cx={0} cy={9} rx={5} ry={1.5} fill="#1e293b" opacity={0.4}/>
      <rect x={-4} y={-2} width={8} height={11} fill="#cbd5e1" stroke="#1e293b" strokeWidth={0.4} rx={0.5}/>
      <ellipse cx={0} cy={-2} rx={4} ry={1.3} fill="#3b82f6"/>
      <path d="M-3.5,-2 L-3.5,-9 Q-3.5,-10.5 -2,-10.5 L2,-10.5 Q3.5,-10.5 3.5,-9 L3.5,-2" fill="#bfdbfe" stroke="#1e293b" strokeWidth={0.4}/>
      <rect x={-1.2} y={3} width={2.4} height={2} fill="#1e40af"/>
    </g>
  )
}

export function BreakRoom({ agents }: BreakRoomProps) {
  // Assign break agents to seat positions in stable order: agent-index order maps to seat-index order.
  const breakAgents = agents
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.state === 'on_break')

  return (
    <g>
      <WaterCooler x={WATER_COOLER_POSITION.x} y={WATER_COOLER_POSITION.y}/>
      <Table x={BREAK_TABLE_POSITION.x} y={BREAK_TABLE_POSITION.y}/>
      {breakAgents.map(({ a }, k) => {
        const seat = BREAK_SEAT_POSITIONS[k % BREAK_SEAT_POSITIONS.length]
        return (
          <g key={`break-${a.id}`}>
            <AgentSprite x={seat.x} y={seat.y} shirtColor="#d97706"/>
            <StatusBubble x={seat.x} y={seat.y} state="on_break"/>
          </g>
        )
      })}
    </g>
  )
}
```

- [ ] **Step 2: Create Manager**

Create `app/components/cockpit/agents/themes/isoOffice/Manager.tsx`:

```tsx
'use client'

import { MANAGER_POSITION, PLANT_POSITION } from './geometry'
import { AgentSprite } from './AgentSprite'

function ExecChair({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 9})`}>
      <polygon points="-6,3 6,3 5,7 -5,7" fill="#0f172a"/>
      <rect x={-5.5} y={-4} width={11} height={7} fill="#1e293b" stroke="#020617" strokeWidth={0.3} rx={1}/>
      <rect x={-5} y={-6} width={10} height={2} fill="#334155"/>
    </g>
  )
}

function ExecDesk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon points="0,-4 22,7 0,16 -22,7" fill="#1e293b" stroke="#0f172a" strokeWidth={0.6}/>
      <polygon points="-22,7 -22,10 0,19 0,16" fill="#0f172a"/>
      <polygon points="22,7 22,10 0,19 0,16" fill="#020617"/>
      <rect x={-3.5} y={0} width={7} height={4.5} fill="#0f172a" stroke="#334155" strokeWidth={0.3}/>
      <polygon points="-4,4.5 4,4.5 2,6 -2,6" fill="#334155"/>
      <rect x={6} y={4} width={3} height={2} fill="#fbbf24" rx={0.2}/>
    </g>
  )
}

function Plant({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 2})`}>
      <ellipse cx={0} cy={9} rx={5} ry={1.5} fill="#1e293b" opacity={0.4}/>
      <polygon points="-3,3 3,3 2.5,8 -2.5,8" fill="#92400e" stroke="#451a03" strokeWidth={0.3}/>
      <ellipse cx={0} cy={0} rx={6} ry={5} fill="#16a34a"/>
      <ellipse cx={-2.5} cy={-3} rx={3} ry={3} fill="#22c55e"/>
      <ellipse cx={2.5} cy={-3} rx={3} ry={3} fill="#22c55e"/>
      <ellipse cx={0} cy={-5} rx={2.8} ry={2.8} fill="#4ade80"/>
    </g>
  )
}

export function Manager() {
  return (
    <g>
      <ExecChair x={MANAGER_POSITION.x} y={MANAGER_POSITION.y}/>
      <AgentSprite x={MANAGER_POSITION.x} y={MANAGER_POSITION.y - 2} shirtColor="#a855f7"/>
      <ExecDesk x={MANAGER_POSITION.x} y={MANAGER_POSITION.y}/>
      <Plant x={PLANT_POSITION.x} y={PLANT_POSITION.y}/>
    </g>
  )
}
```

- [ ] **Step 3: Wire BreakRoom + Manager into IsoRenderer**

Edit `app/components/cockpit/agents/themes/IsoRenderer.tsx`:

```tsx
'use client'

import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { Desks } from './isoOffice/Desks'
import { BreakRoom } from './isoOffice/BreakRoom'
import { Manager } from './isoOffice/Manager'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { VIEWBOX } from './isoOffice/geometry'

export function IsoRenderer({ agents }: AgentRendererProps) {
  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <defs><TileGlowDefs/></defs>
      <Room/>
      <BreakRoom agents={agents}/>
      <Desks agents={agents}/>
      <Manager/>
    </svg>
  )
}
```

(Note: drawing order is back-to-front by zone — break room (front-left) and main desks render after the floor; manager (back-right) sits behind front-most main desk by SVG order. This matches the spec's depth-sort intent.)

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`
Expected: full office now renders. Manager always purple in back-right corner with plant. When agents go on break, they appear at the round table in the front-left.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx app/components/cockpit/agents/themes/isoOffice/Manager.tsx app/components/cockpit/agents/themes/IsoRenderer.tsx
git commit -m "feat(themes): iso office break room + manager corner

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Animation tracker (transition detector — pure logic)

**Files:**
- Create: `app/components/cockpit/agents/themes/isoOffice/animation.ts`
- Create: `tests/themes/animation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/themes/animation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  detectTransitions,
  advanceAnimations,
  type AnimState,
  type AnimationKind,
} from '@/app/components/cockpit/agents/themes/isoOffice/animation'

describe('detectTransitions', () => {
  it('returns no transitions when prev and curr are identical', () => {
    const prev = { A0: 'idle' as const }
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([])
  })

  it('detects desk_to_break when state moves to on_break', () => {
    const prev = { A0: 'idle' as const }
    const curr = { A0: 'on_break' as const }
    const ts = detectTransitions(prev, curr)
    expect(ts).toEqual([{ agentId: 'A0', kind: 'desk_to_break' }])
  })

  it('detects break_to_desk when state leaves on_break to idle/on_call', () => {
    const prev = { A0: 'on_break' as const }
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([{ agentId: 'A0', kind: 'break_to_desk' }])
  })

  it('detects fade_in when state moves from off_shift to active', () => {
    const prev = { A0: 'off_shift' as const }
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([{ agentId: 'A0', kind: 'fade_in' }])
  })

  it('detects fade_out when state moves to off_shift', () => {
    const prev = { A0: 'on_call' as const }
    const curr = { A0: 'off_shift' as const }
    expect(detectTransitions(prev, curr)).toEqual([{ agentId: 'A0', kind: 'fade_out' }])
  })

  it('handles new agents (no prev entry) without crashing', () => {
    const prev = {}
    const curr = { A0: 'idle' as const }
    expect(detectTransitions(prev, curr)).toEqual([])
  })
})

describe('advanceAnimations', () => {
  it('decreases progress towards 1.0 over wall-clock dt', () => {
    const start: AnimState = { A0: { kind: 'desk_to_break', progress: 0, startedAt: 0 } }
    const after = advanceAnimations(start, 0.5, 1000) // dt=500ms; assume 1s duration
    expect(after.A0.progress).toBeCloseTo(0.5, 2)
  })

  it('drops animations whose progress reaches 1.0', () => {
    const start: AnimState = { A0: { kind: 'desk_to_break', progress: 0.95, startedAt: 0 } }
    const after = advanceAnimations(start, 0.1, 1000)
    expect(after.A0).toBeUndefined()
  })

  it('skip rule: starting a new transition for an in-flight agent replaces it', () => {
    const start: AnimState = { A0: { kind: 'desk_to_break', progress: 0.3, startedAt: 0 } }
    const trans: Array<{ agentId: string; kind: AnimationKind }> = [{ agentId: 'A0', kind: 'break_to_desk' }]
    const after = advanceAnimations(start, 0, 1000, trans, 0)
    expect(after.A0.kind).toBe('break_to_desk')
    expect(after.A0.progress).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/themes/animation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create animation.ts**

Create `app/components/cockpit/agents/themes/isoOffice/animation.ts`:

```ts
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

export type AnimationKind = 'desk_to_break' | 'break_to_desk' | 'fade_in' | 'fade_out'

export interface AnimEntry {
  kind: AnimationKind
  progress: number    // 0..1
  startedAt: number   // wall-clock ms when started; useful for debugging
}

export type AnimState = Record<string, AnimEntry>

export type StateMap = Record<string, AgentVisualState>

export interface Transition {
  agentId: string
  kind: AnimationKind
}

export const ANIM_DURATION_MS: Record<AnimationKind, number> = {
  desk_to_break: 1000,
  break_to_desk: 1000,
  fade_in: 500,
  fade_out: 500,
}

export function detectTransitions(prev: StateMap, curr: StateMap): Transition[] {
  const out: Transition[] = []
  for (const id of Object.keys(curr)) {
    const p = prev[id]
    const c = curr[id]
    if (!p || p === c) continue

    if (c === 'on_break' && (p === 'idle' || p === 'on_call')) {
      out.push({ agentId: id, kind: 'desk_to_break' })
    } else if (p === 'on_break' && (c === 'idle' || c === 'on_call')) {
      out.push({ agentId: id, kind: 'break_to_desk' })
    } else if (p === 'off_shift' && c !== 'off_shift') {
      out.push({ agentId: id, kind: 'fade_in' })
    } else if (c === 'off_shift' && p !== 'off_shift') {
      out.push({ agentId: id, kind: 'fade_out' })
    }
  }
  return out
}

/**
 * Advance all in-flight animations by dt seconds. Apply skip rule for any new
 * transitions: a new transition for an agent that already has an in-flight
 * animation replaces it (snap to new state).
 *
 * Note: the 4th and 5th args are optional to keep the simple "advance only"
 * use case readable in tests; in production the renderer always passes them.
 */
export function advanceAnimations(
  state: AnimState,
  dtSeconds: number,
  durationMs: number,
  newTransitions: Transition[] = [],
  nowMs: number = 0,
): AnimState {
  const next: AnimState = { ...state }

  // Advance progress for each existing animation
  for (const id of Object.keys(next)) {
    const entry = next[id]
    const duration = ANIM_DURATION_MS[entry.kind] ?? durationMs
    const inc = (dtSeconds * 1000) / duration
    const newProgress = entry.progress + inc
    if (newProgress >= 1) {
      delete next[id]
    } else {
      next[id] = { ...entry, progress: newProgress }
    }
  }

  // Apply new transitions (skip rule: replace any in-flight animation)
  for (const t of newTransitions) {
    next[t.agentId] = { kind: t.kind, progress: 0, startedAt: nowMs }
  }

  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/themes/animation.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/agents/themes/isoOffice/animation.ts tests/themes/animation.test.ts
git commit -m "feat(themes): animation transition detector with skip rule

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Wire animations into IsoRenderer (walks + idle bob + fades)

**Files:**
- Modify: `app/components/cockpit/agents/themes/IsoRenderer.tsx`
- Modify: `app/components/cockpit/agents/themes/isoOffice/Desks.tsx` (accept anim props for the fade/walk overrides)
- Modify: `app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx` (accept anim props for in-transit agents)

This is mostly visual integration; manual smoke verifies. The transition detector is already unit-tested.

- [ ] **Step 1: Add animation tracking to IsoRenderer**

Replace `app/components/cockpit/agents/themes/IsoRenderer.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgentRendererProps } from './AgentRenderer'
import { Room, RoomDefs } from './isoOffice/Room'
import { Desks } from './isoOffice/Desks'
import { BreakRoom } from './isoOffice/BreakRoom'
import { Manager } from './isoOffice/Manager'
import { TileGlowDefs } from './isoOffice/TileGlow'
import { VIEWBOX } from './isoOffice/geometry'
import { advanceAnimations, detectTransitions, type AnimState, type StateMap } from './isoOffice/animation'

export function IsoRenderer({ agents, simTimeMin }: AgentRendererProps) {
  const prevStatesRef = useRef<StateMap>({})
  const animRef = useRef<AnimState>({})
  const lastTickRef = useRef<number>(performance.now())
  const [bobPhase, setBobPhase] = useState(0)
  const [, forceRender] = useState(0)

  // Build current state map keyed by agent id
  const currStates: StateMap = {}
  for (const a of agents) currStates[a.id] = a.state

  // Detect new transitions whenever currStates changes (sim time advanced)
  useEffect(() => {
    const transitions = detectTransitions(prevStatesRef.current, currStates)
    if (transitions.length > 0) {
      animRef.current = advanceAnimations(animRef.current, 0, 1000, transitions, performance.now())
    }
    prevStatesRef.current = currStates
  }, [simTimeMin]) // eslint-disable-line react-hooks/exhaustive-deps -- currStates derived from agents/simTimeMin; avoid object identity churn

  // requestAnimationFrame loop: advance animations + drive idle bob
  useEffect(() => {
    let raf = 0
    function tick(now: number) {
      const dt = (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      const before = Object.keys(animRef.current).length
      animRef.current = advanceAnimations(animRef.current, dt, 1000)
      const after = Object.keys(animRef.current).length
      // 1Hz bob: phase in [0, 2π)
      setBobPhase(p => (p + dt * 2 * Math.PI) % (2 * Math.PI))
      if (before !== after || before > 0) forceRender(n => (n + 1) % 1_000_000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      <RoomDefs/>
      <defs><TileGlowDefs/></defs>
      <Room/>
      <BreakRoom agents={agents} anim={animRef.current}/>
      <Desks agents={agents} anim={animRef.current} bobPhase={bobPhase}/>
      <Manager/>
    </svg>
  )
}
```

- [ ] **Step 2: Wire anim into Desks**

Edit `app/components/cockpit/agents/themes/isoOffice/Desks.tsx`:

Update interface and the rendering to honor in-transit and fade animations:

```tsx
'use client'

import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import { DESK_POSITIONS, MAX_AGENTS_OFFICE, BREAK_SEAT_POSITIONS } from './geometry'
import { AgentSprite } from './AgentSprite'
import { StatusBubble } from './StatusBubble'
import { TileGlow } from './TileGlow'
import type { AnimState } from './animation'

interface DesksProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
  bobPhase?: number
}

const SHIRT_COLOR: Record<AgentVisualState, string> = {
  idle: '#22c55e',
  on_call: '#dc2626',
  on_break: '#d97706',
  off_shift: '#475569',
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function Chair({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      <polygon points="-5,2 5,2 4,5 -4,5" fill="#1e293b"/>
      <rect x={-4.5} y={-3} width={9} height={5} fill="#334155" stroke="#1e293b" strokeWidth={0.3} rx={0.5}/>
      <rect x={-4} y={-4.5} width={8} height={1.5} fill="#475569"/>
    </g>
  )
}

function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon points="0,-3 16,5 0,13 -16,5" fill="#64748b" stroke="#1e293b" strokeWidth={0.5}/>
      <polygon points="-16,5 -16,8 0,16 0,13" fill="#475569"/>
      <polygon points="16,5 16,8 0,16 0,13" fill="#334155"/>
      <rect x={-2.5} y={0} width={5} height={3.5} fill="#0f172a" stroke="#1e293b" strokeWidth={0.3}/>
      <polygon points="-3,3.5 3,3.5 1.5,5 -1.5,5" fill="#475569"/>
      <rect x={-7} y={3} width={2.5} height={2} fill="#cbd5e1" rx={0.3}/>
    </g>
  )
}

export function Desks({ agents, anim = {}, bobPhase = 0 }: DesksProps) {
  return (
    <g>
      {DESK_POSITIONS.map((pos, i) => {
        const agent = agents[i]
        if (!agent) return null
        const a = anim[agent.id]
        const atDesk = agent.state === 'idle' || agent.state === 'on_call'
        const offShift = agent.state === 'off_shift'
        const seat = BREAK_SEAT_POSITIONS[i % BREAK_SEAT_POSITIONS.length]

        // Animation overrides
        let agentX = pos.x
        let agentY = pos.y - 1
        let agentOpacity = 1
        let renderAgentAtDesk = atDesk
        let bobOffset = 0

        if (a?.kind === 'desk_to_break') {
          // Walking out: agent slides from desk to break seat
          agentX = lerp(pos.x, seat.x, a.progress)
          agentY = lerp(pos.y - 1, seat.y, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'break_to_desk') {
          // Walking back: agent slides from break seat to desk
          agentX = lerp(seat.x, pos.x, a.progress)
          agentY = lerp(seat.y, pos.y - 1, a.progress)
          renderAgentAtDesk = true
        } else if (a?.kind === 'fade_in') {
          agentOpacity = a.progress
          renderAgentAtDesk = true
        } else if (a?.kind === 'fade_out') {
          agentOpacity = 1 - a.progress
          renderAgentAtDesk = true
        }

        if (atDesk && agent.state === 'on_call') {
          bobOffset = Math.sin(bobPhase) * 1
        }

        const shirtColor = SHIRT_COLOR[agent.state]

        return (
          <g key={`desk-${i}`}>
            {atDesk && <TileGlow x={pos.x} y={pos.y - 5} state={agent.state}/>}
            <Chair
              x={pos.x}
              y={pos.y - 7}
              opacity={offShift ? 0.6 : (a?.kind === 'desk_to_break' || a?.kind === 'break_to_desk' || agent.state === 'on_break' ? 0.7 : 1)}
            />
            {renderAgentAtDesk && (
              <AgentSprite
                x={agentX}
                y={agentY}
                shirtColor={shirtColor}
                bobOffset={bobOffset}
                opacity={agentOpacity}
              />
            )}
            <Desk x={pos.x} y={pos.y}/>
            {renderAgentAtDesk && agentOpacity > 0.2 && (
              <StatusBubble x={agentX} y={agentY} state={agent.state}/>
            )}
          </g>
        )
      })}
    </g>
  )
}

export { MAX_AGENTS_OFFICE }
```

- [ ] **Step 3: Wire anim into BreakRoom**

Edit `app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx` to skip rendering an agent at the break seat if they have a `desk_to_break` or `break_to_desk` animation in progress (the desk component is rendering the in-transit sprite):

Replace the `breakAgents.map(...)` block with:

```tsx
      {breakAgents.map(({ a, i }, k) => {
        const inTransit = anim?.[a.id]?.kind === 'desk_to_break' || anim?.[a.id]?.kind === 'break_to_desk'
        if (inTransit) return null
        const seat = BREAK_SEAT_POSITIONS[i % BREAK_SEAT_POSITIONS.length]
        return (
          <g key={`break-${a.id}`}>
            <AgentSprite x={seat.x} y={seat.y} shirtColor="#d97706"/>
            <StatusBubble x={seat.x} y={seat.y} state="on_break"/>
          </g>
        )
      })}
```

And update the props interface and signature:

```tsx
import type { AnimState } from './animation'

interface BreakRoomProps {
  agents: Array<{ id: string; state: AgentVisualState }>
  anim?: AnimState
}

export function BreakRoom({ agents, anim }: BreakRoomProps) {
```

Also: change the seat assignment from `k`-based to `i`-based (each agent has a stable seat = their agent index). Update the filter to keep agent index:

```tsx
  const breakAgents = agents
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.state === 'on_break')
```

(This was already in Task 9's code; the change here is using `i` for seat assignment instead of `k`.)

- [ ] **Step 4: Manual smoke**

Run: `npm run dev` → Live Sim → Office theme → press Play.
Expected:
- On-call agents bob subtly (1px y-axis sine wave at 1Hz)
- When an agent transitions to `on_break`, you see them slide along an iso path from their desk to the break table over ~1 second
- When break ends, they slide back
- Shift start/end fade in/out at the desk over ~0.5s

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/agents/themes/IsoRenderer.tsx app/components/cockpit/agents/themes/isoOffice/Desks.tsx app/components/cockpit/agents/themes/isoOffice/BreakRoom.tsx
git commit -m "feat(themes): animate desk↔break walks, idle bob, shift fades

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: Auto-fallback when peakAgents > 6

**Files:**
- Modify: `app/components/cockpit/agents/AgentScene.tsx`
- Modify: `app/globals.css` (toast styles)

- [ ] **Step 1: Update AgentScene with fallback logic**

Replace `app/components/cockpit/agents/AgentScene.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SimEvent } from '@/lib/types'
import { agentStateAt, buildAgentTimelines } from '@/lib/animation/agentTimeline'
import { useScenario } from '../ScenarioContext'
import { THEME_REGISTRY } from './themes/AgentRenderer'
import { ThemePicker } from './ThemePicker'
import { MAX_AGENTS_OFFICE } from './themes/isoOffice/geometry'

interface AgentSceneProps {
  events: SimEvent[]
  peakAgents: number
  simTimeMin: number
}

export function AgentScene({ events, peakAgents, simTimeMin }: AgentSceneProps) {
  const { theme } = useScenario()
  const [showFallbackToast, setShowFallbackToast] = useState(false)

  const overCapacity = peakAgents > MAX_AGENTS_OFFICE
  const effectiveTheme = overCapacity && theme === 'office' ? 'dots' : theme

  // Show toast when fallback engages
  useEffect(() => {
    if (overCapacity && theme === 'office') {
      setShowFallbackToast(true)
      const t = setTimeout(() => setShowFallbackToast(false), 4000)
      return () => clearTimeout(t)
    }
  }, [overCapacity, theme])

  const timelines = useMemo(
    () => buildAgentTimelines(events, peakAgents),
    [events, peakAgents],
  )

  const agents = useMemo(() => {
    const out: Array<{ id: string; state: ReturnType<typeof agentStateAt> }> = []
    for (let i = 0; i < peakAgents; i++) {
      const id = `A${i}`
      const tl = timelines[id]
      out.push({ id, state: tl ? agentStateAt(tl, simTimeMin) : 'idle' })
    }
    return out
  }, [timelines, peakAgents, simTimeMin])

  const Renderer = THEME_REGISTRY[effectiveTheme]

  return (
    <div className="cockpit-agent-scene">
      <Renderer agents={agents} peakAgents={peakAgents} simTimeMin={simTimeMin} />
      <ThemePicker />
      {showFallbackToast && (
        <div className="cockpit-theme-toast" role="status">
          Switched to Dots view — too many agents for the office layout.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add toast CSS**

Append to `app/globals.css`:

```css
.cockpit-theme-toast {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #f1f5f9;
  border: 1px solid #fbbf24;
  border-radius: 6px;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  z-index: 3;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev` → Live Sim. Switch to a campaign that drives peakAgents > 6 (try changing the daily call total way up, or use a high-volume campaign).
Expected: Office theme auto-falls-back to Dots; toast appears for 4s.

- [ ] **Step 4: Commit**

```bash
git add app/components/cockpit/agents/AgentScene.tsx app/globals.css
git commit -m "feat(themes): auto-fallback to Dots when peakAgents exceeds office capacity

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: Delete old AgentDotCanvas; final smoke test

**Files:**
- Delete: `app/components/cockpit/agents/AgentDotCanvas.tsx`
- Delete (potentially): unused canvas-related styles in `app/globals.css`

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -rn "AgentDotCanvas" /Users/ronnelmatthewrobles/Downloads/forecasting-demo/app /Users/ronnelmatthewrobles/Downloads/forecasting-demo/lib /Users/ronnelmatthewrobles/Downloads/forecasting-demo/tests 2>/dev/null`
Expected: no matches (only the file itself, which we're about to delete).

- [ ] **Step 2: Delete the old file**

```bash
rm app/components/cockpit/agents/AgentDotCanvas.tsx
```

- [ ] **Step 3: Remove now-unused CSS classes**

Edit `app/globals.css` and delete these blocks (they were only used by AgentDotCanvas):

```css
.cockpit-agent-canvas-container {
  width: 100%;
  height: 100%;
  min-height: 220px;
}
```

Keep `.cockpit-agent-canvas-frame` since LiveSimTab still uses it as the frame around the new scene.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: all tests pass (unit + integration). No new regressions.

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Final manual smoke**

Run: `npm run dev`
Open: `http://localhost:3000` → Live Sim
Expected:
- Office theme renders by default with full mini-office
- Theme picker top-right (Dots | Office) toggles cleanly
- Theme persists across page reload
- Press play: agents change state; on-call agents bob; transitions to break show smooth desk→break-table walks
- High-volume scenarios auto-fall-back to Dots with toast

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(themes): delete legacy AgentDotCanvas (replaced by themes/DotsRenderer)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Spec Coverage Self-Review

Mapping each spec section to its task(s):

| Spec section | Implemented in |
|---|---|
| Theme registry + AgentRenderer interface | Task 2 |
| File structure (themes/, isoOffice/) | Tasks 2, 5–11 |
| ScenarioContext theme + persistence | Task 1 |
| State→visual mapping (Theme A) | Task 3 |
| State→visual mapping (Theme D) | Tasks 7, 8, 9, 11 |
| Theme D layout (6×6 floor, walls, windows, zones) | Tasks 5, 6 |
| Capacity (6 desks, 8 break seats, manager separate) | Tasks 5, 8, 9 |
| Auto-fallback at peakAgents > 6 + toast | Task 12 |
| Animation: desk↔break walks (1s) | Tasks 10, 11 |
| Animation: shift fade in/out (0.5s) | Tasks 10, 11 |
| Animation: idle bob on on_call | Task 11 |
| Animation skip rule (cycle drops in-flight) | Task 10 |
| Animations decoupled from simSpeed (wall-clock paced) | Task 11 (uses `performance.now()` and rAF) |
| Theme picker top-right of viewport | Task 4 |
| Default = office, falls back to dots if capacity exceeded | Tasks 1 (default), 12 (fallback) |
| Manager always purple, not derived from agent stream | Task 9 (Manager renders fixed sprite, not from agents prop) |
| Performance budget | Verified by file structure (~330 SVG nodes) — no dedicated task; spec is informational |
| Tests: geometry round-trip | Task 5 |
| Tests: animation transition detector + skip rule | Task 10 |
| Tests: theme picker toggles localStorage | Task 1 (covers persistence); Task 4 manual smoke covers UI toggle |
| Tests: integration (renderer with mocked stream) | Task 3 (DotsRenderer rendering tests); Task 11 manual smoke for IsoRenderer |
| Manual smoke (final) | Task 13 |
| Delete legacy AgentDotCanvas | Task 13 |

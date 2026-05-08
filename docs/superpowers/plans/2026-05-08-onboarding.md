# Cockpit Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-tab "What is this view?" intro strips (collapsible, persisted to localStorage) and dotted-underline jargon tooltips on the 9 most common WFM terms, so the cockpit can be shared company-wide without forcing viewers to learn workforce-management vocabulary first.

**Architecture:** Two small components (`TabIntroStrip` + companion `TabIntroReopenLink`, and `JargonTerm`) plus one content module (`copy.ts`) and one hook (`usePersistedCollapse`). Each tab gets the strip; KpiStrip / Sidebar / HoopSlider get inline tooltip wrappers. The existing `/learn` page gets `id=` attributes on existing sections plus two new short sections (HOOP, Abandons) so deep-links land correctly.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind 4, Vitest, native localStorage. No new dependencies.

**Spec reference:** [docs/superpowers/specs/2026-05-08-onboarding-design.md](../specs/2026-05-08-onboarding-design.md)

---

## Internal phasing

| Sub-phase | Tasks | Demo at end |
| --- | --- | --- |
| A — Foundations (content + hook + components) | Tasks 1–4 | Components exist + tested; not yet wired into tabs |
| B — Integration (wire into tabs, KPI, sidebar, /learn) | Tasks 5–7 | Strips visible on all 4 tabs; jargon tooltips wired into KpiStrip / Sidebar / HoopSlider; /learn anchors land correctly |
| C — Style + verify | Tasks 8–9 | CSS appended; manual browser verification |

Plus Task 0 (branch).

---

## File Structure

### New files

- `lib/onboarding/copy.ts` — content module: `STRIP_VERSION`, `TAB_INTROS` map (4 tabs), `JARGON` map (9 terms), TypeScript key types.
- `lib/onboarding/usePersistedCollapse.ts` — React hook: returns `{ collapsed, collapse, expand }` keyed per-tab; localStorage-backed; SSR-safe (defaults to `false` until `useEffect` reads localStorage).
- `tests/usePersistedCollapse.test.ts` — Vitest tests for the hook.
- `app/components/cockpit/onboarding/TabIntroStrip.tsx` — full banner (renders only when not collapsed).
- `app/components/cockpit/onboarding/TabIntroReopenLink.tsx` — "ⓘ What is this?" link (renders only when collapsed).
- `app/components/cockpit/onboarding/JargonTerm.tsx` — inline wrapper: dotted-underline + popover.

### Modified files

- `app/components/cockpit/tabs/LiveSimTab.tsx` — render `<TabIntroStrip tab="live" />` at top of viewport body; `<TabIntroReopenLink tab="live" />` next to header subtitle.
- `app/components/cockpit/tabs/MonteCarloTab.tsx` — same pattern with `tab="monte"`.
- `app/components/cockpit/tabs/RosterTab.tsx` — same with `tab="roster"`.
- `app/components/cockpit/tabs/ClassicTab.tsx` — same with `tab="classic"`.
- `app/components/cockpit/KpiStrip.tsx` — wrap `Service Level`, `Occupancy`, `Avg ASA` labels in `<JargonTerm>`.
- `app/components/cockpit/Sidebar.tsx` — wrap `AHT`, `SL target`, `SL threshold`, `Shrinkage` slider labels.
- `app/components/cockpit/controls/HoopSlider.tsx` — wrap "HOOP" section header label (note: HOOP label currently lives in Sidebar, not the slider — verify in Task 6).
- `app/learn/page.tsx` — add `id=` attributes to 7 existing section headers; add two new short sections for HOOP and Abandons.
- `app/globals.css` — append onboarding styles (~80 lines).

### Untouched

- All kernel / animation / worker / optimizer code from Phases 1–4.
- `app/components/cockpit/Cockpit.tsx`, `Header.tsx`, `ScenarioContext.tsx`.
- `app/components/cockpit/controls/SliderRow.tsx`, `CurveEditor.tsx`, `DailyTotalInput.tsx`.
- `app/components/cockpit/inject/*`, `agents/*`, `monte/*`, `roster/*`, `timeline/*`.

---

## Conventions

- **Branch:** `feat/cockpit-onboarding` off the current state of the project.
- **Commits:** Conventional commits, one per task.
- **Type imports:** `import type { ... }` for type-only imports.
- **CSS:** New classes prefixed `cockpit-onboarding-`.

---

## Task 0: Branch

**Files:** none

- [ ] **Step 1: Confirm starting state**

```bash
git status
git log --oneline -3
```

Expected: clean working tree.

- [ ] **Step 2: Create branch**

```bash
git checkout -b feat/cockpit-onboarding
git status
```

Expected: `nothing to commit, working tree clean` on the new branch.

---

# Sub-phase A — Foundations (Tasks 1–4)

## Task 1: Content module

**Files:**
- Create: `lib/onboarding/copy.ts`

Single source of truth for all blurbs and term definitions. No logic, just data.

- [ ] **Step 1: Create the file**

```ts
/**
 * Onboarding content module — single source of truth for tab intro blurbs
 * and jargon term definitions. Edit here, not in components.
 *
 * Bumping STRIP_VERSION invalidates every user's stored collapse state, so
 * everyone sees the strips again on next load. Use sparingly — only when a
 * blurb meaningfully changes.
 */

export const STRIP_VERSION = 1

export type TabKey = 'live' | 'monte' | 'roster' | 'classic'
export type TermKey =
  | 'hoop'
  | 'erlang-c'
  | 'aht'
  | 'sl'
  | 'sl-threshold'
  | 'occupancy'
  | 'asa'
  | 'shrinkage'
  | 'abandons'

export interface TabIntro {
  title: string
  body: string
  learnAnchor: string  // appended to `/learn`
}

export interface JargonDef {
  label: string
  body: string
  learnAnchor: string  // appended to `/learn`
}

export const TAB_INTROS: Record<TabKey, TabIntro> = {
  live: {
    title: 'What is this view?',
    body:
      'This tab plays your call center day as a 60-second movie. Each colored dot is one agent — green = idle, red = on a call, yellow = wrap-up, grey = on break. Press play, drag the timeline to skip around, or hit "Inject event" to drop a typhoon mid-day and watch what happens.',
    learnAnchor: '#live-sim',
  },
  monte: {
    title: 'What is this view?',
    body:
      'Real days are noisy — even a perfect schedule has bad-luck days. This tab simulates 1,000 versions of today and shows the spread. The blue band is the middle 80% of outcomes; the red dashed line is your worst day. Click "Replay worst day" to jump back to Live Sim and watch the disaster play out.',
    learnAnchor: '#monte-carlo',
  },
  roster: {
    title: 'What is this view?',
    body:
      'Schedules don\'t write themselves. Drag the shift bars to design a roster by hand, or hit "Auto-generate" and watch an algorithm search for the best schedule given your demand curve and budget. Once you have a roster, the Live Sim and Monte Carlo tabs use it automatically.',
    learnAnchor: '#roster',
  },
  classic: {
    title: 'What is this view?',
    body:
      'The original demo before the cockpit shipped — same Erlang C math, single-page view, no animation. Useful as a sanity-check baseline if a number on another tab looks weird.',
    learnAnchor: '#classic',
  },
}

export const JARGON: Record<TermKey, JargonDef> = {
  hoop: {
    label: 'HOOP',
    body: 'Hours of Operation. The window when your contact center is open. Outside the HOOP, no agents are scheduled and no calls are expected.',
    learnAnchor: '#hoop',
  },
  'erlang-c': {
    label: 'Erlang C',
    body: 'A 1917 queueing formula. Given calls, AHT, and your SL target, it computes the minimum number of agents needed. The whole cockpit\'s math foundation.',
    learnAnchor: '#erlang-c',
  },
  aht: {
    label: 'AHT',
    body: 'Average Handle Time. Talk + hold + after-call work, per call. Cutting AHT by 60 seconds can save 8+ agents at scale.',
    learnAnchor: '#aht',
  },
  sl: {
    label: 'SL',
    body: 'Service Level. The % of calls answered within your threshold. Industry default: 80/20 (80% answered within 20s). Your primary quality KPI.',
    learnAnchor: '#sl',
  },
  'sl-threshold': {
    label: 'SL threshold',
    body: 'The "within X seconds" half of your SL target. Tighter thresholds (10s vs 30s) need significantly more agents for the same SL %.',
    learnAnchor: '#sl-threshold',
  },
  occupancy: {
    label: 'Occupancy',
    body: 'Fraction of logged-in time agents spend actually on calls. 80–88% is healthy; above 90% agents burn out, below 75% you\'re overstaffed.',
    learnAnchor: '#occupancy',
  },
  asa: {
    label: 'ASA',
    body: 'Average Speed of Answer. Mean wait time across all calls. Even with a great SL, ASA can be ugly if a long tail of calls waits forever.',
    learnAnchor: '#asa',
  },
  shrinkage: {
    label: 'Shrinkage',
    body: '% of paid agent time NOT on the phones — breaks, training, meetings, downtime. 30% is typical. If shrinkage is 30%, you schedule ~14 to get 10 on calls.',
    learnAnchor: '#shrinkage',
  },
  abandons: {
    label: 'Abandons',
    body: 'Callers who hang up before being answered. Industry convention: abandons are removed from SL math (they never got a chance).',
    learnAnchor: '#abandons',
  },
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/onboarding/copy.ts
git commit -m "feat(onboarding): content module with 4 tab blurbs and 9 jargon definitions"
```

---

## Task 2: `usePersistedCollapse` hook + tests

**Files:**
- Create: `tests/usePersistedCollapse.test.ts`
- Create: `lib/onboarding/usePersistedCollapse.ts`

Hook that returns `{ collapsed, collapse, expand }` for a given tab. localStorage-backed, SSR-safe. Tests use `vitest`'s `vi.stubGlobal` to mock localStorage.

- [ ] **Step 1: Write failing tests in `tests/usePersistedCollapse.test.ts`**

Note: this test uses React's renderer in a Node environment. Vitest's jsdom support is needed — but the project's `vitest.config.ts` currently uses `environment: 'node'`. Check whether the existing config has jsdom installed (it should — Phase 1 added `jsdom` and `@types/seedrandom`). This test sets the environment to jsdom via the file-level `// @vitest-environment jsdom` comment.

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedCollapse } from '@/lib/onboarding/usePersistedCollapse'
import { STRIP_VERSION } from '@/lib/onboarding/copy'

beforeEach(() => {
  localStorage.clear()
})

describe('usePersistedCollapse', () => {
  it('starts expanded when no localStorage entry', () => {
    const { result } = renderHook(() => usePersistedCollapse('live'))
    expect(result.current.collapsed).toBe(false)
  })

  it('persists collapse state to localStorage', () => {
    const { result } = renderHook(() => usePersistedCollapse('live'))
    act(() => result.current.collapse())
    expect(result.current.collapsed).toBe(true)
    expect(localStorage.getItem(`cockpit-strip-live-v${STRIP_VERSION}`)).toBe('collapsed')
  })

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem(`cockpit-strip-monte-v${STRIP_VERSION}`, 'collapsed')
    const { result } = renderHook(() => usePersistedCollapse('monte'))
    expect(result.current.collapsed).toBe(true)
  })

  it('expand() flips state and removes localStorage entry', () => {
    localStorage.setItem(`cockpit-strip-roster-v${STRIP_VERSION}`, 'collapsed')
    const { result } = renderHook(() => usePersistedCollapse('roster'))
    expect(result.current.collapsed).toBe(true)
    act(() => result.current.expand())
    expect(result.current.collapsed).toBe(false)
    expect(localStorage.getItem(`cockpit-strip-roster-v${STRIP_VERSION}`)).toBeNull()
  })

  it('different tabs have independent state', () => {
    const live = renderHook(() => usePersistedCollapse('live'))
    const monte = renderHook(() => usePersistedCollapse('monte'))
    act(() => live.result.current.collapse())
    expect(live.result.current.collapsed).toBe(true)
    expect(monte.result.current.collapsed).toBe(false)
  })
})
```

- [ ] **Step 2: Install `@testing-library/react`** (needed for `renderHook`)

```bash
npm install --save-dev @testing-library/react
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm test
```

Expected: failures importing from `@/lib/onboarding/usePersistedCollapse`.

- [ ] **Step 4: Implement `lib/onboarding/usePersistedCollapse.ts`**

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { STRIP_VERSION, type TabKey } from './copy'

function storageKey(tab: TabKey): string {
  return `cockpit-strip-${tab}-v${STRIP_VERSION}`
}

export interface PersistedCollapse {
  collapsed: boolean
  collapse: () => void
  expand: () => void
}

export function usePersistedCollapse(tab: TabKey): PersistedCollapse {
  // SSR-safe default: starts expanded server-side. useEffect reads localStorage on mount.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(storageKey(tab))
    if (stored === 'collapsed') setCollapsed(true)
  }, [tab])

  const collapse = useCallback(() => {
    setCollapsed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey(tab), 'collapsed')
    }
  }, [tab])

  const expand = useCallback(() => {
    setCollapsed(false)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey(tab))
    }
  }, [tab])

  return { collapsed, collapse, expand }
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm test
```

Expected: all 5 new tests pass; total count goes up by 5 (was 77 after Phase 4, so now 82).

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding/usePersistedCollapse.ts tests/usePersistedCollapse.test.ts package.json package-lock.json
git commit -m "feat(onboarding): usePersistedCollapse hook with localStorage + tests"
```

---

## Task 3: `JargonTerm` component

**Files:**
- Create: `app/components/cockpit/onboarding/JargonTerm.tsx`

Inline wrapper: dotted-underline + popover on hover/tap. One popover open globally at a time (a module-level `activeTermSetter` ref tracks which component is open and closes others).

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { JARGON, type TermKey } from '@/lib/onboarding/copy'

interface JargonTermProps {
  term: TermKey
  children: React.ReactNode
}

// Module-level: only one popover open at a time across the entire app.
let activeCloser: (() => void) | null = null

export function JargonTerm({ term, children }: JargonTermProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const def = JARGON[term]

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onOutside)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onOutside)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function show() {
    // Close any other open popover.
    if (activeCloser && activeCloser !== closeMe) activeCloser()
    activeCloser = closeMe
    setOpen(true)
  }
  function closeMe() {
    setOpen(false)
    if (activeCloser === closeMe) activeCloser = null
  }

  return (
    <span
      ref={wrapRef}
      className="cockpit-onboarding-term"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); open ? closeMe() : show() }}
    >
      {children}
      {open && (
        <span className="cockpit-onboarding-popover" role="tooltip">
          <span className="cockpit-onboarding-popover-label">{def.label}</span>
          <span className="cockpit-onboarding-popover-body">{def.body}</span>
          <Link
            href={`/learn${def.learnAnchor}`}
            className="cockpit-onboarding-popover-link"
            onClick={e => e.stopPropagation()}
          >More on /learn →</Link>
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/components/cockpit/onboarding/JargonTerm.tsx
git commit -m "feat(onboarding): JargonTerm inline wrapper with hover/tap popover"
```

---

## Task 4: `TabIntroStrip` and `TabIntroReopenLink` components

**Files:**
- Create: `app/components/cockpit/onboarding/TabIntroStrip.tsx`
- Create: `app/components/cockpit/onboarding/TabIntroReopenLink.tsx`

Two cooperating components, both keyed by `tab`, sharing collapse state via the same hook.

- [ ] **Step 1: Create `TabIntroStrip.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { TAB_INTROS, type TabKey } from '@/lib/onboarding/copy'
import { usePersistedCollapse } from '@/lib/onboarding/usePersistedCollapse'

interface TabIntroStripProps {
  tab: TabKey
}

export function TabIntroStrip({ tab }: TabIntroStripProps) {
  const { collapsed, collapse } = usePersistedCollapse(tab)
  if (collapsed) return null

  const intro = TAB_INTROS[tab]
  return (
    <div className="cockpit-onboarding-strip" role="region" aria-label="View introduction">
      <span className="cockpit-onboarding-strip-icon">💡</span>
      <div className="cockpit-onboarding-strip-body">
        <div className="cockpit-onboarding-strip-title">{intro.title}</div>
        <p className="cockpit-onboarding-strip-text">
          {intro.body}{' '}
          <Link href={`/learn${intro.learnAnchor}`} className="cockpit-onboarding-strip-link">
            Show me the math →
          </Link>
        </p>
      </div>
      <button
        type="button"
        className="cockpit-onboarding-strip-close"
        onClick={collapse}
        aria-label="Dismiss intro"
      >✕</button>
    </div>
  )
}
```

- [ ] **Step 2: Create `TabIntroReopenLink.tsx`**

```tsx
'use client'

import { type TabKey } from '@/lib/onboarding/copy'
import { usePersistedCollapse } from '@/lib/onboarding/usePersistedCollapse'

interface TabIntroReopenLinkProps {
  tab: TabKey
}

export function TabIntroReopenLink({ tab }: TabIntroReopenLinkProps) {
  const { collapsed, expand } = usePersistedCollapse(tab)
  if (!collapsed) return null

  return (
    <button
      type="button"
      className="cockpit-onboarding-reopen"
      onClick={expand}
      title="Re-open the intro"
    >
      ⓘ What is this?
    </button>
  )
}
```

- [ ] **Step 3: tsc + commit**

```bash
npx tsc --noEmit
git add app/components/cockpit/onboarding/TabIntroStrip.tsx app/components/cockpit/onboarding/TabIntroReopenLink.tsx
git commit -m "feat(onboarding): TabIntroStrip + TabIntroReopenLink components"
```

End of Sub-phase A.

---

# Sub-phase B — Integration (Tasks 5–7)

## Task 5: `/learn` page anchor IDs + new HOOP & Abandons sections

**Files:**
- Modify: `app/learn/page.tsx`

The cockpit's deep links rely on these `id=` attributes. Two new short sections (HOOP and Abandons) need to be added because the existing /learn page doesn't cover them.

- [ ] **Step 1: Read the current `/learn` structure**

```bash
grep -n 'learn-h2\|learn-h3' app/learn/page.tsx | head -30
```

Expected: a list of `<h2 className="learn-h2">` and `<h3 className="learn-h3">` lines. You'll add `id=` attributes to the relevant ones.

- [ ] **Step 2: Add `id=` attributes to existing section headers**

In `app/learn/page.tsx`, locate each of these section headers and add an `id` attribute. Apply these edits:

| Section currently reads roughly | Add `id=` |
| --- | --- |
| `<h2>What is Erlang C?</h2>` | `id="erlang-c"` |
| The "AHT" definition card / row in the 6-inputs section | wrap or add anchor `<span id="aht" />` immediately before its block |
| The "Service Level" section / card | `id="sl"` |
| The "SL Threshold" / "SL threshold" card | `id="sl-threshold"` |
| The "Occupancy" KPI card | `id="occupancy"` |
| The "Avg ASA" KPI card | `id="asa"` |
| The "Shrinkage" definition card | `id="shrinkage"` |

Strategy: each existing `<div className="learn-input-card learn-input-card--*">` and `<div className="learn-kpi-item">` already has a clear semantic block. Add an `id={...}` attribute on the appropriate wrapping `<div>` (or insert a small `<span id="..." className="anchor-offset" />` just before it if the existing element doesn't accept an id cleanly).

For the four placement-only changes that shouldn't add visual weight, prefer adding `id` directly to the existing element. Example transformation for the AHT input card (line numbers will vary):

```tsx
// Before:
<div key={num} className={`learn-input-card learn-input-card--${color}`}>

// After (only for the AHT/SL/SLthreshold/Shrinkage cards):
<div key={num} id={num === '02' ? 'aht' : num === '03' ? 'sl' : num === '04' ? 'sl-threshold' : num === '05' ? 'shrinkage' : undefined}
     className={`learn-input-card learn-input-card--${color}`}>
```

Or, cleaner: extend the input data objects in the `[{...}]` array to include an optional `anchor` field, then render `id={anchor}`. That avoids the conditional spaghetti above. Use whichever fits the existing pattern best.

Ditto for KPIs (`occupancy` on the Occupancy card, `asa` on the Avg ASA card).

The `Erlang C` `<h2>` is a one-off — just add `id="erlang-c"` to its `<h2>` element.

- [ ] **Step 3: Add new sections for HOOP and Abandons**

In the "Quick reference glossary" or "Campaign rule layers" area (whichever fits the existing structure), insert two new short blocks. The existing learn page structure uses `<section className="learn-section">` wrappers with `<h2 className="learn-h2">` headers and `<p className="learn-p">` body text. Add:

```tsx
{/* ── HOOP ── */}
<section id="hoop" className="learn-section">
  <h2 className="learn-h2">HOOP — Hours of Operation</h2>
  <p className="learn-p">
    The HOOP is the time window when a campaign is open and accepting contacts. US Telco runs 24/7 (HOOP 00:00–24:00); UK Fintech runs GMT business hours (HOOP 09:00–18:00). The cockpit truncates the demand curve at HOOP edges — no calls arrive outside the window, and no agents are scheduled there.
  </p>
  <p className="learn-p">
    Different geos and verticals have radically different HOOPs. A 16-hour HOOP needs roughly half the daily agent-hours of a 24-hour HOOP at the same volume, but creates a different staffing-shape problem (peak-and-trough vs. flat coverage).
  </p>
</section>

{/* ── Abandons ── */}
<section id="abandons" className="learn-section">
  <h2 className="learn-h2">Abandons — when callers hang up</h2>
  <p className="learn-p">
    An <strong>abandon</strong> is a caller who hangs up before being answered, usually because the wait got too long. Industry convention removes abandons from the SL denominator: they never got a chance to be answered fast enough or slow enough, so counting them either way distorts the metric.
  </p>
  <p className="learn-p">
    The cockpit models abandons with a probability ramp: callers tolerate the wait up to a campaign-specific threshold (e.g. 60 seconds), after which the per-second probability of dropping ramps with shape parameter <code>beta</code>. UK Fintech uses 45s/0.08 (impatient), AU Retail Chat uses 90s/0.03 (patient). When the queue gets long, abandons are usually what saves the SL number — and what wrecks the customer experience.
  </p>
</section>
```

Place these after the existing sections (Erlang C, KPIs, Campaign rules, Glossary) so they're discoverable without disrupting the existing flow.

- [ ] **Step 4: Verify build still passes**

```bash
npm run build
```

Expected: succeeds. The new sections render statically and the `id=` attributes are valid HTML.

- [ ] **Step 5: Commit**

```bash
git add app/learn/page.tsx
git commit -m "docs(learn): add anchor IDs + new HOOP and Abandons sections"
```

---

## Task 6: Wire `<TabIntroStrip>` and `<TabIntroReopenLink>` into all 4 tabs

**Files:**
- Modify: `app/components/cockpit/tabs/LiveSimTab.tsx`
- Modify: `app/components/cockpit/tabs/MonteCarloTab.tsx`
- Modify: `app/components/cockpit/tabs/RosterTab.tsx`
- Modify: `app/components/cockpit/tabs/ClassicTab.tsx`

For each tab, the strip goes at the top of the viewport body, and the reopen link goes inside the `<span className="cockpit-viewport-sub">` after the existing subtitle text.

- [ ] **Step 1: Update `LiveSimTab.tsx`**

Add imports near the top:

```tsx
import { TabIntroStrip } from '../onboarding/TabIntroStrip'
import { TabIntroReopenLink } from '../onboarding/TabIntroReopenLink'
```

Find the existing JSX block:

```tsx
      <div className="cockpit-viewport-header">
        <span>Live Sim · time machine</span>
        <span className="cockpit-viewport-sub">
          {running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}% · abandons: ${result?.totals.abandons ?? 0}`}
        </span>
      </div>

      <div className="cockpit-viewport-body">
```

Replace with:

```tsx
      <div className="cockpit-viewport-header">
        <span>Live Sim · time machine</span>
        <span className="cockpit-viewport-sub">
          {running ? 'simulating…' : `total SL: ${result ? (result.totals.sl * 100).toFixed(1) : '—'}% · abandons: ${result?.totals.abandons ?? 0}`}
          {' '}<TabIntroReopenLink tab="live" />
        </span>
      </div>

      <div className="cockpit-viewport-body">
        <TabIntroStrip tab="live" />
```

- [ ] **Step 2: Update `MonteCarloTab.tsx`**

Add the same imports. Find the analogous block and apply the same pattern with `tab="monte"`. The viewport-header in MonteCarloTab reads:

```tsx
      <div className="cockpit-viewport-header">
        <span>Monte Carlo · 1,000 simulated days</span>
        <span className="cockpit-viewport-sub">
          {running
            ? `running ${progress.completed}/${progress.total}…`
            : summary
              ? `worst day: idx ${summary.worstDayIdx} · seed ${dayRngSeed(scenario.rngSeed, summary.worstDayIdx)}`
              : ''}
        </span>
      </div>
      <div className="cockpit-viewport-body cockpit-monte-body">
```

Replace with:

```tsx
      <div className="cockpit-viewport-header">
        <span>Monte Carlo · 1,000 simulated days</span>
        <span className="cockpit-viewport-sub">
          {running
            ? `running ${progress.completed}/${progress.total}…`
            : summary
              ? `worst day: idx ${summary.worstDayIdx} · seed ${dayRngSeed(scenario.rngSeed, summary.worstDayIdx)}`
              : ''}
          {' '}<TabIntroReopenLink tab="monte" />
        </span>
      </div>
      <div className="cockpit-viewport-body cockpit-monte-body">
        <TabIntroStrip tab="monte" />
```

- [ ] **Step 3: Update `RosterTab.tsx`**

Same imports. Find:

```tsx
      <div className="cockpit-viewport-header">
        <span>Roster Designer</span>
        <span className="cockpit-viewport-sub">
          {roster.length === 0
            ? 'no roster — kernel falling back to Erlang C auto-staffing'
            : `${roster.length} shift${roster.length === 1 ? '' : 's'} · ${usedHours.toFixed(0)} / ${budget} agent-hours`}
        </span>
      </div>
      <div className="cockpit-viewport-body cockpit-roster-body">
```

Replace with:

```tsx
      <div className="cockpit-viewport-header">
        <span>Roster Designer</span>
        <span className="cockpit-viewport-sub">
          {roster.length === 0
            ? 'no roster — kernel falling back to Erlang C auto-staffing'
            : `${roster.length} shift${roster.length === 1 ? '' : 's'} · ${usedHours.toFixed(0)} / ${budget} agent-hours`}
          {' '}<TabIntroReopenLink tab="roster" />
        </span>
      </div>
      <div className="cockpit-viewport-body cockpit-roster-body">
        <TabIntroStrip tab="roster" />
```

- [ ] **Step 4: Update `ClassicTab.tsx`**

The Classic tab has a simpler structure (no useState, just renders WFMDemo). Add imports and update:

```tsx
import WFMDemo from '@/app/components/WFMDemo'
import { TabIntroStrip } from '../onboarding/TabIntroStrip'
import { TabIntroReopenLink } from '../onboarding/TabIntroReopenLink'

export function ClassicTab() {
  return (
    <div className="cockpit-viewport">
      <div className="cockpit-viewport-header">
        <span>Classic view</span>
        <span className="cockpit-viewport-sub">
          <TabIntroReopenLink tab="classic" />
        </span>
      </div>
      <div className="cockpit-viewport-body">
        <TabIntroStrip tab="classic" />
        <WFMDemo />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: tsc + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: all green. 82 tests passing.

- [ ] **Step 6: Commit**

```bash
git add app/components/cockpit/tabs/LiveSimTab.tsx app/components/cockpit/tabs/MonteCarloTab.tsx app/components/cockpit/tabs/RosterTab.tsx app/components/cockpit/tabs/ClassicTab.tsx
git commit -m "feat(onboarding): wire TabIntroStrip + ReopenLink into all 4 tabs"
```

---

## Task 7: Wire `<JargonTerm>` into KpiStrip, Sidebar, and HoopSlider

**Files:**
- Modify: `app/components/cockpit/KpiStrip.tsx`
- Modify: `app/components/cockpit/Sidebar.tsx`
- Modify: `app/components/cockpit/controls/HoopSlider.tsx` (or `Sidebar.tsx` if HOOP label lives there)

The KpiStrip wraps three labels (`Service Level`, `Occupancy`, `Avg ASA`). The Sidebar wraps four (`AHT`, `SL target`, `SL threshold`, `Shrinkage`). The HOOP section header label is wrapped wherever it lives.

- [ ] **Step 1: Update `KpiStrip.tsx`**

Add the import:

```tsx
import { JargonTerm } from './onboarding/JargonTerm'
```

Find the three Kpi rows that need wrapping. The existing JSX renders them like:

```tsx
<Kpi label="Service Level"   value={`${(kpis.sl * 100).toFixed(1)}%`} accent="green" />
<Kpi label="Occupancy"       value={`${(kpis.occ * 100).toFixed(1)}%`} accent="amber" />
<Kpi label={live ? 'Abandons' : 'Avg ASA'} value={live ? String(kpis.abandons) : `${Math.round(kpis.asa)}s`} />
```

This is tricky because `Kpi` is an internal component that takes `label: string` (a primitive, not a React node). The cleanest fix: change the `Kpi` component to accept `label: React.ReactNode` (it already renders inside a `<div>` so a node is fine). Then pass `<JargonTerm>` wrapped values:

```tsx
<Kpi label={<JargonTerm term="sl">Service Level</JargonTerm>}   value={`${(kpis.sl * 100).toFixed(1)}%`} accent="green" />
<Kpi label={<JargonTerm term="occupancy">Occupancy</JargonTerm>} value={`${(kpis.occ * 100).toFixed(1)}%`} accent="amber" />
<Kpi label={live
  ? <JargonTerm term="abandons">Abandons</JargonTerm>
  : <JargonTerm term="asa">Avg ASA</JargonTerm>
} value={live ? String(kpis.abandons) : `${Math.round(kpis.asa)}s`} />
```

Update the `Kpi` function signature accordingly:

```tsx
function Kpi({ label, value, accent }: { label: React.ReactNode; value: string; accent?: 'green' | 'amber' }) {
```

The other two `Kpi` calls (`Erlang C agents` / `Active agents` and `Scheduled HC`) stay as plain strings — they're not in the 9 jargon terms.

- [ ] **Step 2: Update `Sidebar.tsx`**

Add import:

```tsx
import { JargonTerm } from './onboarding/JargonTerm'
```

The Sidebar's slider section uses `SliderRow` with a `label: string` prop. Like with `Kpi`, change the `SliderRow` `label` prop type to accept `ReactNode`:

In `app/components/cockpit/controls/SliderRow.tsx`, change:

```tsx
interface SliderRowProps {
  label: string
  // ...
}
```

to:

```tsx
interface SliderRowProps {
  label: React.ReactNode
  // ...
}
```

And ensure the JSX uses `{label}` (it already does — no change needed there).

Then in `Sidebar.tsx`, wrap four of the five slider labels:

```tsx
<SliderRow label={<JargonTerm term="aht">AHT</JargonTerm>}                              value={scenario.aht}    min={120} max={900}  step={10} onChange={v => setNumeric('aht', v)} />
<SliderRow label={<><JargonTerm term="sl">SL target</JargonTerm> (%)</>}                value={scenario.sl}     min={60}  max={95}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('sl', v)} />
<SliderRow label={<JargonTerm term="sl-threshold">SL threshold</JargonTerm>}            value={scenario.asa}    min={10}  max={60}   step={1}  format={v => `${v}s`}   onChange={v => setNumeric('asa', v)} />
<SliderRow label={<><JargonTerm term="shrinkage">Shrinkage</JargonTerm> (%)</>}         value={scenario.shrink} min={10}  max={45}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('shrink', v)} />
<SliderRow label="Absent. (%)"                                                          value={scenario.abs}    min={0}   max={20}   step={1}  format={v => `${v}%`}   onChange={v => setNumeric('abs', v)} />
```

Note: the original `AHT (s)` label drops the `(s)` because `JargonTerm` wraps only "AHT". The unit can be moved into the `format` if desired, but the spec is fine with the label being just "AHT" since the slider's value display already shows seconds. Match the existing pattern — for `SL target (%)` and `Shrinkage (%)` the unit annotation stays outside the wrapper. For `AHT (s)`, either keep `(s)` outside the `<JargonTerm>` (use the `<>...</>` fragment pattern) or drop it. Choose the fragment pattern for consistency:

```tsx
<SliderRow label={<><JargonTerm term="aht">AHT</JargonTerm> (s)</>} value={scenario.aht} min={120} max={900} step={10} onChange={v => setNumeric('aht', v)} />
```

Also update the HOOP section label — find the existing `<div className="cockpit-section-label">HOOP</div>` and wrap:

```tsx
<div className="cockpit-section-label"><JargonTerm term="hoop">HOOP</JargonTerm></div>
```

(The "HOOP" label is in `Sidebar.tsx`, not `HoopSlider.tsx`. The slider component itself shows the time range like `08:00 — 22:00`, not a label.)

- [ ] **Step 3: Verify HoopSlider doesn't need changes**

```bash
grep -n 'HOOP' app/components/cockpit/controls/HoopSlider.tsx
```

Expected: no match (or only matches in comments / aria-labels). If a visible "HOOP" label exists inside HoopSlider, also wrap it there. Otherwise, skip.

- [ ] **Step 4: tsc + tests + build**

```bash
npx tsc --noEmit && npm test && npm run build
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/components/cockpit/KpiStrip.tsx app/components/cockpit/Sidebar.tsx app/components/cockpit/controls/SliderRow.tsx
git commit -m "feat(onboarding): wire JargonTerm into KpiStrip, Sidebar, HOOP label"
```

End of Sub-phase B.

---

# Sub-phase C — Style + verify (Tasks 8–9)

## Task 8: CSS for strips, reopen link, jargon underline + popover

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: APPEND the following block at the very end of `app/globals.css`** (preserve all existing content)

```css
/* ───────── Cockpit Onboarding ───────── */

/* Intro strip */
.cockpit-onboarding-strip {
  background: #1e3a5f;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  margin-bottom: 0.75rem;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  color: #e2e8f0;
}
.cockpit-onboarding-strip-icon {
  font-size: 1.1rem;
  line-height: 1;
}
.cockpit-onboarding-strip-body {
  flex: 1;
}
.cockpit-onboarding-strip-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.cockpit-onboarding-strip-text {
  font-size: 0.85rem;
  line-height: 1.55;
  opacity: 0.92;
  margin: 0;
}
.cockpit-onboarding-strip-link {
  color: #60a5fa;
  text-decoration: underline;
  margin-left: 0.25rem;
}
.cockpit-onboarding-strip-close {
  background: transparent;
  border: 0;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0 0.25rem;
  line-height: 1;
}
.cockpit-onboarding-strip-close:hover {
  color: #e2e8f0;
}

/* Reopen link */
.cockpit-onboarding-reopen {
  background: transparent;
  border: 0;
  color: #94a3b8;
  font-size: 0.75rem;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  margin-left: 0.5rem;
  font-family: inherit;
}
.cockpit-onboarding-reopen:hover {
  color: #cbd5e1;
}

/* Jargon term underline */
.cockpit-onboarding-term {
  position: relative;
  border-bottom: 1px dotted #94a3b8;
  cursor: help;
}

/* Jargon popover */
.cockpit-onboarding-popover {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.4rem;
  background: #0f172a;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  width: 280px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  cursor: default;
}
.cockpit-onboarding-popover-label {
  font-weight: 600;
  font-size: 0.8rem;
  color: #3b82f6;
}
.cockpit-onboarding-popover-body {
  font-size: 0.75rem;
  line-height: 1.5;
  opacity: 0.9;
  color: #e2e8f0;
}
.cockpit-onboarding-popover-link {
  color: #60a5fa;
  text-decoration: underline;
  font-size: 0.7rem;
  margin-top: 0.2rem;
  align-self: flex-start;
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(css): onboarding strip, reopen link, jargon underline and popover"
```

---

## Task 9: End-to-end manual verification + branch handoff

**Files:** none

- [ ] **Step 1: Run automated checks**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: 82 tests passing, all other checks green for new code (pre-existing 7 `/learn` lint errors persist — do not fix).

- [ ] **Step 2: Run dev server and verify in browser**

```bash
npm run dev
```

Open the local URL. Verify:

- **Live Sim tab** (default): blue intro strip at top with "💡 What is this view?" headline, paragraph, "Show me the math →" link. Click "✕" — strip disappears, "ⓘ What is this?" link appears next to the header subtitle. Click the link — strip re-appears.
- **Switch to Monte Carlo / Roster / Classic** — each shows its own strip on first visit, dismissible independently.
- **Sidebar**: hover "AHT (s)", "SL target (%)", "SL threshold", "Shrinkage (%)", and the "HOOP" section label. Each shows a popover with definition + "More on /learn →" link.
- **KPI strip**: hover "Service Level", "Occupancy", and "Avg ASA" / "Abandons". Each shows a popover.
- Click "More on /learn →" on any popover — should land on the matching `/learn` section (e.g. `/learn#shrinkage` jumps to the Shrinkage card).
- Reload the page — collapsed strips remember their state via localStorage.
- On mobile (or with browser devtools narrow width), tap a jargon term — popover opens. Tap outside — popover closes.

- [ ] **Step 3: Final cleanup commit if anything tweaked**

```bash
git status
# If anything was tweaked:
git add -A
git commit -m "chore: onboarding verification cleanups"
```

Otherwise skip.

- [ ] **Step 4: Print summary**

```
Cockpit onboarding complete on feat/cockpit-onboarding.
- Per-tab intro strips (4 tabs, collapsible, localStorage-persisted)
- Jargon tooltips on 9 WFM terms (HOOP, Erlang C, AHT, SL, SL threshold,
  Occupancy, ASA, Shrinkage, Abandons)
- Single content module for easy editing
- /learn page now has all 9 anchors plus new HOOP and Abandons sections
- Tests passing, build green, lint green for new code
```

---

## Self-review

**Spec coverage:**

| Spec requirement | Covered by |
| --- | --- |
| Per-tab intro strip (collapsible) | Task 4 (component), Task 6 (wiring) |
| Strip dismissable, persists | Task 2 (hook + tests), Task 4 (uses hook) |
| Reopen link "ⓘ What is this?" | Task 4 (`TabIntroReopenLink`), Task 6 (placement in each tab) |
| Jargon tooltips on 9 terms | Task 1 (definitions), Task 3 (component), Task 7 (wiring) |
| Plain-language paragraph + Learn link | Task 1 (content), Task 4 (renders Link) |
| `/learn` deep links land correctly | Task 5 (anchor IDs + new HOOP/Abandons sections) |
| Single content module (`copy.ts`) | Task 1 |
| `STRIP_VERSION` mechanism | Task 1 (constant), Task 2 (hook reads it via storageKey) |
| No new heavy deps | Plan adds only `@testing-library/react` (devDep, for the hook test) — note that Phase 1 already installed jsdom, so this is the only new dep |
| Mobile-friendly | Task 3 (`onClick` on `JargonTerm` wrapper handles tap) |

**Type consistency check:**
- `TabKey` defined in Task 1 (`copy.ts`). Used in Tasks 2 (`usePersistedCollapse`), 4 (both intro components). Consistent.
- `TermKey` defined in Task 1. Used in Task 3 (`JargonTerm`). Consistent.
- `TabIntro` and `JargonDef` interfaces defined in Task 1. Consumed in Tasks 3 and 4 via `JARGON[term]` and `TAB_INTROS[tab]` indexing. Consistent.
- `usePersistedCollapse` returns `{ collapsed, collapse, expand }` in Task 2. Consumed identically in Tasks 4a and 4b. Consistent.
- `JargonTermProps` from Task 3 takes `term: TermKey`. Wiring in Task 7 always passes valid keys (`'sl'`, `'occupancy'`, `'asa'`, `'abandons'`, `'aht'`, `'sl-threshold'`, `'shrinkage'`, `'hoop'`). Consistent.

**Placeholder scan:** every code step shows full code; every test step shows full assertions; commands have expected output. No "TBD" / "TODO" patterns.

**Open questions for implementation:**
- Exact positioning of new `id=` attributes in `app/learn/page.tsx` requires reading the current file structure (Task 5 Step 1 prompts the engineer to do this first). Two approaches sketched (conditional id vs. extending the data array); choose whichever fits the existing pattern.
- Popover positioning in `JargonTerm` is fixed `top: 100%; left: 0` (under-and-to-the-left of the term). For terms near the right edge of the viewport, the popover may clip. If clipping is observed during Task 9 manual verification, add a quick `right: 0` fallback class — defer the full smart-positioning library question.

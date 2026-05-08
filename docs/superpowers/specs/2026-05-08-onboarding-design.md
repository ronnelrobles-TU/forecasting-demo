# Cockpit Onboarding — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Owner:** Matthew (matthewnrobles@gmail.com)

## 1. Overview

Add a beginner-friendly onboarding layer to the WFM Cockpit so it can be shared company-wide without forcing every viewer to learn workforce-management vocabulary first. Two pieces:

- **Per-tab intro strip** — a collapsible "What is this view?" banner at the top of each tab with a plain-English explanation and a link into the existing `/learn` page for the math.
- **Jargon tooltips** — dotted-underline + hover/tap popover on the 9 most common WFM terms (HOOP, Erlang C, AHT, SL, SL threshold, Occupancy, ASA, Shrinkage, Abandons), each with a one-line definition and a deep-link to `/learn`.

Together these turn the cockpit into something a non-WFM teammate (engineer, exec, salesperson) can open, skim, and immediately understand — without burying the depth from people who already know the field.

## 2. Goals & success criteria

The onboarding is "successful" when:

1. A first-time visitor opens any tab and the strip explains in plain English what the view does and how to interact with it.
2. The strip dismisses with one click and stays dismissed (per-tab, persisted in `localStorage`).
3. A small "ⓘ What is this?" link is always available next to each tab's header subtitle to re-open the strip.
4. Hovering or tapping any of the 9 jargon terms shows a one-line definition; clicking "More on /learn →" jumps to the matching section in the existing Learn page.
5. None of this gets in the way of power users — the strips collapse permanently after first read, and the tooltips are visually subtle (dotted underline only).

## 3. Constraints

- **No new dependencies.** Pure React + native browser APIs (localStorage, hover, click).
- **Single source of truth for content.** All blurbs and term definitions live in one module (`lib/onboarding/copy.ts`), not scattered across components. Easy to edit by anyone.
- **Reuse `/learn`.** The cockpit already ships an in-depth math page. Onboarding bridges plain English → that page; it does not duplicate the math.
- **Tone.** Friendly, second-person, like a competent coworker explaining to a new hire over coffee. Not childish, not corporate.
- **Mobile-friendly.** Tooltips work on tap (not just hover). Strips are responsive.

## 4. Architecture

### 4.1 File structure

```
app/components/cockpit/onboarding/             ← NEW directory
  TabIntroStrip.tsx                            ← Collapsible banner
  JargonTerm.tsx                               ← Inline term wrapper

lib/onboarding/                                ← NEW directory
  copy.ts                                      ← Single source of truth: tab blurbs + term definitions
  usePersistedCollapse.ts                      ← Hook: localStorage-backed collapse state per-tab
```

### 4.2 Modified files

- `app/components/cockpit/tabs/LiveSimTab.tsx` — render `<TabIntroStrip tab="live" />` at top of viewport
- `app/components/cockpit/tabs/MonteCarloTab.tsx` — `<TabIntroStrip tab="monte" />`
- `app/components/cockpit/tabs/RosterTab.tsx` — `<TabIntroStrip tab="roster" />`
- `app/components/cockpit/tabs/ClassicTab.tsx` — `<TabIntroStrip tab="classic" />`
- `app/components/cockpit/KpiStrip.tsx` — wrap `Service Level`, `Occupancy`, `Avg ASA` labels in `<JargonTerm>`
- `app/components/cockpit/Sidebar.tsx` — wrap `AHT`, `SL target`, `SL threshold`, `Shrinkage` labels (HOOP comes from HoopSlider)
- `app/components/cockpit/controls/HoopSlider.tsx` — wrap "HOOP" section label
- `app/components/cockpit/roster/CoverageLine.tsx` — wrap "Required" / "Scheduled" legend labels (optional polish)
- `app/learn/page.tsx` — add `id=` attributes on the relevant `<h3>` headers so deep links land correctly; add two new short sections for HOOP and Abandons (currently not in `/learn`)
- `app/globals.css` — append onboarding styles (~80 lines)

### 4.3 Component contracts

**Two cooperating components**, both keyed by the same `tab` prop and sharing collapse state via the same `usePersistedCollapse(tab)` hook:

```ts
interface TabIntroStripProps  { tab: 'live' | 'monte' | 'roster' | 'classic' }
interface TabIntroReopenLinkProps { tab: 'live' | 'monte' | 'roster' | 'classic' }
```

- `<TabIntroStrip tab="live" />` — the full banner. Renders only when *not* collapsed. Placed at the top of the viewport body in each tab.
- `<TabIntroReopenLink tab="live" />` — the small "ⓘ What is this?" reopen link. Renders only when *collapsed*. Placed inside the tab's header subtitle by the tab itself (so the layout sits naturally next to existing header text).

Both look up the tab's blurb from `copy.ts` and use the same localStorage-backed collapse state — clicking ✕ on the strip flips state to collapsed, and clicking the reopen link flips it back.

**`JargonTerm`**
```ts
interface JargonTermProps {
  term: 'hoop' | 'erlang-c' | 'aht' | 'sl' | 'sl-threshold' | 'occupancy' | 'asa' | 'shrinkage' | 'abandons'
  children: React.ReactNode
}
```
Wraps the rendered children with a dotted-underline span. On hover (desktop) or tap (mobile), shows a small popover with the definition + "More on /learn →" link. Looks up content from `copy.ts` by `term` key.

Implementation: a single popover state in component-local React state; close on outside click and Escape; one open popover at a time globally enforced by a small module-level "active term" tracker (so opening tooltip B closes tooltip A).

**`copy.ts`**
```ts
export const STRIP_VERSION = 1     // bump to force re-expand for all users on next load

export const TAB_INTROS: Record<TabKey, { title: string; body: string; learnAnchor: string }> = {
  live:    { title: 'What is this view?', body: '...', learnAnchor: '#live-sim' },
  monte:   { title: 'What is this view?', body: '...', learnAnchor: '#monte-carlo' },
  roster:  { title: 'What is this view?', body: '...', learnAnchor: '#roster' },
  classic: { title: 'What is this view?', body: '...', learnAnchor: '#classic' },
}

export const JARGON: Record<TermKey, { label: string; body: string; learnAnchor: string }> = {
  hoop:           { label: 'HOOP', body: '...', learnAnchor: '#hoop' },
  'erlang-c':     { label: 'Erlang C', body: '...', learnAnchor: '#erlang-c' },
  // ... 7 more
}
```

**`usePersistedCollapse(tab)`**
```ts
export function usePersistedCollapse(tab: TabKey): {
  collapsed: boolean
  collapse: () => void
  expand: () => void
}
```
- localStorage key: `cockpit-strip-${tab}-v${STRIP_VERSION}`
- Default state when no key exists: `false` (strip is open)
- Bumping `STRIP_VERSION` invalidates all stored keys (users see the strip again on next load — useful when blurb content meaningfully changes)
- SSR-safe: returns `{ collapsed: false }` on first render server-side (no localStorage), reads localStorage in `useEffect`

## 5. Content draft

### 5.1 Tab intro strips

**▶ Live Sim**
> This tab plays your call center day as a 60-second movie. Each colored dot is one agent — green = idle, red = on a call, yellow = wrap-up, grey = on break. Press play, drag the timeline to skip around, or hit "Inject event" to drop a typhoon mid-day and watch what happens.

**⚡ Monte Carlo**
> Real days are noisy — even a perfect schedule has bad-luck days. This tab simulates 1,000 versions of today and shows the spread. The blue band is the middle 80% of outcomes; the red dashed line is your worst day. Click "Replay worst day" to jump back to Live Sim and watch the disaster play out.

**📋 Roster**
> Schedules don't write themselves. Drag the shift bars to design a roster by hand, or hit "Auto-generate" and watch an algorithm search for the best schedule given your demand curve and budget. Once you have a roster, the Live Sim and Monte Carlo tabs use it automatically.

**📊 Classic**
> The original demo before the cockpit shipped — same Erlang C math, single-page view, no animation. Useful as a sanity-check baseline if a number on another tab looks weird.

Each blurb ends with the same **"Show me the math →"** link, pointing at the tab's `/learn` anchor.

### 5.2 Jargon term definitions

| Key | Label | Body | /learn anchor |
| --- | --- | --- | --- |
| `hoop` | HOOP | Hours of Operation. The window when your contact center is open. Outside the HOOP, no agents are scheduled and no calls are expected. | `#hoop` *(needs to be added)* |
| `erlang-c` | Erlang C | A 1917 queueing formula. Given calls, AHT, and your SL target, it computes the minimum number of agents needed. The whole cockpit's math foundation. | `#erlang-c` |
| `aht` | AHT | Average Handle Time. Talk + hold + after-call work, per call. Cutting AHT by 60 seconds can save 8+ agents at scale. | `#aht` |
| `sl` | SL | Service Level. The % of calls answered within your threshold. Industry default: 80/20 (80% answered within 20s). Your primary quality KPI. | `#sl` |
| `sl-threshold` | SL threshold | The "within X seconds" half of your SL target. Tighter thresholds (10s vs 30s) need significantly more agents for the same SL %. | `#sl-threshold` |
| `occupancy` | Occupancy | Fraction of logged-in time agents spend actually on calls. 80–88% is healthy; above 90% agents burn out, below 75% you're overstaffed. | `#occupancy` |
| `asa` | ASA | Average Speed of Answer. Mean wait time across all calls. Even with a great SL, ASA can be ugly if a long tail of calls waits forever. | `#asa` |
| `shrinkage` | Shrinkage | % of paid agent time NOT on the phones — breaks, training, meetings, downtime. 30% is typical. If shrinkage is 30%, you schedule ~14 to get 10 on calls. | `#shrinkage` |
| `abandons` | Abandons | Callers who hang up before being answered. Industry convention: abandons are removed from SL math (they never got a chance). | `#abandons` *(needs to be added)* |

### 5.3 `/learn` page additions

The Learn page already covers Erlang C, AHT, SL, SL threshold, Occupancy, ASA, and Shrinkage in detail. Two short sections need to be added:

- **HOOP** — one paragraph on what Hours of Operation are, why they vary by geo (US Telco 24/7 vs UK Fintech 9–18 GMT), and how the cockpit uses them to truncate the demand curve.
- **Abandons** — one paragraph on the abandon-probability ramp, why industry convention removes them from SL denominators, and how the cockpit's `abandonThresholdSec` per campaign drives the math.

Both fit naturally into the existing "6 inputs you control" / "Quick reference glossary" sections. Add `id=` attributes to all 9 anchor headers so the cockpit's `/learn#xxx` deep links land correctly.

## 6. Persistence detail

- localStorage key per tab: `cockpit-strip-{live|monte|roster|classic}-v{STRIP_VERSION}`
- Stored value: `'collapsed'` (string sentinel) or absent (treated as expanded)
- Server-side rendering: `usePersistedCollapse` returns `{ collapsed: false }` on first render to avoid hydration mismatch; reads localStorage in a `useEffect` and updates state if found. Brief flash of expanded strip on first SSR'd visit is acceptable (it's informative content).
- Bumping `STRIP_VERSION` re-expands strips for all users on their next load. Use sparingly — only when blurb content changes in a meaningful way.

## 7. Visual design

- **Strip**: blue-accented border (matches cockpit's `#3b82f6`), 💡 icon, paragraph + "Show me the math →" link, "✕" dismiss button.
- **Reopen link**: small grey "ⓘ What is this?" text next to the tab's header subtitle. Visible but quiet.
- **Tooltip**: dotted underline on the term, popover with `#3b82f6` border, definition + "More on /learn →" link. Closes on outside click or Escape.
- **No animations** for v1. Simple show/hide. Animation can come later if it feels too abrupt.

## 8. Out of scope

- First-visit modal walkthrough (option A from brainstorming) — deferred. The strip-on-first-visit covers the core need.
- Spotlight / coachmark tour (option B) — deferred. Same reason.
- Internationalization — copy is English-only for v1.
- "Beginner / Pro" mode toggle — deferred. The strips already auto-collapse for power users.
- Tooltip for the "Absenteeism" sidebar slider — explicitly excluded from the 9 terms. Trivial to add later if requested.
- Animation / transitions on strip collapse and tooltip open — defer for v1; show/hide is enough.

## 9. Open questions for implementation phase

- Exact `id=` attribute placement in `/learn/page.tsx` (which `<h3>` gets which id). Easy to settle during the implementation pass.
- Tooltip popover position: above vs below the term, depending on where the cursor is relative to the viewport edge. Use a small library or hand-roll? Recommend hand-roll (simple math) since adding a positioning dep for one component is overkill.
- Whether the "Show me the math →" link should open in a new tab or navigate in place. Recommend in-place (Next.js `<Link>`) since `/learn` is part of the same app — back button returns to the cockpit cleanly.

---

## Appendix · Why per-tab strips + jargon tooltips and not a guided tour

Brainstorming considered four patterns: A) first-visit modal walkthrough, B) spotlight/coachmark tour, C) per-tab intro strip, D) jargon tooltips. Picked C + D because:

- **Always-available context** — strips don't disappear after one viewing; new visitors and old-hands both see them when relevant.
- **Low maintenance** — content lives in one module; adding/editing a tab is a one-file change.
- **Doesn't interrupt power users** — strips collapse permanently after first read; tooltips are passive (no popups unless asked for).
- **Mobile-friendly** — strips are just inline DOM; tooltips work on tap.
- **No new deps** — A and B typically pull in a tour library (`reactour`, `intro.js`); C+D needs none.

A or B can be layered on top later if the company-wide rollout shows people still feel lost on first visit. They're additive — won't break the C+D foundation.

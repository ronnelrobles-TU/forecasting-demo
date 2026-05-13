# Agent Visualization Themes — Design Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorm complete; ready for implementation plan)
**Related:** [`2026-05-08-wfm-cockpit-design.md`](./2026-05-08-wfm-cockpit-design.md), [`2026-05-08-onboarding-design.md`](./2026-05-08-onboarding-design.md)

## Goal

Replace the abstract "dots on a canvas" agent visualization with a pluggable theme system that supports a richer, scene-based view of the contact-center floor. Ship two themes: **Theme A (enhanced dots)** as the perf-safe default fallback, and **Theme D (static isometric mini-office)** as the headline visual. The architecture must allow future themes (16-bit retro, Stardew-pretty, etc.) to be added later without touching the simulation kernel or the existing tab.

## Motivation

The current `AgentDotCanvas` paints colored circles on a 2D canvas. Stakeholders found it abstract and asked for "see the people in real time, like a Pokemon game." Two follow-up insights from the brainstorm:

1. **Shirt color alone doesn't scale.** With 5px shirts and 50+ agents, state becomes unreadable. The visual system needs to encode state at multiple sizes (large surfaces like floor tiles, mid-size like status bubbles, plus the shirt color as fine detail).
2. **Pure static rendering feels lifeless.** Walking transitions between desk and break-room are the cute, narratively-meaningful moments. Animating those transitions (and only those) gives the office a heartbeat without paying the cost of a full animation engine.

## Non-Goals

- Not building a sprite-pack pipeline (no Kenney.nl assets, no PNGs, no atlases). All sprites are hand-crafted SVG.
- Not changing the simulation kernel. Themes consume the existing `AgentVisualState` stream from `lib/animation/agentTimeline.ts`.
- Not building a level editor. Theme D's office layout is hardcoded.
- Not animating mid-call agents wandering around. The only motion is state-transition walks + a 1px idle bob for on-call agents.
- Not supporting walk paths through obstacles. The break room is visible from every desk; animations are direct iso-path slides.

## Architecture

### Theme registry

All renderers conform to a single interface:

```ts
// app/components/cockpit/agents/themes/AgentRenderer.ts
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

export interface RenderContext {
  agents: Array<{ id: string; state: AgentVisualState }>
  peakAgents: number       // for layout sizing (Theme A grid, Theme D desk count cap)
  simTimeMin: number       // for animation triggers — lets the renderer track transitions across frames
  container: HTMLElement   // the renderer mounts into this
}

export interface AgentRenderer {
  render: (ctx: RenderContext) => void
  cleanup: () => void
}

export type ThemeKey = 'dots' | 'office'

export const THEME_REGISTRY: Record<ThemeKey, () => AgentRenderer> = {
  dots: () => createDotsRenderer(),
  office: () => createIsoOfficeRenderer(),
}
```

### File structure

```
app/components/cockpit/agents/
├── AgentScene.tsx              # New top-level. Reads theme from ScenarioContext, mounts the right renderer.
├── ThemePicker.tsx              # Top-right segmented control (Dots | Office).
├── AgentDotCanvas.tsx           # Existing canvas-based dot view. Replaced by themes/DotsRenderer.tsx — DELETE this file.
└── themes/
    ├── AgentRenderer.ts         # Interface + registry + types.
    ├── DotsRenderer.tsx         # Theme A: enhanced SVG dots with emojis.
    ├── IsoRenderer.tsx          # Theme D: orchestrates isometric office scene.
    └── isoOffice/
        ├── geometry.ts          # iso<->screen helpers, fixed layout coordinates.
        ├── Room.tsx             # Walls, windows, floor, zone tints, partitions.
        ├── Desks.tsx            # 6 agent desks + 1 manager desk + chairs.
        ├── BreakRoom.tsx        # Round table, water cooler, break-table seats.
        ├── Manager.tsx          # Manager corner with plant, exec desk, always-purple agent.
        ├── AgentSprite.tsx      # Single agent (head, torso, headset, eye) parameterized by shirt color.
        ├── StatusBubble.tsx     # 📞 / 💤 / ☕ above-head bubble.
        ├── TileGlow.tsx         # Soft radial under desk in state color.
        └── animation.ts         # Transition tracker: detects state changes, drives walk-path interpolation.
```

### Modified files

- [`app/components/cockpit/tabs/LiveSimTab.tsx`](../../../app/components/cockpit/tabs/LiveSimTab.tsx) — replace `<AgentDotCanvas />` with `<AgentScene />`.
- [`app/components/cockpit/ScenarioContext.tsx`](../../../app/components/cockpit/ScenarioContext.tsx) — add `theme: ThemeKey` + `setTheme(t: ThemeKey)`. Hydrate from `localStorage["wfm.cockpit.theme"]` via `useEffect` to stay SSR-safe.
- [`app/globals.css`](../../../app/globals.css) — append theme-picker styles (segmented control, hover states).

### Why hand-crafted SVG, not a sprite pack

1. Free isometric office sprite packs at the fidelity we want are scarce; the few that exist need conversion + don't match each other.
2. SVG scales crisply at any size — important since the canvas may sit in a small panel or expand to fill the viewport.
3. State changes become CSS-variable swaps (shirt fill, opacity, transform) instead of swapping bitmap atlases. Keeps the renderer logic small.
4. Performance budget for ~50 agents is comfortably within SVG's range (~330 nodes static).

## State → visual mapping

The simulation already emits `AgentVisualState = 'idle' | 'on_call' | 'on_break' | 'off_shift'` per agent per minute (from [`lib/animation/agentTimeline.ts`](../../../lib/animation/agentTimeline.ts)). Renderers translate that into pixels.

| State | Theme A (Dots) | Theme D (Iso Office) |
|---|---|---|
| `idle` | Green dot (#22c55e), 😊 emoji | Green shirt, 💤 status bubble, soft green tile glow under desk, agent at home desk |
| `on_call` | Red dot (#dc2626), 📞 emoji | Red shirt, 📞 bubble, soft red tile glow, **idle bob** (1px sine wave at 1Hz) |
| `on_break` | Orange dot (#d97706), ☕ emoji | Orange shirt, ☕ bubble, agent at break-table seat (one of N), home-desk chair tilted/pulled-out |
| `off_shift` | Slate dot (#475569) at 50% opacity, no emoji | Empty desk, chair pushed in, no bubble, no tile glow |
| Manager (decorative) | (n/a) | Always purple shirt, sits at exec desk in manager corner. NOT derived from any `AgentVisualState` — purely a fixed scenery element. Does not animate (no idle bob, no walks). |

### Theme D layout (hardcoded)

6×6 isometric floor diamond. Coordinates from [Theme D mockup v3 in `.superpowers/brainstorm/43391-1778243522/content/section2-mockups-v3.html`](../../../.superpowers/brainstorm/43391-1778243522/content/section2-mockups-v3.html):

- **Floor**: SVG viewBox 0 0 500 280. Diamond corners at N(250,50) → E(450,150) → S(250,250) → W(50,150).
- **Two back walls** (NW + NE) meeting at N corner, height 50px. 3 windows per wall.
- **6 agent desks** in a diagonal 2×3 grid in the center, depth-sorted by `i+j`.
- **Manager corner** (back-right): exec desk + always-purple manager + potted plant.
- **Break room** (front-left): round wooden table with 8 seats + water cooler. Up to 8 break agents fit.
- **Zone tints**: amber over break corner, indigo over manager corner.
- **Low partition walls** dividing manager / break / agent floor zones.

### Capacity

- 6 fixed home desks for the call-taker agent pool. The manager seat is a 7th visual position but is not part of the agent pool.
- Break room has 8 visual seat-positions around the table; agents going on break are assigned the next free seat. Since the agent pool is capped at 6 (see fallback rule), 8 seats is comfortable headroom.
- If `peakAgents > 6` for the active scenario, auto-fall-back to Theme A and show a one-line toast: *"Switched to Dots view — too many agents for the office layout."* (Toast persists for 4s, dismisses on theme change. The picker still shows Office as available; selecting it triggers the same toast and stays on Dots.)

## Animation (Theme D only)

The renderer tracks each agent's previous state across frames. On state transition, it kicks off a wall-clock-paced animation. Animations are **decoupled from `simSpeed`** — they always run at real-time pace so they look right whether the sim is paused, 1×, or 60×.

| Trigger | Animation | Duration |
|---|---|---|
| `idle | on_call` → `on_break` | Slide along straight iso path from home desk to next free break-table seat | 1.0s |
| `on_break` → `idle` | Slide reverse from break seat to home desk | 1.0s |
| `off_shift` → `idle` | Fade-in at home desk (opacity 0 → 1) | 0.5s |
| `idle | on_call` → `off_shift` | Fade-out at home desk (opacity 1 → 0) | 0.5s |
| While `on_call` | Continuous 1px y-axis sine bob at 1Hz | ongoing |

### Animation skip rule

If a state change happens and resolves before the animation finishes (e.g. sim at 60× and agent's break lasts 0.3 sim-minutes = 0.3s real time), the renderer **drops the in-flight animation and snaps to the new state**. Otherwise rapidly-cycling states would cause a backlog of stuck-in-progress walks.

### Idle bob

Implemented as a CSS-variable transform on the agent group: `transform: translateY(calc(var(--bob, 0) * 1px))`, with `--bob` driven by the renderer's animation loop using `Math.sin(t * 2π)`. Off when state ≠ `on_call`.

## Theme picker

Lives top-right inside the LiveSim viewport panel, NOT in the global header. Small segmented control:

```
┌─ Agent floor ────────────────────[ Dots | Office ]─┐
│                                                     │
│           (renderer canvas)                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- **Default on first load**: `office` (Theme D — the headline). Falls back to `dots` automatically if `peakAgents > 6`.
- **Persistence**: `localStorage["wfm.cockpit.theme"]` written on every change. Hydrated via `useEffect` to avoid SSR mismatch.
- **Available everywhere via context**: stored in `ScenarioContext` as `theme: ThemeKey` + `setTheme(t)`. Future code (e.g. KPI strip palette matching the office tones) can read this without prop-drilling.

## Performance

| Theme | Static node count | Animation cost |
|---|---|---|
| A — Dots | ~200 SVG circles + 200 text nodes (one per agent) | None |
| D — Office | ~330 nodes total: 6 desks × ~12 nodes + 6 chairs × 4 + 1 mgr × 18 + walls/windows × 24 + zone tints × 4 + break room × 16 + plant × 7 | ~5 transitions per minute simulated × ≤6 agents in motion at once. Each animation is one `requestAnimationFrame` lerp. |

Browsers handle 1k+ static SVG nodes at 60fps. Animation cost is negligible because at most ~6 agents move at once and each motion is a simple position lerp. The auto-fallback at `peakAgents > 6` ensures Theme D never goes beyond its layout capacity.

## Testing

- **Unit**: `geometry.ts` iso↔screen conversion (round-trip tests on representative coords).
- **Unit**: animation transition detector — given a sequence of states across frames, asserts which transitions trigger which animations.
- **Unit**: skip-rule for rapid state cycles (state changes mid-animation snap to new state).
- **Integration**: render `IsoRenderer` with a mocked `AgentVisualState` stream of 6 agents, assert SVG node count is within budget.
- **Integration**: theme picker click toggles `localStorage` and re-renders.
- **Manual smoke**: load LiveSim with default scenario, verify Theme D renders, click Dots toggle, click Office toggle. Run sim, watch for break-room walks. No console errors.

## Out of scope (future work)

- Theme B (16-bit retro) and Theme C (Stardew-pretty) from the original brainstorm — saved for a later phase if the demo lands.
- Multi-floor offices (the current spec is single-floor only).
- Agent customization (different hair, skin tones, hats).
- Walking paths around obstacles (current paths are direct lines).
- Manager state encoding (currently always purple — future could swap to "in meeting" / "available").
- Audio (chair scrape, ambient office hum) — would be charming but is its own scope.

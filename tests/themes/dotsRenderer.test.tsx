// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DotsRenderer } from '@/app/components/cockpit/agents/themes/DotsRenderer'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'
import type { IntervalStat, RosterShift } from '@/lib/types'

const mkAgent = (i: number, state: AgentVisualState) => ({ id: `A${i}`, state })

// Realistic shape: kernel produces 48 entries (30-min buckets). Morning low
// at bucket 11 (5:30am, agents=22), peak from bucket 18 (9am) onward.
function morningRampPerInterval(): IntervalStat[] {
  const out: IntervalStat[] = []
  for (let i = 0; i < 48; i++) {
    let agents = 0
    if (i < 8) agents = 0
    else if (i < 12) agents = 22
    else if (i < 18) agents = 80
    else if (i < 36) agents = 159
    else agents = 30
    out.push({ sl: 1, agents, queueLen: 0, abandons: 0, occ: 0.5, asa: 0 } as IntervalStat)
  }
  return out
}

// Bright-only "active" circles — fill is one of dA-idle/dA-call/dA-brk and
// opacity is 1 (not 0.25 dim or 0.5 off-shift).
function activeCircles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll('circle')).filter(c => {
    const fill = c.getAttribute('fill') ?? ''
    if (!fill.startsWith('url(#dA-')) return false
    if (fill.includes('dA-off')) return false
    return c.getAttribute('opacity') === '1'
  })
}

// Round 8: DotsRenderer now also renders a sky-color background <rect> and
// (when the sun or moon is up) a single small celestial circle in the corner.
// Tests use noon (simTimeMin=720) so the sun is overhead and a celestial dot
// is present, then count agent dots by excluding it.
const NOON = 720

function agentCircles(container: HTMLElement): SVGCircleElement[] {
  // Agent dots are the ones with a `url(#dA-...)` fill — the celestial dot
  // uses a flat hex fill.
  return Array.from(container.querySelectorAll('circle'))
    .filter(c => (c.getAttribute('fill') ?? '').startsWith('url(#dA-'))
}

describe('DotsRenderer', () => {
  it('renders one agent <circle> per agent', () => {
    const agents = [mkAgent(0, 'idle'), mkAgent(1, 'on_call'), mkAgent(2, 'on_break')]
    const { container } = render(<DotsRenderer agents={agents} peakAgents={3} simTimeMin={NOON} />)
    expect(agentCircles(container).length).toBe(3)
  })

  it('off_shift agents render at 50% opacity with no emoji', () => {
    const agents = [mkAgent(0, 'off_shift')]
    const { container } = render(<DotsRenderer agents={agents} peakAgents={1} simTimeMin={NOON} />)
    const circle = agentCircles(container)[0]
    expect(circle?.getAttribute('opacity')).toBe('0.5')
    expect(container.querySelectorAll('text').length).toBe(0)
  })

  it('on_call agents render with red fill and 📞 emoji', () => {
    const agents = [mkAgent(0, 'on_call')]
    const { container } = render(<DotsRenderer agents={agents} peakAgents={1} simTimeMin={NOON} />)
    expect(agentCircles(container)[0]?.getAttribute('fill')).toContain('dA-call')
    expect(container.querySelector('text')?.textContent).toBe('📞')
  })

  it('idle and on_break also render the right emoji', () => {
    const idle = render(<DotsRenderer agents={[mkAgent(0, 'idle')]} peakAgents={1} simTimeMin={NOON} />)
    expect(idle.container.querySelector('text')?.textContent).toBe('😊')
    const brk = render(<DotsRenderer agents={[mkAgent(0, 'on_break')]} peakAgents={1} simTimeMin={NOON} />)
    expect(brk.container.querySelector('text')?.textContent).toBe('☕')
  })

  it('grid layout sized for peakAgents (not just current agents)', () => {
    // peakAgents=12 means grid laid out for 12 cells even if only 3 agents present
    const { container } = render(<DotsRenderer agents={[mkAgent(0, 'idle')]} peakAgents={12} simTimeMin={NOON} />)
    expect(agentCircles(container).length).toBe(1)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBeTruthy()
  })

  it('shift model hides off-shift agents at 5:54 AM (productive count is small)', () => {
    // At simTimeMin=354 (5:54am), perInterval[11].agents=22, so only ~22
    // productive + ~9 shrinkage agents should be visible. Before the
    // shiftModel INTERVAL_MIN=30 fix, the lookup mistakenly returned the
    // peak (159) and ~227 dots showed as active. Allow stagger jitter ±10.
    const peakAgents = 250
    const agents = Array.from({ length: peakAgents }, (_, i) => mkAgent(i, 'idle'))
    const { container } = render(
      <DotsRenderer
        agents={agents}
        peakAgents={peakAgents}
        simTimeMin={354}
        perInterval={morningRampPerInterval()}
        shrinkPct={30}
      />
    )
    const visible = activeCircles(container)
    // Productive ≈ 22, in-office ≈ 31. Generous bounds for stagger jitter.
    expect(visible.length).toBeGreaterThan(10)
    expect(visible.length).toBeLessThan(50)
  })

  it('honours roster prop (snaps to user-authored shift windows)', () => {
    // Day-shift roster: 100 agents from 9am-5pm. At 5:54am no one is in the
    // office. Without the roster path, Dots would consult the smoothed
    // Erlang curve and show the morning ramp; with it, the floor is empty.
    const peakAgents = 100
    const agents = Array.from({ length: peakAgents }, (_, i) => mkAgent(i, 'idle'))
    const roster: RosterShift[] = [
      { id: 's1', startMin: 9 * 60, endMin: 17 * 60, agentCount: peakAgents, breaks: [] },
    ]
    const { container } = render(
      <DotsRenderer
        agents={agents}
        peakAgents={peakAgents}
        simTimeMin={354}  // 5:54am — well before the 9am shift
        perInterval={morningRampPerInterval()}
        shrinkPct={30}
        roster={roster}
      />
    )
    expect(activeCircles(container).length).toBe(0)
  })
})

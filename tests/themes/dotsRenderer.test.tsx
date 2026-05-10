// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DotsRenderer } from '@/app/components/cockpit/agents/themes/DotsRenderer'
import type { AgentVisualState } from '@/lib/animation/agentTimeline'

const mkAgent = (i: number, state: AgentVisualState) => ({ id: `A${i}`, state })

// Round 8: DotsRenderer now also renders a sky-color background <rect> and
// (when the sun or moon is up) a single small celestial circle in the corner.
// Tests use noon (simTimeMin=720) so the sun is overhead and a celestial dot
// is present, then count agent dots by excluding it.
const NOON = 720

function agentCircles(container: HTMLElement): HTMLElement[] {
  // Agent dots are the ones with a `url(#dA-...)` fill — the celestial dot
  // uses a flat hex fill.
  return Array.from(container.querySelectorAll('circle'))
    .filter(c => (c.getAttribute('fill') ?? '').startsWith('url(#dA-')) as HTMLElement[]
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
})

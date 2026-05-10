// Smoke particle layer for the HD smoking patio.
//
// Uses a small pool of `Graphics` circles. Each particle has a position,
// life, and rises while fading. When a particle dies it respawns at one of
// the configured emitter positions. Designed to be cheap (max ~24 particles)
// and to look like wisps coming up from cigarettes.

import { Container, Graphics } from 'pixi.js'

export interface SmokeEmitter {
  x: number
  y: number
}

interface Particle {
  g: Graphics
  x: number
  y: number
  vy: number
  life: number      // 0..1
  baseR: number
  emitter: number
}

export interface SmokeLayer {
  container: Container
  particles: Particle[]
  emitters: SmokeEmitter[]
  /** Last update time in ms; used to compute frame delta. */
  lastTimeMs: number
}

const PARTICLES_PER_EMITTER = 6

export function buildSmokeLayer(emitters: SmokeEmitter[]): SmokeLayer {
  const container = new Container()
  container.sortableChildren = false
  const particles: Particle[] = []
  for (let e = 0; e < emitters.length; e++) {
    for (let p = 0; p < PARTICLES_PER_EMITTER; p++) {
      const g = new Graphics()
      const baseR = 0.7 + (p % 3) * 0.3
      g.circle(0, 0, baseR).fill({ color: 0xcbd5e1 })
      // Stagger initial life so particles don't all rise in lockstep.
      const life = ((p / PARTICLES_PER_EMITTER) + e * 0.13) % 1
      g.x = emitters[e].x
      g.y = emitters[e].y - life * 18
      g.alpha = (1 - life) * 0.55
      container.addChild(g)
      particles.push({
        g,
        x: emitters[e].x,
        y: emitters[e].y - life * 18,
        vy: -8 - (p % 3),  // px/sec upward
        life,
        baseR,
        emitter: e,
      })
    }
  }
  return { container, particles, emitters, lastTimeMs: -1 }
}

export function updateSmokeLayer(layer: SmokeLayer, nowMs: number): void {
  if (layer.lastTimeMs < 0) {
    layer.lastTimeMs = nowMs
    return
  }
  const dt = Math.min(0.1, (nowMs - layer.lastTimeMs) / 1000)  // seconds, clamp huge gaps
  layer.lastTimeMs = nowMs
  for (const p of layer.particles) {
    p.life += dt * 0.45  // ~2.2s lifespan
    if (p.life >= 1) {
      // Respawn at emitter.
      const e = layer.emitters[p.emitter]
      if (e) {
        p.x = e.x + (Math.random() - 0.5) * 1.5
        p.y = e.y
      }
      p.life = 0
    }
    p.y += p.vy * dt
    p.g.x = p.x
    p.g.y = p.y
    p.g.alpha = (1 - p.life) * 0.55
    // Slight horizontal drift
    p.x += Math.sin(p.life * Math.PI * 2) * 0.05
  }
}

export function destroySmokeLayer(layer: SmokeLayer): void {
  layer.container.destroy({ children: true })
}

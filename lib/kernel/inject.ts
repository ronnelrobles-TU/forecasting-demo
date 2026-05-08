import type { InjectedEvent } from '@/lib/types'

export interface ActivePerturbations {
  volumeMultiplier: number
  ahtMultiplier: number
  agentReductionFraction: number    // e.g. 0.25 means -25% of active agents
  flashAbsentJustFired: number       // count of agents to remove permanently from this minute
}

function isActive(ev: InjectedEvent, currentMin: number): boolean {
  if (currentMin < ev.fireAtMin) return false
  if (ev.durationMin == null) return true
  return currentMin < ev.fireAtMin + ev.durationMin
}

export function activePerturbations(events: InjectedEvent[], currentMin: number): ActivePerturbations {
  const result: ActivePerturbations = {
    volumeMultiplier: 1,
    ahtMultiplier: 1,
    agentReductionFraction: 0,
    flashAbsentJustFired: 0,
  }
  for (const ev of events) {
    if (ev.type === 'flash_absent') {
      if (currentMin === ev.fireAtMin) result.flashAbsentJustFired += ev.magnitude
      continue
    }
    if (!isActive(ev, currentMin)) continue
    switch (ev.type) {
      case 'volume_surge': result.volumeMultiplier *= (1 + ev.magnitude); break
      case 'aht_spike':    result.ahtMultiplier *= (1 + ev.magnitude); break
      case 'staff_drop':   result.agentReductionFraction += ev.magnitude; break
      case 'custom':       /* no-op for v2; see Task 17 for preset list */ break
    }
  }
  return result
}

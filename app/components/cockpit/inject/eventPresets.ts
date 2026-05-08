import type { InjectedEvent } from '@/lib/types'

export interface EventPreset {
  id: 'surge' | 'outage' | 'typhoon' | 'flash_absent'
  label: string
  emoji: string
  description: string
  build: (fireAtMin: number) => InjectedEvent
}

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'surge',
    label: 'Surge',
    emoji: '🌪',
    description: '+30% volume for 2 hours',
    build: fireAtMin => ({ type: 'volume_surge', fireAtMin, durationMin: 120, magnitude: 0.3 }),
  },
  {
    id: 'outage',
    label: 'Outage',
    emoji: '📞',
    description: 'AHT doubles for 1 hour',
    build: fireAtMin => ({ type: 'aht_spike', fireAtMin, durationMin: 60, magnitude: 1.0 }),
  },
  {
    id: 'typhoon',
    label: 'Typhoon',
    emoji: '🌀',
    description: '−25% staff for the rest of the day',
    build: fireAtMin => ({ type: 'staff_drop', fireAtMin, magnitude: 0.25 }),
  },
  {
    id: 'flash_absent',
    label: 'Flash absent',
    emoji: '🚨',
    description: '−15 agents instantly',
    build: fireAtMin => ({ type: 'flash_absent', fireAtMin, magnitude: 15 }),
  },
]

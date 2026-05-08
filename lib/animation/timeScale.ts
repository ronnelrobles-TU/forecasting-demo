export type Speed = 1 | 10 | 60

const TABLE: Record<Speed, number> = {
  1: 24,      // 24h day in 60s wall
  10: 240,    // day in 6s wall
  60: 1440,   // day in 1s wall
}

export function simMinutesPerSec(speed: Speed): number {
  return TABLE[speed]
}

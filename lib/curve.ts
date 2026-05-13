import type { HoopWindow } from './types'

export function intervalIndexForMinute(min: number): number {
  return Math.min(47, Math.max(0, Math.floor(min / 30)))
}

export function applyHoop(curve: number[], hoop: HoopWindow): number[] {
  const startIdx = intervalIndexForMinute(hoop.startMin)
  const endIdx = hoop.endMin >= 1440 ? 48 : intervalIndexForMinute(hoop.endMin)
  return curve.map((v, i) => (i >= startIdx && i < endIdx ? v : 0))
}

export function normalize(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return weights.map(() => 0)
  return weights.map(v => v / sum)
}

export function callsPerInterval(curve: number[], dailyTotal: number): number[] {
  return normalize(curve).map(w => w * dailyTotal)
}

export function erlangC(N: number, A: number): number {
  if (N <= A) return 1
  let sum = 0
  let term = 1
  for (let k = 0; k < N; k++) {
    if (k > 0) term = (term * A) / k
    sum += term
  }
  const lastTerm = (term * A) / N
  const numerator = (lastTerm * N) / (N - A)
  return numerator / (sum + numerator)
}

export function serviceLevel(N: number, A: number, ahtSec: number, thresholdSec: number): number {
  if (N <= A) return 0
  const pw = erlangC(N, A)
  return 1 - pw * Math.exp((-(N - A) * thresholdSec) / ahtSec)
}

export function avgWait(N: number, A: number, ahtSec: number): number {
  if (N <= A) return 999
  const pw = erlangC(N, A)
  return (pw * ahtSec) / (N - A)
}

export function requiredAgents(
  callsPerHalfHour: number,
  ahtSec: number,
  slTarget: number,
  thresholdSec: number,
): { N: number; A: number } {
  const lambda = callsPerHalfHour / 1800
  const A = lambda * ahtSec
  let N = Math.max(1, Math.ceil(A) + 1)
  if (N > 5000) return { N: 5000, A }
  while (serviceLevel(N, A, ahtSec, thresholdSec) < slTarget && N < 5000) N++
  return { N, A }
}

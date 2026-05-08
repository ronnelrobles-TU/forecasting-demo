import seedrandom from 'seedrandom'

export type Rng = () => number  // returns uniform in [0, 1)

export function makeRng(seed: number): Rng {
  return seedrandom(String(seed))
}

// Knuth's algorithm — fine for typical lambdas <100
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0
  // Use the inverse-transform / multiplication method
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

// Box-Muller standard normal
function standardNormal(rng: Rng): number {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

// Log-normal sample with mean ≈ `mean` (in same units as `mean`) and shape σ.
export function logNormal(rng: Rng, mean: number, sigma: number): number {
  // Convert desired arithmetic mean to mu (location) of the underlying normal.
  const mu = Math.log(mean) - (sigma * sigma) / 2
  return Math.exp(mu + sigma * standardNormal(rng))
}

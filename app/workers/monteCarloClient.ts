import type { Scenario, SimResult } from '@/lib/types'
import { dayRngSeed } from '@/lib/kernel/monteCarlo'

const POOL_SIZE = 4

interface Job {
  dayIndex: number
  resolve: (r: SimResult) => void
  reject: (e: Error) => void
}

interface PoolWorker {
  worker: Worker
  pending: Map<number, Job>
}

let pool: PoolWorker[] | null = null
let nextRequestId = 1

function ensurePool(): PoolWorker[] {
  if (pool) return pool
  pool = []
  for (let i = 0; i < POOL_SIZE; i++) {
    const w = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })
    const pending = new Map<number, Job>()
    w.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as { type: string; requestId: number; result?: SimResult; message?: string }
      const job = pending.get(data.requestId)
      if (!job) return
      pending.delete(data.requestId)
      if (data.type === 'runDayResult' && data.result) {
        job.resolve(data.result)
      } else if (data.type === 'runDayError') {
        job.reject(new Error(data.message ?? 'kernel worker error'))
      }
    })
    w.addEventListener('error', () => {
      for (const job of pending.values()) job.reject(new Error('worker crashed'))
      pending.clear()
    })
    pool.push({ worker: w, pending })
  }
  return pool
}

export interface RunManyOptions {
  days: number
  baseSeed: number
  onProgress?: (completed: number, total: number) => void
}

/** Runs `days` simulations across the worker pool. Returns the array of results in dayIndex order. */
export async function runManyInPool(scenario: Scenario, opts: RunManyOptions): Promise<SimResult[]> {
  const { days, baseSeed, onProgress } = opts
  const workers = ensurePool()
  const results: SimResult[] = new Array(days)
  let completed = 0

  const promises: Promise<void>[] = []
  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const slot = workers[dayIndex % POOL_SIZE]
    const requestId = nextRequestId++
    const seededScenario: Scenario = { ...scenario, rngSeed: dayRngSeed(baseSeed, dayIndex) }
    const p = new Promise<void>((resolve, reject) => {
      slot.pending.set(requestId, {
        dayIndex,
        resolve: r => {
          results[dayIndex] = r
          completed++
          onProgress?.(completed, days)
          resolve()
        },
        reject,
      })
      slot.worker.postMessage({ type: 'runDay', requestId, scenario: seededScenario })
    })
    promises.push(p)
  }

  await Promise.all(promises)
  return results
}

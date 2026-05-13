/// <reference lib="webworker" />
import { optimizeRoster, type OptimizeOptions } from '@/lib/kernel/optimizer'
import type { Scenario, RosterShift } from '@/lib/types'

interface OptimizeRequest {
  type: 'optimize'
  requestId: number
  scenario: Scenario
  budgetAgentHours: number
  iterations: number
  emitEvery: number
  optSeed: number
}

interface OptimizeProgress {
  type: 'optimizeProgress'
  requestId: number
  iter: number
  best: RosterShift[]
  bestScore: number
}

interface OptimizeDone {
  type: 'optimizeDone'
  requestId: number
  best: RosterShift[]
}

interface OptimizeError {
  type: 'optimizeError'
  requestId: number
  message: string
}

self.addEventListener('message', (e: MessageEvent<OptimizeRequest>) => {
  const msg = e.data
  if (msg.type !== 'optimize') return
  try {
    const opts: OptimizeOptions = {
      iterations: msg.iterations,
      budgetAgentHours: msg.budgetAgentHours,
      optSeed: msg.optSeed,
      emitEvery: msg.emitEvery,
      onIter: (iter, best, bestScore) => {
        const progress: OptimizeProgress = {
          type: 'optimizeProgress',
          requestId: msg.requestId,
          iter,
          best,
          bestScore,
        }
        ;(self as unknown as Worker).postMessage(progress)
      },
    }
    const final = optimizeRoster(msg.scenario, opts)
    const done: OptimizeDone = { type: 'optimizeDone', requestId: msg.requestId, best: final }
    ;(self as unknown as Worker).postMessage(done)
  } catch (err) {
    const errResponse: OptimizeError = {
      type: 'optimizeError',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(errResponse)
  }
})

export {}

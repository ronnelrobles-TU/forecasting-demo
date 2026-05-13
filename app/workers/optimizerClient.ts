import type { Scenario, RosterShift } from '@/lib/types'

interface RunOpts {
  scenario: Scenario
  budgetAgentHours: number
  iterations?: number     // default 300
  emitEvery?: number      // default 20
  optSeed?: number        // default 1
  onProgress: (iter: number, best: RosterShift[], bestScore: number) => void
}

let worker: Worker | null = null
let nextRequestId = 1
let activeRequestId = 0

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

/** Start an optimization run. Cancels any in-flight run by ignoring its messages. */
export function runOptimize(opts: RunOpts): Promise<RosterShift[]> {
  const w = ensureWorker()
  const requestId = nextRequestId++
  activeRequestId = requestId

  return new Promise<RosterShift[]>((resolve, reject) => {
    function onMessage(e: MessageEvent) {
      const data = e.data as {
        type: string
        requestId: number
        iter?: number
        best?: RosterShift[]
        bestScore?: number
        message?: string
      }
      // Ignore messages from older runs
      if (data.requestId !== activeRequestId) return
      if (data.type === 'optimizeProgress' && data.best && data.iter != null && data.bestScore != null) {
        opts.onProgress(data.iter, data.best, data.bestScore)
      } else if (data.type === 'optimizeDone' && data.best) {
        w.removeEventListener('message', onMessage)
        resolve(data.best)
      } else if (data.type === 'optimizeError') {
        w.removeEventListener('message', onMessage)
        reject(new Error(data.message ?? 'optimizer error'))
      }
    }
    w.addEventListener('message', onMessage)

    w.postMessage({
      type: 'optimize',
      requestId,
      scenario: opts.scenario,
      budgetAgentHours: opts.budgetAgentHours,
      iterations: opts.iterations ?? 300,
      emitEvery: opts.emitEvery ?? 20,
      optSeed: opts.optSeed ?? 1,
    })
  })
}

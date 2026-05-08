import type { Scenario, SimResult } from '@/lib/types'

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, { resolve: (r: SimResult) => void; reject: (err: Error) => void }>()

function rejectAllPending(reason: Error) {
  for (const { reject } of pending.values()) reject(reason)
  pending.clear()
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type: string; requestId: number; result?: SimResult; message?: string }
    const entry = pending.get(data.requestId)
    if (!entry) return
    pending.delete(data.requestId)
    if (data.type === 'runDayResult' && data.result) {
      entry.resolve(data.result)
    } else if (data.type === 'runDayError') {
      entry.reject(new Error(data.message ?? 'kernel worker error'))
    }
  })
  worker.addEventListener('error', (e: ErrorEvent) => {
    rejectAllPending(new Error(`kernel worker crashed: ${e.message}`))
    worker?.terminate()
    worker = null
  })
  return worker
}

export function runDayInWorker(scenario: Scenario): Promise<SimResult> {
  const w = ensureWorker()
  const requestId = nextRequestId++
  return new Promise<SimResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    w.postMessage({ type: 'runDay', requestId, scenario })
  })
}

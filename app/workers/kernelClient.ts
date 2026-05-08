import type { Scenario, SimResult } from '@/lib/types'

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, (r: SimResult) => void>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type: string; requestId: number; result: SimResult }
    if (data.type === 'runDayResult') {
      const resolve = pending.get(data.requestId)
      if (resolve) {
        resolve(data.result)
        pending.delete(data.requestId)
      }
    }
  })
  return worker
}

export function runDayInWorker(scenario: Scenario): Promise<SimResult> {
  const w = ensureWorker()
  const requestId = nextRequestId++
  return new Promise(resolve => {
    pending.set(requestId, resolve)
    w.postMessage({ type: 'runDay', requestId, scenario })
  })
}

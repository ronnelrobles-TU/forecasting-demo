/// <reference lib="webworker" />
import { runDay } from '@/lib/kernel'
import type { Scenario, SimResult } from '@/lib/types'

interface RunDayMessage {
  type: 'runDay'
  requestId: number
  scenario: Scenario
  collectEvents?: boolean
}

interface RunDayResponse {
  type: 'runDayResult'
  requestId: number
  result: SimResult
}

interface RunDayErrorResponse {
  type: 'runDayError'
  requestId: number
  message: string
}

self.addEventListener('message', (e: MessageEvent<RunDayMessage>) => {
  const msg = e.data
  if (msg.type === 'runDay') {
    try {
      const result = runDay(msg.scenario, { collectEvents: msg.collectEvents })
      const response: RunDayResponse = { type: 'runDayResult', requestId: msg.requestId, result }
      ;(self as unknown as Worker).postMessage(response)
    } catch (err) {
      const response: RunDayErrorResponse = {
        type: 'runDayError',
        requestId: msg.requestId,
        message: err instanceof Error ? err.message : String(err),
      }
      ;(self as unknown as Worker).postMessage(response)
    }
  }
})

export {}

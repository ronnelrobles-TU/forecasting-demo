/// <reference lib="webworker" />

import { runDay } from '@/lib/kernel'
import type { Scenario, SimResult } from '@/lib/types'

interface RunDayMessage {
  type: 'runDay'
  requestId: number
  scenario: Scenario
}

interface RunDayResponse {
  type: 'runDayResult'
  requestId: number
  result: SimResult
}

self.addEventListener('message', (e: MessageEvent<RunDayMessage>) => {
  const msg = e.data
  if (msg.type === 'runDay') {
    const result = runDay(msg.scenario)
    const response: RunDayResponse = { type: 'runDayResult', requestId: msg.requestId, result }
    ;(self as unknown as Worker).postMessage(response)
  }
})

export {}  // make this a module

import type { IntervalStat } from '@/lib/types'
import { intervalIndexForMinute } from '@/lib/curve'

export function intervalStatsAt(perInterval: IntervalStat[], simTimeMin: number): IntervalStat {
  return perInterval[intervalIndexForMinute(simTimeMin)]
}

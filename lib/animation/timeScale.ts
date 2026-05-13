// Speed levels for the time-machine playback. The base unit is "1×" =
// 24 sim minutes per real second (a 24-hour day in 60s). Slower speeds
// (0.1×, 0.25×, 0.5×) exist for the cockpit visualization so the user can
// watch individual characters: at 0.25× a full day is ~4 real minutes,
// which is fast enough to be interesting but slow enough to follow a
// single agent walking from desk → break → desk.
export type Speed = 0.1 | 0.25 | 0.5 | 1 | 10 | 60

const TABLE: Record<Speed, number> = {
  0.1:  2.4,    // day in 600s wall (10 min)
  0.25: 6,      // day in 240s wall (4 min)
  0.5:  12,     // day in 120s wall (2 min)
  1:    24,     // day in 60s wall
  10:   240,    // day in 6s wall
  60:   1440,   // day in 1s wall
}

export function simMinutesPerSec(speed: Speed): number {
  return TABLE[speed]
}

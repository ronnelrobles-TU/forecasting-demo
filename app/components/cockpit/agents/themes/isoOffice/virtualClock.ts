// Virtual wall-clock used by the journey state machine.
//
// The journey model stores phase-start timestamps in real (performance.now())
// time and computes positions/transitions from `now - phaseStartedAt`. That
// works fine during playback, but it means a paused simulation doesn't truly
// pause: the next time we read `performance.now()` and feed it to
// `journeyPosition` or `tickJourney`, the elapsed delta has grown and the
// agent has either moved further along their lerp or auto-advanced past the
// phase boundary. The user sees pause as "teleport to destination."
//
// The fix is a small virtual clock that *only ticks while playing*. Renderers
// store phase-start times in virtual-time and pass `now()` through this
// clock. While paused, `now()` returns a frozen value, so:
//   - `journeyPosition(j, now())`  → frozen lerp output (agent visually held
//     in place)
//   - `tickJourney(j, layout, now())` → no-op (elapsed never crosses the
//     phase duration boundary)
// On resume, the clock catches up by carrying forward the *frozen* time, so
// the very next frame's `elapsed` is the same as the last frame before pause
// — playback continues smoothly from the held position.

export interface VirtualClock {
  now: () => number
  setPlaying: (playing: boolean) => void
}

export function createVirtualClock(initialPlaying: boolean = true): VirtualClock {
  // Virtual time = performance.now() at construction + (real time elapsed
  // while playing). We track this as an offset between real-now and virtual-
  // now, plus a frozen virtual timestamp for when we're paused.
  //
  // Invariant when playing: virtual = real - offset
  // Invariant when paused:  virtual = frozenVirtual (constant)
  let playing = initialPlaying
  let offset = 0       // real - virtual, only meaningful while playing
  let frozenVirtual = 0  // last virtual value, only meaningful while paused

  function realNow(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  // Initialize: virtual starts at real-now so existing phase timestamps
  // (which were set with `performance.now()` before the clock was wired in)
  // remain meaningful for the first frame.
  offset = 0

  return {
    now() {
      if (playing) return realNow() - offset
      return frozenVirtual
    },
    setPlaying(next: boolean) {
      if (next === playing) return
      if (next) {
        // Resume: shift offset forward by however long we were frozen, so
        // virtual continues from frozenVirtual (no jump).
        offset = realNow() - frozenVirtual
        playing = true
      } else {
        // Pause: snapshot current virtual time.
        frozenVirtual = realNow() - offset
        playing = false
      }
    },
  }
}

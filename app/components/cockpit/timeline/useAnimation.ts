'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { simMinutesPerSec, type Speed } from '@/lib/animation/timeScale'

interface UseAnimationReturn {
  simTimeMin: number
  setSimTimeMin: (n: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  speed: Speed
  setSpeed: (s: Speed) => void
}

export function useAnimation(): UseAnimationReturn {
  // Default open at 9am so the office is busy from the first frame
  // (was 0/midnight which left the floor empty until the user scrubbed).
  const [simTimeMin, setSimTimeMin] = useState(540)
  const [playing, setPlaying] = useState(false)
  // Default to 0.25× — a full day in ~4 real minutes. Slow enough to
  // follow individual NPC walks across the floor.
  const [speed, setSpeed] = useState<Speed>(0.25)

  const lastFrameRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const speedRef = useRef(speed)

  useEffect(() => { speedRef.current = speed }, [speed])

  useEffect(() => {
    if (!playing) {
      lastFrameRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    function tick(now: number) {
      const last = lastFrameRef.current
      lastFrameRef.current = now
      if (last != null) {
        const deltaSec = (now - last) / 1000
        const deltaSimMin = deltaSec * simMinutesPerSec(speedRef.current)
        setSimTimeMin(prev => {
          const next = prev + deltaSimMin
          if (next >= 1440) {
            setPlaying(false)
            return 1440
          }
          return next
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing])

  const seek = useCallback((n: number) => {
    setSimTimeMin(Math.max(0, Math.min(1440, n)))
  }, [])

  return {
    simTimeMin,
    setSimTimeMin: seek,
    playing,
    setPlaying,
    speed,
    setSpeed,
  }
}

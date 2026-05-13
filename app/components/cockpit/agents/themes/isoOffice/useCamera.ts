'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Camera state for the iso-office SVG.
 *
 * `scale` = 1 means "fit" (the base viewBox). >1 zooms in, <1 zooms out.
 * `panX`/`panY` are offsets in *base* viewBox units; we divide by scale when
 * applying so dragging at high zoom feels natural (a gesture that moves N
 * pixels on screen pans by N "viewBox pixels", regardless of zoom).
 */
export interface CameraState {
  scale: number
  panX: number
  panY: number
}

export interface CameraOptions {
  /** Base viewBox width (the "fit" width). */
  baseW: number
  /** Base viewBox height. */
  baseH: number
  /** Base viewBox X origin (typically 0). */
  baseX?: number
  /** Base viewBox Y origin (typically 0). */
  baseY?: number
  /** Min/max zoom. Defaults: 0.5x to 4x. */
  minScale?: number
  maxScale?: number
  /** Fraction (0..1) of the office that must remain in view when panned. */
  minVisibleFraction?: number
}

export interface CameraApi {
  state: CameraState
  /** Effective viewBox to feed the SVG. */
  viewBox: { x: number; y: number; w: number; h: number }
  /** Are we mid-drag right now? Useful for cursor styling. */
  dragging: boolean
  /** Programmatically reset (animated). */
  reset(): void
  /** Zoom in by one step (keyboard +). */
  zoomIn(): void
  /** Zoom out by one step (keyboard -). */
  zoomOut(): void
  /** Pan by a delta in base-viewBox pixels (keyboard arrows). */
  panBy(dx: number, dy: number): void

  // SVG event handlers, wire onto the <svg>.
  onWheel(e: React.WheelEvent<SVGSVGElement>): void
  onMouseDown(e: React.MouseEvent<SVGSVGElement>): void
  // Touch handlers (optional pinch-zoom + drag).
  onTouchStart(e: React.TouchEvent<SVGSVGElement>): void
  onTouchMove(e: React.TouchEvent<SVGSVGElement>): void
  onTouchEnd(e: React.TouchEvent<SVGSVGElement>): void
}

const ZOOM_STEP = 1.2

const DEFAULTS = {
  minScale: 0.5,
  maxScale: 4,
  minVisibleFraction: 0.3,
}

/**
 * Clamp a candidate (panX, panY, scale) so at least `minVisibleFraction` of
 * the office stays in view. The office occupies [baseX, baseX+baseW] x
 * [baseY, baseY+baseH] in viewBox units. The current viewport (in viewBox
 * units) is [vbX, vbX+vbW] x [vbY, vbY+vbH] where vbW = baseW/scale, etc.
 *
 * "30% of the office must remain in view" → the overlap rect's area is
 * at least 30% of the office area. We approximate per-axis: each axis must
 * keep at least sqrt(0.3) of the office visible, which is conservative.
 */
function clampPan(
  panX: number, panY: number, scale: number,
  baseX: number, baseY: number, baseW: number, baseH: number,
  minVisibleFraction: number,
): { panX: number; panY: number } {
  const vbW = baseW / scale
  const vbH = baseH / scale
  const officeMinX = baseX
  const officeMaxX = baseX + baseW
  const officeMinY = baseY
  const officeMaxY = baseY + baseH

  // Per-axis minimum overlap (in office units).
  const axisFrac = Math.sqrt(minVisibleFraction)
  const minOverlapX = axisFrac * baseW
  const minOverlapY = axisFrac * baseH

  // Effective viewport.
  const vbX = baseX - panX / scale
  const vbY = baseY - panY / scale

  // Allowed range for vbX: must satisfy
  //   overlap = min(officeMaxX, vbX+vbW) - max(officeMinX, vbX) >= minOverlapX
  // Equivalent (cap-style) bounds:
  //   vbX in [officeMinX - (vbW - minOverlapX), officeMaxX - minOverlapX]
  // (when zoomed in vbW < baseW; when zoomed out vbW > baseW)
  const minVbX = officeMinX - Math.max(0, vbW - minOverlapX)
  const maxVbX = officeMaxX - minOverlapX
  const minVbY = officeMinY - Math.max(0, vbH - minOverlapY)
  const maxVbY = officeMaxY - minOverlapY

  // If zoomed way out, the bounds may invert (minVb > maxVb). In that case
  // allow free movement around centered.
  let clampedVbX = vbX
  if (minVbX <= maxVbX) clampedVbX = Math.min(maxVbX, Math.max(minVbX, vbX))
  let clampedVbY = vbY
  if (minVbY <= maxVbY) clampedVbY = Math.min(maxVbY, Math.max(minVbY, vbY))

  // Convert back to pan units.
  const newPanX = (baseX - clampedVbX) * scale
  const newPanY = (baseY - clampedVbY) * scale
  return { panX: newPanX, panY: newPanY }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useCamera(opts: CameraOptions): CameraApi {
  const baseX = opts.baseX ?? 0
  const baseY = opts.baseY ?? 0
  const baseW = opts.baseW
  const baseH = opts.baseH
  const minScale = opts.minScale ?? DEFAULTS.minScale
  const maxScale = opts.maxScale ?? DEFAULTS.maxScale
  const minVisibleFraction = opts.minVisibleFraction ?? DEFAULTS.minVisibleFraction

  const [state, setState] = useState<CameraState>({ scale: 1, panX: 0, panY: 0 })
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  }>({ active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 })

  // rAF token for the reset animation. Cancel before starting a new one so
  // double-clicks don't stack interpolations.
  const animRef = useRef<number | null>(null)

  const cancelAnim = useCallback(() => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
  }, [])

  // Zoom toward a *screen-relative* point (sx, sy), the point under the
  // cursor stays anchored. We compute the viewBox-space point, then adjust
  // pan so that point maps to the same screen position at the new scale.
  const zoomTo = useCallback((newScale: number, screenX: number, screenY: number, svgRect: DOMRect) => {
    const cur = stateRef.current
    const clamped = Math.max(minScale, Math.min(maxScale, newScale))
    if (clamped === cur.scale) return

    // Convert screen px -> viewBox-space coords (under current camera).
    // Screen origin of the SVG's viewport is svgRect.left, svgRect.top.
    // The viewBox we currently render is:
    //   vbX = baseX - panX/scale,  vbW = baseW/scale.
    // Screen-to-viewBox: vbCoord = vbX + (sx / svgRect.width) * vbW.
    const vbX = baseX - cur.panX / cur.scale
    const vbY = baseY - cur.panY / cur.scale
    const vbW = baseW / cur.scale
    const vbH = baseH / cur.scale
    const sx = screenX - svgRect.left
    const sy = screenY - svgRect.top
    const cursorVbX = vbX + (sx / svgRect.width) * vbW
    const cursorVbY = vbY + (sy / svgRect.height) * vbH

    // After zoom: we want cursorVbX/Y to map to the same screen position.
    // New vbW' = baseW/clamped, new vbX' = cursorVbX - (sx / svgRect.width) * vbW'.
    const newVbW = baseW / clamped
    const newVbH = baseH / clamped
    const newVbX = cursorVbX - (sx / svgRect.width) * newVbW
    const newVbY = cursorVbY - (sy / svgRect.height) * newVbH
    const rawPanX = (baseX - newVbX) * clamped
    const rawPanY = (baseY - newVbY) * clamped
    const { panX, panY } = clampPan(rawPanX, rawPanY, clamped, baseX, baseY, baseW, baseH, minVisibleFraction)
    cancelAnim()
    setState({ scale: clamped, panX, panY })
  }, [baseX, baseY, baseW, baseH, minScale, maxScale, minVisibleFraction, cancelAnim])

  const reset = useCallback(() => {
    cancelAnim()
    const start = { ...stateRef.current }
    const startTime = performance.now()
    const duration = 300
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      const e = easeOutCubic(t)
      const next: CameraState = {
        scale: start.scale + (1 - start.scale) * e,
        panX:  start.panX + (0 - start.panX) * e,
        panY:  start.panY + (0 - start.panY) * e,
      }
      setState(next)
      if (t < 1) {
        animRef.current = requestAnimationFrame(step)
      } else {
        animRef.current = null
      }
    }
    animRef.current = requestAnimationFrame(step)
  }, [cancelAnim])

  const zoomIn = useCallback(() => {
    cancelAnim()
    const cur = stateRef.current
    const next = Math.min(maxScale, cur.scale * ZOOM_STEP)
    setState(s => ({ ...s, scale: next }))
  }, [cancelAnim, maxScale])
  const zoomOut = useCallback(() => {
    cancelAnim()
    const cur = stateRef.current
    const next = Math.max(minScale, cur.scale / ZOOM_STEP)
    // After zoom-out we may need to re-center.
    const { panX, panY } = clampPan(cur.panX, cur.panY, next, baseX, baseY, baseW, baseH, minVisibleFraction)
    setState({ scale: next, panX, panY })
  }, [cancelAnim, minScale, baseX, baseY, baseW, baseH, minVisibleFraction])

  const panBy = useCallback((dx: number, dy: number) => {
    cancelAnim()
    const cur = stateRef.current
    const { panX, panY } = clampPan(cur.panX + dx, cur.panY + dy, cur.scale, baseX, baseY, baseW, baseH, minVisibleFraction)
    setState({ ...cur, panX, panY })
  }, [cancelAnim, baseX, baseY, baseW, baseH, minVisibleFraction])

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    // We can't preventDefault on a passive listener; React's synthetic event
    // is non-passive in modern React on SVG, but be defensive.
    if (e.cancelable !== false) e.preventDefault()
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const cur = stateRef.current
    zoomTo(cur.scale * factor, e.clientX, e.clientY, rect)
  }, [zoomTo])

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    cancelAnim()
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: stateRef.current.panX,
      startPanY: stateRef.current.panY,
    }
    setDragging(true)
  }, [cancelAnim])

  // Window-level mousemove/mouseup so drags continue if the cursor leaves
  // the SVG bounds (very common when zoomed in).
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current.active) return
      const dxScreen = e.clientX - dragRef.current.startX
      const dyScreen = e.clientY - dragRef.current.startY
      // Drag in *viewBox units*. We want a 1:1 feel: dragging N px on screen
      // should translate the world by N px on screen. The viewBox→screen scale
      // is roughly (svgWidth / vbW) = (svgWidth / (baseW/scale)) =
      // (svgWidth * scale / baseW). To translate by dxScreen pixels on screen,
      // we add dxScreen viewBox-pixels at scale=1 (because pan is in *base*
      // viewBox units). At scale=k the visual displacement per viewBox-pixel
      // is k× larger, so dragging feels "natural" without any extra scaling.
      // (We keep this simple, pan units == screen pixels at scale=1.)
      const cur = stateRef.current
      const rawPanX = dragRef.current.startPanX + dxScreen
      const rawPanY = dragRef.current.startPanY + dyScreen
      const { panX, panY } = clampPan(rawPanX, rawPanY, cur.scale, baseX, baseY, baseW, baseH, minVisibleFraction)
      setState({ ...cur, panX, panY })
    }
    function onUp() {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [baseX, baseY, baseW, baseH, minVisibleFraction])

  // Pinch-zoom (two-finger). Track the initial pinch distance + scale; on
  // every move scale relative to that. One-finger touch acts as pan.
  const touchRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch'
    startX: number
    startY: number
    startPanX: number
    startPanY: number
    pinchStartDist: number
    pinchStartScale: number
    pinchCenterX: number
    pinchCenterY: number
  }>({
    mode: 'idle',
    startX: 0, startY: 0, startPanX: 0, startPanY: 0,
    pinchStartDist: 0, pinchStartScale: 1, pinchCenterX: 0, pinchCenterY: 0,
  })

  const onTouchStart = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    cancelAnim()
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchRef.current = {
        ...touchRef.current,
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        startPanX: stateRef.current.panX,
        startPanY: stateRef.current.panY,
      }
    } else if (e.touches.length >= 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      touchRef.current = {
        ...touchRef.current,
        mode: 'pinch',
        pinchStartDist: Math.hypot(dx, dy) || 1,
        pinchStartScale: stateRef.current.scale,
        pinchCenterX: (t1.clientX + t2.clientX) / 2,
        pinchCenterY: (t1.clientY + t2.clientY) / 2,
      }
    }
  }, [cancelAnim])

  const onTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (touchRef.current.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0]
      const dx = t.clientX - touchRef.current.startX
      const dy = t.clientY - touchRef.current.startY
      const cur = stateRef.current
      const rawPanX = touchRef.current.startPanX + dx
      const rawPanY = touchRef.current.startPanY + dy
      const { panX, panY } = clampPan(rawPanX, rawPanY, cur.scale, baseX, baseY, baseW, baseH, minVisibleFraction)
      setState({ ...cur, panX, panY })
    } else if (touchRef.current.mode === 'pinch' && e.touches.length >= 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy) || 1
      const ratio = dist / touchRef.current.pinchStartDist
      const newScale = touchRef.current.pinchStartScale * ratio
      const rect = e.currentTarget.getBoundingClientRect()
      zoomTo(newScale, touchRef.current.pinchCenterX, touchRef.current.pinchCenterY, rect)
    }
  }, [baseX, baseY, baseW, baseH, minVisibleFraction, zoomTo])

  const onTouchEnd = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 0) {
      touchRef.current.mode = 'idle'
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      touchRef.current = {
        ...touchRef.current,
        mode: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        startPanX: stateRef.current.panX,
        startPanY: stateRef.current.panY,
      }
    }
  }, [])

  const viewBox = useMemo(() => {
    const vbX = baseX - state.panX / state.scale
    const vbY = baseY - state.panY / state.scale
    const vbW = baseW / state.scale
    const vbH = baseH / state.scale
    return { x: vbX, y: vbY, w: vbW, h: vbH }
  }, [baseX, baseY, baseW, baseH, state.panX, state.panY, state.scale])

  // Memoize the API object so it has stable identity across renders when none
  // of its observable fields change. Without this, IsoRenderer's keyboard
  // useEffect (which depends on `camera`) re-registers on every parent
  // re-render, and during heavy rAF-driven re-render cycles (Round 6 added
  // the camera, which compounded with the existing journey/positions ticks),
  // React 19's "max update depth" guard misclassifies the cascade as a
  // runaway update inside the useAnimation rAF. Stable identity breaks the
  // cascade.
  return useMemo(() => ({
    state,
    viewBox,
    dragging,
    reset,
    zoomIn,
    zoomOut,
    panBy,
    onWheel,
    onMouseDown,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }), [state, viewBox, dragging, reset, zoomIn, zoomOut, panBy, onWheel, onMouseDown, onTouchStart, onTouchMove, onTouchEnd])
}

// Exported for tests.
export const __test_internals = { clampPan, easeOutCubic }

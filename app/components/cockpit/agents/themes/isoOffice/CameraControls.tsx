'use client'

interface CameraControlsProps {
  scale: number
  onReset: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

/**
 * Tiny button strip in the top-right of the office canvas (sits to the LEFT
 * of the existing ThemePicker). Shows zoom +/− and a reset button. The reset
 * button only highlights when the camera isn't already at 1×.
 */
export function CameraControls({ scale, onReset, onZoomIn, onZoomOut }: CameraControlsProps) {
  const zoomed = Math.abs(scale - 1) > 0.001
  const pct = Math.round(scale * 100)
  return (
    <div className="cockpit-camera-controls" role="group" aria-label="Camera controls">
      <button
        type="button"
        className="cockpit-camera-btn"
        title="Zoom out (−)"
        onClick={onZoomOut}
      >−</button>
      <span className="cockpit-camera-zoom-label" aria-live="polite">{pct}%</span>
      <button
        type="button"
        className="cockpit-camera-btn"
        title="Zoom in (+)"
        onClick={onZoomIn}
      >+</button>
      <button
        type="button"
        className={`cockpit-camera-btn cockpit-camera-reset ${zoomed ? 'cockpit-camera-reset--active' : ''}`}
        title="Reset view (0)"
        onClick={onReset}
        aria-label="Reset view"
      >↺</button>
    </div>
  )
}

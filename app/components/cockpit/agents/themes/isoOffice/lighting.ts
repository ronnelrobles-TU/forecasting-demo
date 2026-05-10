// Time-of-day lighting model. Computes a `LightingState` (sky colour, window
// fill, wall warmth, sun/moon position) from `simTimeMin` ∈ [0, 1440).
// Pure — no side effects, easy to test.
//
// Sky colour interpolates between keyframes (see SKY_KEYFRAMES). Window fill
// shifts warm at dawn/dusk and dark at night. Wall warmth (0..1) is a subtle
// overlay applied by IsoRenderer at night (warm yellow tint over the floor).
// Sun/moon trace a half-circle arc across the sky (rises east, sets west).

export interface LightingState {
  /** SVG background colour (the sky behind the building). */
  skyColor: string
  /** Fill applied to building windows. Shifts warm at dawn/dusk, dark at night. */
  windowFill: string
  /** Border colour for windows (matches windowFill for visual cohesion). */
  windowStroke: string
  /** 0 = cool/day, 1 = warm/night. Used as alpha for a yellow overlay. */
  wallWarmth: number
  /** Where the sun (or moon) sits in the SVG. Visible:false hides it. */
  sunPosition: { x: number; y: number; visible: boolean }
  /** True if it's currently nighttime (informs window pattern + sprite). */
  isNight: boolean
  /** Sprite label: "sun" or "moon" — caller chooses how to render. */
  celestialBody: 'sun' | 'moon'
}

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const v = parseInt(h, 16)
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff }
}

function rgbToHex(c: RGB): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r))).toString(16).padStart(2, '0')
  const g = Math.max(0, Math.min(255, Math.round(c.g))).toString(16).padStart(2, '0')
  const b = Math.max(0, Math.min(255, Math.round(c.b))).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const tt = Math.max(0, Math.min(1, t))
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * tt,
    g: ca.g + (cb.g - ca.g) * tt,
    b: ca.b + (cb.b - ca.b) * tt,
  })
}

// Sky colour keyframes (sim-minute → hex). Linear interpolation between
// adjacent entries; wraps at 1440 (24h).
interface SkyKeyframe { min: number; color: string }
const SKY_KEYFRAMES: SkyKeyframe[] = [
  { min:    0, color: '#0a0e1a' },   // 0:00 — deep night
  { min:  240, color: '#0a0e1a' },   // 4:00
  { min:  360, color: '#1a1f3a' },   // 6:00 — late night purple
  { min:  390, color: '#3d2c5a' },   // 6:30 — dawn purple
  { min:  420, color: '#7d4a8a' },   // 7:00 — dawn pink
  { min:  450, color: '#f59e0b' },   // 7:30 — sunrise orange
  { min:  480, color: '#fbbf24' },   // 8:00 — bright yellow
  { min:  540, color: '#fef3c7' },   // 9:00 — warm morning yellow
  { min:  600, color: '#dbeafe' },   // 10:00 — clear sky blue
  { min:  960, color: '#dbeafe' },   // 16:00 — clear day
  { min: 1020, color: '#fde68a' },   // 17:00 — late afternoon golden
  { min: 1050, color: '#f97316' },   // 17:30 — golden hour orange
  { min: 1080, color: '#dc2626' },   // 18:00 — sunset red
  { min: 1110, color: '#7c3aed' },   // 18:30 — dusk purple
  { min: 1140, color: '#3730a3' },   // 19:00 — dusk indigo
  { min: 1320, color: '#1e293b' },   // 22:00 — evening dark
  { min: 1440, color: '#0a0e1a' },   // 24:00 — back to deep night
]

function interpolateKeyframe(simTimeMin: number, keys: SkyKeyframe[]): string {
  const t = ((simTimeMin % 1440) + 1440) % 1440
  // Find bracketing keyframes.
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].min && t <= keys[i + 1].min) {
      const span = keys[i + 1].min - keys[i].min
      const frac = span === 0 ? 0 : (t - keys[i].min) / span
      return lerpColor(keys[i].color, keys[i + 1].color, frac)
    }
  }
  return keys[keys.length - 1].color
}

// Window keyframes — windows appear bright sky-blue during the day, warm
// orange at sunset, dark/yellow-lit at night.
const WINDOW_KEYFRAMES: SkyKeyframe[] = [
  { min:    0, color: '#1e293b' },   // night — dim slate (some windows lit yellow elsewhere)
  { min:  360, color: '#1e293b' },   // 6:00 still mostly dark
  { min:  420, color: '#fde68a' },   // 7:00 dawn warm
  { min:  480, color: '#bae6fd' },   // 8:00 morning sky
  { min: 1020, color: '#bae6fd' },   // 17:00
  { min: 1080, color: '#fb923c' },   // 18:00 sunset glow
  { min: 1140, color: '#5b21b6' },   // 19:00 dusk dark purple
  { min: 1320, color: '#1e293b' },   // 22:00
  { min: 1440, color: '#1e293b' },
]

function isNightTime(simTimeMin: number): boolean {
  const t = ((simTimeMin % 1440) + 1440) % 1440
  return t < 6 * 60 || t > 19.5 * 60
}

// Wall warmth: 0 during day, ramps to 0.35 at night (overlay alpha).
function wallWarmth(simTimeMin: number): number {
  const t = ((simTimeMin % 1440) + 1440) % 1440
  // 0 during 8:00-17:00; ramp up to 0.35 by 19:30, hold through 5:30,
  // ramp back down to 0 by 7:30.
  if (t >= 8 * 60 && t <= 17 * 60) return 0
  if (t >= 19.5 * 60 || t <= 5.5 * 60) return 0.35
  // Ramps:
  if (t > 17 * 60 && t < 19.5 * 60) return ((t - 17 * 60) / (2.5 * 60)) * 0.35
  if (t > 5.5 * 60 && t < 8 * 60) return ((8 * 60 - t) / (2.5 * 60)) * 0.35
  return 0
}

// Sun/moon arc. Sun rises ~6:30, sets ~18:30. Outside that window, moon
// occupies a similar arc (rises ~19:00, sets ~6:00).
function celestialPosition(
  simTimeMin: number,
  viewBox: { w: number; h: number },
): { x: number; y: number; visible: boolean; body: 'sun' | 'moon' } {
  const t = ((simTimeMin % 1440) + 1440) % 1440
  const padX = viewBox.w * 0.08
  const padY = viewBox.h * 0.04
  const arcW = viewBox.w - padX * 2
  const arcMaxY = padY                       // top of arc (highest point)
  const arcMinY = viewBox.h * 0.18           // bottom (horizon line)

  function arcAt(frac: number): { x: number; y: number } {
    // frac=0 east horizon (right), frac=1 west horizon (left).
    const fx = Math.max(0, Math.min(1, frac))
    const x = viewBox.w - padX - fx * arcW
    const sinComponent = Math.sin(fx * Math.PI)        // 0 → 1 → 0
    const y = arcMinY - (arcMinY - arcMaxY) * sinComponent
    return { x, y }
  }

  // Sun arc — 6:30 to 18:30 (12 hours)
  const SUNRISE = 6.5 * 60
  const SUNSET = 18.5 * 60
  if (t >= SUNRISE && t <= SUNSET) {
    const frac = (t - SUNRISE) / (SUNSET - SUNRISE)
    const p = arcAt(frac)
    return { x: p.x, y: p.y, visible: true, body: 'sun' }
  }
  // Moon arc — 19:00 to 6:00 next day (11 hours, wraps).
  const MOONRISE = 19 * 60
  const MOONSET = 6 * 60
  let frac = 0
  if (t >= MOONRISE) frac = (t - MOONRISE) / (24 * 60 - MOONRISE + MOONSET)
  else if (t <= MOONSET) frac = (24 * 60 - MOONRISE + t) / (24 * 60 - MOONRISE + MOONSET)
  else return { x: 0, y: 0, visible: false, body: 'moon' }
  const p = arcAt(frac)
  return { x: p.x, y: p.y, visible: true, body: 'moon' }
}

export function computeLighting(
  simTimeMin: number,
  viewBox: { w: number; h: number },
): LightingState {
  const skyColor = interpolateKeyframe(simTimeMin, SKY_KEYFRAMES)
  const windowFill = interpolateKeyframe(simTimeMin, WINDOW_KEYFRAMES)
  const isNight = isNightTime(simTimeMin)
  const sun = celestialPosition(simTimeMin, viewBox)
  return {
    skyColor,
    windowFill,
    windowStroke: lerpColor(windowFill, '#0c4a6e', 0.35),
    wallWarmth: wallWarmth(simTimeMin),
    sunPosition: { x: sun.x, y: sun.y, visible: sun.visible },
    isNight,
    celestialBody: sun.body,
  }
}

// Snap-to-grid helper: returns simTimeMin rounded down to the nearest 5-min
// boundary so memoization in IsoRenderer doesn't recompute lighting every
// frame. Caller does:
//   const lightingTime = quantizeLightingTime(simTimeMin)
//   const lighting = useMemo(() => computeLighting(lightingTime, vb), [lightingTime, vb])
export function quantizeLightingTime(simTimeMin: number, stepMin = 5): number {
  return Math.floor(simTimeMin / stepMin) * stepMin
}

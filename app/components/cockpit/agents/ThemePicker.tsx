'use client'

import { useScenario, type ThemeKey } from '../ScenarioContext'

// NOTE: 'office' theme is kept in code for safekeeping (was the v1 prototype)
// but unlinked from the picker now that 'office-hd' is the canonical version.
const THEMES: Array<{ key: ThemeKey; label: string }> = [
  { key: 'dots', label: 'Dots' },
  { key: 'office-hd', label: 'Office HD' },
]

export function ThemePicker() {
  const { theme, setTheme } = useScenario()
  return (
    <div className="cockpit-theme-picker" role="group" aria-label="Visualization theme">
      {THEMES.map(t => (
        <button
          key={t.key}
          type="button"
          className={`cockpit-theme-picker-btn ${theme === t.key ? 'cockpit-theme-picker-btn--active' : ''}`}
          aria-pressed={theme === t.key}
          onClick={() => setTheme(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

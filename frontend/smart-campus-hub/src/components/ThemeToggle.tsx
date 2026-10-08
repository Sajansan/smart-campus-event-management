import { useEffect, useState } from 'react'
import Icon from './Icon'

type Theme = 'light' | 'dark'
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#18121f' : '#7042b5')
}
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => {
      let saved: string | null = null
      try { saved = localStorage.getItem('dbit:theme:v1') } catch { /* Theme still works when storage is unavailable. */ }
      if (saved === 'light' || saved === 'dark') return
      const next = media.matches ? 'dark' : 'light'
      applyTheme(next); setTheme(next)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next); setTheme(next)
    try { localStorage.setItem('dbit:theme:v1', next) } catch { /* Keep the choice for this page even without persistent storage. */ }
  }
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18}/><span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>
}

import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'

export function useTheme() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const applyDark = (dark: boolean) => {
      root.classList.toggle('dark', dark)
    }

    if (theme === 'dark') {
      applyDark(true)
    } else if (theme === 'light') {
      applyDark(false)
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyDark(mq.matches)
      const listener = (e: MediaQueryListEvent) => applyDark(e.matches)
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }
  }, [theme])
}

'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { THEME_CONFIGS } from '@/lib/theme-configs'

interface ThemeContextValue {
  activeThemeId: string
  applyTheme: (themeId: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  activeThemeId: 'default',
  applyTheme: () => {},
})

const STORAGE_KEY = 'flowstate_active_theme'

function applyVars(vars: Record<string, string>) {
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

function clearThemeVars() {
  const root = document.documentElement
  const defaults = THEME_CONFIGS['default'].vars
  for (const key of Object.keys(defaults)) {
    root.style.removeProperty(key)
  }
}

export function FlowThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState('default')

  const applyTheme = useCallback((themeId: string) => {
    const config = THEME_CONFIGS[themeId]
    if (!config) return
    setActiveThemeId(themeId)
    applyVars(config.vars)
    try {
      localStorage.setItem(STORAGE_KEY, themeId)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && THEME_CONFIGS[stored]) {
        applyTheme(stored)
      }
    } catch {}

    const handleStorage = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored && THEME_CONFIGS[stored]) {
          applyTheme(stored)
        }
      } catch {}
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [applyTheme])

  return (
    <ThemeContext.Provider value={{ activeThemeId, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useFlowTheme = () => useContext(ThemeContext)

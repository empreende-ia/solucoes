'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

interface DevModeContextValue {
  isDevMode: boolean
  toggleDevMode: () => void
}

const DevModeContext = createContext<DevModeContextValue | null>(null)

const STORAGE_KEY = 'dispara:devMode'

export function DevModeProvider({ children }: { children: React.ReactNode }) {
  const [isDevMode, setIsDevMode] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Hydrate from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') {
      setIsDevMode(true)
    }
    setIsHydrated(true)
  }, [])

  // Persist to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEY, String(isDevMode))
    }
  }, [isDevMode, isHydrated])

  const toggleDevMode = useCallback(() => {
    setIsDevMode(prev => !prev)
  }, [])

  const value = useMemo(() => ({ isDevMode, toggleDevMode }), [isDevMode, toggleDevMode])

  return (
    <DevModeContext.Provider value={value}>
      {children}
    </DevModeContext.Provider>
  )
}

export function useDevMode() {
  const ctx = useContext(DevModeContext)
  if (!ctx) {
    // Fallback para SSR ou fora do provider - retorna estado "desligado"
    return { isDevMode: false, toggleDevMode: () => {} }
  }
  return ctx
}

'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'

/**
 * Hook para detectar media queries CSS em JavaScript
 * Usa useSyncExternalStore para evitar hydration mismatch
 * @param query - Media query string (ex: '(min-width: 1024px)')
 * @returns boolean indicando se a query está ativa
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', callback)
    return () => mediaQuery.removeEventListener('change', callback)
  }

  const getSnapshot = () => {
    return window.matchMedia(query).matches
  }

  // Server sempre retorna false para evitar hydration mismatch
  // O cliente vai renderizar o valor correto no primeiro paint
  const getServerSnapshot = () => false

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Hook conveniente para detectar se está em mobile/tablet (< 1024px)
 * Usa o breakpoint 'lg' do Tailwind como ponto de corte
 */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 1024px)')
}

/**
 * Hook conveniente para detectar se está em tablet (>= 768px e < 1024px)
 */
export function useIsTablet(): boolean {
  const isAboveSm = useMediaQuery('(min-width: 768px)')
  const isBelowLg = !useMediaQuery('(min-width: 1024px)')
  return isAboveSm && isBelowLg
}

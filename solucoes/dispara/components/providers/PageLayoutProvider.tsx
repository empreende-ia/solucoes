
'use client'

import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'

export type PageWidth = 'content' | 'wide' | 'full'
export type PageOverflow = 'auto' | 'hidden'
export type PageHeight = 'auto' | 'full'

export interface PageLayoutConfig {
  /** Largura do wrapper interno da página */
  width: PageWidth
  /** Controle do scroll do <main> */
  overflow: PageOverflow
  /** Se aplica padding padrão no <main> */
  padded: boolean
  /** Se o wrapper interno deve preencher altura */
  height: PageHeight
  /** Exibe o banner de alertas da conta (pagamentos/limites) */
  showAccountAlerts: boolean
}

const DEFAULT_LAYOUT: PageLayoutConfig = {
  width: 'content',
  overflow: 'auto',
  padded: true,
  height: 'auto',
  showAccountAlerts: true,
}

type LayoutStackItem = {
  id: string
  value: Partial<PageLayoutConfig>
}

type PageLayoutContextValue = {
  layout: PageLayoutConfig
  push: (value: Partial<PageLayoutConfig>) => string
  pop: (id: string) => void
}

const PageLayoutContext = createContext<PageLayoutContextValue | null>(null)

export interface PageLayoutProviderProps {
  /** Child components that will have access to page layout context */
  children: React.ReactNode
}

export function PageLayoutProvider({ children }: PageLayoutProviderProps) {
  const [stack, setStack] = useState<LayoutStackItem[]>([])
  const idSeq = useRef(0)

  const layout = useMemo<PageLayoutConfig>(() => {
    const merged = stack.reduce<Partial<PageLayoutConfig>>((acc, item) => ({ ...acc, ...item.value }), {})
    return { ...DEFAULT_LAYOUT, ...merged }
  }, [stack])

  const push = useCallback((value: Partial<PageLayoutConfig>) => {
    const id = `pl_${++idSeq.current}`
    setStack((prev) => [...prev, { id, value }])
    return id
  }, [])

  const pop = useCallback((id: string) => {
    setStack((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const ctx = useMemo<PageLayoutContextValue>(() => ({ layout, push, pop }), [layout, push, pop])

  return <PageLayoutContext.Provider value={ctx}>{children}</PageLayoutContext.Provider>
}

export function usePageLayout() {
  const ctx = useContext(PageLayoutContext)
  return ctx?.layout ?? DEFAULT_LAYOUT
}

export function usePageLayoutController() {
  const ctx = useContext(PageLayoutContext)
  if (!ctx) {
    // Fail-soft: permite render sem provider em cenários isolados.
    return {
      push: () => 'pl_0',
      pop: () => undefined,
    }
  }
  return { push: ctx.push, pop: ctx.pop }
}

export interface PageLayoutScopeProps {
  /** Partial layout configuration to apply within this scope */
  value: Partial<PageLayoutConfig>
  /** Content to render with the scoped layout */
  children: React.ReactNode
}

export function PageLayoutScope({
  value,
  children,
}: PageLayoutScopeProps) {
  const { push, pop } = usePageLayoutController()
  const scopeIdRef = useRef<string | null>(null)

  // Mantém o valor sempre refletindo o props atual: ao mudar, trocamos o scope.
  useLayoutEffect(() => {
    const id = push(value)
    scopeIdRef.current = id
    return () => {
      pop(id)
    }
    // Intencional: value é objeto; quem usar deve passar literal estável ou aceitar re-scope.
  }, [push, pop, value])

  return <>{children}</>
}

export function getPageWidthClass(width: PageWidth) {
  switch (width) {
    case 'content':
      // Padrão legível (7xl) mas aproveita melhor telas grandes (>= 2xl)
      return 'max-w-7xl 2xl:max-w-[1440px] mx-auto'
    case 'wide':
      return 'max-w-[1440px] mx-auto'
    case 'full':
      return 'w-full'
  }
}

'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import type { AttendantPermissions } from '@/types'
import { computeReconnectDelay, isTransientHttpStatus } from '@/components/attendant/attendant-reconnect'

// =============================================================================
// TYPES
// =============================================================================

interface AttendantInfo {
  id: string
  name: string
  permissions: AttendantPermissions
}

interface AttendantContextType {
  // Estado
  isReady: boolean
  isValidating: boolean
  isAuthenticated: boolean
  /**
   * A validação falhou por motivo transitório (503 com o banco oscilando, 5xx,
   * rede): a sessão NÃO foi negada e a validação está sendo repetida com backoff.
   */
  isReconnecting: boolean
  error: string | null

  // Atendente
  attendant: AttendantInfo | null
  token: string | null

  // Permissões
  canView: boolean
  canReply: boolean
  canHandoff: boolean

  // Ações
  logout: () => Promise<void>
  /** Antecipa a próxima tentativa de reconexão (botão "Tentar agora"). */
  retryNow: () => void
}

interface ValidateResponse {
  valid?: boolean
  error?: string
  attendant?: AttendantInfo
}

// =============================================================================
// CONSTANTS
// =============================================================================

const VALIDATE_URL = '/api/attendants/validate'

// =============================================================================
// CONTEXT
// =============================================================================

const AttendantContext = createContext<AttendantContextType | null>(null)

// =============================================================================
// PROVIDER
// =============================================================================

interface AttendantProviderProps {
  children: ReactNode
  token: string | null
}

export function AttendantProvider({ children, token }: AttendantProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attendant, setAttendant] = useState<AttendantInfo | null>(null)
  // Incrementado para disparar uma nova tentativa (backoff, "Tentar agora", volta da rede)
  const [retryNonce, setRetryNonce] = useState(0)
  const authenticatedRef = useRef(false)
  const attemptRef = useRef(0)
  const lastTokenRef = useRef<string | null>(token)

  // Com ?token → POST (valida e grava o cookie); sem ?token → GET (restaura do cookie).
  // A navegação interna não leva mais o ?token= na URL: a sessão segue pelo cookie httpOnly.
  useEffect(() => {
    // Já autenticado e a URL nova não tem ?token= (navegação interna): nada a revalidar.
    if (!token && authenticatedRef.current) return

    // Outro link (?token diferente): o backoff recomeça do zero.
    if (token !== lastTokenRef.current) {
      lastTokenRef.current = token
      attemptRef.current = 0
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    // Revalidação com sessão ativa (ex.: voltar para o link com ?token=) ou nova
    // tentativa de reconexão não pisca o loading
    if (!authenticatedRef.current && attemptRef.current === 0) setIsValidating(true)

    // Falha transitória: o servidor não disse que o token é inválido (o cookie foi
    // preservado). Mantém a sessão como está e tenta de novo com backoff.
    const scheduleRetry = (retryAfter: string | null) => {
      const delay = computeReconnectDelay(attemptRef.current, retryAfter)
      attemptRef.current += 1
      setIsReconnecting(true)
      setError(null)
      retryTimer = setTimeout(() => setRetryNonce((n) => n + 1), delay)
    }

    const validate = async () => {
      try {
        let res: Response
        try {
          res = token
            ? await fetch(VALIDATE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ token }),
              })
            : await fetch(VALIDATE_URL, {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store',
              })
        } catch (err) {
          // Rede (offline, servidor reiniciando): transitório, não é "acesso negado".
          if (cancelled) return
          console.warn('[AttendantProvider] Falha de rede ao validar a sessão, tentando de novo:', err)
          scheduleRetry(null)
          return
        }

        const data = (await res.json().catch(() => ({}))) as ValidateResponse
        if (cancelled) return

        if (res.ok && data.valid && data.attendant) {
          attemptRef.current = 0
          authenticatedRef.current = true
          setAttendant(data.attendant)
          setIsAuthenticated(true)
          setIsReconnecting(false)
          setError(null)
        } else if (isTransientHttpStatus(res.status)) {
          // 503 (banco indisponível, com Retry-After) ou outro 5xx
          scheduleRetry(res.headers?.get('Retry-After') ?? null)
        } else {
          // 4xx: veredito do servidor (token inválido/revogado/expirado, sem sessão)
          attemptRef.current = 0
          authenticatedRef.current = false
          setAttendant(null)
          setIsAuthenticated(false)
          setIsReconnecting(false)
          setError(data.error || (token ? 'Token inválido' : 'Token não informado'))
        }
      } finally {
        if (!cancelled) {
          setIsValidating(false)
          setIsReady(true)
        }
      }
    }

    validate()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [token, retryNonce])

  // A rede voltou durante a reconexão: tenta já, sem esperar o backoff.
  useEffect(() => {
    if (!isReconnecting) return
    const onOnline = () => setRetryNonce((n) => n + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [isReconnecting])

  const retryNow = useCallback(() => {
    setRetryNonce((n) => n + 1)
  }, [])

  // Logout: apaga o cookie no servidor e zera o estado local
  const logout = useCallback(async () => {
    try {
      await fetch(VALIDATE_URL, { method: 'DELETE', credentials: 'same-origin' })
    } catch (err) {
      console.error('[AttendantProvider] Erro ao encerrar sessão:', err)
    }
    authenticatedRef.current = false
    attemptRef.current = 0
    setAttendant(null)
    setIsAuthenticated(false)
    setIsReconnecting(false)
    setError('Sessão encerrada')
  }, [])

  // Permissões derivadas
  const canView = attendant?.permissions.canView ?? false
  const canReply = attendant?.permissions.canReply ?? false
  const canHandoff = attendant?.permissions.canHandoff ?? false

  const contextValue: AttendantContextType = {
    isReady,
    isValidating,
    isAuthenticated,
    isReconnecting,
    error,
    attendant,
    token,
    canView,
    canReply,
    canHandoff,
    logout,
    retryNow,
  }

  return (
    <AttendantContext.Provider value={contextValue}>
      {children}
    </AttendantContext.Provider>
  )
}

// =============================================================================
// HOOK
// =============================================================================

export function useAttendant() {
  const context = useContext(AttendantContext)
  if (!context) {
    throw new Error('useAttendant must be used within AttendantProvider')
  }
  return context
}

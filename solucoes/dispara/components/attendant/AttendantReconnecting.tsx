'use client'

/**
 * Estados de "reconectando" da PWA de atendente.
 *
 * Usados quando o servidor responde 503/5xx ou a rede cai: a sessão do
 * atendente continua válida (o cookie não foi apagado), então a PWA NÃO mostra
 * "Acesso Negado" — mostra que está tentando de novo.
 */

import { Loader2, WifiOff } from 'lucide-react'

interface AttendantReconnectingPageProps {
  /** Antecipa a próxima tentativa (sem esperar o backoff). */
  onRetry?: () => void
}

/** Tela cheia: ainda não foi possível validar/carregar, mas não houve negação. */
export function AttendantReconnectingPage({ onRetry }: AttendantReconnectingPageProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center min-h-screen px-4 text-center"
      style={{ backgroundColor: 'var(--geist-background)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: 'var(--geist-warning-light)' }}
      >
        <WifiOff size={32} style={{ color: 'var(--geist-warning)' }} />
      </div>
      <h1
        className="text-xl font-semibold mb-2"
        style={{ color: 'var(--geist-foreground)' }}
      >
        Reconectando...
      </h1>
      <p
        className="mb-6 max-w-sm"
        style={{ color: 'var(--geist-foreground-secondary)' }}
      >
        Não foi possível falar com o servidor agora. Seu acesso continua válido: estamos
        tentando de novo automaticamente.
      </p>
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--geist-foreground-tertiary)' }}>
        <Loader2 size={16} className="animate-spin" />
        Tentando reconectar
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            border: '1px solid var(--geist-border)',
            color: 'var(--geist-foreground)',
            backgroundColor: 'var(--geist-component-bg)',
          }}
        >
          Tentar agora
        </button>
      )}
    </div>
  )
}

/** Faixa discreta: os dados já carregados continuam na tela enquanto o polling tenta de novo. */
export function AttendantReconnectingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="shrink-0 flex items-center gap-2 px-4 py-2 text-xs"
      style={{
        backgroundColor: 'var(--geist-warning-light)',
        color: 'var(--geist-warning)',
        borderBottom: '1px solid var(--geist-border)',
      }}
    >
      <Loader2 size={14} className="animate-spin" />
      Conexão instável. Tentando reconectar...
    </div>
  )
}

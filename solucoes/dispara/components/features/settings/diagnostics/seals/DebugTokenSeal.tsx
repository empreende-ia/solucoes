'use client'

import Link from 'next/link'
import type { MetaDiagnosticsResponse } from '@/services/metaDiagnosticsService'
import type { MetaDiagnosticsCheckStatus } from '../types'
import { StatusBadge } from '../StatusBadge'
import { Container } from '@/components/ui/container'

export interface DebugTokenSealProps {
  data?: MetaDiagnosticsResponse
}

export function DebugTokenSeal({ data }: DebugTokenSealProps) {
  const metaApp = data?.metaApp || null
  const dbg = data?.debugTokenValidation || null

  const enabled = Boolean(dbg?.enabled || metaApp?.enabled)
  const source = (dbg?.source || metaApp?.source || 'none') as 'db' | 'env' | 'none'

  const status: MetaDiagnosticsCheckStatus = !enabled
    ? 'info'
    : (dbg?.attempted && dbg?.ok === true && dbg?.isValid === true)
      ? 'pass'
      : (dbg?.attempted && (dbg?.ok === false || dbg?.isValid === false))
        ? 'warn'
        : 'info'

  const sourceLabel = source === 'db' ? 'Banco (Supabase)' : source === 'env' ? 'Env vars' : '—'
  const title = enabled ? 'debug_token habilitado' : 'debug_token desabilitado'
  const subtitle = !enabled
    ? 'Configure o Meta App ID/Secret para validar token/escopos com prova (menos achismo, menos suporte).'
    : dbg?.attempted
      ? (dbg?.ok === true && dbg?.isValid === true ? 'Ultima validacao: OK' : 'Ultima validacao: falhou')
      : 'Aguardando primeira validacao'

  return (
    <Container variant="glass" padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-[var(--ds-text-muted)]">Selo</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={status} />
            <div className="text-sm text-[var(--ds-text-primary)] font-medium truncate">{title}</div>
          </div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">{subtitle}</div>
          <div className="mt-2 text-xs text-[var(--ds-text-muted)]">Fonte: {sourceLabel}</div>
        </div>

        <div className="text-right">
          <div className="text-xs text-[var(--ds-text-muted)]">App ID</div>
          <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-mono">{metaApp?.appId || '—'}</div>
          <div className="mt-2">
            <Link
              href="/settings"
              className="text-xs text-[var(--ds-text-secondary)] underline hover:text-[var(--ds-text-primary)] transition-colors"
            >
              Configurar
            </Link>
          </div>
        </div>
      </div>

      {enabled && dbg?.attempted && dbg?.ok === false && dbg?.error != null ? (
        <div className="mt-4 text-xs text-[var(--ds-text-secondary)]">
          Detalhe: {typeof dbg.error === 'string' ? dbg.error : 'Falha ao validar via /debug_token'}
        </div>
      ) : null}
    </Container>
  )
}

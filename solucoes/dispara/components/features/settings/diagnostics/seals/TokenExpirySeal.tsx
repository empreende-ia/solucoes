'use client'

import { Clock } from 'lucide-react'
import type { MetaDiagnosticsResponse } from '@/services/metaDiagnosticsService'
import type { MetaDiagnosticsCheck, MetaDiagnosticsCheckStatus } from '../types'
import { StatusBadge } from '../StatusBadge'
import { Container } from '@/components/ui/container'

export interface TokenExpirySealProps {
  data?: MetaDiagnosticsResponse
  checks: MetaDiagnosticsCheck[]
}

export function TokenExpirySeal({ data, checks }: TokenExpirySealProps) {
  const enabled = Boolean(data?.debugTokenValidation?.enabled)
  const token = data?.summary?.token || null

  // fallback (se summary/token nao vier por algum motivo): tenta ler do check meta_debug_token
  const fallbackExpiresAt = (() => {
    const c = checks.find((x) => x.id === 'meta_debug_token')
    const v = (c?.details as Record<string, unknown>)?.expiresAt
    if (typeof v === 'number') return v
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  })()

  const expiresIso = token?.expiresAtIso || (fallbackExpiresAt ? new Date(fallbackExpiresAt * 1000).toISOString() : null)
  const status = token?.status || (enabled ? 'unknown' : 'unknown')

  const badgeStatus: MetaDiagnosticsCheckStatus =
    !enabled ? 'info' : status === 'expired' ? 'fail' : status === 'expiring' ? 'warn' : status === 'ok' ? 'pass' : 'info'

  const subtitle = !enabled
    ? 'Para ver expiracao do token com prova, habilite debug_token (Meta App ID/Secret).'
    : expiresIso
      ? `Expira em: ${new Date(expiresIso).toLocaleString('pt-BR')}`
      : 'Expiracao nao disponivel (tipo de token/Meta nao retornou expires_at).'

  const extra = enabled && token?.daysRemaining != null
    ? `Dias restantes: ${token.daysRemaining}`
    : null

  return (
    <Container variant="glass" padding="md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-[var(--ds-text-muted)]">Token</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={badgeStatus} />
            <div className="text-sm text-[var(--ds-text-primary)] font-medium">Expiracao</div>
          </div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">{subtitle}</div>
          {extra && <div className="mt-2 text-xs text-[var(--ds-text-muted)]">{extra}</div>}
        </div>
        <div className="shrink-0 text-[var(--ds-text-secondary)]">
          <Clock size={18} />
        </div>
      </div>
    </Container>
  )
}

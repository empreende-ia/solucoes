'use client'

import type { MetaDiagnosticsCheck, MetaDiagnosticsCheckStatus } from '../types'
import { StatusBadge } from '../StatusBadge'
import { Container } from '@/components/ui/container'

export interface HealthStatusSealProps {
  checks: MetaDiagnosticsCheck[]
}

export function HealthStatusSeal({ checks }: HealthStatusSealProps) {
  const health = checks.find((c) => c.id === 'meta_health_status')
  const overall = String((health?.details as Record<string, unknown>)?.overall || '')

  const status: MetaDiagnosticsCheckStatus =
    overall === 'BLOCKED' ? 'fail' : overall === 'LIMITED' ? 'warn' : overall === 'AVAILABLE' ? 'pass' : 'info'

  const subtitle =
    overall === 'BLOCKED'
      ? 'Bloqueio confirmado pela Meta (Health Status). Nao ha "auto-fix" aqui: precisa resolver no Business Manager/Meta.'
      : overall === 'LIMITED'
        ? 'Envio limitado pela Meta. Pode afetar volume/entregabilidade ate resolver a causa.'
        : overall === 'AVAILABLE'
          ? 'Envio liberado segundo a Meta (prova oficial).'
          : 'Health Status nao disponivel (ou nao foi possivel consultar).'

  return (
    <Container variant="glass" padding="md">
      <div className="text-xs text-[var(--ds-text-muted)]">Semaforo</div>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={status} />
        <div className="text-sm text-[var(--ds-text-primary)] font-medium">Health Status: {overall || '—'}</div>
      </div>
      <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">{subtitle}</div>
      <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
        Fonte: Graph API · field <span className="font-mono">health_status</span>
      </div>
    </Container>
  )
}

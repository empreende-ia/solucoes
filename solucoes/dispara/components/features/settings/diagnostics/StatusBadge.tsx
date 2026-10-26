'use client'

import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import type { MetaDiagnosticsCheckStatus } from './types'

export interface StatusBadgeProps {
  status: MetaDiagnosticsCheckStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium'

  if (status === 'pass') {
    return (
      <span className={`${base} bg-primary-500/10 border-primary-500/20 text-primary-200`}>
        <CheckCircle2 size={14} /> OK
      </span>
    )
  }

  if (status === 'warn') {
    return (
      <span className={`${base} bg-amber-500/10 border-amber-500/20 text-amber-200`}>
        <AlertTriangle size={14} /> Atenção
      </span>
    )
  }

  if (status === 'fail') {
    return (
      <span className={`${base} bg-red-500/10 border-red-500/20 text-red-200`}>
        <XCircle size={14} /> Falha
      </span>
    )
  }

  return (
    <span className={`${base} bg-[var(--ds-bg-hover)] border-[var(--ds-border-subtle)] text-[var(--ds-text-primary)]`}>
      <Info size={14} /> Info
    </span>
  )
}

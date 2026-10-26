'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { MetaDiagnosticsResponse } from '@/services/metaDiagnosticsService'
import type { MetaDiagnosticsCheck, MetaDiagnosticsCheckStatus } from '../types'
import { StatusBadge } from '../StatusBadge'
import { Pill } from '../Pill'
import { Container } from '@/components/ui/container'

export interface TokenScopesCardProps {
  data?: MetaDiagnosticsResponse
  checks: MetaDiagnosticsCheck[]
}

export function TokenScopesCard({ data, checks }: TokenScopesCardProps) {
  const dbgEnabled = Boolean(data?.debugTokenValidation?.enabled)
  const scopesCheck = checks.find((c) => c.id === 'meta_token_scopes')
  const mePermsCheck = checks.find((c) => c.id === 'meta_permissions')

  const required = Array.isArray((scopesCheck?.details as Record<string, unknown>)?.required)
    ? ((scopesCheck?.details as Record<string, unknown>).required as unknown[]).filter((x) => typeof x === 'string') as string[]
    : ['whatsapp_business_messaging', 'whatsapp_business_management']

  const foundScopes = Array.isArray((scopesCheck?.details as Record<string, unknown>)?.scopes)
    ? ((scopesCheck?.details as Record<string, unknown>).scopes as unknown[]).filter((x) => typeof x === 'string') as string[]
    : []

  const missing = Array.isArray((scopesCheck?.details as Record<string, unknown>)?.missing)
    ? ((scopesCheck?.details as Record<string, unknown>).missing as unknown[]).filter((x) => typeof x === 'string') as string[]
    : required.filter((r) => !foundScopes.includes(r))

  const granted = Array.isArray((mePermsCheck?.details as Record<string, unknown>)?.granted)
    ? ((mePermsCheck?.details as Record<string, unknown>).granted as unknown[]).filter((x) => typeof x === 'string') as string[]
    : []

  const verificationMode: 'debug_token' | 'me_permissions' | 'unknown' =
    foundScopes.length > 0
      ? 'debug_token'
      : granted.length > 0
        ? 'me_permissions'
        : 'unknown'

  const missingCritical = missing.includes('whatsapp_business_messaging')

  const cardStatus: MetaDiagnosticsCheckStatus = (() => {
    if (verificationMode === 'unknown') return 'info'
    return missing.length === 0 ? 'pass' : (missingCritical ? 'fail' : 'warn')
  })()

  return (
    <Container variant="glass" padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-[var(--ds-text-muted)]">Token</div>
          <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-medium">Permissoes (escopos) — checklist</div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">
            Aqui voce ve <b>o que conseguimos verificar</b> sobre escopos e o que e necessario para o Dispara funcionar.
          </div>
        </div>
        <div className="shrink-0">
          <StatusBadge status={cardStatus} />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-[var(--ds-text-secondary)]">Necessarias</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {required.map((s) => {
            const ok = foundScopes.includes(s) || granted.includes(s)
            const tone: 'ok' | 'warn' | 'fail' | 'neutral' =
              verificationMode === 'unknown' ? 'neutral' : (ok ? 'ok' : 'fail')
            return <Pill key={s} tone={tone}>{s}</Pill>
          })}
        </div>
        {verificationMode === 'unknown' && (
          <div className="mt-3 text-xs text-[var(--ds-text-secondary)]">
            Ainda nao conseguimos listar os escopos desse token. Isso acontece quando <span className="font-mono">/debug_token</span> nao esta habilitado e <span className="font-mono">/me/permissions</span> nao retorna dados para este tipo de token.
          </div>
        )}
      </div>

      {verificationMode !== 'unknown' && missing.length > 0 && (
        <div className="mt-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
          <div className="text-sm text-[var(--ds-text-primary)] font-semibold">Faltando</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((s) => (
              <Pill key={s} tone={missingCritical && s === 'whatsapp_business_messaging' ? 'fail' : 'warn'}>{s}</Pill>
            ))}
          </div>
          <div className="mt-3 text-xs text-[var(--ds-text-secondary)]">
            Dica: se voce gerou token de <b>System User</b>, confirme tambem se os ativos (WABA + Phone Number) foram atribuidos ao usuario do sistema.
          </div>
        </div>
      )}

      <details className="mt-4 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
          <div className="text-sm text-[var(--ds-text-primary)]">Ver detalhes (para suporte)</div>
          <ChevronDown size={16} className="text-[var(--ds-text-secondary)]" />
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-xs text-[var(--ds-text-secondary)]">Fonte principal</div>
            <div className="mt-1 text-sm text-[var(--ds-text-primary)]">
              {verificationMode === 'debug_token'
                ? 'debug_token (recomendado)'
                : verificationMode === 'me_permissions'
                  ? '/me/permissions (best-effort)'
                  : dbgEnabled
                    ? 'debug_token (habilitado, mas nao retornou escopos)'
                    : 'indisponivel (nao conseguimos listar escopos)'}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-secondary)]">Escopos encontrados</div>
            {foundScopes.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {foundScopes.map((s) => (<Pill key={s} tone={required.includes(s) ? 'neutral' : 'neutral'}>{s}</Pill>))}
              </div>
            ) : (
              <div className="mt-1 text-sm text-[var(--ds-text-secondary)]">—</div>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-secondary)]">/me/permissions (quando disponivel)</div>
            {granted.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {granted.map((s) => (<Pill key={s} tone={'neutral'}>{s}</Pill>))}
              </div>
            ) : (
              <div className="mt-1 text-sm text-[var(--ds-text-secondary)]">—</div>
            )}
          </div>
        </div>
      </details>

      {!dbgEnabled && (
        <div className="mt-4 text-xs text-[var(--ds-text-secondary)]">
          Para ver escopos com prova (recomendado), habilite <b>Meta App ID/Secret</b> em <Link href="/settings" className="underline">Ajustes</Link>.
        </div>
      )}
    </Container>
  )
}

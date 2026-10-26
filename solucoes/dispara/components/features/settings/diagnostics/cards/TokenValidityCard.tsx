'use client'

import Link from 'next/link'
import type { MetaDiagnosticsResponse } from '@/services/metaDiagnosticsService'
import type { MetaDiagnosticsCheck, MetaDiagnosticsCheckStatus } from '../types'
import { StatusBadge } from '../StatusBadge'
import { formatJsonMaybe } from '../utils'
import { Container } from '@/components/ui/container'

export interface TokenValidityCardProps {
  data?: MetaDiagnosticsResponse
  checks: MetaDiagnosticsCheck[]
}

export function TokenValidityCard({ data, checks }: TokenValidityCardProps) {
  const dbgEnabled = Boolean(data?.debugTokenValidation?.enabled)

  const dbgCheck = checks.find((c) => c.id === 'meta_debug_token')
  const meCheck = checks.find((c) => c.id === 'meta_me')

  const dbgAttempted = Boolean(data?.debugTokenValidation?.attempted)
  const dbgOk = data?.debugTokenValidation?.ok
  const dbgIsValid = data?.debugTokenValidation?.isValid

  const status: MetaDiagnosticsCheckStatus = (() => {
    // Preferimos a "prova" do /debug_token quando habilitado.
    if (dbgEnabled && dbgAttempted) {
      if (dbgOk === true && dbgIsValid === true) return 'pass'
      if (dbgOk === true && dbgIsValid === false) return 'fail'
      if (dbgOk === false) return 'warn'
    }

    // Fallback: /me indica que o token ao menos autentica.
    if (meCheck?.status === 'pass') return dbgEnabled ? 'warn' : 'info'
    if (meCheck?.status === 'fail') return 'fail'

    return 'info'
  })()

  const title = 'Token de acesso'

  const subtitle = (() => {
    if (dbgEnabled && dbgAttempted) {
      if (dbgOk === true && dbgIsValid === true) return 'Valido (confirmado pela Meta via /debug_token)'
      if (dbgOk === true && dbgIsValid === false) return 'Invalido (confirmado pela Meta via /debug_token)'
      return 'Nao foi possivel confirmar via /debug_token (best-effort)'
    }

    if (meCheck?.status === 'pass') {
      return dbgEnabled
        ? 'Autentica via /me, mas ainda nao confirmamos /debug_token'
        : 'Autentica via /me, mas nao da pra provar escopos/expiracao sem /debug_token'
    }
    if (meCheck?.status === 'fail') return 'Falha ao autenticar (/me) — token pode estar invalido/expirado'
    return 'Sem informação suficiente (ainda carregando ou chamada falhou)'
  })()

  const nextSteps = (() => {
    if (dbgEnabled && dbgAttempted && dbgOk === true && dbgIsValid === false) {
      return [
        'Gere um novo token (recomendado: System User no Business Manager).',
        'Antes de gerar, atribua os ativos (WABA + Phone Number) ao System User.',
        'Salve o token em Ajustes e clique em "Atualizar".',
      ]
    }

    if (!dbgEnabled) {
      return [
        'Opcional (recomendado): configure Meta App ID/Secret em Ajustes para habilitar /debug_token.',
        'Com /debug_token ativo, voce ve validade, expiracao e escopos com prova (menos suporte).',
      ]
    }

    if (dbgEnabled && (!dbgAttempted || (dbgAttempted && dbgOk !== true))) {
      return [
        'Clique em "Atualizar" para tentar validar novamente via /debug_token.',
        'Se falhar, confira se Meta App ID/Secret estao corretos em Ajustes.',
      ]
    }

    // Se chegou aqui, o token parece ok.
    return [
      'Se ainda "nao envia", confira permissoes (escopos) e acesso ao WABA/Phone Number nos checks abaixo.',
    ]
  })()

  return (
    <Container variant="glass" padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-[var(--ds-text-muted)]">Token</div>
          <div className="mt-2 text-sm text-[var(--ds-text-primary)] font-medium">{title}</div>
          <div className="mt-2 text-sm text-[var(--ds-text-secondary)]">{subtitle}</div>
          {dbgEnabled ? (
            <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
              Fonte: <span className="font-mono">/debug_token</span> (quando disponivel) + <span className="font-mono">/me</span>
            </div>
          ) : (
            <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
              Fonte: <span className="font-mono">/me</span> (best-effort). Para prova de escopos/expiracao, habilite <span className="font-mono">/debug_token</span>.
            </div>
          )}
        </div>
        <div className="shrink-0">
          <StatusBadge status={status} />
        </div>
      </div>

      {nextSteps.length > 0 && (
        <div className="mt-4 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-xl p-4">
          <div className="text-sm text-[var(--ds-text-primary)] font-semibold">O que fazer</div>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-[var(--ds-text-primary)]">
            {nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          {!dbgEnabled && (
            <div className="mt-3 text-xs text-[var(--ds-text-secondary)]">
              Ir para <Link href="/settings" className="underline">Ajustes</Link> para configurar Meta App.
            </div>
          )}
        </div>
      )}

      {(dbgCheck?.details || meCheck?.details) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors">
            Ver detalhes tecnicos
          </summary>
          <pre className="mt-3 text-xs bg-[var(--ds-bg-surface)]/30 border border-[var(--ds-border-subtle)] rounded-xl p-4 overflow-auto text-[var(--ds-text-primary)]">
            {formatJsonMaybe({
              debug_token: dbgCheck?.details || null,
              me: meCheck?.details || null,
            })}
          </pre>
        </details>
      )}
    </Container>
  )
}

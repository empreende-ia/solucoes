'use client'

import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, RefreshCw, Loader2, ShieldCheck, Clock, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PermissionValidationResult } from '@/app/api/settings/validate-permissions/route'

interface PermissionStatusViewProps {
  result: PermissionValidationResult | null
  isLoading?: boolean
  onRetry?: () => void
  onContinue?: () => void
  showContinueButton?: boolean
  className?: string
}

/**
 * Componente que exibe o status das permissões do token WhatsApp.
 *
 * Mostra:
 * - Checklist de permissões (OK ou faltando)
 * - Informações do token (tipo, expiração)
 * - Instruções para resolver problemas quando há erros
 */
export function PermissionStatusView({
  result,
  isLoading,
  onRetry,
  onContinue,
  showContinueButton = true,
  className,
}: PermissionStatusViewProps) {
  if (isLoading) {
    return (
      <div className={cn('p-4 rounded-xl bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)]', className)}>
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[var(--ds-text-secondary)] animate-spin" />
          <span className="text-sm text-[var(--ds-text-secondary)]">Validando permissões do token...</span>
        </div>
      </div>
    )
  }

  if (!result) {
    return null
  }

  const hasError = !result.valid || result.missing.length > 0
  const hasWarning = result.warning && !hasError
  const tokenType = result.tokenInfo.type || 'Desconhecido'
  const isSystemUser = tokenType === 'SYSTEM_USER'

  return (
    <div className={cn('rounded-xl overflow-hidden', className)}>
      {/* Header */}
      <div
        className={cn(
          'px-4 py-3 flex items-center gap-2',
          hasError
            ? 'bg-red-500/10 border-b border-red-500/20'
            : hasWarning
            ? 'bg-amber-500/10 border-b border-amber-500/20'
            : 'bg-primary-500/10 border-b border-primary-500/20'
        )}
      >
        {hasError ? (
          <XCircle className="w-5 h-5 text-red-400" />
        ) : hasWarning ? (
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        ) : (
          <ShieldCheck className="w-5 h-5 text-primary-400" />
        )}
        <span
          className={cn(
            'font-medium',
            hasError ? 'text-red-200' : hasWarning ? 'text-amber-200' : 'text-primary-200'
          )}
        >
          Permissões do Token
        </span>
      </div>

      {/* Content */}
      <div
        className={cn(
          'p-4 space-y-4',
          hasError
            ? 'bg-red-500/5 border border-t-0 border-red-500/20 rounded-b-xl'
            : hasWarning
            ? 'bg-amber-500/5 border border-t-0 border-amber-500/20 rounded-b-xl'
            : 'bg-primary-500/5 border border-t-0 border-primary-500/20 rounded-b-xl'
        )}
      >
        {/* Error message */}
        {result.error && (
          <div className="text-sm text-red-300/80 pb-2 border-b border-red-500/10">
            {result.error}
          </div>
        )}

        {/* Scopes Checklist */}
        <div className="space-y-2">
          {result.scopeDetails.map((scope) => (
            <div key={scope.scope} className="flex items-start gap-3">
              {scope.present ? (
                <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    'text-sm font-medium',
                    scope.present ? 'text-primary-200' : 'text-red-200'
                  )}
                >
                  {scope.scope}
                  {scope.critical && !scope.present && (
                    <span className="ml-2 text-xs text-red-400">(obrigatório)</span>
                  )}
                </div>
                <div className="text-xs text-[var(--ds-text-secondary)]">{scope.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Token Info Card */}
        <div className="p-3 rounded-lg bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] space-y-2">
          {/* Tipo do token */}
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="w-4 h-4 text-[var(--ds-text-muted)]" />
            <span className="text-[var(--ds-text-secondary)]">Tipo:</span>
            <span className={cn('font-mono', isSystemUser ? 'text-primary-300' : 'text-[var(--ds-text-primary)]')}>
              {tokenType}
            </span>
          </div>

          {/* Expiração */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-[var(--ds-text-muted)]" />
            <span className="text-[var(--ds-text-secondary)]">Expiração:</span>
            {result.tokenInfo.isPermanent ? (
              <span className="text-primary-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Token permanente
              </span>
            ) : result.tokenInfo.expiresIn ? (
              <span
                className={cn(
                  'flex items-center gap-1',
                  result.tokenInfo.expiresIn === 'Expirado' ? 'text-red-300' : 'text-amber-300'
                )}
              >
                <AlertTriangle className="w-3 h-3" />
                {result.tokenInfo.expiresIn}
                {result.tokenInfo.expiresAtFormatted && ` (${result.tokenInfo.expiresAtFormatted})`}
              </span>
            ) : (
              <span className="text-[var(--ds-text-muted)]">—</span>
            )}
          </div>

          {/* App ID */}
          {result.tokenInfo.appId && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--ds-text-secondary)] ml-6">App ID:</span>
              <span className="font-mono text-[var(--ds-text-secondary)]">{result.tokenInfo.appId}</span>
            </div>
          )}
        </div>

        {/* Warning message */}
        {hasWarning && result.warning && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-200">{result.warning}</div>
          </div>
        )}

        {/* Steps to fix (when missing permissions) */}
        {hasError && result.steps && result.steps.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--ds-text-secondary)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Como resolver:
            </p>
            <ol className="space-y-1 ml-6 list-decimal list-outside">
              {result.steps.map((step, i) => (
                <li key={i} className="text-sm text-[var(--ds-text-secondary)] pl-1">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Docs link */}
        {hasError && result.docsUrl && (
          <a
            href={result.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Documentação Meta
          </a>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {hasError ? (
            <Button onClick={onRetry} variant="outline" className="flex-1">
              <RefreshCw className="w-4 h-4 mr-2" />
              Verificar novamente
            </Button>
          ) : showContinueButton && onContinue ? (
            <Button onClick={onContinue} className="flex-1">
              Continuar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

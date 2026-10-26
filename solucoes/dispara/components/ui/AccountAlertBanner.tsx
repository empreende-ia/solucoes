'use client'

import { AlertTriangle, CreditCard, ShieldAlert, X, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useAccountAlerts } from '@/hooks/useAccountAlerts'

const alertIcons: Record<string, typeof AlertTriangle> = {
  payment: CreditCard,
  auth: ShieldAlert,
  rate_limit: AlertTriangle,
  template: AlertTriangle,
  system: AlertTriangle,
  meta_integration: AlertTriangle,
  recipient: AlertTriangle,
  media: AlertTriangle,
  unknown: XCircle,
}

const alertColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  payment: {
    bg: 'bg-red-950/50',
    border: 'border-red-800',
    text: 'text-red-200',
    icon: 'text-red-400',
  },
  auth: {
    bg: 'bg-orange-950/50',
    border: 'border-orange-800',
    text: 'text-orange-200',
    icon: 'text-orange-400',
  },
  rate_limit: {
    bg: 'bg-yellow-950/50',
    border: 'border-yellow-800',
    text: 'text-yellow-200',
    icon: 'text-yellow-400',
  },
  template: {
    bg: 'bg-blue-950/50',
    border: 'border-blue-800',
    text: 'text-blue-200',
    icon: 'text-blue-400',
  },
  system: {
    bg: 'bg-[var(--ds-bg-elevated)]',
    border: 'border-[var(--ds-border-default)]',
    text: 'text-[var(--ds-text-primary)]',
    icon: 'text-[var(--ds-text-secondary)]',
  },
  meta_integration: {
    bg: 'bg-yellow-950/50',
    border: 'border-yellow-800',
    text: 'text-yellow-200',
    icon: 'text-yellow-400',
  },
  default: {
    bg: 'bg-red-950/50',
    border: 'border-red-800',
    text: 'text-red-200',
    icon: 'text-red-400',
  },
}

interface AccountAlertBannerProps {
  className?: string
}

export function AccountAlertBanner({ className = '' }: AccountAlertBannerProps) {
  const { criticalAlert: critical, alerts, dismiss, isDismissing } = useAccountAlerts()
  // Avisos da integração com a Meta (type 'meta_integration': assinatura do webhook,
  // chaves dos Flows — ver lib/meta-integration-alerts.ts) só aparecem quando NÃO há
  // alerta crítico (pagamento/auth): nunca escondem um alerta real da Meta.
  const criticalAlert = critical ?? alerts.find((a) => a.type === 'meta_integration') ?? null

  if (!criticalAlert) {
    return null
  }
  
  const alertType = criticalAlert.type || 'default'
  const Icon = alertIcons[alertType] || AlertTriangle
  const colors = alertColors[alertType] || alertColors.default

  const isPossibleMetaLock = alertType === 'auth' && criticalAlert.code === 131031
  
  // Parse details if JSON
  let actionText: string | null = null
  try {
    if (criticalAlert.details) {
      const details = JSON.parse(criticalAlert.details)
      actionText = details.action || null
    }
  } catch {
    // Not JSON, ignore
  }

  const displayTitle = isPossibleMetaLock
    ? 'Possível bloqueio na Meta (não confirmado)'
    : (
        alertType === 'payment' ? 'Problema de Pagamento'
        : alertType === 'auth' ? 'Erro de Autenticação'
        : alertType === 'rate_limit' ? 'Limite de Taxa Excedido'
        : alertType === 'template' ? 'Problema com Template'
        : alertType === 'system' ? 'Erro do Sistema'
        : alertType === 'meta_integration' ? 'Integração com a Meta'
        : 'Alerta'
      )

  const displayMessage = isPossibleMetaLock
    ? 'Detectamos um erro 131031 em tentativas recentes. Isso pode indicar bloqueio, mas também pode ser um sinal histórico/intermitente. Confirme o status atual no Diagnóstico da Meta.'
    : criticalAlert.message

  const displayActionText = isPossibleMetaLock
    ? 'Abra “Diagnósticos da Meta” para checar o Health Status e seguir o passo a passo recomendado.'
    : actionText
  
  return (
    <div
      className={`${colors.bg} ${colors.border} border rounded-lg p-4 mb-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${colors.icon}`} />
        
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium ${colors.text}`}>{displayTitle}</h4>
          
          <p className={`text-sm mt-1 ${colors.text} opacity-90`}>
            {displayMessage}
          </p>
          
          {displayActionText && (
            <p className={`text-sm mt-2 ${colors.text} opacity-75`}>
              {displayActionText}
            </p>
          )}

          {(isPossibleMetaLock || alertType === 'meta_integration') && (
            <div className="mt-2">
              <Link
                href="/settings/meta-diagnostics"
                className={`text-sm underline ${colors.text} opacity-90 hover:opacity-100 transition-opacity`}
              >
                Abrir Diagnósticos da Meta
              </Link>
            </div>
          )}
          
          {criticalAlert.code && (
            <p className={`text-xs mt-2 ${colors.text} opacity-50`}>
              Código do erro: {criticalAlert.code}
            </p>
          )}
        </div>
        
        <button
          onClick={() => dismiss(criticalAlert.id)}
          disabled={isDismissing}
          className={`p-1 rounded hover:bg-[var(--ds-bg-hover)] transition-colors ${colors.text} opacity-60 hover:opacity-100`}
          aria-label="Dispensar alerta"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

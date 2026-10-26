'use client'

import React from 'react'
import { ShieldAlert } from 'lucide-react'

export interface LimitWarningProps {
  /** Number of recipients selected */
  recipientCount: number
  /** Current daily limit */
  currentLimit: number
  /** Display variant: 'detailed' shows stats and solutions, 'compact' shows minimal info */
  variant?: 'detailed' | 'compact'
  /** Callback to show upgrade modal (for detailed variant) */
  onShowUpgradeModal?: () => void
  /** Callback to go back (for compact variant) */
  onGoBack?: () => void
  /** Custom back button text */
  backButtonText?: string
}

/**
 * Warning component displayed when recipient count exceeds daily limit.
 *
 * @example
 * // Detailed variant (for audience selection step)
 * <LimitWarning
 *   recipientCount={1500}
 *   currentLimit={1000}
 *   variant="detailed"
 *   onShowUpgradeModal={() => setShowUpgrade(true)}
 * />
 *
 * @example
 * // Compact variant (for review step)
 * <LimitWarning
 *   recipientCount={1500}
 *   currentLimit={1000}
 *   variant="compact"
 *   onGoBack={() => setStep(2)}
 * />
 */
export function LimitWarning({
  recipientCount,
  currentLimit,
  variant = 'detailed',
  onShowUpgradeModal,
  onGoBack,
  backButtonText = '← Voltar e ajustar destinatários',
}: LimitWarningProps) {
  const exceeded = recipientCount - currentLimit
  const campaignsNeeded = Math.ceil(recipientCount / currentLimit)

  // Compact variant - minimal info for review step
  if (variant === 'compact') {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <ShieldAlert className="text-red-400 shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <p className="font-bold text-red-400 text-sm mb-1">
            ⛔ Não é possível disparar
          </p>
          <p className="text-sm text-red-200/70">
            Você selecionou{' '}
            <span className="font-bold text-[var(--ds-text-primary)]">{recipientCount}</span> contatos,
            mas seu limite é{' '}
            <span className="font-bold text-[var(--ds-text-primary)]">{currentLimit}</span>/dia.
          </p>
          {onGoBack && (
            <button
              onClick={onGoBack}
              className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
            >
              {backButtonText}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Detailed variant - full stats and solutions for audience step
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex gap-3">
        <ShieldAlert className="text-red-400 shrink-0 mt-0.5" size={22} />
        <div className="flex-1">
          <p className="font-bold text-red-400 text-base mb-1">Limite Excedido</p>
          <p className="text-sm text-red-200/80">
            Você selecionou <span className="font-bold text-[var(--ds-text-primary)]">{recipientCount}</span> contatos,
            mas seu limite atual é de <span className="font-bold text-[var(--ds-text-primary)]">{currentLimit}</span> mensagens/dia.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 bg-black/20 rounded-lg p-3">
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--ds-text-primary)]">{recipientCount}</p>
          <p className="text-[10px] text-[var(--ds-text-muted)] uppercase">Selecionados</p>
        </div>
        <div className="text-center border-x border-[var(--ds-border-subtle)]">
          <p className="text-lg font-bold text-primary-400">{currentLimit}</p>
          <p className="text-[10px] text-[var(--ds-text-muted)] uppercase">Seu Limite</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-red-400">+{exceeded}</p>
          <p className="text-[10px] text-[var(--ds-text-muted)] uppercase">Excedente</p>
        </div>
      </div>

      {/* Solutions */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-[var(--ds-text-secondary)] uppercase tracking-wider">
          O que você pode fazer:
        </p>
        <div className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
          <span className="w-5 h-5 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center text-xs">
            1
          </span>
          Reduza a seleção para no máximo{' '}
          <span className="font-bold text-primary-400">{currentLimit}</span> contatos
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
          <span className="w-5 h-5 rounded-full bg-[var(--ds-bg-surface)] flex items-center justify-center text-xs">
            2
          </span>
          Divida em {campaignsNeeded} campanhas menores
        </div>
        {onShowUpgradeModal && (
          <div className="flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
            <span className="w-5 h-5 rounded-full bg-primary-500/30 flex items-center justify-center text-xs text-primary-400">
              *
            </span>
            <button
              onClick={onShowUpgradeModal}
              className="text-primary-400 hover:text-primary-300 underline"
            >
              Saiba como aumentar seu limite
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

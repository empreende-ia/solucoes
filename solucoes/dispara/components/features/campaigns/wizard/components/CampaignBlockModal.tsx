import React from 'react';
import {
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  CampaignValidation,
  AccountLimits,
  TIER_DISPLAY_NAMES,
  getNextTier,
  TIER_LIMITS,
} from '@/lib/meta-limits';

interface CampaignBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  validation: CampaignValidation | null;
  accountLimits?: AccountLimits | null;
}

export const CampaignBlockModal: React.FC<CampaignBlockModalProps> = ({
  isOpen,
  onClose,
  validation,
  accountLimits,
}) => {
  if (!isOpen || !validation) return null;

  const currentTier = accountLimits?.messagingTier || 'TIER_250';
  const nextTier = getNextTier(currentTier);
  const currentLimit = TIER_LIMITS[currentTier];
  const nextLimit = nextTier ? TIER_LIMITS[nextTier] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-[var(--ds-border-subtle)] bg-red-500/5">
          <div className="p-3 bg-red-500/20 rounded-xl">
            <ShieldAlert className="text-red-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--ds-text-primary)]">Limite de Envio Excedido</h2>
            <p className="text-sm text-[var(--ds-text-secondary)]">Sua conta não pode enviar essa quantidade</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
          >
            <XCircle className="text-[var(--ds-text-secondary)]" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Status */}
          <div className="bg-[var(--ds-bg-surface)] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ds-text-secondary)]">Seu Tier Atual</span>
              <span className="text-sm font-bold text-[var(--ds-text-primary)] bg-[var(--ds-bg-elevated)] px-3 py-1 rounded-lg">
                {TIER_DISPLAY_NAMES[currentTier]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ds-text-secondary)]">Limite de Mensagens/dia</span>
              <span className="text-sm font-bold text-primary-400">
                {currentLimit.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ds-text-secondary)]">Você tentou enviar</span>
              <span className="text-sm font-bold text-red-400">
                {validation.requestedCount.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--ds-border-subtle)] pt-3">
              <span className="text-sm text-[var(--ds-text-secondary)]">Excedente</span>
              <span className="text-sm font-bold text-red-400">
                +{(validation.requestedCount - currentLimit).toLocaleString('pt-BR')} mensagens
              </span>
            </div>
          </div>

          {/* Upgrade Roadmap */}
          {validation.upgradeRoadmap && validation.upgradeRoadmap.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--ds-text-primary)]">
                <TrendingUp size={16} className="text-primary-400" />
                Como aumentar seu limite
              </div>
              <div className="space-y-2">
                {validation.upgradeRoadmap.map((step, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 bg-[var(--ds-bg-surface)] p-3 rounded-lg border border-[var(--ds-border-subtle)]"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <p className="text-sm text-[var(--ds-text-secondary)]">{step.title}: {step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Tier Info */}
          {nextTier && nextLimit && (
            <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-primary-400" />
                <span className="text-sm font-bold text-primary-400">Próximo Tier: {TIER_DISPLAY_NAMES[nextTier]}</span>
              </div>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                Com o tier {TIER_DISPLAY_NAMES[nextTier]}, você poderá enviar até{' '}
                <span className="text-[var(--ds-text-primary)] font-bold">{nextLimit.toLocaleString('pt-BR')}</span> mensagens por dia.
              </p>
            </div>
          )}

          {/* Suggestion */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <AlertCircle className="text-amber-400 shrink-0" size={18} />
            <div className="text-sm text-amber-200/80">
              <p className="font-bold text-amber-400 mb-1">Sugestão</p>
              <p>
                Reduza o número de destinatários para no máximo{' '}
                <span className="font-bold text-[var(--ds-text-primary)]">{currentLimit.toLocaleString('pt-BR')}</span>{' '}
                ou divida sua campanha em múltiplos envios.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]">
          <a
            href="https://developers.facebook.com/docs/whatsapp/messaging-limits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--ds-text-secondary)] hover:text-primary-400 flex items-center gap-1 transition-colors"
          >
            <ExternalLink size={14} />
            Documentação da Meta
          </a>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white dark:bg-white dark:text-black font-bold rounded-xl hover:bg-primary-500 dark:hover:bg-neutral-100 transition-colors"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Check,
  Circle,
  ExternalLink,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  AccountLimits,
  TIER_DISPLAY_NAMES,
  getNextTier,
  TIER_LIMITS,
  getUpgradeRoadmap,
} from '@/lib/meta-limits';

interface UpgradeRoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountLimits?: AccountLimits | null;
}

export const UpgradeRoadmapModal: React.FC<UpgradeRoadmapModalProps> = ({
  isOpen,
  onClose,
  accountLimits,
}) => {
  if (!isOpen) return null;

  const currentTier = accountLimits?.messagingTier || 'TIER_250';
  const nextTier = getNextTier(currentTier);
  const currentLimit = TIER_LIMITS[currentTier];
  const nextLimit = nextTier ? TIER_LIMITS[nextTier] : null;

  // Get upgrade steps
  const upgradeSteps = accountLimits ? getUpgradeRoadmap(accountLimits) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-subtle)] rounded-2xl w-full max-w-lg mx-4 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-[var(--ds-border-subtle)] bg-linear-to-r from-primary-500/10 to-transparent shrink-0">
          <div className="p-3 bg-primary-500/20 rounded-xl">
            <TrendingUp className="text-primary-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--ds-text-primary)]">Aumentar seu Limite</h2>
            <p className="text-sm text-[var(--ds-text-secondary)]">Siga o roadmap para evoluir seu tier</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
          >
            <XCircle className="text-[var(--ds-text-secondary)]" size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Current vs Next Tier */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[var(--ds-bg-surface)] rounded-xl p-4 text-center border border-[var(--ds-border-subtle)]">
              <p className="text-[10px] text-[var(--ds-text-muted)] uppercase tracking-wider mb-1">Tier Atual</p>
              <p className="text-lg font-bold text-[var(--ds-text-primary)]">{TIER_DISPLAY_NAMES[currentTier]}</p>
              <p className="text-sm text-[var(--ds-text-secondary)]">{currentLimit.toLocaleString('pt-BR')}/dia</p>
            </div>
            {nextTier && nextLimit && (
              <div className="bg-primary-500/10 rounded-xl p-4 text-center border border-primary-500/30">
                <p className="text-[10px] text-primary-400 uppercase tracking-wider mb-1">Próximo Tier</p>
                <p className="text-lg font-bold text-primary-400">{TIER_DISPLAY_NAMES[nextTier]}</p>
                <p className="text-sm text-primary-300">{nextLimit.toLocaleString('pt-BR')}/dia</p>
              </div>
            )}
          </div>

          {/* Upgrade Steps */}
          {upgradeSteps.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-[var(--ds-text-secondary)] uppercase tracking-wider">Passos para Evoluir</p>
              {upgradeSteps.map((step, index) => {
                const isCompleted = step.completed;
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border transition-all \${isCompleted
                      ? 'bg-primary-500/10 border-primary-500/30'
                      : 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-subtle)]'
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 \${isCompleted
                        ? 'bg-primary-500 text-white'
                        : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
                        }`}>
                        {isCompleted ? <Check size={14} /> : <Circle size={14} />}
                      </div>
                      <div className="flex-1">
                        <p className={`font-bold text-sm \${isCompleted ? 'text-primary-400' : 'text-[var(--ds-text-primary)]'}`}>
                          {step.title}
                        </p>
                        <p className="text-xs text-[var(--ds-text-secondary)] mt-1">{step.description}</p>
                        {step.link && (
                          <a
                            href={step.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 mt-2"
                          >
                            <ExternalLink size={12} />
                            {step.action || 'Abrir'}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--ds-text-muted)]">
              <TrendingUp size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Você já está no tier máximo!</p>
            </div>
          )}

          {/* Quality Score Info */}
          {accountLimits?.qualityScore && (
            <QualityScoreCard qualityScore={accountLimits.qualityScore} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] shrink-0">
          <a
            href="https://developers.facebook.com/docs/whatsapp/messaging-limits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--ds-text-secondary)] hover:text-primary-400 flex items-center gap-1 transition-colors"
          >
            <ExternalLink size={14} />
            Documentação Meta
          </a>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-500 transition-colors"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper component for quality score display
const QualityScoreCard: React.FC<{ qualityScore: string }> = ({ qualityScore }) => {
  const getColorClasses = () => {
    switch (qualityScore) {
      case 'GREEN':
        return 'bg-green-500/10 border-green-500/30';
      case 'YELLOW':
        return 'bg-yellow-500/10 border-yellow-500/30';
      case 'RED':
        return 'bg-red-500/10 border-red-500/30';
      default:
        return 'bg-[var(--ds-bg-surface)] border-[var(--ds-border-subtle)]';
    }
  };

  const getDotColor = () => {
    switch (qualityScore) {
      case 'GREEN':
        return 'bg-green-500';
      case 'YELLOW':
        return 'bg-yellow-500';
      case 'RED':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  };

  const getLabel = () => {
    switch (qualityScore) {
      case 'GREEN':
        return 'Alta (Verde)';
      case 'YELLOW':
        return 'Média (Amarela)';
      case 'RED':
        return 'Baixa (Vermelha)';
      default:
        return 'Desconhecida';
    }
  };

  return (
    <div className={`p-4 rounded-xl border \${getColorClasses()}`}>
      <p className="text-xs font-bold text-[var(--ds-text-secondary)] uppercase tracking-wider mb-2">
        Qualidade da Conta
      </p>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full \${getDotColor()}`} />
        <span className="text-sm text-[var(--ds-text-primary)] font-medium">{getLabel()}</span>
      </div>
      <p className="text-xs text-[var(--ds-text-secondary)] mt-2">
        {qualityScore === 'RED'
          ? 'Melhore a qualidade para poder evoluir de tier.'
          : 'Mantenha a qualidade alta para evoluir automaticamente.'}
      </p>
    </div>
  );
};

import React from 'react';
import {
  MessageSquare,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export interface SetupStep {
  id: 'whatsapp';
  title: string;
  description: string;
  status: 'pending' | 'configured' | 'error';
  icon: React.ReactNode;
  actionLabel?: string;
  actionUrl?: string;
  errorMessage?: string;
  isRequired: boolean;
}

interface SetupWizardViewProps {
  steps: SetupStep[];
  isLoading: boolean;
  onRefresh: () => void;
  onContinueToSettings?: () => void;
  allConfigured: boolean;
}

export const SetupWizardView: React.FC<SetupWizardViewProps> = ({
  steps,
  isLoading,
  onRefresh,
  onContinueToSettings,
  allConfigured,
}) => {
  const completedSteps = steps.filter(s => s.status === 'configured').length;
  const progressPercent = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-primary-500 to-primary-600 mb-4">
          <Sparkles size={32} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight mb-2">
          Configuração Inicial
        </h1>
        <p className="text-[var(--ds-text-secondary)] max-w-md mx-auto">
          Para usar o Dispara, você precisa configurar alguns serviços. 
          Siga os passos abaixo na ordem indicada.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-[var(--ds-text-secondary)]">
            Progresso: {completedSteps}/{steps.length} configurados
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1 text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Verificar novamente
          </button>
        </div>
        <div className="h-2 bg-[var(--ds-bg-surface)] rounded-full overflow-hidden">
          <div 
            className="h-full bg-linear-to-r from-primary-500 to-primary-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const isPending = step.status === 'pending';
          const isConfigured = step.status === 'configured';
          const isError = step.status === 'error';
          
          // Determine if step should be highlighted (next to do)
          const previousStepsConfigured = steps
            .slice(0, index)
            .filter(s => s.isRequired)
            .every(s => s.status === 'configured');
          const isNextStep = isPending && previousStepsConfigured;

          return (
            <div
              key={step.id}
              className={`relative rounded-2xl border transition-all duration-300 overflow-hidden ${
                isConfigured
                  ? 'bg-primary-500/5 border-primary-500/30'
                  : isError
                    ? 'bg-red-500/5 border-red-500/30'
                    : isNextStep
                      ? 'bg-primary-500/5 border-primary-500/30 ring-2 ring-primary-500/20'
                      : 'bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)] opacity-60'
              }`}
            >
              {/* Step number badge */}
              <div className={`absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                isConfigured
                  ? 'bg-primary-500 text-white'
                  : isError
                    ? 'bg-red-500 text-white'
                    : isNextStep
                      ? 'bg-primary-500 text-white'
                      : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)]'
              }`}>
                {isConfigured ? <Check size={16} /> : index + 1}
              </div>

              <div className="pl-16 pr-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-semibold ${
                        isConfigured ? 'text-primary-400' : isError ? 'text-red-400' : 'text-[var(--ds-text-primary)]'
                      }`}>
                        {step.title}
                      </h3>
                      {step.isRequired && (
                        <span className="px-1.5 py-0.5 bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] text-[10px] font-medium rounded">
                          OBRIGATÓRIO
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--ds-text-secondary)] mb-3">
                      {step.description}
                    </p>

                    {/* Error message */}
                    {isError && step.errorMessage && (
                      <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-3">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{step.errorMessage}</span>
                      </div>
                    )}

                    {/* Success message */}
                    {isConfigured && (
                      <div className="flex items-center gap-2 text-sm text-primary-400">
                        <Check size={14} />
                        <span>Configurado com sucesso</span>
                      </div>
                    )}
                  </div>

                  {/* Action button */}
                  {isPending && step.actionUrl && (
                    <a
                      href={step.actionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                        isNextStep
                          ? 'bg-primary-500 hover:bg-primary-400 text-white'
                          : 'bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] cursor-not-allowed'
                      }`}
                      onClick={(e) => {
                        if (!isNextStep) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {step.actionLabel}
                      <ExternalLink size={14} />
                    </a>
                  )}

                  {/* Icon for configured state */}
                  {isConfigured && (
                    <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
                      {step.icon}
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow connector */}
              {index < steps.length - 1 && (
                <div className="absolute -bottom-4 left-7 z-10">
                  <div className={`w-0.5 h-8 ${isConfigured ? 'bg-primary-500/30' : 'bg-[var(--ds-border-default)]'}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      {allConfigured ? (
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500/20 border border-primary-500/30 rounded-xl text-primary-400 mb-4">
            <Check size={20} />
            <span className="font-medium">Tudo configurado!</span>
          </div>
          {onContinueToSettings && (
            <button
              onClick={onContinueToSettings}
              className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white dark:bg-white dark:hover:bg-neutral-100 dark:text-black font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              Ir para Configurações
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 p-4 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-subtle)] rounded-xl text-center">
          <p className="text-[var(--ds-text-secondary)] text-sm">
            Complete os passos acima para liberar as configurações do WhatsApp.
          </p>
          <p className="text-[var(--ds-text-muted)] text-xs mt-2">
            Após configurar suas credenciais, clique em "Verificar novamente" para atualizar.
          </p>
        </div>
      )}

      {/* Help section */}
      <div className="mt-8 pt-6 border-t border-[var(--ds-border-subtle)]">
        <h4 className="text-sm font-medium text-[var(--ds-text-secondary)] mb-3">Precisa de ajuda?</h4>
        <div className="grid grid-cols-1 gap-3">
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-subtle)] rounded-xl text-sm text-[var(--ds-text-secondary)] transition-colors"
          >
            <MessageSquare size={16} className="text-green-400" />
            Docs: WhatsApp Cloud API
            <ExternalLink size={12} className="text-[var(--ds-text-muted)] ml-auto" />
          </a>
        </div>
      </div>
    </div>
  );
};

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Minimize2,
  X,
  AlertTriangle,
  ExternalLink,
  Key,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useOnboardingProgress, type OnboardingStep } from './hooks/useOnboardingProgress';
import { cn } from '@/lib/utils';
import type { HealthStatus } from '@/lib/health-check';
import { toast } from 'sonner';

interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  actionLabel?: string;
  actionUrl?: string;
  isComplete: boolean;
}

interface OnboardingChecklistProps {
  /** Health status do sistema (fonte da verdade para credentials e webhook) */
  healthStatus: HealthStatus;
  /** Token expira em X dias (null = permanente ou desconhecido) */
  tokenExpiresIn?: string | null;
  onNavigate?: (path: string) => void;
  /** Callback para abrir o modal de onboarding em um step específico */
  onOpenStep?: (step: OnboardingStep) => void;
}

export function OnboardingChecklist({
  healthStatus,
  tokenExpiresIn,
  onNavigate,
  onOpenStep,
}: OnboardingChecklistProps) {
  const {
    progress,
    shouldShowChecklist,
    minimizeChecklist,
    dismissChecklist,
  } = useOnboardingProgress();

  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [tokenConfirmChecked, setTokenConfirmChecked] = useState(false);

  // Estado do token permanente - busca do banco de dados
  const [isPermanentTokenConfirmed, setIsPermanentTokenConfirmed] = useState(false);
  const [isLoadingTokenStatus, setIsLoadingTokenStatus] = useState(true);
  const [isSavingTokenStatus, setIsSavingTokenStatus] = useState(false);

  // Busca o status do token permanente do banco ao montar
  useEffect(() => {
    async function fetchTokenStatus() {
      try {
        const res = await fetch('/api/settings/onboarding');
        if (res.ok) {
          const data = await res.json();
          setIsPermanentTokenConfirmed(data.permanentTokenConfirmed ?? false);
        }
      } catch (error) {
        console.error('Erro ao buscar status do token permanente:', error);
      } finally {
        setIsLoadingTokenStatus(false);
      }
    }
    fetchTokenStatus();
  }, []);

  // Salva a confirmação do token permanente no banco
  const confirmPermanentToken = useCallback(async () => {
    setIsSavingTokenStatus(true);
    try {
      const res = await fetch('/api/settings/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanentTokenConfirmed: true }),
      });

      if (res.ok) {
        setIsPermanentTokenConfirmed(true);
        toast.success('Token permanente confirmado!');
      } else {
        throw new Error('Falha ao salvar');
      }
    } catch (error) {
      console.error('Erro ao salvar status do token permanente:', error);
      toast.error('Erro ao salvar confirmação');
    } finally {
      setIsSavingTokenStatus(false);
    }
  }, []);

  if (!shouldShowChecklist || progress.isChecklistMinimized) {
    return null;
  }

  // Fonte da verdade: health check (DB)
  const isCredentialsOk = healthStatus.services.whatsapp.status === 'ok';
  const isWebhookOk = healthStatus.services.webhook?.status === 'ok';

  // Token permanente: agora vem do banco de dados
  const isPermanentToken = isPermanentTokenConfirmed;

  const items: ChecklistItem[] = [
    {
      id: 'credentials',
      label: 'Conectar credenciais do WhatsApp',
      isComplete: isCredentialsOk,
    },
    {
      id: 'webhook',
      label: 'Configurar webhook',
      description: 'Receba notificações de entrega e leitura',
      actionLabel: 'Configurar',
      isComplete: isWebhookOk,
    },
    {
      id: 'permanentToken',
      label: 'Criar token permanente (System User)',
      description: 'Evite interrupções quando o token expirar',
      actionLabel: 'Criar',
      actionUrl: 'https://business.facebook.com/settings/system-users',
      isComplete: isPermanentToken,
    },
  ];

  // Calcula progresso baseado nos items
  const completedCount = items.filter(item => item.isComplete).length;
  const checklistProgress = {
    completed: completedCount,
    total: items.length,
    percentage: Math.round((completedCount / items.length) * 100),
  };

  // Se tudo completo, não mostra checklist
  if (checklistProgress.percentage === 100) {
    return null;
  }

  const showTokenWarning = tokenExpiresIn && !isPermanentToken;

  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-[var(--ds-text-primary)]">Complete sua configuração</h3>
          <span className="text-sm text-[var(--ds-text-muted)]">
            {checklistProgress.percentage}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => minimizeChecklist(true)}
            className="p-1.5 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
            title="Minimizar"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={dismissChecklist}
            className="p-1.5 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[var(--ds-bg-surface)] rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full transition-all duration-500"
          style={{ width: `${checklistProgress.percentage}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg transition-colors',
              item.isComplete ? 'bg-[var(--ds-bg-surface)]/50' : 'bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]'
            )}
          >
            <div className="flex items-center gap-3">
              {item.isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-primary-500 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-[var(--ds-text-muted)] flex-shrink-0" />
              )}
              <div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    item.isComplete ? 'text-[var(--ds-text-muted)] line-through' : 'text-[var(--ds-text-primary)]'
                  )}
                >
                  {item.label}
                </p>
                {item.description && !item.isComplete && (
                  <p className="text-xs text-[var(--ds-text-muted)]">{item.description}</p>
                )}
              </div>
            </div>

            {!item.isComplete && item.actionLabel && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-400 hover:text-primary-300 hover:bg-primary-500/10"
                onClick={() => {
                  // Webhook abre o wizard no step de configuração
                  if (item.id === 'webhook') {
                    onOpenStep?.('configure-webhook');
                    return;
                  }
                  // Token permanente abre dialog de confirmação
                  if (item.id === 'permanentToken') {
                    setShowTokenDialog(true);
                    return;
                  }
                  if (item.actionUrl?.startsWith('http')) {
                    window.open(item.actionUrl, '_blank');
                  } else if (item.actionUrl && onNavigate) {
                    onNavigate(item.actionUrl);
                  }
                }}
              >
                {item.actionLabel}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Token warning */}
      {showTokenWarning && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-amber-200">
                Seu token expira em <strong>{tokenExpiresIn}</strong>.
                Crie um token permanente para evitar interrupções.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10 flex-shrink-0"
              onClick={() => setShowTokenDialog(true)}
            >
              Criar agora
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de confirmação - Token Permanente */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                <Key className="w-7 h-7 text-amber-400" />
              </div>
            </div>
            <DialogTitle className="text-center">Criar Token Permanente</DialogTitle>
            <DialogDescription className="text-center">
              Tokens de System User não expiram e garantem funcionamento contínuo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Instruções */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-[var(--ds-text-secondary)]">No Meta Business Suite:</h4>
              <ol className="space-y-2 text-sm text-[var(--ds-text-secondary)]">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                  <span>Vá em <strong className="text-[var(--ds-text-primary)]">System Users</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                  <span>Clique em <strong className="text-[var(--ds-text-primary)]">Add</strong> para criar um novo System User</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                  <span>Dê permissão de <strong className="text-[var(--ds-text-primary)]">WhatsApp Business</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                  <span>Gere o token e <strong className="text-[var(--ds-text-primary)]">atualize nas configurações</strong> do Dispara</span>
                </li>
              </ol>
            </div>

            {/* Link externo */}
            <a
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Meta Business Suite
            </a>

            {/* Confirmação */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)]">
              <Checkbox
                id="confirm-token"
                checked={tokenConfirmChecked}
                onCheckedChange={(checked) => setTokenConfirmChecked(checked === true)}
                className="mt-0.5 border-primary-500 data-[state=checked]:bg-primary-500"
              />
              <label
                htmlFor="confirm-token"
                className="text-sm text-[var(--ds-text-secondary)] cursor-pointer select-none leading-relaxed"
              >
                Confirmo que criei um <strong className="text-[var(--ds-text-primary)]">System User</strong> e atualizei o token nas configurações
              </label>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTokenDialog(false);
                  setTokenConfirmChecked(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={!tokenConfirmChecked || isSavingTokenStatus}
                onClick={async () => {
                  await confirmPermanentToken();
                  setShowTokenDialog(false);
                  setTokenConfirmChecked(false);
                }}
              >
                {isSavingTokenStatus ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Confirmar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

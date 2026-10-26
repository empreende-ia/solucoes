'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepHeader } from './StepHeader';
import { toast } from 'sonner';

interface SyncTemplatesStepProps {
  onNext: () => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
  onTemplatesSynced?: (count: number) => void;
}

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export function SyncTemplatesStep({
  onNext,
  onBack,
  stepNumber,
  totalSteps,
  onTemplatesSynced,
}: SyncTemplatesStepProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [templateCount, setTemplateCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Auto-sync on mount
  useEffect(() => {
    handleSync();
  }, []);

  const handleSync = async () => {
    setSyncStatus('syncing');
    setErrorMessage('');

    try {
      const response = await fetch('/api/templates');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao sincronizar templates');
      }

      const templates = await response.json();
      const count = Array.isArray(templates) ? templates.length : 0;

      setTemplateCount(count);
      setSyncStatus('success');
      onTemplatesSynced?.(count);

      if (count > 0) {
        toast.success(`${count} templates sincronizados!`);
      }
    } catch (error) {
      setSyncStatus('error');
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      setErrorMessage(message);
      toast.error('Falha ao sincronizar templates');
    }
  };

  const handleContinue = () => {
    onNext();
  };

  return (
    <div className="space-y-6">
      <StepHeader
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Sincronizar Templates"
        onBack={onBack}
      />

      {/* Ícone central com animação */}
      <div className="flex justify-center py-6">
        <div className={`
          w-24 h-24 rounded-2xl flex items-center justify-center transition-all duration-500
          ${syncStatus === 'syncing' ? 'bg-blue-500/20 animate-pulse' : ''}
          ${syncStatus === 'success' ? 'bg-green-500/20' : ''}
          ${syncStatus === 'error' ? 'bg-red-500/20' : ''}
          ${syncStatus === 'idle' ? 'bg-[var(--ds-bg-surface)]' : ''}
        `}>
          {syncStatus === 'syncing' && (
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
          )}
          {syncStatus === 'success' && (
            <CheckCircle2 className="w-12 h-12 text-primary-400" />
          )}
          {syncStatus === 'error' && (
            <AlertCircle className="w-12 h-12 text-red-400" />
          )}
          {syncStatus === 'idle' && (
            <FileText className="w-12 h-12 text-[var(--ds-text-secondary)]" />
          )}
        </div>
      </div>

      {/* Status message */}
      <div className="text-center space-y-2">
        {syncStatus === 'syncing' && (
          <>
            <p className="text-lg font-medium text-[var(--ds-text-primary)]">Sincronizando templates...</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">Buscando seus templates aprovados da Meta</p>
          </>
        )}

        {syncStatus === 'success' && templateCount > 0 && (
          <>
            <p className="text-lg font-medium text-primary-400">
              {templateCount} {templateCount === 1 ? 'template encontrado' : 'templates encontrados'}!
            </p>
            <p className="text-sm text-[var(--ds-text-secondary)]">
              Seus templates estão prontos para uso
            </p>
          </>
        )}

        {syncStatus === 'success' && templateCount === 0 && (
          <>
            <p className="text-lg font-medium text-amber-400">Nenhum template encontrado</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">
              Você ainda não tem templates aprovados na sua conta
            </p>
          </>
        )}

        {syncStatus === 'error' && (
          <>
            <p className="text-lg font-medium text-red-400">Erro ao sincronizar</p>
            <p className="text-sm text-[var(--ds-text-secondary)]">{errorMessage}</p>
          </>
        )}
      </div>

      {/* Info box */}
      {syncStatus === 'success' && templateCount === 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm text-amber-200/80">
            <strong className="text-amber-200">Sem problemas!</strong>
            <br />
            A Meta fornece automaticamente o template "hello_world" para testes.
            Você pode criar mais templates depois no Meta Business Manager.
          </p>
        </div>
      )}

      {/* Retry button for errors */}
      {syncStatus === 'error' && (
        <Button
          variant="outline"
          className="w-full"
          onClick={handleSync}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      )}

      {/* Ações */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleContinue}
          disabled={syncStatus === 'syncing'}
        >
          {syncStatus === 'syncing' ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Aguarde...
            </>
          ) : (
            <>
              Próximo passo
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

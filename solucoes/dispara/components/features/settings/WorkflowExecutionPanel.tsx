'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Save, Loader2 } from 'lucide-react';
import { WorkflowExecutionConfig } from '../../../types';
import { SectionHeader } from '@/components/ui/section-header';

export interface WorkflowExecutionPanelProps {
  workflowExecution?: {
    ok: boolean;
    source?: string;
    config: WorkflowExecutionConfig;
  } | null;
  workflowExecutionLoading?: boolean;
  saveWorkflowExecution?: (data: Partial<WorkflowExecutionConfig>) => Promise<WorkflowExecutionConfig | void>;
  isSaving?: boolean;
}

const clampExecutionValue = (value: number, min: number, max: number) => {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
};

export function WorkflowExecutionPanel({
  workflowExecution,
  workflowExecutionLoading,
  saveWorkflowExecution,
  isSaving,
}: WorkflowExecutionPanelProps) {
  const workflowExecutionConfig = workflowExecution?.config;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    retryCount: workflowExecutionConfig?.retryCount ?? 0,
    retryDelayMs: workflowExecutionConfig?.retryDelayMs ?? 500,
    timeoutMs: workflowExecutionConfig?.timeoutMs ?? 10000,
  }));

  // Keep draft in sync when server data arrives (unless editing)
  useEffect(() => {
    if (isEditing) return;
    if (!workflowExecution?.config) return;
    setDraft({
      retryCount: workflowExecution.config.retryCount,
      retryDelayMs: workflowExecution.config.retryDelayMs,
      timeoutMs: workflowExecution.config.timeoutMs,
    });
  }, [
    workflowExecution?.config?.retryCount,
    workflowExecution?.config?.retryDelayMs,
    workflowExecution?.config?.timeoutMs,
    isEditing,
  ]);

  const handleSave = async () => {
    if (!saveWorkflowExecution) return;
    await saveWorkflowExecution({
      retryCount: clampExecutionValue(draft.retryCount, 0, 10),
      retryDelayMs: clampExecutionValue(draft.retryDelayMs, 0, 60000),
      timeoutMs: clampExecutionValue(draft.timeoutMs, 0, 60000),
    });
    setIsEditing(false);
  };

  return (
    <div className="glass-panel rounded-2xl p-8">
      <SectionHeader
        title="Execução do workflow (global)"
        description="Define retries e timeouts padrão para cada etapa, sem complicar o fluxo."
        color="info"
        icon={Clock}
        actions={
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={handleSave}
                disabled={!!isSaving}
                className="h-10 px-5 rounded-xl bg-primary-600 text-white hover:bg-primary-500 dark:bg-white dark:text-black dark:hover:bg-neutral-100 font-semibold transition-all text-sm flex items-center gap-2 shadow-lg shadow-primary-500/10 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar
              </button>
            )}
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="h-10 px-4 rounded-xl bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)] transition-all text-sm font-medium"
            >
              {isEditing ? 'Fechar' : 'Configurar'}
            </button>
          </div>
        }
      />

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4">
          <div className="text-xs text-[var(--ds-text-muted)]">Resumo</div>
          {workflowExecutionLoading ? (
            <div className="mt-2 text-sm text-[var(--ds-text-secondary)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="mt-2">
              <div className="text-sm text-[var(--ds-text-primary)]">
                retries: <span className="font-mono text-[var(--ds-text-primary)]">{workflowExecutionConfig?.retryCount ?? 0}</span>
                <span className="text-[var(--ds-text-muted)]"> · </span>
                delay: <span className="font-mono text-[var(--ds-text-primary)]">{workflowExecutionConfig?.retryDelayMs ?? 500}ms</span>
                <span className="text-[var(--ds-text-muted)]"> · </span>
                timeout: <span className="font-mono text-[var(--ds-text-primary)]">{workflowExecutionConfig?.timeoutMs ?? 10000}ms</span>
              </div>
              <div className="mt-2 text-xs text-[var(--ds-text-secondary)]">
                fonte: {workflowExecution?.source || 'env'}
              </div>
            </div>
          )}
        </div>

        <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4">
          <div className="text-xs text-[var(--ds-text-muted)]">Observação</div>
          <div className="mt-2 text-xs text-[var(--ds-text-secondary)] leading-relaxed">
            Aplica em todos os steps do workflow. Ajustes por etapa foram removidos para manter simples.
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="mt-6 p-5 bg-[var(--ds-bg-surface)] border border-[var(--ds-border-default)] rounded-2xl">
          <div className="text-sm font-medium text-[var(--ds-text-primary)]">Parâmetros globais</div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">retryCount</label>
              <input
                type="number"
                min={0}
                max={10}
                value={draft.retryCount}
                onChange={(e) => setDraft((s) => ({ ...s, retryCount: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
              />
              <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quantas tentativas extras por etapa.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">retryDelayMs</label>
              <input
                type="number"
                min={0}
                max={60000}
                value={draft.retryDelayMs}
                onChange={(e) => setDraft((s) => ({ ...s, retryDelayMs: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
              />
              <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Delay base antes de reintentar (backoff exponencial).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">timeoutMs</label>
              <input
                type="number"
                min={0}
                max={60000}
                value={draft.timeoutMs}
                onChange={(e) => setDraft((s) => ({ ...s, timeoutMs: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none"
              />
              <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Tempo máximo por etapa antes de falhar.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

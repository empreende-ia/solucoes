'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';

interface AutoSuppressionConfig {
  enabled: boolean;
  undeliverable131026: {
    enabled: boolean;
    windowDays: number;
    threshold: number;
    ttlBaseDays: number;
    ttl2Days: number;
    ttl3Days: number;
  };
}

export interface AutoSuppressionPanelProps {
  autoSuppression?: {
    ok: boolean;
    source?: 'db' | 'default';
    config?: AutoSuppressionConfig;
  } | null;
  autoSuppressionLoading?: boolean;
  saveAutoSuppression?: (data: {
    enabled?: boolean;
    undeliverable131026?: {
      enabled?: boolean;
      windowDays?: number;
      threshold?: number;
      ttlBaseDays?: number;
      ttl2Days?: number;
      ttl3Days?: number;
    };
  }) => Promise<void>;
  isSaving?: boolean;
}

export function AutoSuppressionPanel({
  autoSuppression,
  autoSuppressionLoading,
  saveAutoSuppression,
  isSaving,
}: AutoSuppressionPanelProps) {
  const autoConfig = autoSuppression?.config;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    enabled: autoConfig?.enabled ?? true,
    undeliverable131026: {
      enabled: autoConfig?.undeliverable131026?.enabled ?? true,
      windowDays: autoConfig?.undeliverable131026?.windowDays ?? 30,
      threshold: autoConfig?.undeliverable131026?.threshold ?? 1,
      ttlBaseDays: autoConfig?.undeliverable131026?.ttlBaseDays ?? 90,
      ttl2Days: autoConfig?.undeliverable131026?.ttl2Days ?? 180,
      ttl3Days: autoConfig?.undeliverable131026?.ttl3Days ?? 365,
    },
  }));

  // Keep draft in sync when server data arrives (unless editing)
  useEffect(() => {
    if (!autoConfig) return;
    if (isEditing) return;
    setDraft({
      enabled: autoConfig.enabled,
      undeliverable131026: {
        enabled: autoConfig.undeliverable131026.enabled,
        windowDays: autoConfig.undeliverable131026.windowDays,
        threshold: autoConfig.undeliverable131026.threshold,
        ttlBaseDays: autoConfig.undeliverable131026.ttlBaseDays,
        ttl2Days: autoConfig.undeliverable131026.ttl2Days,
        ttl3Days: autoConfig.undeliverable131026.ttl3Days,
      },
    });
  }, [
    autoConfig?.enabled,
    autoConfig?.undeliverable131026?.enabled,
    autoConfig?.undeliverable131026?.windowDays,
    autoConfig?.undeliverable131026?.threshold,
    autoConfig?.undeliverable131026?.ttlBaseDays,
    autoConfig?.undeliverable131026?.ttl2Days,
    autoConfig?.undeliverable131026?.ttl3Days,
    isEditing,
  ]);

  const handleSave = async () => {
    if (!saveAutoSuppression) return;

    const p = draft.undeliverable131026;
    if (p.threshold < 1) {
      toast.error('threshold deve ser ≥ 1');
      return;
    }
    if (p.windowDays < 1) {
      toast.error('windowDays deve ser ≥ 1');
      return;
    }
    if (p.ttl2Days < p.ttlBaseDays) {
      toast.error('ttl2Days não pode ser menor que ttlBaseDays');
      return;
    }
    if (p.ttl3Days < p.ttl2Days) {
      toast.error('ttl3Days não pode ser menor que ttl2Days');
      return;
    }

    await saveAutoSuppression({
      enabled: draft.enabled,
      undeliverable131026: {
        enabled: p.enabled,
        windowDays: p.windowDays,
        threshold: p.threshold,
        ttlBaseDays: p.ttlBaseDays,
        ttl2Days: p.ttl2Days,
        ttl3Days: p.ttl3Days,
      },
    });
    setIsEditing(false);
  };

  return (
    <div className="glass-panel rounded-2xl p-8">
      <SectionHeader
        title="Proteção de Qualidade (Auto-supressão)"
        description={
          <>
            Bloqueia automaticamente telefones com falhas repetidas (ex.: <span className="font-mono">131026</span>)
            para reduzir retries inúteis e proteger a qualidade da conta.
          </>
        }
        color="brand"
        icon={Shield}
        actions={
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={handleSave}
                disabled={!!isSaving}
                className="h-10 px-5 rounded-xl bg-primary-500 hover:bg-primary-400 text-black font-semibold transition-all text-sm flex items-center gap-2 shadow-lg shadow-primary-500/10 disabled:opacity-50"
                title="Salvar configurações de auto-supressão"
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
          <div className="text-xs text-[var(--ds-text-muted)]">Status</div>
          {autoSuppressionLoading ? (
            <div className="mt-2 text-sm text-[var(--ds-text-secondary)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="mt-2">
              <div className="text-sm text-[var(--ds-text-primary)] flex items-center gap-2 flex-wrap">
                {autoConfig?.enabled ? (
                  <StatusBadge status="success">Ativo</StatusBadge>
                ) : (
                  <StatusBadge status="default">Inativo</StatusBadge>
                )}
                <span className="text-xs text-[var(--ds-text-secondary)]">fonte: {autoSuppression?.source || '—'}</span>
              </div>
              <div className="mt-2 text-xs text-[var(--ds-text-secondary)]">
                Regra 131026: <span className="font-mono text-[var(--ds-text-primary)]">{autoConfig?.undeliverable131026?.enabled ? 'on' : 'off'}</span>
                <span className="text-[var(--ds-text-muted)]"> · </span>
                threshold: <span className="font-mono text-[var(--ds-text-primary)]">{autoConfig?.undeliverable131026?.threshold ?? '—'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4">
          <div className="text-xs text-[var(--ds-text-muted)]">Observação</div>
          <div className="mt-2 text-xs text-[var(--ds-text-secondary)] leading-relaxed">
            Dica: com perfil agressivo, <span className="font-mono">threshold=1</span> já coloca em quarentena.
            Para "mais seguro", aumente o threshold.
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="mt-6 p-5 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--ds-text-primary)]">Configurações</div>
            <label className="flex items-center gap-2 text-sm text-[var(--ds-text-primary)]">
              <input
                type="checkbox"
                checked={!!draft.enabled}
                onChange={(e) => setDraft((s) => ({ ...s, enabled: e.target.checked }))}
                className="accent-primary-500"
              />
              Ativar auto-supressão
            </label>
          </div>

          <div className="mt-4 p-4 bg-[var(--ds-bg-base)] border border-[var(--ds-border-default)] rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-[var(--ds-text-primary)] font-medium">Regra: 131026 (undeliverable)</div>
                <div className="text-[11px] text-[var(--ds-text-muted)]">Cross-campaign: conta falhas por telefone na janela e aplica quarentena.</div>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--ds-text-primary)]">
                <input
                  type="checkbox"
                  checked={!!draft.undeliverable131026.enabled}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      undeliverable131026: { ...s.undeliverable131026, enabled: e.target.checked },
                    }))
                  }
                  className="accent-primary-500"
                />
                Ativar regra
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">windowDays</label>
                <input
                  type="number"
                  value={draft.undeliverable131026.windowDays}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      undeliverable131026: { ...s.undeliverable131026, windowDays: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                  min={1}
                  max={365}
                />
                <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Janela (dias) para contar falhas.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">threshold</label>
                <input
                  type="number"
                  value={draft.undeliverable131026.threshold}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      undeliverable131026: { ...s.undeliverable131026, threshold: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                  min={1}
                  max={20}
                />
                <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quantas falhas na janela para suprimir.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">ttlBaseDays</label>
                <input
                  type="number"
                  value={draft.undeliverable131026.ttlBaseDays}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      undeliverable131026: { ...s.undeliverable131026, ttlBaseDays: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                  min={1}
                  max={3650}
                />
                <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quarentena (dias) na 1ª ocorrência.</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">ttl2Days</label>
                <input
                  type="number"
                  value={draft.undeliverable131026.ttl2Days}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      undeliverable131026: { ...s.undeliverable131026, ttl2Days: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                  min={1}
                  max={3650}
                />
                <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quarentena (dias) na 2ª ocorrência.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--ds-text-secondary)] mb-1">ttl3Days</label>
                <input
                  type="number"
                  value={draft.undeliverable131026.ttl3Days}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      undeliverable131026: { ...s.undeliverable131026, ttl3Days: Number(e.target.value) },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-lg text-sm text-[var(--ds-text-primary)] font-mono"
                  min={1}
                  max={3650}
                />
                <p className="text-[11px] text-[var(--ds-text-muted)] mt-1">Quarentena (dias) na 3ª+ ocorrência.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

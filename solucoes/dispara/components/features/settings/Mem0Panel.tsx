'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Brain, Eye, EyeOff, Info, Loader2, Check, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Mem0Config {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}

/**
 * Mem0Panel - Configuração de memória persistente para conversas
 *
 * Permite ao usuário habilitar/desabilitar a memória contextual
 * nas conversas do agente de IA. Com Mem0 ativo, o agente lembra
 * de interações anteriores com cada contato.
 */
export function Mem0Panel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Mem0Config>({
    enabled: false,
    hasApiKey: false,
    apiKeyPreview: null,
  });
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/mem0', { cache: 'no-store' });
      const data = await res.json();

      if (data.ok) {
        setConfig(data.config);
      }
    } catch (error) {
      console.error('Error fetching Mem0 config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleToggle = async (enabled: boolean) => {
    // Se tentando habilitar sem chave, mostrar input
    if (enabled && !config.hasApiKey) {
      setShowApiKeyInput(true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/mem0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      const data = await res.json();

      if (data.ok) {
        setConfig(data.config);
        toast.success(enabled ? 'Mem0 habilitado!' : 'Mem0 desabilitado');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Error toggling Mem0:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyDraft.trim()) {
      toast.error('Informe a API key do Mem0');
      return;
    }

    if (!apiKeyDraft.startsWith('m0-')) {
      toast.error('API key deve começar com "m0-"');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/mem0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          apiKey: apiKeyDraft.trim()
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setConfig(data.config);
        setApiKeyDraft('');
        setShowApiKeyInput(false);
        toast.success('Mem0 configurado com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Error saving Mem0 API key:', error);
      toast.error('Erro ao salvar API key');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/mem0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          apiKey: '' // Empty string to clear
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setConfig({ enabled: false, hasApiKey: false, apiKeyPreview: null });
        toast.success('API key removida');
      } else {
        toast.error(data.error || 'Erro ao remover');
      }
    } catch (error) {
      console.error('Error removing Mem0 API key:', error);
      toast.error('Erro ao remover API key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-2 text-[var(--ds-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel rounded-2xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-text-primary)]">
            <Brain className="size-4 text-violet-400" />
            Memória Persistente (Mem0)
          </div>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            O agente lembra de conversas anteriores com cada contato.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-3">
          {config.enabled && (
            <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-300">
              Ativo
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label="Habilitar Mem0"
            disabled={saving}
            onClick={() => handleToggle(!config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
              config.enabled
                ? 'border-violet-400 bg-violet-600'
                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]'
            } ${saving ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span
              className={`inline-block size-4 rounded-full transition ${
                config.enabled ? 'translate-x-6 bg-white' : 'translate-x-1 bg-[var(--ds-text-muted)]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Config Status / API Key Input */}
      <div className="mt-5 space-y-4">
        {/* Configured status */}
        {config.hasApiKey && !showApiKeyInput && (
          <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
                  <Check size={16} className="text-violet-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--ds-text-primary)]">API Key Configurada</div>
                  {config.apiKeyPreview && (
                    <div className="text-xs text-[var(--ds-text-muted)] font-mono mt-0.5">
                      {config.apiKeyPreview}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowApiKeyInput(true)}
                  className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                >
                  Atualizar chave
                </button>
                <button
                  type="button"
                  onClick={handleRemoveApiKey}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  <Trash2 className="size-3" />
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}

        {/* API Key Input */}
        {(showApiKeyInput || !config.hasApiKey) && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-4">
            <div className="flex items-start gap-2 text-sm text-violet-200/80">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="leading-relaxed">
                  Mem0 é uma camada de memória para IA que permite contexto persistente.
                  <a
                    href="https://app.mem0.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 ml-1 font-medium hover:underline"
                  >
                    Criar conta <ExternalLink size={12} />
                  </a>
                </p>
                <p className="text-xs text-violet-300/60 mt-1">
                  Plano gratuito disponível
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="m0-..."
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 pr-10 text-sm text-[var(--ds-text-primary)] font-mono outline-none transition focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={saving || !apiKeyDraft.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              {config.hasApiKey && showApiKeyInput && (
                <button
                  type="button"
                  onClick={() => {
                    setShowApiKeyInput(false);
                    setApiKeyDraft('');
                  }}
                  className="text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)]"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}

        {/* Benefits info */}
        {config.enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-tertiary)] p-3 text-xs text-[var(--ds-text-secondary)]">
            <Info className="mt-0.5 size-4 shrink-0 text-violet-300/60" />
            <div>
              <p>Com a memória ativa, o agente consegue:</p>
              <ul className="mt-1 space-y-0.5 text-[var(--ds-text-muted)]">
                <li>• Lembrar preferências do cliente</li>
                <li>• Retomar conversas anteriores</li>
                <li>• Personalizar respostas por contexto</li>
                <li>• Evitar repetição de perguntas</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

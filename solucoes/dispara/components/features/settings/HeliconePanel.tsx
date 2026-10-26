'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Eye, EyeOff, Info, Loader2, Check, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface HeliconeConfig {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}

interface GatewayStatus {
  enabled: boolean;
}

/**
 * HeliconePanel - Configuração de observability de IA via Helicone
 *
 * Permite ao usuário habilitar/desabilitar o monitoramento de chamadas
 * de IA através do proxy Helicone. Armazena a configuração no banco
 * de dados (tabela settings).
 */
export function HeliconePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<HeliconeConfig>({
    enabled: false,
    hasApiKey: false,
    apiKeyPreview: null,
  });
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({ enabled: false });
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);

      // Busca config do Helicone e status do Gateway em paralelo
      const [heliconeRes, gatewayRes] = await Promise.all([
        fetch('/api/settings/helicone'),
        fetch('/api/settings/ai'),
      ]);

      const heliconeData = await heliconeRes.json();
      const gatewayData = await gatewayRes.json();

      if (heliconeData.ok) {
        setConfig(heliconeData.config);
      }

      if (gatewayData.gateway) {
        setGatewayStatus({ enabled: gatewayData.gateway.enabled });
      }
    } catch (error) {
      console.error('Error fetching Helicone config:', error);
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

    // Se habilitando o Helicone, desativa o Gateway automaticamente
    if (enabled && gatewayStatus.enabled) {
      try {
        await fetch('/api/settings/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gateway: { enabled: false } }),
        });
        setGatewayStatus({ enabled: false });
      } catch (error) {
        console.error('Error disabling Gateway:', error);
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/helicone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });

      const data = await res.json();

      if (data.ok) {
        setConfig(data.config);
        toast.success(enabled ? 'Helicone habilitado!' : 'Helicone desabilitado');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Error toggling Helicone:', error);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyDraft.trim()) {
      toast.error('Informe a API key do Helicone');
      return;
    }

    if (!apiKeyDraft.startsWith('sk-helicone-')) {
      toast.error('API key deve começar com "sk-helicone-"');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/helicone', {
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
        toast.success('Helicone configurado com sucesso!');
      } else {
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch (error) {
      console.error('Error saving Helicone API key:', error);
      toast.error('Erro ao salvar API key');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/helicone', {
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
      console.error('Error removing Helicone API key:', error);
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
            <Activity className="size-4 text-cyan-400" />
            Observability (Helicone)
          </div>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            Monitore prompts, tokens, custos e latência das chamadas de IA.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-3">
          {config.enabled && (
            <span className="rounded-full bg-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-300">
              Ativo
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label="Habilitar Helicone"
            disabled={saving}
            onClick={() => handleToggle(!config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
              config.enabled
                ? 'border-cyan-500/40 bg-cyan-500/20'
                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]'
            } ${saving ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span
              className={`inline-block size-4 rounded-full transition ${
                config.enabled ? 'translate-x-6 bg-cyan-300' : 'translate-x-1 bg-[var(--ds-text-muted)]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Config Status / API Key Input */}
      <div className="mt-5 space-y-4">
        {/* Gateway active warning */}
        {gatewayStatus.enabled && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <Info className="size-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-200">AI Gateway está ativo</div>
                <p className="text-xs text-amber-300/70 mt-1">
                  O Helicone está desativado porque o AI Gateway está em uso.
                  Para usar o Helicone, desative o Gateway primeiro ou ative o Helicone para desativar o Gateway automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Configured status */}
        {config.hasApiKey && !showApiKeyInput && (
          <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                  <Check size={16} className="text-cyan-400" />
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
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-4">
            <div className="flex items-start gap-2 text-sm text-cyan-200/80">
              <Info className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="leading-relaxed">
                  O Helicone é um proxy gratuito que monitora suas chamadas de IA.
                  <a
                    href="https://helicone.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 ml-1 font-medium hover:underline"
                  >
                    Criar conta <ExternalLink size={12} />
                  </a>
                </p>
                <p className="text-xs text-cyan-300/60 mt-1">
                  100.000 requests/mês gratuitos
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-helicone-..."
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 pr-10 text-sm text-[var(--ds-text-primary)] font-mono outline-none transition focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/10"
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
                className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
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
            <Info className="mt-0.5 size-4 shrink-0 text-cyan-300/60" />
            <div>
              <p>Com o Helicone ativo, você pode ver no dashboard:</p>
              <ul className="mt-1 space-y-0.5 text-[var(--ds-text-muted)]">
                <li>• Prompts completos enviados</li>
                <li>• Tokens consumidos por request</li>
                <li>• Custo estimado por modelo</li>
                <li>• Latência e erros</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

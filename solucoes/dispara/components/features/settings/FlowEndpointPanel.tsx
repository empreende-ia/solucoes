'use client';

import React, { useState, useEffect } from 'react';
import { Workflow, Copy, Check, RefreshCw, Key } from 'lucide-react';
import { toast } from 'sonner';
import { SectionHeader } from '@/components/ui/section-header';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';

interface EndpointStatus {
  configured: boolean;
  publicKey: string | null;
  endpointUrl: string | null;
}

interface FlowEndpointPanelProps {
  devBaseUrl?: string | null;
}

export function FlowEndpointPanel({ devBaseUrl }: FlowEndpointPanelProps) {
  const [status, setStatus] = useState<EndpointStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<'url' | 'key' | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/flows/endpoint/keys', { cache: 'no-store' });
      const data = await res.json();
      // #region agent log
      // #endregion agent log
      setStatus(data);
    } catch {
      toast.error('Erro ao verificar status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/flows/endpoint/keys', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Chave salva localmente mas não registrada na Meta = Flows com endpoint
        // continuam recebendo 421 até sincronizar: não é sucesso.
        if (data.metaSync && data.metaSync.success === false) {
          toast.warning(
            `Chaves geradas, mas a sincronização com a Meta falhou${data.metaSync.error ? `: ${data.metaSync.error}` : ''}. ` +
              'Use "Re-sincronizar chave dos Flows" no Diagnóstico da Meta ou gere novamente.'
          );
        } else {
          toast.success('Chaves geradas com sucesso!');
        }
        await fetchStatus();
      } else {
        toast.error(data.error || 'Erro ao gerar');
      }
    } catch {
      toast.error('Erro ao gerar chaves');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'url' | 'key') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  const devEndpointUrl = devBaseUrl ? `${devBaseUrl}/api/flows/endpoint` : null;
  const resolvedEndpointUrl = devEndpointUrl || status?.endpointUrl || null;

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-8">
        <div className="animate-pulse h-20 bg-[var(--ds-bg-hover)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-8">
      <SectionHeader
        title="MiniApp Dinâmico (Endpoint)"
        description="Permite MiniApps buscarem dados em tempo real (ex: slots do Calendar)."
        color="info"
        icon={Workflow}
        badge={status?.configured && <StatusBadge status="success">Configurado</StatusBadge>}
        className="mb-6"
      />

      {!status?.configured ? (
        <div className="text-center py-8">
          <div className="inline-flex p-4 bg-primary-500/10 rounded-2xl mb-4">
            <Key size={32} className="text-primary-400" />
          </div>
          <p className="text-[var(--ds-text-secondary)] mb-4">Gere as chaves para ativar o endpoint.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="h-10 px-6 bg-primary-500 hover:bg-primary-400 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            {generating ? <RefreshCw size={16} className="animate-spin" /> : <Key size={16} />}
            {generating ? 'Gerando...' : 'Gerar Chaves'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sucesso */}
          <Alert variant="success">
            <AlertTitle>Pronto para usar!</AlertTitle>
            <AlertDescription>
              Ao publicar um MiniApp dinâmico, o endpoint será configurado automaticamente.
            </AlertDescription>
          </Alert>

          {/* Endpoint URL */}
          <div className="bg-[var(--ds-bg-elevated)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--ds-text-secondary)]">URL do Endpoint</span>
              <button
                onClick={() => resolvedEndpointUrl && copyToClipboard(resolvedEndpointUrl, 'url')}
                className="text-xs text-primary-300 hover:text-primary-200 flex items-center gap-1"
              >
                {copied === 'url' ? <Check size={12} /> : <Copy size={12} />}
                {copied === 'url' ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <code className="text-sm text-[var(--ds-text-primary)] font-mono break-all">
              {resolvedEndpointUrl || 'URL não disponível'}
            </code>
            {!resolvedEndpointUrl ? (
              <p className="mt-2 text-[11px] text-[var(--ds-text-muted)]">
                Dica: defina `NEXT_PUBLIC_APP_URL` no ambiente de produção ou gere as chaves no
                próprio ambiente para registrar a URL correta.
              </p>
            ) : null}
            {devEndpointUrl ? (
              <p className="mt-2 text-[11px] text-primary-300">
                URL dev (túnel) ativa nesta tela.
              </p>
            ) : null}
          </div>

          {/* Regenerate */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
              Regenerar chaves
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

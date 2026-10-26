import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import { Badge } from '../ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { channelsApi } from '@/services/channels';
import type { ZernioStatus } from '@/services/channels';

const ZernioApiSettings: React.FC = () => {
  const { isAdmin } = useCompanySettings();
  const [status, setStatus] = useState<ZernioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await channelsApi.status());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar a configuração da Zernio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSave = async () => {
    const key = apiKey.trim();
    if (!key) return;

    setSaving(true);
    try {
      await channelsApi.saveKey(key);
      toast.success('Chave da Zernio salva.');
      setApiKey('');
      await fetchStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a chave da Zernio');
    } finally {
      setSaving(false);
    }
  };

  const hasKey = !!status?.hasKey;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-base">Zernio API</CardTitle>
              <CardDescription>
                Integração gerenciada para conectar o WhatsApp à Lara.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Opção 1</Badge>
            {!loading && <Badge variant={hasKey ? 'success' : 'muted'}>{hasKey ? 'Configurada' : 'Não configurada'}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use este caminho para conectar o WhatsApp Business por coexistência, sem tirar o número
          do aplicativo. Depois de salvar a chave, faça a conexão da conta na aba{' '}
          <strong className="text-foreground">Canais</strong>.
        </p>

        {loading ? (
          <Skeleton className="h-9 w-full max-w-xl" />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="zernio-api-key">Chave da API</Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="zernio-api-key"
                type="password"
                autoComplete="off"
                placeholder={hasKey ? 'Cole uma nova chave para substituir a atual (sk_…)' : 'sk_…'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={!isAdmin || saving}
                className="sm:max-w-md"
              />
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!isAdmin || saving || !apiKey.trim()}
                className="shrink-0 gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {hasKey ? 'Trocar chave' : 'Salvar chave'}
              </Button>
            </div>
            {hasKey && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {status?.profileId && <span className="font-mono">Perfil {status.profileId}</span>}
                <Badge variant={status?.webhookConfigured ? 'success' : 'muted'}>
                  {status?.webhookConfigured ? 'Webhook configurado' : 'Webhook pendente'}
                </Badge>
              </div>
            )}
          </div>
        )}

        {!isAdmin && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Apenas administradores podem trocar esta chave.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Obtenha a chave em{' '}
          <a
            href="https://zernio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            zernio.com
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>{' '}
          em Settings → API Keys. Para WhatsApp e Inbox, a conta deve usar o plano usage-based.
        </p>
      </CardContent>
    </Card>
  );
};

export default ZernioApiSettings;

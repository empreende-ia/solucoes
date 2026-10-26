import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2,
  Lock,
  MessageCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { channelsApi } from '@/services/channels';
import type { ChannelConnection, ZernioStatus } from '@/services/channels';
import { useCompanySettings } from '@/hooks/useCompanySettings';

const PLATFORM_LABEL: Record<ChannelConnection['platform'], string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

const STATUS_META: Record<
  ChannelConnection['status'],
  { label: string; variant: 'success' | 'muted' | 'destructive' }
> = {
  active: { label: 'Ativa', variant: 'success' },
  disconnected: { label: 'Desconectada', variant: 'muted' },
  error: { label: 'Erro', variant: 'destructive' },
};

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const ChannelSettings: React.FC = () => {
  const { isAdmin } = useCompanySettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<ZernioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<ChannelConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ChannelConnection | null>(null);
  const [removing, setRemoving] = useState(false);
  const redirectHandled = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await channelsApi.status();
      setStatus(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar o status dos canais');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const connections = await channelsApi.sync();
      const active = connections.filter((c) => c.status === 'active').length;
      if (connections.length === 0) {
        toast.info('Nenhuma conta encontrada na Zernio. Conclua a autorização e sincronize de novo.');
      } else {
        toast.success(
          `Sincronização concluída: ${connections.length} ${connections.length === 1 ? 'conta' : 'contas'}, ${active} ${active === 1 ? 'ativa' : 'ativas'}.`
        );
      }
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar as contas');
    } finally {
      setSyncing(false);
    }
  }, [fetchStatus]);

  // Retorno do OAuth da Zernio: ?zernio=connected → sincroniza e limpa a URL
  useEffect(() => {
    if (redirectHandled.current) return;
    if (searchParams.get('zernio') !== 'connected') return;
    redirectHandled.current = true;

    const next = new URLSearchParams(searchParams);
    next.delete('zernio');
    setSearchParams(next, { replace: true });

    toast.success('Autorização concluída. Sincronizando suas contas...');
    handleSync();
  }, [searchParams, setSearchParams, handleSync]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const authUrl = await channelsApi.connect('whatsapp');
      window.open(authUrl, '_blank');
      toast.info('Conclua a autorização na aba que abriu. Depois volte aqui e clique em "Sincronizar contas".');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar a conexão');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      await channelsApi.disconnect(disconnectTarget.zernio_account_id);
      toast.success('Conta desconectada.');
      setDisconnectTarget(null);
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desconectar a conta');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await channelsApi.remove(removeTarget.zernio_account_id);
      toast.success('Conta removida.');
      setRemoveTarget(null);
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover a conta');
    } finally {
      setRemoving(false);
    }
  };

  const hasKey = !!status?.hasKey;
  const connections = status?.connections.filter((connection) => connection.platform === 'whatsapp') ?? [];

  return (
    <div className="space-y-8">
      {!isAdmin && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Lock className="w-4 h-4 shrink-0" />
          Apenas administradores podem gerenciar canais. Os controles abaixo estão desabilitados.
        </div>
      )}

      {!loading && !hasKey && (
        <Card>
          <CardContent className="flex flex-col items-start justify-between gap-4 pt-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-foreground">Configure a Zernio antes de conectar contas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A chave da integração agora fica centralizada na aba APIs.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('tab', 'apis');
                setSearchParams(next, { replace: true });
              }}
            >
              Configurar na aba APIs
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cards de canal */}
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base">WhatsApp Business</CardTitle>
                <CardDescription>Coexistência com o app</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Conecta o mesmo número que você já usa no app WhatsApp Business. O app continua
              funcionando, o histórico dos últimos 6 meses sincroniza e a Lara passa a responder
              pela API.
            </p>
            <p className="text-xs text-muted-foreground">
              Limite de 20 mensagens por segundo. Requer app WhatsApp Business 2.24.17 ou superior
              e conta no Meta Business.
            </p>
            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={!isAdmin || !hasKey || connecting}
              className="w-full gap-2 sm:w-auto"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              Conectar WhatsApp
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Contas conectadas */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Contas conectadas</CardTitle>
              <CardDescription>
                Depois de autorizar na Zernio, sincronize para trazer as contas para cá.
              </CardDescription>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSync}
              disabled={!isAdmin || syncing || !hasKey}
              className="gap-2"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sincronizar contas
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conta conectada ainda.
            </p>
          ) : (
            connections.map((conn) => {
              const meta = STATUS_META[conn.status];
              const connectedAt = formatDate(conn.connected_at);
              return (
                <div
                  key={conn.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant="outline">{PLATFORM_LABEL[conn.platform]}</Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {conn.display_name || conn.username || conn.zernio_account_id}
                      </p>
                      {conn.username && (
                        <p className="truncate text-xs text-muted-foreground">@{conn.username}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {connectedAt && (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        desde {connectedAt}
                      </span>
                    )}
                    {conn.status !== 'disconnected' && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDisconnectTarget(conn)}
                        disabled={!isAdmin || disconnecting}
                      >
                        Desconectar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRemoveTarget(conn)}
                      disabled={!isAdmin || removing}
                      aria-label="Remover conta"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        As credenciais da Zernio e a alternativa direta da WhatsApp Cloud API ficam centralizadas
        na aba APIs. Aqui você gerencia apenas as contas conectadas.
      </p>

      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => {
          if (!open && !disconnecting) setDisconnectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desconectar{' '}
              {disconnectTarget
                ? disconnectTarget.display_name ||
                  disconnectTarget.username ||
                  PLATFORM_LABEL[disconnectTarget.platform]
                : 'conta'}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A Lara deixa de responder por este canal até você conectar de novo. No caso do
              WhatsApp, o número continua funcionando normalmente no app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="border border-destructive/20 bg-destructive/10 text-destructive shadow-none hover:bg-destructive/20"
              onClick={(e) => {
                e.preventDefault();
                handleDisconnect();
              }}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Desconectando...
                </>
              ) : (
                'Desconectar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover{' '}
              {removeTarget
                ? removeTarget.display_name ||
                  removeTarget.username ||
                  PLATFORM_LABEL[removeTarget.platform]
                : 'conta'}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A conta sai definitivamente da lista e a autorização é revogada na Zernio. Para usar
              este canal de novo, será preciso conectar e autorizar outra vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="border border-destructive/20 bg-destructive/10 text-destructive shadow-none hover:bg-destructive/20"
              onClick={(e) => {
                e.preventDefault();
                handleRemove();
              }}
            >
              {removing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChannelSettings;

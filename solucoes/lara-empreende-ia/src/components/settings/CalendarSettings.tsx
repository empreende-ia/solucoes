import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Unplug,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../Button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Switch } from '../ui/switch';
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
import NylasCredentialsSettings from './NylasCredentialsSettings';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { calendarApi, CalendarError, connectionSignature, type CalendarStatus } from '@/services/calendar';
import {
  calendarProviderLabel,
  describeCalendarProvider,
  listCalendarProviders,
  type CalendarProviderInfo,
} from '@/lib/calendarProviders';

const TIME_ZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'UTC', label: 'UTC' },
];

/** Origem que pode postar o resultado do OAuth de volta para esta janela. */
const CALLBACK_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;
  } catch {
    return null;
  }
})();

// A janela de autorização atravessa telas do Google e da Microsoft, que servem
// Cross-Origin-Opener-Policy. Depois disso `window.opener` some e `popup.closed`
// mente. O postMessage vira o caminho rápido e a consulta periódica de status é
// quem realmente decide se conectou.
const STATUS_POLL_MS = 2_000;
// O `state` do OAuth vale 10 minutos no servidor. Parar de observar antes disso
// faria a tela decretar falha enquanto a autorização ainda podia se concluir.
const CONNECT_TIMEOUT_MS = 10 * 60_000;

let popupSequence = 0;
let attemptCounter = 0;

type PendingConnection = { provider: CalendarProviderInfo; loginHint?: string | null };

const CalendarSettings: React.FC = () => {
  const { isAdmin, loading: permissionsLoading } = useCompanySettings();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loadFailure, setLoadFailure] = useState<CalendarError | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectStalled, setConnectStalled] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<CalendarProviderInfo | null>(null);
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const oauthPopup = useRef<Window | null>(null);
  const pollTimer = useRef<number | null>(null);
  const pollInFlight = useRef(false);
  /** Ordem de emissão e ordem de aplicação das consultas de status. */
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  /** Tentativa de autorização em curso; 0 quando não há nenhuma. */
  const attemptId = useRef(0);
  /** Assinatura da conexão antes da tentativa: o que prova sucesso é a mudança. */
  const beforeRef = useRef<string | null>(null);

  const loadStatus = useCallback(async (): Promise<CalendarStatus | null> => {
    requestSeq.current += 1;
    const seq = requestSeq.current;
    // Uma resposta antiga chegando depois da nova sobrescreveria o certo pelo
    // errado — acontece quando a rede varia entre dois polls. Descartar só a
    // escrita: o valor ainda é devolvido a quem pediu.
    const canApply = () => seq >= appliedSeq.current;
    try {
      const next = await calendarApi.status();
      if (canApply()) {
        appliedSeq.current = seq;
        setStatus(next);
        setLoadFailure(null);
        // Conexão saudável apaga falha de conexão anterior: virou história.
        if (next.connected && next.status === 'active') setConnectError(null);
      }
      return next;
    } catch (error) {
      const failure = error instanceof CalendarError
        ? error
        : new CalendarError(error instanceof Error ? error.message : 'Erro ao carregar a integração de agenda', null, null);
      if (canApply()) {
        appliedSeq.current = seq;
        setLoadFailure(failure);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    // pollInFlight NÃO é zerado aqui: quem está em voo ainda vai liquidar, e
    // zerar agora abriria espaço para duas consultas simultâneas.
  }, []);

  /** Encerra a tentativa por completo: nada mais dela é aceito. */
  const finishConnecting = useCallback(() => {
    stopPolling();
    attemptId.current = 0;
    beforeRef.current = null;
    setConnecting(false);
    setConnectStalled(false);
    setConnectingProvider(null);
    setAuthUrl(null);
    oauthPopup.current = null;
  }, [stopPolling]);

  const closePopup = useCallback(() => {
    try {
      oauthPopup.current?.close();
    } catch {
      // Janela cross-origin: o navegador recusa o close.
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => () => {
    stopPolling();
    closePopup();
  }, [stopPolling, closePopup]);

  // Caminho rápido: o callback consegue falar com esta janela quando o COOP não
  // apagou o opener. Quando apaga, quem resolve é a consulta periódica.
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Sem origem conhecida a validação não tem como passar: melhor recusar a
      // mensagem do que aceitar qualquer remetente.
      if (!CALLBACK_ORIGIN || event.origin !== CALLBACK_ORIGIN) return;
      if (event.data?.type !== 'nylas-calendar-oauth') return;
      // Sem tentativa em curso, a mensagem é de uma janela órfã de antes.
      if (!attemptId.current) return;
      finishConnecting();
      if (event.data.ok) {
        setConnectError(null);
        toast.success('Agenda conectada.');
        loadStatus();
      } else {
        const message = event.data.message || 'Não foi possível conectar a agenda.';
        setConnectError(message);
        toast.error(message);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [finishConnecting, loadStatus]);

  const startConnection = async (provider: CalendarProviderInfo | null, loginHint?: string | null) => {
    // Retrato de antes: só uma MUDANÇA na conexão prova que a autorização
    // funcionou. Reconexão e migração partem de `connected: true`, então
    // presença de conexão não prova nada.
    const before = connectionSignature(status);
    beforeRef.current = before;

    attemptCounter += 1;
    const thisAttempt = attemptCounter;
    attemptId.current = thisAttempt;
    // Tentativa nova começa com o polling livre, mesmo que a anterior tenha
    // deixado uma consulta pendurada — a resposta dela será descartada.
    pollInFlight.current = false;

    setConnectError(null);
    setPending(null);
    setConnecting(true);
    setConnectStalled(false);
    setConnectingProvider(provider);

    // A janela abre no próprio clique — pedir a URL antes faria o bloqueador de
    // pop-ups engolir o fluxo. O nome é único por tentativa: um nome fixo faria
    // window.open devolver uma janela antiga sem navegar até ela.
    popupSequence += 1;
    const windowName = `nylas-oauth-${Date.now()}-${popupSequence}`;
    const popup = window.open('', windowName, 'popup=yes,width=620,height=760,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');

    if (!popup) {
      finishConnecting();
      setConnectError('Seu navegador bloqueou a janela de autorização. Libere pop-ups para este site e tente de novo.');
      return;
    }

    oauthPopup.current = popup;
    // Escrever no popup é cortesia, não parte do fluxo: se o navegador recusar,
    // a autorização continua. Por isso vive no seu próprio try.
    try {
      popup.document.title = 'Conectando a agenda';
      popup.document.body.innerHTML =
        '<main style="min-height:100vh;display:grid;place-items:center;background:#f7f8fa">' +
        '<p style="font:15px system-ui;color:#526176;padding:32px;text-align:center">Preparando uma conexão segura...</p>' +
        '</main>';
    } catch {
      // Janela ainda em about:blank ou já cross-origin.
    }

    try {
      const nextAuthUrl = await calendarApi.connect({
        ...(provider ? { provider: provider.id } : {}),
        ...(loginHint ? { loginHint } : {}),
      });
      setAuthUrl(nextAuthUrl);
      if (popup.closed) throw new Error('A janela de autorização foi fechada antes de começar.');
      popup.location.replace(nextAuthUrl);
      popup.focus();

      const startedAt = Date.now();
      stopPolling();
      pollTimer.current = window.setInterval(async () => {
        // Tentativa superada por outra: este tick não fala mais por ninguém.
        if (attemptId.current !== thisAttempt) return;
        // O teto é avaliado antes da guarda de concorrência: se ficasse depois,
        // uma consulta pendurada tornaria o teto inalcançável.
        if (Date.now() - startedAt > CONNECT_TIMEOUT_MS) {
          stopPolling();
          setConnecting(false);
          setConnectStalled(true);
          return;
        }
        if (pollInFlight.current) return;
        pollInFlight.current = true;
        try {
          const next = await loadStatus();
          if (attemptId.current !== thisAttempt) return;
          if (next?.connected && next.status === 'active' && connectionSignature(next) !== before) {
            finishConnecting();
            setConnectError(null);
            toast.success('Agenda conectada.');
          }
        } finally {
          // Só o dono libera. Se a tentativa mudou, quem começou a nova já
          // zerou a flag e liberar aqui permitiria duas consultas ao mesmo tempo.
          if (attemptId.current === thisAttempt) pollInFlight.current = false;
        }
      }, STATUS_POLL_MS);
    } catch (error) {
      closePopup();
      finishConnecting();
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar a conexão.';
      setConnectError(message);
      toast.error(message);
    }
  };

  const handleProviderClick = (provider: CalendarProviderInfo | null, loginHint?: string | null) => {
    // O iCloud precisa de senha de app antes de qualquer janela — inclusive na
    // reconexão, que é justamente quando a senha antiga pode ter sido revogada.
    if (provider?.appPassword) {
      setConnectError(null);
      setPending({ provider, loginHint });
      return;
    }
    void startConnection(provider, loginHint);
  };

  const handleReopenPopup = () => {
    if (!authUrl) return;
    closePopup();
    popupSequence += 1;
    const popup = window.open(authUrl, `nylas-oauth-${Date.now()}-${popupSequence}`, 'popup=yes,width=620,height=760');
    if (popup) {
      oauthPopup.current = popup;
      popup.focus();
    } else {
      setConnectError('Seu navegador bloqueou a janela de autorização. Libere pop-ups para este site e tente de novo.');
    }
  };

  const handleCheckNow = async () => {
    const next = await loadStatus();
    // Mesma régua do polling: numa reconexão a conexão de partida já é
    // `connected` e `active`, e só presença daria sucesso instantâneo.
    if (next?.connected && next.status === 'active' && connectionSignature(next) !== beforeRef.current) {
      finishConnecting();
      setConnectError(null);
      toast.success('Agenda conectada.');
    } else {
      toast.info('Ainda não recebemos a autorização. Conclua na janela que abriu.');
    }
  };

  const handleCancelConnection = () => {
    closePopup();
    finishConnecting();
    // A janela pode ter concluído no instante do cancelamento. Uma última
    // leitura evita a tela ficar mentindo até o próximo carregamento.
    void loadStatus();
  };

  const handleSettingChange = async (changes: { syncEnabled?: boolean; createMeet?: boolean; timeZone?: string }) => {
    if (!status) return;
    const previous = status;
    setStatus({ ...status, ...changes });
    setUpdating(true);
    try {
      await calendarApi.updateSettings(changes);
      toast.success('Preferências da agenda atualizadas.');
    } catch (error) {
      setStatus(previous);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar a agenda');
    } finally {
      setUpdating(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await calendarApi.syncAll();
      if (result.errors.length) {
        toast.warning(`${result.synced} de ${result.total} agendamentos sincronizados. Revise os itens com erro.`);
      } else {
        toast.success(
          result.total === 0
            ? 'Nenhum agendamento futuro para sincronizar.'
            : `${result.synced} ${result.synced === 1 ? 'agendamento sincronizado' : 'agendamentos sincronizados'}.`,
        );
      }
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar os agendamentos');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setConnectError(null);
    try {
      await calendarApi.disconnect();
      toast.success('Agenda desconectada. Os eventos já criados continuam lá.');
      setDisconnectOpen(false);
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao desconectar a agenda');
    } finally {
      setDisconnecting(false);
    }
  };

  const lastSync = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const connected = Boolean(status?.connected);
  const needsAttention = connected && status?.status === 'error';
  const grantInfo = describeCalendarProvider(status?.grantProvider);
  const meetingRoom = grantInfo?.meetingRoom ?? null;
  const providers = listCalendarProviders(status?.providers);

  // Sessão expirada e falta de permissão são do usuário e têm ação própria;
  // só falha da instalação vira "nada aqui resolve".
  const sessionExpired = loadFailure?.status === 401;
  const forbidden = loadFailure?.status === 403;
  // Quem já conectou continua com o painel de gestão mesmo se a integração cair:
  // desligar a sincronização e desconectar precisam continuar ao alcance. Por
  // isso o card de indisponível é só para quem ainda não conectou.
  const unavailable = !connecting && !connected && !sessionExpired && !forbidden
    && (status?.configured === false || Boolean(loadFailure?.isStructural));
  // Sobra: erro de rede, 400, 429, corpo de erro com HTTP 200. Sem um ramo
  // próprio, a tela desenharia "Não conectada" saudável em cima de uma falha.
  const loadFailed = Boolean(loadFailure) && !sessionExpired && !forbidden && !unavailable && !connected;
  // A pendência decide a copy: credenciais o próprio admin resolve nesta tela;
  // provedor é no painel do Nylas; o resto é servidor.
  const missingConfig = status?.missingConfig ?? [];
  const missingCredentials = missingConfig.some((item) => item.includes('credenciais'));
  const missingConnector = missingConfig.some((item) => item.includes('provedor'));
  const showManagement = connected && !connecting;
  const canConnect = isAdmin && !permissionsLoading && !unavailable && !loadFailed
    && !sessionExpired && !forbidden && status?.configured !== false;

  const badge: { label: string; variant: 'muted' | 'success' | 'destructive' } = connecting
    ? { label: 'Aguardando', variant: 'muted' }
    : connectStalled
      ? { label: 'Sem confirmação', variant: 'muted' }
      : needsAttention
        ? { label: 'Reconectar', variant: 'destructive' }
        : connected
          ? { label: 'Conectada', variant: 'success' }
          : unavailable || loadFailed
            ? { label: 'Indisponível', variant: 'muted' }
            : { label: 'Não conectada', variant: 'muted' };

  if (loading) {
    return (
      <div className="eia-card p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-6 w-52" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sem credenciais nada nesta tela funciona, então o formulário vem
          primeiro enquanto ninguém conectou uma conta. */}
      {!connected && !sessionExpired && !forbidden && (
        <NylasCredentialsSettings status={status} isAdmin={isAdmin && !permissionsLoading} onSaved={async () => { await loadStatus(); }} />
      )}

      <div className="eia-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--eia-radius-sm)] border border-border bg-secondary text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="eia-eyebrow">Agenda</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Onde a Lara lança as reuniões</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Uma agenda para toda a operação, não a agenda pessoal de cada pessoa do time.
              </p>
            </div>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        {/* Vale para todos os ramos: quem não é admin precisa saber disso antes
            de encontrar um botão desabilitado. */}
        {!permissionsLoading && !isAdmin && (
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Só administradores gerenciam a agenda. Peça para quem administra a plataforma.
          </p>
        )}

        {sessionExpired && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <p className="text-sm font-medium text-foreground">Sua sessão expirou</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Entre de novo para ver e gerenciar a conexão de agenda.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()} className="mt-4 gap-2">
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </Button>
          </div>
        )}

        {forbidden && !sessionExpired && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <p className="text-sm font-medium text-foreground">Sua conta não tem acesso à conexão de agenda</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Peça a um administrador da plataforma para conectar ou ajustar a agenda.
            </p>
          </div>
        )}

        {/* A instalação ainda não tem a integração de pé. */}
        {unavailable && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">A conexão de agenda ainda não está no ar</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {missingCredentials
                    ? 'Falta cadastrar as credenciais do Nylas. Isso se resolve aqui mesmo, no cartão logo abaixo — o passo a passo está lá.'
                    : missingConnector
                      ? 'As credenciais estão certas, mas a sua conta do Nylas não tem nenhum provedor de agenda habilitado. Adicione ao menos um em Connectors, no painel do Nylas.'
                      : 'Falta terminar a configuração no servidor, e isso não se resolve por esta tela.'}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Enquanto isso, a Lara segue agendando normalmente — ela só não espelha nada em
                  agenda externa.
                </p>
                {status?.missingConfig?.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Pendente: {status.missingConfig.join(', ')}.
                  </p>
                ) : null}
                {(loadFailure?.detail || status?.lastError) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Detalhe técnico: {loadFailure?.detail || status?.lastError}
                  </p>
                )}
                {connectError && (
                  <p className="mt-1 text-xs text-muted-foreground">Última tentativa: {connectError}</p>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={loadStatus} className="mt-4 gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Verificar de novo
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Preparo do iCloud antes de abrir a janela. */}
        {pending?.provider.appPassword && !connecting && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <p className="mt-3 text-sm font-medium text-foreground">{pending.provider.appPassword.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {pending.provider.appPassword.explanation}
            </p>
            <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {pending.provider.appPassword.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="text-muted-foreground">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void startConnection(pending.provider, pending.loginHint)}
              >
                Já tenho a senha, conectar
              </Button>
              <a
                href={pending.provider.appPassword.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--eia-radius-sm)] border border-border px-4 text-xs text-foreground hover:bg-accent/70"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {pending.provider.appPassword.helpLabel}
              </a>
            </div>
          </div>
        )}

        {/* Janela aberta, esperando a autorização. */}
        {connecting && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Autorize na janela que abriu</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {connectingProvider
                    ? `Escolha a conta do ${connectingProvider.label} e libere o acesso à agenda.`
                    : 'Escolha a conta e libere o acesso à agenda.'}{' '}
                  Assim que terminar, esta tela atualiza sozinha.
                </p>
                {loadFailure && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    A verificação automática está falhando: {loadFailure.detail || loadFailure.message}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {authUrl && (
                    <Button type="button" variant="secondary" size="sm" onClick={handleReopenPopup}>
                      Reabrir janela
                    </Button>
                  )}
                  <Button type="button" variant="secondary" size="sm" onClick={handleCheckNow}>
                    Já autorizei, verificar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={handleCancelConnection}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Passou dos 10 minutos do `state`: paramos de verificar sozinhos, mas
            a tentativa continua válida e o resto da tela volta ao ar. */}
        {connectStalled && !connecting && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Ainda não recebemos a confirmação</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Paramos de verificar sozinhos. Se você concluiu a autorização, clique em verificar.
                  Se a janela já fechou ou expirou, comece de novo.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={handleCheckNow}>
                    Já autorizei, verificar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void startConnection(connectingProvider)}
                    disabled={!canConnect}
                  >
                    Começar de novo
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={finishConnecting}>
                    Descartar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Falha de carga que não é sessão, permissão nem instalação: rede caiu,
            429, resposta malformada. Precisa de um lugar, senão vira silêncio. */}
        {loadFailed && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Não conseguimos ler o estado da agenda</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Enquanto isso não carregar, não dá para saber se a agenda está conectada. Tente de novo.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Detalhe técnico: {loadFailure?.detail || loadFailure?.message}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={loadStatus} className="mt-4 gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Falha de conexão: vale para quem nunca conectou e para quem está
            reconectando o modo antigo. Antes só aparecia no primeiro caso. */}
        {connectError && !connecting && !unavailable && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-destructive/20 bg-destructive/10 p-5">
            <div className="flex items-start justify-between gap-4 text-sm text-destructive">
              <div className="flex min-w-0 items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Não deu para conectar a agenda</p>
                  <p className="mt-1 leading-relaxed">{connectError}</p>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConnectError(null)} className="shrink-0">
                Entendi
              </Button>
            </div>
          </div>
        )}

        {/* Pronta para conectar. */}
        {!unavailable && !loadFailed && !sessionExpired && !forbidden && !connected && !connecting && !connectStalled && !pending && (
          <div className="mt-6 rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-5">
            <p className="text-sm font-medium text-foreground">Escolha onde a Lara vai lançar as reuniões</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {providers.length > 0 ? (
                providers.map((provider) => (
                  <Button
                    key={provider.id}
                    type="button"
                    variant="secondary"
                    onClick={() => handleProviderClick(provider)}
                    disabled={!canConnect}
                    className="gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    {provider.label}
                  </Button>
                ))
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleProviderClick(null)}
                  disabled={!canConnect}
                  className="gap-2"
                >
                  <Link2 className="h-4 w-4" />
                  Conectar agenda
                </Button>
              )}
            </div>

            <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-foreground">O que a Lara faz na sua agenda</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>Cria o evento quando marca uma reunião</li>
                  <li>Atualiza quando o lead reagenda</li>
                  <li>Apaga quando o lead cancela</li>
                  <li>Gera a sala de reunião, quando o provedor tem uma</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">O que a Lara não faz</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                  <li>Não lê os compromissos que já estão na sua agenda. Reunião marcada fora do sistema não bloqueia horário aqui.</li>
                  <li>Não abre o conteúdo dos seus eventos antigos.</li>
                </ul>
              </div>
            </div>

            <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              A autorização acontece numa página do Nylas, o intermediário que usamos para falar com
              Google, Outlook e iCloud. As senhas e os tokens ficam lá; aqui guardamos só a referência
              da conexão.
            </p>
          </div>
        )}

        {/* Conectada. */}
        {showManagement && (
          <div className="mt-6 space-y-4">
            <div
              className={`flex flex-wrap items-center justify-between gap-4 rounded-[var(--eia-radius-md)] border p-4 ${
                needsAttention ? 'border-destructive/20 bg-destructive/10' : 'border-border bg-secondary/60'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    needsAttention ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
                  }`}
                >
                  {needsAttention ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {calendarProviderLabel(status?.grantProvider)}
                    {status?.accountEmail ? ` · ${status.accountEmail}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastSync ? `Última sincronização em ${lastSync}` : 'Ainda sem sincronização registrada'}
                  </p>
                </div>
              </div>
              {!needsAttention && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSync}
                  // Com a integração fora do ar, sincronizar só produz erro.
                  disabled={!isAdmin || syncing || !status?.syncEnabled || status?.configured === false}
                  className="gap-2"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sincronizar agora
                </Button>
              )}
            </div>

            {/* A integração caiu, mas quem já conectou continua podendo desligar
                a sincronização e desconectar. */}
            {status?.configured === false && (
              <div className="rounded-[var(--eia-radius-md)] border border-border bg-secondary/60 p-4 text-sm">
                <p className="font-medium text-foreground">A conexão de agenda não está no ar neste ambiente</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  A sincronização não vai acontecer até o servidor ser configurado.
                  {status.missingConfig?.length ? ` Pendente: ${status.missingConfig.join(', ')}.` : ''}
                </p>
              </div>
            )}

            {/* Grant revogado ou expirado: sincronizar de novo não resolve. */}
            {needsAttention && (
              <div className="rounded-[var(--eia-radius-md)] border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">
                <p className="font-medium">Perdemos o acesso à sua agenda</p>
                <p className="mt-1 leading-relaxed">
                  {isAdmin
                    ? 'A autorização foi revogada ou expirou. Reconecte para a Lara voltar a lançar as reuniões. Sincronizar de novo não resolve isso.'
                    : 'A autorização foi revogada ou expirou. Peça a um administrador para reconectar a agenda.'}
                </p>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleProviderClick(grantInfo, status?.accountEmail)}
                    disabled={!canConnect}
                    className="mt-4 gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    Reconectar
                  </Button>
                )}
              </div>
            )}

            <div className="divide-y divide-border rounded-[var(--eia-radius-md)] border border-border">
              <label className="flex items-center justify-between gap-5 p-4">
                <div>
                  <span className="text-sm font-medium text-foreground">Sincronização automática</span>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Criar, reagendar e cancelar também atualiza a sua agenda.
                  </p>
                </div>
                <Switch
                  checked={status?.syncEnabled}
                  onCheckedChange={(checked) => handleSettingChange({ syncEnabled: checked })}
                  disabled={!isAdmin || updating}
                  aria-label="Ativar sincronização automática"
                />
              </label>

              {meetingRoom ? (
                <label className="flex items-center justify-between gap-5 p-4">
                  <div className="flex items-start gap-3">
                    <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium text-foreground">Criar sala do {meetingRoom}</span>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Cada novo evento recebe um link de reunião.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={status?.createMeet}
                    onCheckedChange={(checked) => handleSettingChange({ createMeet: checked })}
                    disabled={!isAdmin || updating}
                    aria-label={`Criar sala do ${meetingRoom}`}
                  />
                </label>
              ) : (
                <p className="p-4 text-xs text-muted-foreground">
                  Seu provedor de agenda não cria sala de reunião automática.
                </p>
              )}

              <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div>
                  <label htmlFor="calendar-time-zone" className="text-sm font-medium text-foreground">
                    Fuso horário da agenda
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Usado para interpretar o horário informado pela Lara e pelo time.
                  </p>
                </div>
                <select
                  id="calendar-time-zone"
                  value={status?.timeZone}
                  onChange={(event) => handleSettingChange({ timeZone: event.target.value })}
                  disabled={!isAdmin || updating}
                  className="h-10 min-w-56 rounded-[var(--eia-radius-sm)] border border-input bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {TIME_ZONES.map((zone) => (
                    <option key={zone.value} value={zone.value}>{zone.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-foreground">Desconectar agenda</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A Lara para de lançar reuniões na sua agenda. Os eventos já criados continuam lá.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setDisconnectOpen(true)}
                  disabled={!isAdmin}
                  className="w-full shrink-0 gap-2 sm:w-auto"
                >
                  <Unplug className="h-4 w-4" />
                  Desconectar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Novos agendamentos deixam de ser lançados na sua agenda. Os eventos já criados continuam
              lá e não são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Manter conexão</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CalendarSettings;

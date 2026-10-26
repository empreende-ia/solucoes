import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Loader2,
  MessageSquare,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/Button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  actionForTraceDetail,
  actionHref,
  fetchDeliveryTrace,
  removeTestConversation,
  startTestLead,
  TEST_LEAD_DEFAULTS,
  type DeliveryTraceRow,
} from '@/services/goLive';

interface TestLeadPanelProps {
  /** Conversa de teste que já existe no workspace, vinda da verificação. */
  initialConversationId?: string | null;
  /** Avisa o checklist para revalidar depois de um teste ou remoção. */
  onChanged?: () => void;
}

const STAGES: Array<{ key: string; title: string; hint: string }> = [
  { key: 'recebida', title: 'Mensagem recebida', hint: 'O lead fictício entrou no sistema.' },
  { key: 'na fila', title: 'Na fila da Lara', hint: 'O orquestrador pegou a mensagem para responder.' },
  { key: 'respondida', title: 'Resposta redigida', hint: 'A agente escreveu a resposta.' },
  { key: 'enviada', title: 'Entregue ao canal', hint: 'A resposta saiu para o WhatsApp.' },
];

const POLL_INTERVAL_MS = 2000;
const POLL_WINDOW_MS = 30000;

function situationIcon(situation: string | undefined) {
  switch (situation) {
    case 'ok':
      return <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />;
    case 'erro':
      return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
    case 'processando':
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

function situationLabel(situation: string | undefined) {
  switch (situation) {
    case 'ok':
      return 'Concluída';
    case 'erro':
      return 'Com erro';
    case 'processando':
      return 'Em andamento';
    default:
      return 'Aguardando';
  }
}

function formatMoment(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(date);
}

export const TestLeadPanel: React.FC<TestLeadPanelProps> = ({ initialConversationId, onChanged }) => {
  const [phone, setPhone] = useState(TEST_LEAD_DEFAULTS.phone);
  const [name, setName] = useState(TEST_LEAD_DEFAULTS.name);
  const [message, setMessage] = useState(TEST_LEAD_DEFAULTS.message);
  const [showFields, setShowFields] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [trace, setTrace] = useState<DeliveryTraceRow[] | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [removing, setRemoving] = useState(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // A verificação pode voltar com a conversa que acabou de ser apagada (ela
  // estava em voo durante a remoção); sem esta trava o painel ressuscitaria um
  // id morto e mostraria "conversa não encontrada".
  const removedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialConversationId || conversationId) return;
    if (initialConversationId === removedIdRef.current) return;
    setConversationId(initialConversationId);
  }, [initialConversationId, conversationId]);

  const loadTraceOnce = useCallback(async (id: string) => {
    try {
      const rows = await fetchDeliveryTrace(id);
      setTrace(rows);
      setTraceError(null);
    } catch (error) {
      setTraceError(error instanceof Error ? error.message : 'Não foi possível ler o rastro.');
    }
  }, []);

  // Conversa de teste que já existia: mostra o rastro dela sem disparar nada.
  useEffect(() => {
    if (!conversationId || trace || polling) return;
    void loadTraceOnce(conversationId);
  }, [conversationId, trace, polling, loadTraceOnce]);

  useEffect(() => {
    if (!polling || !conversationId) return;

    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const rows = await fetchDeliveryTrace(conversationId);
        if (cancelled) return;
        setTrace(rows);
        setTraceError(null);

        const delivered = rows.some((row) => row.etapa === 'enviada' && row.situacao === 'ok');
        const failed = rows.some((row) => row.situacao === 'erro');
        if (delivered || failed) {
          setPolling(false);
          onChangedRef.current?.();
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setTraceError(error instanceof Error ? error.message : 'Não foi possível ler o rastro.');
        setPolling(false);
        return;
      }

      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_WINDOW_MS) {
        setPolling(false);
        setTimedOut(true);
        onChangedRef.current?.();
        return;
      }
      timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [polling, conversationId]);

  const handleStart = async () => {
    if (!message.trim()) {
      toast.error('Escreva a mensagem que o lead enviaria.');
      return;
    }
    if (!phone.trim()) {
      toast.error('Informe um número para o lead de teste.');
      return;
    }

    setStarting(true);
    removedIdRef.current = null;
    setTimedOut(false);
    setTraceError(null);
    setTrace(null);
    try {
      const result = await startTestLead({ phone, name, message });
      setConversationId(result.conversationId);
      setPolling(true);
      if (!result.queuedForLara) {
        toast('A conversa não entrou na fila da Lara. O rastro abaixo mostra onde parou.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem de teste.');
    } finally {
      setStarting(false);
    }
  };

  const handleRemove = async () => {
    if (!conversationId) return;
    setRemoving(true);
    try {
      const removed = await removeTestConversation(conversationId);
      if (!removed) {
        toast.error('A conversa de teste não foi encontrada.');
        return;
      }
      removedIdRef.current = conversationId;
      setConversationId(null);
      setTrace(null);
      setTimedOut(false);
      setTraceError(null);
      toast.success('Conversa de teste removida.');
      onChangedRef.current?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a conversa de teste.');
    } finally {
      setRemoving(false);
    }
  };

  const rowFor = (key: string) => trace?.find((row) => row.etapa === key);
  const blocked = trace?.find((row) => row.situacao === 'erro')
    ?? (timedOut ? trace?.find((row) => row.situacao !== 'ok') : undefined);
  const blockedAction = actionForTraceDetail(blocked?.detalhe);
  const blockedHref = actionHref(blockedAction);

  return (
    <div className="space-y-4">
      {!conversationId && !trace && (
        <p className="text-sm text-muted-foreground">
          Envie uma mensagem fictícia para ver a Lara respondendo antes de anunciar o número. Nada sai
          para o WhatsApp e o lead de teste pode ser apagado depois.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={handleStart} disabled={starting || polling}>
          {starting || polling ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          )}
          Testar a Lara
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFields((visible) => !visible)}
          disabled={starting || polling}
        >
          {showFields ? 'Ocultar dados' : 'Ajustar dados'}
        </Button>

        {conversationId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadTraceOnce(conversationId)}
              disabled={polling}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Atualizar rastro
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRemove} disabled={removing || polling}>
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Remover teste
            </Button>
          </>
        )}
      </div>

      {showFields && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="test-lead-phone">Número do lead</Label>
            <Input
              id="test-lead-phone"
              value={phone}
              inputMode="numeric"
              maxLength={20}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-lead-name">Nome do lead</Label>
            <Input
              id="test-lead-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-lead-message">Mensagem</Label>
            <Input
              id="test-lead-message"
              value={message}
              maxLength={400}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </div>
      )}

      {(trace || polling) && (
        <ol className="space-y-2">
          {STAGES.map((stage) => {
            const row = rowFor(stage.key);
            const situation = polling && !row ? 'processando' : row?.situacao;
            const moment = formatMoment(row?.em);
            return (
              <li
                key={stage.key}
                className="flex items-start gap-3 rounded-xl border border-border bg-secondary px-4 py-3"
              >
                <span className="mt-0.5 shrink-0">{situationIcon(situation)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{stage.title}</p>
                    <span className="eia-pill border border-border bg-card text-muted-foreground">
                      {situationLabel(situation)}
                    </span>
                    {moment && <span className="text-xs text-muted-foreground">{moment}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row?.detalhe || stage.hint}</p>
                  {typeof row?.tentativas === 'number' && row.tentativas > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.tentativas} {row.tentativas === 1 ? 'tentativa' : 'tentativas'}.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {traceError && (
        <div className="rounded-xl border border-border bg-secondary px-4 py-3">
          <p className="text-sm text-destructive">{traceError}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Só quem é membro ativo do workspace lê o rastro de uma conversa.
          </p>
        </div>
      )}

      {blocked && (
        <div className="rounded-xl border border-border bg-secondary px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            {timedOut && blocked.situacao !== 'erro'
              ? `O teste parou em "${blocked.etapa}" nos primeiros 30 segundos.`
              : `A etapa "${blocked.etapa}" falhou.`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{blocked.detalhe}</p>
          {blockedHref && (
            <Link to={blockedHref} className="mt-3 inline-block">
              <Button variant="secondary" size="sm">
                {blockedAction?.label ?? 'Resolver agora'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {polling && (
        <p className="text-xs text-muted-foreground">
          Acompanhando a entrega por até 30 segundos.
        </p>
      )}
    </div>
  );
};

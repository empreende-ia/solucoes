import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, MessageSquare, RefreshCw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AgentConfig } from '@/domain/agent-config';
import { cn } from '@/lib/utils';
import {
  knowledgeApi,
  type ConversationExcerptLine,
  type GapAnswerProof,
  type KnowledgeGap,
  type UnansweredQuestion,
} from '@/services/knowledge';

type GapStatus = UnansweredQuestion['status'];
type AnswerType = 'fact' | 'faq' | 'policy' | 'handoff';

const statusOptions: Array<{ id: GapStatus; label: string }> = [
  { id: 'open', label: 'Pendentes' },
  { id: 'resolved', label: 'Resolvidas' },
  { id: 'ignored', label: 'Descartadas' },
];

const kindLabels: Record<UnansweredQuestion['kind'], string> = {
  question: 'Pergunta sem resposta',
  conflict: 'Informações em conflito',
  unreadable_document: 'Material ilegível',
  expired_fact: 'Informação vencida',
};

const answerTypeOptions: Array<{ id: AnswerType; label: string }> = [
  { id: 'fact', label: 'Informação confirmada' },
  { id: 'faq', label: 'Pergunta frequente' },
  { id: 'policy', label: 'Política ou regra' },
  { id: 'handoff', label: 'Encaminhar para uma pessoa' },
];

const textareaClass = 'min-h-32 w-full resize-y rounded-xl border border-input bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function leadLabel(name: string | null, phone: string | null): string {
  return name?.trim() || phone?.trim() || 'Lead sem nome';
}

function ProofBlock({ proof, question }: { proof: GapAnswerProof; question: string }) {
  const reachable = proof.found || proof.always_include;
  const detail = proof.found
    ? `A resposta aprovada aparece em ${proof.position}º lugar entre ${proof.titles.length} fonte(s).`
    : proof.always_include
      ? 'A busca não trouxe a resposta, mas o fato está fixado no prompt: a agente recebe esse texto em toda conversa.'
      : 'A busca não trouxe a resposta aprovada. Do jeito que está, a agente vai continuar dizendo que não sabe.';
  return (
    <div className={cn('rounded-xl border p-4', reachable ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5')}>
      <div className="flex items-start gap-3">
        {reachable
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {reachable ? 'A agente encontra esta resposta.' : 'A agente ainda não encontra esta resposta.'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Busca executada com a pergunta do lead: {question}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          {proof.titles.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Fontes devolvidas: {proof.titles.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Fila de trabalho do loop de treinamento: cada pergunta que a Lara não soube
 * responder vira uma decisão com prova. Resolver não é só criar o fato — é
 * rodar a mesma busca da agente e mostrar que agora a resposta aparece.
 */
export default function KnowledgeGapsPanel({
  editable,
  onChange,
  onAddKnowledge,
  updateConfigAndSave,
}: {
  editable: boolean;
  onChange?: () => void;
  onAddKnowledge?: () => void;
  updateConfigAndSave: (updater: (current: AgentConfig) => AgentConfig) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GapStatus>('open');
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [counts, setCounts] = useState<Record<GapStatus, number>>({ open: 0, resolved: 0, ignored: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [answering, setAnswering] = useState<KnowledgeGap | null>(null);
  const [answerType, setAnswerType] = useState<AnswerType>('fact');
  const [answerText, setAnswerText] = useState('');
  const [answerSource, setAnswerSource] = useState('');
  const [excerpt, setExcerpt] = useState<ConversationExcerptLine[]>([]);
  const [proof, setProof] = useState<{ factId: string; value: GapAnswerProof } | null>(null);

  // Trocar de sub-aba dispara uma carga nova antes da anterior voltar. Sem o
  // bilhete, a resposta atrasada sobrescreve a lista da aba que está na tela.
  const loadToken = useRef(0);
  const excerptToken = useRef(0);

  const load = useCallback(async (next: GapStatus) => {
    const token = ++loadToken.current;
    setLoading(true);
    setError(null);
    try {
      const [rows, totals] = await Promise.all([knowledgeApi.fetchGaps(next), knowledgeApi.countGaps()]);
      if (token !== loadToken.current) return;
      setGaps(rows);
      setCounts(totals);
    } catch (cause) {
      if (token !== loadToken.current) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as pendências.');
    } finally {
      if (token === loadToken.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(status); }, [load, status]);

  const waitingLeads = useMemo(
    () => gaps.reduce((total, gap) => total + gap.occurrences, 0),
    [gaps],
  );

  // A contagem da situação aberta na tela vem da lista já agrupada; as outras
  // vêm do banco. Sem isso, a aba diria 12 e mostraria 5 cartões.
  const displayCounts = useMemo(
    () => (loading || error ? counts : { ...counts, [status]: gaps.length }),
    [counts, error, gaps.length, loading, status],
  );

  const openAnswer = async (gap: KnowledgeGap) => {
    setAnswering(gap);
    setAnswerType('fact');
    setAnswerText('');
    setAnswerSource('');
    setProof(null);
    setExcerpt([]);
    const token = ++excerptToken.current;
    const conversationId = gap.waiting.find((lead) => lead.conversationId)?.conversationId;
    if (!conversationId) return;
    try {
      const lines = await knowledgeApi.fetchConversationExcerpt(conversationId, 6);
      // Sem esta conferência, fechar e abrir outra pendência rápido colava o
      // trecho da conversa anterior no diálogo da pergunta nova.
      if (token === excerptToken.current) setExcerpt(lines);
    } catch {
      // O trecho da conversa é apoio: sem ele o operador ainda responde a pergunta.
    }
  };

  const closeAnswer = async () => {
    const shouldReload = proof !== null;
    setAnswering(null);
    setProof(null);
    setExcerpt([]);
    if (shouldReload) {
      await load(status);
      onChange?.();
    }
  };

  const saveAnswer = async () => {
    if (!answering) return;
    if (answerType !== 'handoff' && !answerText.trim()) return;
    setWorking(true);
    try {
      if (answerType === 'handoff') {
        await updateConfigAndSave((current) => ({
          ...current,
          actions: current.actions.map((action) => action.actionId !== 'human_handoff' ? action : ({
            ...action,
            enabled: true,
            handoff: {
              ...action.handoff!,
              reasons: Array.from(new Set([...(action.handoff?.reasons ?? []), answering.question])),
            },
          })),
        }));
        await knowledgeApi.resolveGap(answering.ids, { factId: null, proof: null });
        toast.success('Regra de encaminhamento adicionada ao rascunho.');
        setAnswering(null);
        await load(status);
        onChange?.();
        return;
      }

      const alwaysInclude = answerType !== 'faq';
      const created = await knowledgeApi.createFact({
        title: answering.question,
        // A pergunta do lead vai junto em qualquer tipo: o índice de busca cobre
        // question + fact, não o título. Sem ela, uma informação confirmada só
        // chegava à agente por estar fixada no prompt, nunca pela busca.
        question: answering.question,
        category: answerType === 'faq' ? 'faq' : answerType === 'policy' ? 'política' : 'geral',
        fact: answerText.trim(),
        source: answerSource.trim() || 'Confirmado ao resolver uma pendência',
        always_include: alwaysInclude,
      });
      const verified = await knowledgeApi.verifyAnswerReachable(answering.question, created.id, alwaysInclude);
      await knowledgeApi.resolveGap(answering.ids, { factId: created.id, proof: verified });
      setProof({ factId: created.id, value: verified });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar a resposta.');
    } finally {
      setWorking(false);
    }
  };

  const pinAnswer = async () => {
    if (!answering || !proof) return;
    setWorking(true);
    try {
      await knowledgeApi.updateFact(proof.factId, { always_include: true, is_active: true, status: 'confirmed' });
      const verified = await knowledgeApi.verifyAnswerReachable(answering.question, proof.factId, true);
      await knowledgeApi.recordGapProof(answering.ids, verified);
      setProof({ factId: proof.factId, value: verified });
      toast.success('A informação passou a acompanhar toda conversa.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível fixar a informação.');
    } finally {
      setWorking(false);
    }
  };

  const discard = async (gap: KnowledgeGap) => {
    if (!window.confirm(`Descartar “${gap.question}”? Ela sai da fila e não vira conhecimento.`)) return;
    try {
      await knowledgeApi.discardGap(gap.ids);
      await load(status);
      onChange?.();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível descartar a pendência.');
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <p className="eia-eyebrow">Loop de treinamento</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">O que a agente não soube responder</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada linha é uma pergunta que travou um atendimento. Responder aqui cria a informação aprovada e roda a
            mesma busca que a agente faz, para provar que ela passou a encontrar a resposta.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load(status)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {statusOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setStatus(option.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              status === option.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {option.label} ({displayCounts[option.id]})
          </button>
        ))}
      </div>

      {status === 'open' && gaps.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {gaps.length} pergunta(s) em aberto · {waitingLeads} vez(es) que um lead ficou sem resposta.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Carregando pendências…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-foreground">Não foi possível carregar as pendências.</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load(status)}>
              <RefreshCw className="h-4 w-4" />Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !error && gaps.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {status === 'open'
                ? 'Nenhuma pergunta em aberto.'
                : status === 'resolved'
                  ? 'Nenhuma pendência resolvida ainda.'
                  : 'Nenhuma pendência descartada.'}
            </p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              {status === 'open'
                ? 'Quando a agente não souber responder, ela registra a pergunta aqui com o link da conversa. Enquanto isso, cadastre o que a equipe repete todo dia.'
                : status === 'resolved'
                  ? 'Responda a primeira pergunta pendente: a informação entra na base e a busca prova que a agente aprendeu.'
                  : 'Perguntas descartadas saem da fila sem virar conhecimento.'}
            </p>
            {status === 'open' && editable && onAddKnowledge && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={onAddKnowledge}>
                Nova informação
              </Button>
            )}
            {status !== 'open' && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => setStatus('open')}>
                Ver pendentes
              </Button>
            )}
          </div>
        )}

        {!loading && !error && gaps.map((gap) => (
          <article key={gap.key} className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">{kindLabels[gap.kind]}</Badge>
              {gap.occurrences > 1 && <Badge variant="destructive">{gap.occurrences} leads perguntaram</Badge>}
              {gap.status === 'resolved' && gap.proof && (
                <Badge variant={gap.proof.found || gap.proof.always_include ? 'success' : 'destructive'}>
                  {gap.proof.found || gap.proof.always_include ? 'Busca confirmada' : 'Sem prova de busca'}
                </Badge>
              )}
              {gap.status === 'resolved' && !gap.proof && <Badge variant="muted">Resolvida sem teste de busca</Badge>}
            </div>

            <p className="mt-2 text-sm font-medium text-foreground">{gap.question}</p>

            {gap.variants.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Também chegou como: {gap.variants.slice(0, 3).join(' · ')}
              </p>
            )}
            {gap.context && <p className="mt-1 text-xs text-muted-foreground">Contexto: {gap.context}</p>}

            <p className="mt-2 text-xs text-muted-foreground">
              {gap.firstSeenAt === gap.lastSeenAt
                ? `Registrada em ${formatDate(gap.firstSeenAt)}`
                : `De ${formatDate(gap.firstSeenAt)} a ${formatDate(gap.lastSeenAt)}`}
              {gap.status === 'resolved' && gap.resolvedAt ? ` · resolvida em ${formatDate(gap.resolvedAt)}` : ''}
            </p>

            {gap.waiting.length > 0 && (
              <div className="mt-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {gap.status === 'open' ? 'Esperando resposta' : 'Perguntaram isso'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {gap.waiting.slice(0, 6).map((lead) => (
                    <button
                      key={`${gap.key}-${lead.conversationId ?? lead.contactId}`}
                      type="button"
                      disabled={!lead.conversationId}
                      onClick={() => lead.conversationId && navigate(`/chat?conversation=${lead.conversationId}`)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition hover:border-primary/30 disabled:cursor-default disabled:text-muted-foreground"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {leadLabel(lead.name, lead.phone)}
                    </button>
                  ))}
                  {gap.waiting.length > 6 && (
                    <span className="inline-flex items-center px-2 py-1 text-xs text-muted-foreground">
                      e mais {gap.waiting.length - 6}
                    </span>
                  )}
                </div>
              </div>
            )}

            {gap.status === 'resolved' && gap.proof && (
              <p className="mt-3 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                {gap.proof.found
                  ? `Teste de busca: a resposta aprovada aparece em ${gap.proof.position}º lugar.`
                  : gap.proof.always_include
                    ? 'Teste de busca: a resposta não aparece na busca, mas está fixada no prompt da agente.'
                    : 'Teste de busca: a resposta aprovada não foi encontrada. Abra a informação e fixe no prompt.'}
              </p>
            )}

            {editable && gap.status === 'open' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => void openAnswer(gap)}>
                  <CheckCircle2 className="h-4 w-4" />Responder com fato
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void discard(gap)}>Descartar</Button>
              </div>
            )}
          </article>
        ))}
      </div>

      <Dialog open={Boolean(answering)} onOpenChange={(open) => { if (!open) void closeAnswer(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{proof ? 'Prova de que a agente aprendeu' : 'Responder com fato'}</DialogTitle>
            <DialogDescription>{answering?.question}</DialogDescription>
          </DialogHeader>

          {proof ? (
            <div className="space-y-4">
              <ProofBlock proof={proof.value} question={answering?.question ?? ''} />
              {!proof.value.found && !proof.value.always_include && (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-sm text-foreground">
                    Fixar a informação no prompt garante que a agente receba esse texto em toda conversa, sem depender
                    da busca. Use para preço, prazo, política e qualquer coisa que ela não pode errar.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => void pinAnswer()} disabled={working}>
                    {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Fixar no prompt
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {excerpt.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground">Como a conversa chegou até a pergunta</p>
                  <div className="mt-2 space-y-1.5">
                    {excerpt.map((line) => (
                      <p key={line.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {line.from === 'user' ? 'Lead' : line.from === 'lara' ? 'Agente' : 'Equipe'}:
                        </span>{' '}
                        {line.content.slice(0, 220)}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="gap-answer-type">Como a agente deve tratar isso?</Label>
                <select
                  id="gap-answer-type"
                  value={answerType}
                  onChange={(event) => setAnswerType(event.target.value as AnswerType)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-input bg-secondary px-3 text-sm"
                >
                  {answerTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>

              {answerType === 'handoff' ? (
                <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  A situação entra nos motivos de encaminhamento humano do rascunho. A ação continua exigindo
                  confirmação explícita, e a pendência sai da fila sem virar informação da empresa.
                </p>
              ) : (
                <>
                  <div>
                    <Label htmlFor="gap-answer-text">Resposta aprovada</Label>
                    <textarea
                      id="gap-answer-text"
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      className={cn(textareaClass, 'mt-1.5')}
                      placeholder="Ex.: O plano principal custa R$ 497 por mês e inclui…"
                    />
                  </div>
                  <div>
                    <Label htmlFor="gap-answer-source">Fonte da confirmação</Label>
                    <Input
                      id="gap-answer-source"
                      value={answerSource}
                      onChange={(event) => setAnswerSource(event.target.value)}
                      className="mt-1.5"
                      placeholder="Ex.: tabela comercial de agosto de 2026"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ao salvar, a mesma busca da agente roda com a pergunta do lead e mostra se a resposta aparece.
                  </p>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {proof ? (
              <Button variant="primary" onClick={() => void closeAnswer()}>Concluir</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => void closeAnswer()}>Cancelar</Button>
                <Button
                  variant="primary"
                  onClick={() => void saveAnswer()}
                  disabled={working || (answerType !== 'handoff' && !answerText.trim())}
                >
                  {working && <Loader2 className="h-4 w-4 animate-spin" />}
                  {answerType === 'handoff' ? 'Adicionar regra' : 'Salvar e testar'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

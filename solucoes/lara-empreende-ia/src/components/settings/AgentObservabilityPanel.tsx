import { useEffect, useState } from 'react';
import { Activity, AlertCircle, Clock3, Loader2, RefreshCw, Wrench } from 'lucide-react';

import { Button } from '@/components/Button';
import { Badge } from '@/components/ui/badge';
import {
  getAgentOperationalMetrics,
  getAgentProductMetrics,
  listAgentRuntimeEvents,
  type AgentOperationalMetrics,
  type AgentProductMetrics,
  type AgentRuntimeEvent,
} from '@/services/observability';

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

export default function AgentObservabilityPanel({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<AgentRuntimeEvent[]>([]);
  const [metrics, setMetrics] = useState<AgentOperationalMetrics | null>(null);
  const [productMetrics, setProductMetrics] = useState<AgentProductMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [nextEvents, nextMetrics, nextProductMetrics] = await Promise.all([
        listAgentRuntimeEvents(agentId), getAgentOperationalMetrics(agentId), getAgentProductMetrics(agentId),
      ]);
      setEvents(nextEvents); setMetrics(nextMetrics); setProductMetrics(nextProductMetrics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a atividade.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [agentId]);

  return (
    <div className="eia-card p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><p className="eia-eyebrow">Atividade avançada</p><h2 className="mt-1 text-xl font-semibold text-foreground">O que aconteceu no atendimento real</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Métricas dos últimos 30 dias e trilha sem conteúdo completo ou dados pessoais.</p></div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Atualizar</Button>
      </div>
      {metrics && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Respostas" value={metrics.responses} /><Metric label="Transferências" value={metrics.handoffs} /><Metric label="Erros / falhas de ação" value={`${metrics.errors} / ${metrics.toolFailures}`} /><Metric label="Latência p50 / p95" value={metrics.latencyP50 === null ? '—' : `${metrics.latencyP50} / ${metrics.latencyP95} ms`} /><Metric label="Última avaliação" value={metrics.latestEvaluationGate || 'Ainda não rodada'} /><Metric label="Sugestões pendentes" value={metrics.pendingSuggestions} /></div>}
      {productMetrics && <div className="mt-5 rounded-2xl border border-border bg-muted/10 p-4"><p className="text-sm font-semibold text-foreground">Adoção e melhoria da configuração</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Configurações com IA iniciadas / aplicadas" value={`${productMetrics.setupStarts} / ${productMetrics.setupCompletions}`} /><Metric label="Abandonos registrados" value={productMetrics.setupAbandonments} /><Metric label="Campos preenchidos com IA" value={productMetrics.aiGeneratedFields} /><Metric label="Sugestões confirmadas / rejeitadas" value={`${productMetrics.suggestionConfirmations} / ${productMetrics.suggestionRejections}`} /><Metric label="Publicações bloqueadas" value={productMetrics.blockedPublications} /><Metric label="Restaurações" value={productMetrics.restorations} /><Metric label="Tempo até a primeira publicação" value={productMetrics.timeToFirstPublicationMinutes === null ? 'Ainda não publicada' : `${productMetrics.timeToFirstPublicationMinutes} min`} /></div></div>}
      {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando atividade…</div>
        : error ? <div className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>
        : events.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center"><Activity className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium text-foreground">Nenhum atendimento registrado nesta versão</p></div>
        : <div className="mt-5 space-y-2">{events.map((event) => <article key={event.id} className="rounded-xl border border-border bg-muted/20 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge variant={event.event_kind === 'error' ? 'destructive' : event.event_kind === 'handoff' ? 'muted' : 'success'}>{event.event_kind === 'response' ? 'Resposta' : event.event_kind === 'handoff' ? 'Transferência' : 'Erro'}</Badge><span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.created_at))}</span></div><p className="mt-2 text-sm font-medium text-foreground">{event.route || 'Conversa'} · {event.model_provider || 'provedor'} / {event.model_name || 'modelo'}</p><p className="mt-1 text-xs text-muted-foreground">Compilador {event.compiler_version} · {event.sources.length} fonte(s) · {event.tools.length} ação(ões)</p></div><div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{event.latency_ms !== null && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"><Clock3 className="h-3 w-3" />{event.latency_ms} ms</span>}{event.tools.map((tool, index) => <span key={`${tool.tool}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1"><Wrench className="h-3 w-3" />{tool.tool}: {tool.ok ? 'sucesso' : 'falhou'}</span>)}</div></div>{event.guards.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Proteções acionadas: {event.guards.join(', ')}</p>}</article>)}</div>}
    </div>
  );
}

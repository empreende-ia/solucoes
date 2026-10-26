import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export interface AgentRuntimeEvent {
  id: string;
  workspace_id: string;
  agent_id: string;
  agent_version_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  event_kind: 'response' | 'handoff' | 'error';
  compiler_version: string;
  model_provider: string | null;
  model_name: string | null;
  route: string | null;
  sources: Array<{ query?: string; source_type?: string; title?: string; rank?: number }>;
  tools: Array<{ tool: string; ok: boolean; summary?: string | null }>;
  guards: string[];
  latency_ms: number | null;
  estimated_cost: number | null;
  handoff: boolean;
  error_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AgentOperationalMetrics {
  responses: number;
  handoffs: number;
  errors: number;
  toolFailures: number;
  latencyP50: number | null;
  latencyP95: number | null;
  latestEvaluationGate: string | null;
  pendingSuggestions: number;
}

export interface AgentProductMetrics {
  setupStarts: number;
  setupCompletions: number;
  setupAbandonments: number;
  aiGeneratedFields: number;
  suggestionConfirmations: number;
  suggestionRejections: number;
  blockedPublications: number;
  restorations: number;
  timeToFirstPublicationMinutes: number | null;
}

export async function recordAgentProductEvent(
  agentId: string,
  event: 'setup_started' | 'setup_step_viewed' | 'setup_proposal_generated' | 'setup_applied' | 'setup_abandoned',
  step: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.rpc('record_agent_product_event', {
    _agent_id: agentId,
    _event: event,
    _step: step,
    _metadata: metadata,
  });
  if (error) throw error;
}

export async function listAgentRuntimeEvents(agentId: string, limit = 20): Promise<AgentRuntimeEvent[]> {
  const { data, error } = await db
    .from('agent_runtime_events')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getAgentOperationalMetrics(agentId: string, days = 30): Promise<AgentOperationalMetrics> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [eventsResult, evaluationResult, suggestionsResult] = await Promise.all([
    db.from('agent_runtime_events').select('event_kind, handoff, tools, latency_ms')
      .eq('agent_id', agentId).gte('created_at', since).limit(1000),
    db.from('eval_runs').select('gate_status').eq('agent_id', agentId).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('agent_suggestions').select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId).eq('status', 'pending'),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  const events = eventsResult.data ?? [];
  const latencies = events.map((event: any) => event.latency_ms)
    .filter((value: unknown): value is number => typeof value === 'number')
    .sort((a: number, b: number) => a - b);
  const percentile = (fraction: number) => latencies.length
    ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * fraction) - 1)]
    : null;
  return {
    responses: events.filter((event: any) => event.event_kind === 'response').length,
    handoffs: events.filter((event: any) => event.handoff || event.event_kind === 'handoff').length,
    errors: events.filter((event: any) => event.event_kind === 'error').length,
    toolFailures: events.reduce((total: number, event: any) => total + (Array.isArray(event.tools) ? event.tools.filter((tool: any) => tool.ok === false).length : 0), 0),
    latencyP50: percentile(0.5),
    latencyP95: percentile(0.95),
    latestEvaluationGate: evaluationResult.data?.gate_status ?? null,
    pendingSuggestions: suggestionsResult.count ?? 0,
  };
}

export async function getAgentProductMetrics(agentId: string): Promise<AgentProductMetrics> {
  const [auditResult, agentResult, versionsResult, evalResult] = await Promise.all([
    db.from('agent_audit_log').select('action, metadata, created_at')
      .eq('agent_id', agentId).order('created_at', { ascending: true }).limit(5_000),
    db.from('agents').select('created_at').eq('id', agentId).single(),
    db.from('agent_versions').select('published_at').eq('agent_id', agentId)
      .order('published_at', { ascending: true }).limit(1),
    db.from('eval_runs').select('gate_status').eq('agent_id', agentId).eq('status', 'completed').limit(5_000),
  ]);
  if (auditResult.error) throw auditResult.error;
  if (agentResult.error) throw agentResult.error;
  if (versionsResult.error) throw versionsResult.error;
  if (evalResult.error) throw evalResult.error;

  const audit = auditResult.data ?? [];
  const count = (action: string) => audit.filter((event: any) => event.action === action).length;
  const reviewed = audit.filter((event: any) => event.action === 'agent.suggestion_reviewed');
  const aiGeneratedFields = audit
    .filter((event: any) => event.action === 'agent.product.setup_applied')
    .reduce((total: number, event: any) => total + Number(event.metadata?.aiGeneratedFields || 0), 0);
  const firstPublished = versionsResult.data?.[0]?.published_at;
  const createdAt = agentResult.data?.created_at;

  return {
    setupStarts: count('agent.product.setup_started'),
    setupCompletions: count('agent.product.setup_applied'),
    setupAbandonments: count('agent.product.setup_abandoned'),
    aiGeneratedFields,
    suggestionConfirmations: reviewed.filter((event: any) => ['accepted', 'applied'].includes(event.metadata?.status)).length,
    suggestionRejections: reviewed.filter((event: any) => event.metadata?.status === 'rejected').length,
    blockedPublications: (evalResult.data ?? []).filter((run: any) => !['passed', 'warnings'].includes(run.gate_status)).length,
    restorations: count('agent.version_restored_to_draft'),
    timeToFirstPublicationMinutes: firstPublished && createdAt
      ? Math.max(0, Math.round((new Date(firstPublished).getTime() - new Date(createdAt).getTime()) / 60_000))
      : null,
  };
}

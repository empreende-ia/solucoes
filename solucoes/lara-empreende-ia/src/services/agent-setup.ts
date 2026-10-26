import { z } from 'zod';

import { parseAgentConfig, type AgentConfig } from '@/domain/agent-config';
import { supabase } from '@/integrations/supabase/client';
import type { ExtractedMaterial } from '@/lib/material-extraction';

export interface AgentSetupAnswers {
  companyName: string;
  website: string;
  companyDescription: string;
  whatCompanySells: string;
  primaryAudience: string;
  salesGoal: string;
  salesProcess: string;
  tone: string;
  differentiators: string;
  restrictions: string;
  knownFacts: string;
  unknownNotes: string;
  segmentTemplate: string;
}

export interface AgentSetupSourceInput {
  id: string;
  title: string;
  kind: string;
  content: string;
  sourceLabel: string;
  sizeBytes: number;
  warnings: string[];
  unreadableParts: string[];
}

/** Marcação da pessoa sobre um campo do formulário, sem sobrescrever o texto. */
export type AgentSetupAnswerNote = 'unknown' | 'later' | 'suggest' | 'handoff';

export type AgentSetupUrlSource = z.infer<typeof sourceSummarySchema>;

const sourceSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  sourceLabel: z.string(),
  content: z.string().default(''),
  charactersRead: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
  unreadableParts: z.array(z.string()).default([]),
});

const setupProposalSchema = z.object({
  identity: z.object({
    agentName: z.string().default('Lara'),
    role: z.string().default('Assistente de vendas'),
    companyName: z.string().default(''),
    companyDescription: z.string().default(''),
    whatCompanySells: z.string().default(''),
    primaryAudience: z.string().default(''),
    introduction: z.string().default(''),
    website: z.string().default(''),
    segment: z.string().default(''),
    serviceMode: z.enum(['remote', 'in_person', 'hybrid', 'not_applicable']).default('remote'),
    serviceRegions: z.array(z.string()).default([]),
    differentiators: z.array(z.string()).default([]),
    excludedProfiles: z.array(z.string()).default([]),
    primaryGoals: z.array(z.enum([
      'qualify', 'qualify_and_schedule', 'answer_and_recommend', 'sell_directly',
      'support_and_handoff', 'collect_information',
    ])).default(['qualify_and_schedule']),
    offerings: z.array(z.object({
      name: z.string(),
      summary: z.string().default(''),
      audience: z.string().default(''),
      problemSolved: z.string().default(''),
      relatedLink: z.string().default(''),
      active: z.boolean().default(true),
    })).default([]),
  }),
  salesProcess: z.object({
    model: z.enum(['consultative', 'qualification_and_scheduling', 'direct_sale', 'triage_and_handoff', 'custom']).default('consultative'),
    desiredOutcomes: z.array(z.enum([
      'schedule_meeting', 'handoff_to_consultant', 'recommend_solution', 'send_purchase_link',
      'collect_information', 'resolve_question', 'identify_no_fit',
    ])).default(['schedule_meeting']),
    stages: z.array(z.object({ name: z.string(), objective: z.string().default(''), active: z.boolean().default(true) })).default([]),
    qualificationFields: z.array(z.object({
      name: z.string(),
      description: z.string().default(''),
      dataType: z.enum(['text', 'number', 'boolean', 'date', 'single_choice', 'multiple_choice']).default('text'),
      priority: z.enum(['required', 'important', 'contextual']).default('important'),
      captureRule: z.string().default(''),
      crmSource: z.string().default(''),
      options: z.array(z.string()).default([]),
    })).default([]),
    positiveCriteria: z.array(z.string()).default([]),
    negativeCriteria: z.array(z.string()).default([]),
    communication: z.object({
      formality: z.enum(['informal', 'balanced', 'formal']).default('balanced'),
      emojiUsage: z.enum(['none', 'light', 'moderate']).default('light'),
      idealMessageLength: z.number().int().min(80).max(2_000).default(320),
      maximumMessageLength: z.number().int().min(120).max(4_000).default(800),
      oneQuestionAtATime: z.boolean().default(true),
      answerDirectQuestionsFirst: z.boolean().default(true),
      useLeadName: z.boolean().default(true),
    }).default({}),
  }),
  customInstructions: z.string().default(''),
  suggestedFacts: z.array(z.object({
    id: z.string().optional(),
    title: z.string(),
    category: z.string().default('geral'),
    fact: z.string(),
    source: z.string().default(''),
    evidence: z.string().default(''),
    critical: z.boolean().default(false),
  })).default([]),
  missingInformation: z.array(z.object({
    field: z.string(),
    question: z.string(),
    reason: z.string().default(''),
  })).default([]),
  assumptions: z.array(z.string()).default([]),
  sources: z.array(sourceSummarySchema).default([]),
});

export type AgentSetupProposal = z.infer<typeof setupProposalSchema>;
export type AgentSetupFact = AgentSetupProposal['suggestedFacts'][number] & { id: string };

async function unwrapFunctionError(error: unknown): Promise<never> {
  const functionError = error as { message?: string; context?: { json?: () => Promise<unknown> } };
  let message = functionError.message || 'Não foi possível falar com o assistente.';
  try {
    const details = typeof functionError.context?.json === 'function'
      ? await functionError.context.json() as { error?: string }
      : null;
    if (details?.error) message = details.error;
  } catch {
    // Mantém a mensagem da SDK.
  }
  throw new Error(message);
}

/**
 * Lê as páginas informadas sem chamar a IA: rápido, cancelável e sem consumir a
 * cota de geração. O resultado alimenta a geração e o status por URL na interface.
 */
export async function readAgentSetupSources(input: {
  agentId: string;
  siteUrls: string[];
  signal?: AbortSignal;
}): Promise<AgentSetupUrlSource[]> {
  const { data, error } = await supabase.functions.invoke('agent-setup-assistant', {
    body: { action: 'read_sources', agent_id: input.agentId, site_urls: input.siteUrls },
    signal: input.signal,
  });
  if (error) await unwrapFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return z.array(sourceSummarySchema).parse(data?.sources ?? []);
}

export interface AgentSetupGenerateInput {
  agentId: string;
  answers: AgentSetupAnswers;
  answerNotes?: Record<string, AgentSetupAnswerNote>;
  siteUrls: string[];
  urlSources?: AgentSetupUrlSource[];
  materials: ExtractedMaterial[];
  signal?: AbortSignal;
}

export interface AgentSetupGenerateResult {
  proposal: AgentSetupProposal;
  durationMs: number | null;
}

function generateRequestBody(input: AgentSetupGenerateInput): Record<string, unknown> {
  return {
    agent_id: input.agentId,
    answers: input.answers,
    answer_notes: input.answerNotes ?? {},
    site_urls: input.siteUrls,
    url_sources: input.urlSources,
    materials: input.materials.map((material) => ({
      id: material.id,
      title: material.title,
      kind: material.kind,
      content: material.content,
      sourceLabel: material.sourceLabel,
      sizeBytes: material.sizeBytes,
      warnings: material.warnings,
      unreadableParts: material.unreadableParts,
    } satisfies AgentSetupSourceInput)),
  };
}

function finalizeProposal(data: { proposal?: unknown; duration_ms?: unknown }): AgentSetupGenerateResult {
  const parsed = setupProposalSchema.parse(data?.proposal);
  return {
    proposal: {
      ...parsed,
      suggestedFacts: parsed.suggestedFacts.map((fact) => ({ ...fact, id: fact.id || crypto.randomUUID() })),
    },
    durationMs: typeof data?.duration_ms === 'number' ? data.duration_ms : null,
  };
}


/**
 * Geração com streaming: o texto da proposta chega em deltas (pré-visualização
 * progressiva via onDelta) e o evento final traz a proposta parseada pelo
 * servidor. Se o backend responder JSON comum (deploy antigo ou gateway sem
 * stream), degrada para o mesmo resultado sem erro.
 */
export async function generateAgentSetupProposalStream(
  input: AgentSetupGenerateInput & { onDelta?: (fullText: string) => void },
): Promise<AgentSetupGenerateResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sessão expirada. Entre novamente para gerar a proposta.');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-setup-assistant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...generateRequestBody(input), stream: true }),
    signal: input.signal,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error || 'Não foi possível gerar a proposta.');
  }
  if (!contentType.includes('text/event-stream')) {
    const data = await response.json();
    if (data?.error) throw new Error(data.error);
    return finalizeProposal(data);
  }
  if (!response.body) throw new Error('A conexão de streaming não pôde ser aberta. Tente novamente.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let final: { proposal?: unknown; duration_ms?: unknown } | null = null;
  let streamError: string | null = null;

  const handleEvent = (raw: string) => {
    const eventName = raw.match(/^event: (.+)$/m)?.[1] ?? 'message';
    const dataLine = raw.match(/^data: (.+)$/m)?.[1];
    if (!dataLine) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLine) as Record<string, unknown>;
    } catch {
      return;
    }
    if (eventName === 'delta' && typeof payload.text === 'string') {
      fullText += payload.text;
      input.onDelta?.(fullText);
    } else if (eventName === 'complete') {
      final = payload;
    } else if (eventName === 'error' && typeof payload.error === 'string') {
      streamError = payload.error;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separatorIndex;
    while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
      handleEvent(buffer.slice(0, separatorIndex));
      buffer = buffer.slice(separatorIndex + 2);
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  if (streamError) throw new Error(streamError);
  if (!final) throw new Error('A conexão caiu antes de a proposta terminar. Tente novamente.');
  return finalizeProposal(final);
}

/**
 * O schema da proposta tem .default() em tudo, então depois do parse ela SEMPRE
 * possui todas as chaves — e um spread cego faria o vazio do modelo apagar o
 * que o usuário já preencheu no rascunho, sem isso aparecer na revisão. A
 * mescla preserva o valor atual quando o proposto está vazio.
 */
/**
 * Defaults do schema da proposta para communication. Valor proposto IGUAL ao
 * default é indistinguível de "o modelo não falou sobre isso" — nesses casos a
 * preferência atual do usuário prevalece. O custo é ignorar o modelo quando
 * ele escolhe ativamente o default; o benefício é nunca resetar em silêncio
 * uma preferência ajustada (ex.: tamanho máximo 500 voltando para 800).
 */
const COMMUNICATION_SCHEMA_DEFAULTS: Record<string, unknown> = {
  formality: 'balanced',
  emojiUsage: 'light',
  idealMessageLength: 320,
  maximumMessageLength: 800,
  oneQuestionAtATime: true,
  answerDirectQuestionsFirst: true,
  useLeadName: true,
};

function mergeProposedCommunication<T extends Record<string, unknown>>(current: T, proposed: T): T {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(proposed)) {
    if (value === undefined || value === null) continue;
    if (COMMUNICATION_SCHEMA_DEFAULTS[key] === value) continue;
    merged[key] = value;
  }
  return merged as T;
}

/**
 * Escalares cujo default do schema NÃO é vazio: 'Lara', 'remote',
 * 'consultative'... Valor proposto igual ao default é indistinguível de "o
 * modelo não falou disso" — a preferência atual prevalece, pelo mesmo motivo
 * do merge de communication.
 */
const NON_EMPTY_SCHEMA_DEFAULTS: Record<string, unknown> = {
  agentName: 'Lara',
  role: 'Assistente de vendas',
  serviceMode: 'remote',
  model: 'consultative',
};

function keepFilled<T extends Record<string, unknown>>(current: T, proposed: Partial<T>): T {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(proposed)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (key in NON_EMPTY_SCHEMA_DEFAULTS && NON_EMPTY_SCHEMA_DEFAULTS[key] === value) continue;
    merged[key] = value;
  }
  return merged as T;
}

export function applyAgentSetupProposal(
  current: AgentConfig,
  proposal: AgentSetupProposal,
  accepted: { identity: boolean; sales: boolean; behavior: boolean },
): AgentConfig {
  const next = structuredClone(current);
  if (accepted.identity) {
    next.identity = {
      ...keepFilled(current.identity as unknown as Record<string, unknown>, proposal.identity as unknown as Record<string, unknown>) as typeof current.identity,
      offerings: proposal.identity.offerings.length > 0
        ? proposal.identity.offerings.map((offering) => ({ id: crypto.randomUUID(), ...offering }))
        : current.identity.offerings,
      socialProof: current.identity.socialProof,
    };
  }
  if (accepted.sales) {
    next.salesProcess = {
      ...keepFilled(current.salesProcess as unknown as Record<string, unknown>, proposal.salesProcess as unknown as Record<string, unknown>) as typeof current.salesProcess,
      // Depois do parse a proposta SEMPRE traz communication completo (defaults
      // do schema), então spread cego apagava preferências já ajustadas com
      // valores que o modelo nem propôs. Só entra o que difere do default do
      // schema — sinal de escolha ativa do modelo.
      communication: mergeProposedCommunication(
        current.salesProcess.communication,
        proposal.salesProcess.communication,
      ),
      stages: proposal.salesProcess.stages.length > 0
        ? proposal.salesProcess.stages.map((stage, order) => ({ id: crypto.randomUUID(), order, ...stage }))
        : current.salesProcess.stages,
      qualificationFields: proposal.salesProcess.qualificationFields.length > 0
        ? proposal.salesProcess.qualificationFields.map((field) => ({ id: crypto.randomUUID(), ...field }))
        : current.salesProcess.qualificationFields,
    };
  }
  // Comportamento vazio na proposta não apaga instruções já escritas.
  if (accepted.behavior && proposal.customInstructions.trim()) {
    next.customInstructions = proposal.customInstructions;
  }
  return parseAgentConfig(next);
}

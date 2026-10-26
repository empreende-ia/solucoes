import { supabase } from '@/integrations/supabase/client';
import { currentWorkspaceId } from './workspace';
import { chunkContent } from '@/domain/knowledge';

export { chunkContent, parseFaqPairs } from '@/domain/knowledge';

// Tabelas novas ainda não estão nos types gerados do Supabase — cast local.
const db = supabase as any;

/**
 * Busca todas as páginas de uma consulta. O dedupe compara no cliente (o .in()
 * do PostgREST não escapa aspas), e o PostgREST corta a resposta em ~1000
 * linhas — sem paginar, uma base grande deixaria o dedupe cego para o que
 * ficou fora da primeira página e recriaria itens existentes.
 */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
}

export interface KnowledgeFact {
  id: string;
  workspace_id: string;
  title: string;
  category: string;
  question: string | null;
  fact: string;
  source: string | null;
  is_active: boolean;
  always_include: boolean;
  status: 'draft' | 'confirmed' | 'needs_review' | 'expired' | 'archived';
  confirmed_by: string | null;
  confirmed_at: string | null;
  valid_from: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  doc_type: 'texto' | 'faq' | 'url';
  is_active: boolean;
  status: 'processing' | 'approved' | 'needs_review' | 'error' | 'archived';
  source_url: string | null;
  fingerprint: string | null;
  ingestion_report: Record<string, unknown>;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface UnansweredQuestion {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  question: string;
  context: string | null;
  status: 'open' | 'resolved' | 'ignored';
  kind: 'question' | 'conflict' | 'unreadable_document' | 'expired_fact';
  metadata: Record<string, unknown>;
  resolved_fact_id: string | null;
  created_at: string;
  // Colunas de 20260904140000_knowledge_gap_resolution.sql. Opcionais porque a
  // interface precisa continuar de pé enquanto a migration não está publicada.
  normalized_question?: string | null;
  occurrence_count?: number | null;
  last_seen_at?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_proof?: Record<string, unknown> | null;
}

/** Prova de que a agente encontra a resposta recém-aprovada. */
export interface GapAnswerProof {
  found: boolean;
  /** Posição da resposta no resultado da busca (1 = primeira fonte). */
  position: number | null;
  /** Títulos das fontes que a busca devolveu, na ordem. */
  titles: string[];
  query: string;
  checked_at: string;
  /** Verdadeiro quando o fato entra no prompt sem depender da busca. */
  always_include: boolean;
}

/** Lead que fez a pergunta e ficou esperando a resposta. */
export interface GapWaitingLead {
  conversationId: string | null;
  contactId: string | null;
  askedAt: string;
  name: string | null;
  phone: string | null;
}

/** Pendências equivalentes reunidas numa unidade de trabalho. */
export interface KnowledgeGap {
  key: string;
  ids: string[];
  kind: UnansweredQuestion['kind'];
  status: UnansweredQuestion['status'];
  question: string;
  /** Outras formas em que a mesma pergunta chegou. */
  variants: string[];
  context: string | null;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  waiting: GapWaitingLead[];
  resolvedFactId: string | null;
  resolvedAt: string | null;
  proof: GapAnswerProof | null;
}

export interface ConversationExcerptLine {
  id: string;
  from: 'user' | 'lara' | 'human';
  content: string;
  at: string;
}

/**
 * Mesma normalização de public.normalize_unanswered_text: minúsculas, sem
 * acento, sem pontuação, espaço único. O banco agrupa o que chega de agora em
 * diante; isto agrupa também as linhas gravadas antes da migration.
 */
export function normalizeQuestionKey(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function parseProof(value: unknown): GapAnswerProof | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.found !== 'boolean') return null;
  return {
    found: record.found,
    position: typeof record.position === 'number' ? record.position : null,
    titles: Array.isArray(record.titles) ? record.titles.map(String) : [],
    query: typeof record.query === 'string' ? record.query : '',
    checked_at: typeof record.checked_at === 'string' ? record.checked_at : '',
    always_include: record.always_include === true,
  };
}

function readOccurrences(metadata: Record<string, unknown> | null | undefined): Array<{
  conversationId: string | null;
  contactId: string | null;
  askedAt: string | null;
}> {
  const raw = metadata?.occurrences;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      conversationId: typeof record.conversation_id === 'string' ? record.conversation_id : null,
      contactId: typeof record.contact_id === 'string' ? record.contact_id : null,
      askedAt: typeof record.at === 'string' ? record.at : null,
    };
  });
}

/**
 * Escreve nas pendências tolerando um deploy de front adiantado: as colunas de
 * 20260904140000 são enviadas primeiro e, se o banco ainda não as tiver, a
 * escrita essencial (situação e fato) vai sozinha em vez de falhar inteira.
 */
async function updateGapRows(
  ids: string[],
  required: Record<string, unknown>,
  optional: Record<string, unknown>,
): Promise<void> {
  const hasOptional = Object.keys(optional).length > 0;
  const { error } = await db.from('unanswered_questions').update({ ...required, ...optional }).in('id', ids);
  if (!error) return;
  const missingColumn = error.code === '42703' || error.code === 'PGRST204';
  if (!hasOptional || !missingColumn) throw error;
  if (Object.keys(required).length === 0) return;
  const retry = await db.from('unanswered_questions').update(required).in('id', ids);
  if (retry.error) throw retry.error;
}

/** Nome e telefone de quem está esperando. Falhar aqui não derruba a fila. */
async function attachLeadNames(gaps: KnowledgeGap[]): Promise<void> {
  const conversationIds = new Set<string>();
  const contactIds = new Set<string>();
  for (const gap of gaps) {
    for (const lead of gap.waiting) {
      if (lead.contactId) contactIds.add(lead.contactId);
      else if (lead.conversationId) conversationIds.add(lead.conversationId);
    }
  }
  if (conversationIds.size === 0 && contactIds.size === 0) return;

  const contactByConversation = new Map<string, string>();
  try {
    if (conversationIds.size > 0) {
      const { data, error } = await db
        .from('conversations')
        .select('id, contact_id')
        .in('id', [...conversationIds]);
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ id: string; contact_id: string | null }>) {
        if (!row.contact_id) continue;
        contactByConversation.set(row.id, row.contact_id);
        contactIds.add(row.contact_id);
      }
    }
    if (contactIds.size === 0) return;
    const { data, error } = await db
      .from('contacts')
      .select('id, name, call_name, phone_number')
      .in('id', [...contactIds]);
    if (error) throw error;
    const byId = new Map(
      ((data ?? []) as Array<{ id: string; name: string | null; call_name: string | null; phone_number: string | null }>)
        .map((row) => [row.id, row]),
    );
    for (const gap of gaps) {
      for (const lead of gap.waiting) {
        const contactId = lead.contactId ?? (lead.conversationId ? contactByConversation.get(lead.conversationId) ?? null : null);
        const contact = contactId ? byId.get(contactId) : undefined;
        if (!contact) continue;
        lead.contactId = contactId;
        lead.name = contact.call_name || contact.name || null;
        lead.phone = contact.phone_number;
      }
    }
  } catch {
    // Sem nome, a fila continua utilizável: a pergunta e o link da conversa bastam.
  }
}

async function hydrateGaps(rows: UnansweredQuestion[]): Promise<KnowledgeGap[]> {
  const grouped = new Map<string, { gap: KnowledgeGap; questions: Set<string> }>();

  for (const row of rows) {
    const normalized = (row.normalized_question || '').trim() || normalizeQuestionKey(row.question) || row.id;
    const groupKey = `${row.kind}:${row.status}:${normalized}`;
    const askedAt = row.created_at;
    const lastSeenAt = row.last_seen_at || row.created_at;
    const waiting: GapWaitingLead[] = [
      { conversationId: row.conversation_id, contactId: row.contact_id, askedAt, name: null, phone: null },
      ...readOccurrences(row.metadata).map((occurrence) => ({
        conversationId: occurrence.conversationId,
        contactId: occurrence.contactId,
        askedAt: occurrence.askedAt || askedAt,
        name: null,
        phone: null,
      })),
    ].filter((lead) => Boolean(lead.conversationId || lead.contactId));

    const entry = grouped.get(groupKey);
    if (!entry) {
      grouped.set(groupKey, {
        questions: new Set([row.question]),
        gap: {
          key: groupKey,
          ids: [row.id],
          kind: row.kind,
          status: row.status,
          question: row.question,
          variants: [],
          context: row.context,
          occurrences: Math.max(row.occurrence_count ?? 1, 1),
          firstSeenAt: askedAt,
          lastSeenAt,
          waiting,
          resolvedFactId: row.resolved_fact_id,
          resolvedAt: row.resolved_at ?? null,
          proof: parseProof(row.resolution_proof),
        },
      });
      continue;
    }

    const { gap, questions } = entry;
    gap.ids.push(row.id);
    gap.occurrences += Math.max(row.occurrence_count ?? 1, 1);
    gap.context = gap.context || row.context;
    gap.resolvedFactId = gap.resolvedFactId || row.resolved_fact_id;
    gap.resolvedAt = gap.resolvedAt || row.resolved_at || null;
    gap.proof = gap.proof || parseProof(row.resolution_proof);
    gap.waiting.push(...waiting);
    if (askedAt < gap.firstSeenAt) gap.firstSeenAt = askedAt;
    if (lastSeenAt > gap.lastSeenAt) gap.lastSeenAt = lastSeenAt;
    if (!questions.has(row.question)) {
      questions.add(row.question);
      gap.variants.push(row.question);
    }
  }

  const gaps = [...grouped.values()].map((entry) => entry.gap);
  for (const gap of gaps) {
    const unique = new Map<string, GapWaitingLead>();
    for (const lead of gap.waiting) {
      const key = lead.conversationId ?? `contato:${lead.contactId}`;
      const previous = unique.get(key);
      if (!previous || lead.askedAt > previous.askedAt) unique.set(key, lead);
    }
    gap.waiting = [...unique.values()].sort((a, b) => b.askedAt.localeCompare(a.askedAt));
  }

  await attachLeadNames(gaps);
  return gaps.sort((a, b) => b.occurrences - a.occurrences || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.normalize('NFKC').trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function existingFact(workspaceId: string, title: string, fact: string): Promise<KnowledgeFact | null> {
  const { data, error } = await db
    .from('knowledge_facts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('title', title)
    .eq('fact', fact)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function existingDocument(workspaceId: string, fingerprint: string): Promise<KnowledgeDocument | null> {
  const { data, error } = await db
    .from('knowledge_documents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function writeDocument(input: {
  id?: string | null;
  title: string;
  content: string;
  doc_type: 'texto' | 'faq' | 'url';
  source_url?: string | null;
  status: KnowledgeDocument['status'];
  is_active: boolean;
  ingestion_report?: Record<string, unknown>;
  error_message?: string | null;
}): Promise<KnowledgeDocument> {
  const chunks = chunkContent(input.content).filter((chunk) => chunk.trim().length > 0);
  const fingerprint = await sha256(`${input.doc_type}\n${input.source_url ?? ''}\n${input.content}`);
  const { data, error } = await db.rpc('write_knowledge_document', {
    _document_id: input.id ?? null,
    _title: input.title,
    _content: input.content,
    _doc_type: input.doc_type,
    _source_url: input.source_url ?? null,
    _fingerprint: fingerprint,
    _status: input.status,
    _is_active: input.is_active,
    _ingestion_report: {
      chunks_created: chunks.length,
      characters_read: input.content.length,
      unreadable_parts: [],
      conflicts: [],
      ...(input.ingestion_report ?? {}),
    },
    _error_message: input.error_message ?? null,
    _chunks: chunks,
  });
  if (error) throw error;
  const document = Array.isArray(data) ? data[0] : data;
  if (!document) throw new Error('O banco não retornou o material gravado.');
  return document as KnowledgeDocument;
}

export interface KnowledgeSearchHit {
  source_type: 'fact' | 'chunk';
  source_id: string;
  title: string;
  content: string;
  rank: number;
}

export interface SimulatorGrounding {
  searches: Array<{ query: string; results: Array<{ source_type: string; title: string; content: string; rank: number }> }>;
  unanswered: Array<{ pergunta: string; contexto?: string }>;
  tool_events: Array<{ tool: string; args: any; ok: boolean; summary?: string }>;
}

export interface SimulatorResponse {
  reply: string;
  grounding: SimulatorGrounding;
  model: string;
  facts_in_prompt: number;
  iterations: number;
}

export const knowledgeApi = {
  // ---- Fatos canônicos ----
  async fetchFacts(): Promise<KnowledgeFact[]> {
    const { data, error } = await db
      .from('knowledge_facts')
      .select('*')
      .order('category')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  // Insert em lote numa única request: importação de FAQ não pode ficar pela
  // metade se a rede cair no meio (retry duplicaria o que já entrou)
  async createFactsBulk(
    inputs: Array<{ title?: string; category: string; question?: string | null; fact: string; source?: string | null; always_include?: boolean }>,
  ): Promise<void> {
    if (inputs.length === 0) return;
    const workspaceId = await currentWorkspaceId();
    const { error } = await db.from('knowledge_facts').insert(
      inputs.map((i) => ({
        workspace_id: workspaceId,
        title: i.title || i.question || i.category || 'Informação confirmada',
        category: i.category || 'geral',
        question: i.question || null,
        fact: i.fact,
        source: i.source || null,
        always_include: i.always_include ?? false,
      })),
    );
    if (error) throw error;
  },

  async createFact(input: { title?: string; category: string; question?: string | null; fact: string; source?: string | null; always_include?: boolean; expires_at?: string | null }): Promise<KnowledgeFact> {
    const workspaceId = await currentWorkspaceId();
    const title = input.title || input.question || input.category || 'Informação confirmada';
    const duplicate = await existingFact(workspaceId, title, input.fact);
    if (duplicate) {
      const { data, error } = await db.from('knowledge_facts').update({
        category: input.category || duplicate.category,
        question: input.question || duplicate.question,
        source: input.source || duplicate.source,
        always_include: input.always_include ?? true,
        is_active: true,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        expires_at: input.expires_at ?? duplicate.expires_at,
      }).eq('id', duplicate.id).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await db
      .from('knowledge_facts')
      .insert({
        workspace_id: workspaceId,
        title,
        category: input.category || 'geral',
        question: input.question || null,
        fact: input.fact,
        source: input.source || null,
        always_include: input.always_include ?? true,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        expires_at: input.expires_at ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async createFactSuggestion(input: {
    title: string;
    category: string;
    fact: string;
    source?: string | null;
    question?: string | null;
  }): Promise<KnowledgeFact> {
    const workspaceId = await currentWorkspaceId();
    const duplicate = await existingFact(workspaceId, input.title, input.fact);
    if (duplicate) return duplicate;
    const { data, error } = await db
      .from('knowledge_facts')
      .insert({
        workspace_id: workspaceId,
        title: input.title,
        category: input.category || 'geral',
        question: input.question || null,
        fact: input.fact,
        source: input.source || null,
        always_include: false,
        is_active: false,
        status: 'needs_review',
        confirmed_by: null,
        confirmed_at: null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateFact(id: string, updates: Partial<Pick<KnowledgeFact, 'title' | 'category' | 'question' | 'fact' | 'source' | 'is_active' | 'always_include' | 'status' | 'expires_at'>>): Promise<void> {
    const { error } = await db.from('knowledge_facts').update(updates).eq('id', id);
    if (error) throw error;
  },

  async confirmFact(id: string): Promise<void> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const { error } = await db.from('knowledge_facts').update({
      status: 'confirmed',
      is_active: true,
      always_include: true,
      confirmed_by: userData.user?.id ?? null,
      confirmed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  },

  async deleteFact(id: string): Promise<void> {
    const { error } = await db.from('knowledge_facts').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Documentos ----
  async fetchDocuments(): Promise<KnowledgeDocument[]> {
    const { data, error } = await db
      .from('knowledge_documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createDocument(input: { title: string; content: string; doc_type?: 'texto' | 'faq' | 'url'; source_url?: string | null }): Promise<KnowledgeDocument> {
    const workspaceId = await currentWorkspaceId();
    const fingerprint = await sha256(`${input.doc_type ?? 'texto'}\n${input.source_url ?? ''}\n${input.content}`);
    const duplicate = await existingDocument(workspaceId, fingerprint);
    if (duplicate) return duplicate;
    return writeDocument({
      title: input.title,
      content: input.content,
      doc_type: input.doc_type ?? 'texto',
      source_url: input.source_url,
      status: 'approved',
      is_active: true,
    });
  },

  async createDocumentForReview(input: {
    title: string;
    content: string;
    doc_type?: 'texto' | 'faq' | 'url';
    source_url?: string | null;
    ingestion_report?: Record<string, unknown>;
    error_message?: string | null;
  }): Promise<KnowledgeDocument> {
    const workspaceId = await currentWorkspaceId();
    const fingerprint = await sha256(`${input.doc_type ?? 'texto'}\n${input.source_url ?? ''}\n${input.content}`);
    const duplicate = await existingDocument(workspaceId, fingerprint);
    if (duplicate) return duplicate;
    const hasReadableContent = input.content.trim().length > 0;
    return writeDocument({
      title: input.title,
      content: input.content,
      doc_type: input.doc_type ?? 'texto',
      source_url: input.source_url,
      status: hasReadableContent ? 'needs_review' : 'error',
      is_active: false,
      error_message: input.error_message ?? (hasReadableContent ? null : 'Nenhum conteúdo legível foi extraído.'),
      ingestion_report: input.ingestion_report,
    });
  },

  async approveDocument(id: string): Promise<void> {
    const { error } = await db
      .from('knowledge_documents')
      .update({ status: 'approved', is_active: true, error_message: null })
      .eq('id', id);
    if (error) throw error;
  },

  async updateDocument(id: string, input: { title: string; content: string; doc_type?: 'texto' | 'faq' | 'url'; source_url?: string | null }): Promise<void> {
    await writeDocument({
      id,
      title: input.title,
      content: input.content,
      doc_type: input.doc_type ?? 'texto',
      source_url: input.source_url,
      status: 'approved',
      is_active: true,
    });
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await db.from('knowledge_documents').delete().eq('id', id);
    if (error) throw error;
  },

  async toggleDocument(id: string, isActive: boolean): Promise<void> {
    const { error } = await db.from('knowledge_documents').update({ is_active: isActive }).eq('id', id);
    if (error) throw error;
  },

  // ---- Perguntas sem resposta ----
  async fetchUnanswered(status?: 'open' | 'resolved' | 'ignored'): Promise<UnansweredQuestion[]> {
    let query = db.from('unanswered_questions').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async resolveUnanswered(id: string, factId?: string): Promise<void> {
    const { error } = await db
      .from('unanswered_questions')
      .update({ status: 'resolved', resolved_fact_id: factId ?? null })
      .eq('id', id);
    if (error) throw error;
  },

  async ignoreUnanswered(id: string): Promise<void> {
    const { error } = await db.from('unanswered_questions').update({ status: 'ignored' }).eq('id', id);
    if (error) throw error;
  },

  // ---- Fila de trabalho: lacuna -> fato -> prova ----

  /**
   * As pendências equivalentes chegam reunidas num item só, com quem está
   * esperando e a ordem de prioridade sendo o número de leads, não a data.
   */
  async fetchGaps(status: UnansweredQuestion['status'] = 'open'): Promise<KnowledgeGap[]> {
    return hydrateGaps(await knowledgeApi.fetchUnanswered(status));
  },

  /**
   * Contagem por situação para o cabeçalho da aba. Conta no banco em vez de
   * trazer as linhas: o PostgREST corta a resposta em 1000 registros, e uma
   * fila maior que isso passaria a exibir um número errado sem avisar.
   */
  async countGaps(): Promise<Record<UnansweredQuestion['status'], number>> {
    const statuses: Array<UnansweredQuestion['status']> = ['open', 'resolved', 'ignored'];
    const totals = await Promise.all(statuses.map(async (status) => {
      const { count, error } = await db
        .from('unanswered_questions')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      if (error) throw error;
      return count ?? 0;
    }));
    return { open: totals[0], resolved: totals[1], ignored: totals[2] };
  },

  async resolveGap(ids: string[], input: { factId?: string | null; proof?: GapAnswerProof | null }): Promise<void> {
    if (ids.length === 0) return;
    await updateGapRows(ids, { status: 'resolved', resolved_fact_id: input.factId ?? null }, {
      resolution_proof: input.proof ?? {},
    });
  },

  async discardGap(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await updateGapRows(ids, { status: 'ignored' }, {});
  },

  async recordGapProof(ids: string[], proof: GapAnswerProof): Promise<void> {
    if (ids.length === 0) return;
    await updateGapRows(ids, {}, { resolution_proof: proof });
  },

  /**
   * Roda a MESMA busca que a agente roda em atendimento e diz se a resposta
   * recém-aprovada aparece. Sem isso, aprovar um fato é um ato de fé: uma FAQ
   * entra sem always_include e só chega à agente se a busca híbrida a achar.
   */
  async verifyAnswerReachable(question: string, factId: string, alwaysInclude: boolean): Promise<GapAnswerProof> {
    const hits = await knowledgeApi.search(question, 8);
    const position = hits.findIndex((hit) => hit.source_type === 'fact' && hit.source_id === factId);
    return {
      found: position >= 0,
      position: position >= 0 ? position + 1 : null,
      titles: hits.map((hit) => hit.title),
      query: question,
      checked_at: new Date().toISOString(),
      always_include: alwaysInclude,
    };
  },

  /** As últimas falas da conversa em que a pergunta apareceu. */
  async fetchConversationExcerpt(conversationId: string, limit = 8): Promise<ConversationExcerptLine[]> {
    const { data, error } = await db
      .from('messages')
      .select('id, content, from_type, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as Array<{ id: string; content: string | null; from_type: string; sent_at: string }>)
      .map((row) => ({
        id: row.id,
        from: (row.from_type === 'lara' || row.from_type === 'human' ? row.from_type : 'user') as ConversationExcerptLine['from'],
        content: row.content ?? '',
        at: row.sent_at,
      }))
      .reverse();
  },

  async createUnansweredBulk(inputs: Array<{
    question: string;
    context?: string | null;
    kind?: UnansweredQuestion['kind'];
    metadata?: Record<string, unknown>;
  }>): Promise<number> {
    const normalized = inputs
      .map((item) => ({ ...item, question: item.question.trim() }))
      .filter((item) => item.question.length > 0);
    if (normalized.length === 0) return 0;
    const workspaceId = await currentWorkspaceId();
    // Sem .in() com texto livre: o postgrest-js não escapa aspas duplas
    // internas, e uma pergunta com aspas gerava filtro malformado (400) —
    // derrubando a persistência inteira. O dedupe compara no cliente.
    const questionSet = new Set(normalized.map((item) => item.question));
    const existing = (await fetchAllRows<{ question: string; kind: string }>((from, to) => db
      .from('unanswered_questions')
      .select('question, kind')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .range(from, to),
    )).filter((item) => questionSet.has(item.question));
    const known = new Set((existing ?? []).map((item: { question: string; kind: string }) => `${item.kind}:${item.question}`));
    const rows = normalized.filter((item) => !known.has(`${item.kind ?? 'question'}:${item.question}`));
    if (rows.length === 0) return 0;
    const { error } = await db.from('unanswered_questions').insert(rows.map((item) => ({
      workspace_id: workspaceId,
      question: item.question,
      context: item.context ?? null,
      kind: item.kind ?? 'question',
      metadata: item.metadata ?? {},
      status: 'open',
    })));
    if (error) throw error;
    return rows.length;
  },

  /**
   * Grava tudo o que a configuração assistida produziu numa única passada segura
   * de repetir: fatos deduplicam por título+conteúdo (uma consulta e uma inserção
   * em lote), documentos pelo fingerprint (o próprio RPC trata corrida na
   * transação) e perguntas contra as que já estão abertas. Os três grupos são
   * independentes e correm em paralelo — assim como os documentos entre si —
   * então o pior caso deixa de ser ~34 idas seriais ao banco. Repetir a chamada
   * após falha parcial não duplica nada.
   */
  async applySetupKnowledge(input: {
    facts: Array<{ title: string; category: string; fact: string; source: string; critical: boolean; decision: 'confirm' | 'suggest' }>;
    documents: Array<{ title: string; content: string; doc_type: 'texto' | 'url'; source_url: string | null; error_message: string | null; ingestion_report: Record<string, unknown> }>;
    unanswered: Array<{ question: string; context?: string | null; kind?: UnansweredQuestion['kind']; metadata?: Record<string, unknown> }>;
  }): Promise<void> {
    const applyFacts = async () => {
      const normalized = input.facts
        .map((item) => ({ ...item, title: item.title.trim(), fact: item.fact.trim() }))
        .filter((item) => item.title.length > 0 && item.fact.length > 0);
      // Fatos idênticos na mesma proposta viram um só (confirmar vence sugerir);
      // sem isso, dois updates concorrentes disputariam o mesmo registro.
      const byKey = new Map<string, typeof normalized[number]>();
      for (const item of normalized) {
        const key = `${item.title}\n${item.fact}`;
        const existing = byKey.get(key);
        if (!existing || (existing.decision === 'suggest' && item.decision === 'confirm')) byKey.set(key, item);
      }
      const facts = [...byKey.values()];
      if (facts.length === 0) return;
      const workspaceId = await currentWorkspaceId();
      // Mesmo motivo do dedupe de perguntas: título com aspas quebrava o
      // filtro .in() do PostgREST. Busca por workspace e filtra no cliente.
      const titleSet = new Set(facts.map((item) => item.title));
      const existing = (await fetchAllRows<Pick<KnowledgeFact, 'id' | 'title' | 'fact' | 'category' | 'source'>>((from, to) => db
        .from('knowledge_facts')
        .select('id, title, fact, category, source')
        .eq('workspace_id', workspaceId)
        .neq('status', 'archived')
        .range(from, to),
      )).filter((row) => titleSet.has(row.title));
      const known = new Map(
        ((existing ?? []) as Array<Pick<KnowledgeFact, 'id' | 'title' | 'fact' | 'category' | 'source'>>)
          .map((row) => [`${row.title}\n${row.fact}`, row]),
      );
      const now = new Date().toISOString();
      const inserts: Array<Record<string, unknown>> = [];
      const confirmations: Array<Promise<void>> = [];
      for (const item of facts) {
        const duplicate = known.get(`${item.title}\n${item.fact}`);
        if (duplicate) {
          if (item.decision === 'confirm') {
            confirmations.push((async () => {
              const { error } = await db.from('knowledge_facts').update({
                category: item.category || duplicate.category,
                source: item.source || duplicate.source,
                always_include: item.critical,
                is_active: true,
                status: 'confirmed',
                confirmed_at: now,
              }).eq('id', duplicate.id);
              if (error) throw error;
            })());
          }
          continue;
        }
        inserts.push(item.decision === 'confirm'
          ? {
            workspace_id: workspaceId,
            title: item.title,
            category: item.category || 'geral',
            fact: item.fact,
            source: item.source || null,
            always_include: item.critical,
            status: 'confirmed',
            confirmed_at: now,
          }
          : {
            workspace_id: workspaceId,
            title: item.title,
            category: item.category || 'geral',
            fact: item.fact,
            source: item.source || null,
            always_include: false,
            is_active: false,
            status: 'needs_review',
          });
      }
      await Promise.all(confirmations);
      if (inserts.length > 0) {
        const { error } = await db.from('knowledge_facts').insert(inserts);
        if (error) throw error;
      }
    };

    const applyDocuments = async () => {
      // Concorrência limitada: o rate limit de ingestão serializa num lock de
      // linha única por hora — 14 transações simultâneas viram um comboio que
      // arrisca statement_timeout. Quatro por vez mantém quase todo o ganho.
      const queue = [...input.documents];
      const failures: unknown[] = [];
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let document = queue.shift(); document; document = queue.shift()) {
          try {
            await knowledgeApi.createDocumentForReview(document);
          } catch (cause) {
            failures.push(cause);
          }
        }
      }));
      if (failures.length > 0) {
        const first = failures[0];
        const detail = first instanceof Error && first.message ? ` (${first.message})` : '';
        throw new Error(`${failures.length} material(is) não puderam ser salvos${detail}.`);
      }
    };

    const groups = await Promise.allSettled([
      applyFacts(),
      applyDocuments(),
      knowledgeApi.createUnansweredBulk(input.unanswered),
    ]);
    const groupLabels = ['os fatos', 'os materiais', 'as perguntas'];
    const failed = groups
      .map((group, index) => (group.status === 'rejected' ? { label: groupLabels[index], reason: group.reason } : null))
      .filter((group): group is { label: string; reason: unknown } => group !== null);
    if (failed.length === 1) throw failed[0].reason;
    if (failed.length > 1) {
      const details = failed
        .map((group) => (group.reason instanceof Error ? group.reason.message : String(group.reason)))
        .join(' · ');
      throw new Error(`Falhas ao salvar ${failed.map((group) => group.label).join(' e ')}: ${details}`);
    }
  },

  // ---- Busca (preview do que a Lara encontra) ----
  async search(query: string, limit = 6): Promise<KnowledgeSearchHit[]> {
    const { data, error } = await db.rpc('search_knowledge', { p_query: query, p_limit: limit });
    if (error) throw error;
    return data ?? [];
  },

  // ---- Simulador ----
  async simulate(messages: Array<{ role: 'user' | 'assistant'; content: string }>, options?: { test_prompt?: string; model_mode?: string; contact_name?: string; profile_context?: string }): Promise<SimulatorResponse> {
    const { data, error } = await supabase.functions.invoke('lara-simulator', {
      body: { messages, ...options },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as SimulatorResponse;
  },
};

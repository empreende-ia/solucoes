import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '../types';

/**
 * Camada de dados do quadro de pipeline.
 *
 * Complementa src/services/api.ts com o que a operação do quadro precisa e que
 * a leitura antiga não devolvia: data de criação, data de atualização e
 * observações do deal. Também concentra a edição, a exclusão e as regras de
 * filtro do quadro, incluindo a serialização dos filtros na URL.
 */

const FALLBACK_AVATAR = 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff';

export interface PipelineDeal extends Deal {
  /** Valor cru da coluna `company` — `company` traz o nome do contato como fallback de exibição. */
  rawCompany?: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

export type DealPriority = 'low' | 'medium' | 'high';

export interface DealDetailsInput {
  title: string;
  company: string | null;
  value: number;
  priority: DealPriority;
  dueDate: string | null;
  ownerId: string | null;
  tags: string[];
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export async function fetchPipelineDeals(): Promise<PipelineDeal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select(`
      *,
      contact:contacts(name, call_name, phone_number, email, client_memory),
      owner:team_members(name, avatar)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pipeline] Erro ao carregar deals:', error);
    throw error;
  }

  const rows = (data || []) as any[];

  const contactIds = rows
    .map((row) => row.contact_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const conversationByContact = new Map<string, string>();

  if (contactIds.length > 0) {
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, contact_id')
      .in('contact_id', Array.from(new Set(contactIds)));

    (conversations || []).forEach((conversation) => {
      if (conversation.contact_id && !conversationByContact.has(conversation.contact_id)) {
        conversationByContact.set(conversation.contact_id, conversation.id);
      }
    });
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    company: row.company || row.contact?.name || row.contact?.call_name || 'Sem empresa',
    rawCompany: row.company ?? undefined,
    value: Number(row.value) || 0,
    stage: row.stage ?? '',
    stageId: row.stage_id,
    ownerAvatar: row.owner?.avatar || FALLBACK_AVATAR,
    ownerId: row.owner_id ?? undefined,
    ownerName: row.owner?.name ?? undefined,
    tags: row.tags || [],
    dueDate: row.due_date ?? undefined,
    priority: (row.priority || 'medium') as DealPriority,
    contactId: row.contact_id ?? undefined,
    contactName: row.contact?.name || row.contact?.call_name,
    contactPhone: row.contact?.phone_number,
    contactEmail: row.contact?.email,
    wonAt: row.won_at ?? undefined,
    lostAt: row.lost_at ?? undefined,
    lostReason: row.lost_reason ?? undefined,
    clientMemory: row.contact?.client_memory || undefined,
    conversationId: row.contact_id ? conversationByContact.get(row.contact_id) : undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? undefined,
    notes: row.notes ?? undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

export async function updateDealDetails(dealId: string, input: DealDetailsInput): Promise<void> {
  const { data, error } = await supabase
    .from('deals')
    .update({
      title: input.title,
      company: input.company,
      value: input.value,
      priority: input.priority,
      due_date: input.dueDate,
      owner_id: input.ownerId,
      tags: input.tags,
      notes: input.notes,
    })
    .eq('id', dealId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[pipeline] Erro ao atualizar deal:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Deal não encontrado ou edição não permitida.');
  }
}

export async function deleteDealById(dealId: string): Promise<void> {
  const { data, error } = await supabase
    .from('deals')
    .delete()
    .eq('id', dealId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[pipeline] Erro ao excluir deal:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Deal não encontrado ou exclusão não permitida.');
  }
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

export type PeriodFilter = 'all' | 'today' | '7' | '30' | '90';

export interface PipelineFilters {
  search: string;
  /** 'all' · 'none' (sem responsável) · id do membro da equipe */
  owner: string;
  /** 'all' · nome da tag */
  tag: string;
  priority: 'all' | DealPriority;
  period: PeriodFilter;
}

export const EMPTY_PIPELINE_FILTERS: PipelineFilters = {
  search: '',
  owner: 'all',
  tag: 'all',
  priority: 'all',
  period: 'all',
};

export const PRIORITY_OPTIONS: Array<{ value: 'all' | DealPriority; label: string }> = [
  { value: 'all', label: 'Todas as prioridades' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' },
];

export const PERIOD_OPTIONS: Array<{ value: PeriodFilter; label: string }> = [
  { value: 'all', label: 'Todo o período' },
  { value: 'today', label: 'Criados hoje' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

export const PIPELINE_FILTER_PARAMS = {
  search: 'busca',
  owner: 'responsavel',
  tag: 'tag',
  priority: 'prioridade',
  period: 'periodo',
} as const;

export function priorityLabel(priority: string): string {
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baixa';
  return 'Média';
}

export function readFiltersFromParams(params: URLSearchParams): PipelineFilters {
  const priority = params.get(PIPELINE_FILTER_PARAMS.priority) || 'all';
  const period = params.get(PIPELINE_FILTER_PARAMS.period) || 'all';

  return {
    search: params.get(PIPELINE_FILTER_PARAMS.search) || '',
    owner: params.get(PIPELINE_FILTER_PARAMS.owner) || 'all',
    tag: params.get(PIPELINE_FILTER_PARAMS.tag) || 'all',
    priority: PRIORITY_OPTIONS.some((option) => option.value === priority)
      ? (priority as PipelineFilters['priority'])
      : 'all',
    period: PERIOD_OPTIONS.some((option) => option.value === period)
      ? (period as PeriodFilter)
      : 'all',
  };
}

/**
 * Devolve os parâmetros da URL com os filtros aplicados, preservando qualquer
 * outro parâmetro que já esteja lá.
 */
export function writeFiltersToParams(
  filters: PipelineFilters,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base ? base.toString() : undefined);

  const apply = (key: string, value: string, isDefault: boolean) => {
    if (isDefault || !value) {
      params.delete(key);
      return;
    }
    params.set(key, value);
  };

  apply(PIPELINE_FILTER_PARAMS.search, filters.search.trim(), filters.search.trim().length === 0);
  apply(PIPELINE_FILTER_PARAMS.owner, filters.owner, filters.owner === 'all');
  apply(PIPELINE_FILTER_PARAMS.tag, filters.tag, filters.tag === 'all');
  apply(PIPELINE_FILTER_PARAMS.priority, filters.priority, filters.priority === 'all');
  apply(PIPELINE_FILTER_PARAMS.period, filters.period, filters.period === 'all');

  return params;
}

export function countActiveFilters(filters: PipelineFilters): number {
  let total = 0;
  if (filters.search.trim().length > 0) total += 1;
  if (filters.owner !== 'all') total += 1;
  if (filters.tag !== 'all') total += 1;
  if (filters.priority !== 'all') total += 1;
  if (filters.period !== 'all') total += 1;
  return total;
}

function periodStart(period: PeriodFilter, now: Date): Date | null {
  if (period === 'all') return null;

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  const days = Number(period);
  if (!Number.isFinite(days)) return null;

  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return start;
}

export function filterDeals(
  deals: PipelineDeal[],
  filters: PipelineFilters,
  now: Date = new Date(),
): PipelineDeal[] {
  const term = filters.search.trim().toLowerCase();
  const start = periodStart(filters.period, now);

  return deals.filter((deal) => {
    if (term) {
      const haystack = [deal.title, deal.company, deal.contactName, deal.contactPhone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    if (filters.owner === 'none') {
      if (deal.ownerId) return false;
    } else if (filters.owner !== 'all') {
      if (deal.ownerId !== filters.owner) return false;
    }

    if (filters.tag !== 'all' && !deal.tags.includes(filters.tag)) return false;

    if (filters.priority !== 'all' && deal.priority !== filters.priority) return false;

    if (start) {
      const createdAt = new Date(deal.createdAt);
      if (Number.isNaN(createdAt.getTime()) || createdAt < start) return false;
    }

    return true;
  });
}

export function collectTags(deals: PipelineDeal[]): string[] {
  const tags = new Set<string>();
  deals.forEach((deal) => {
    deal.tags.forEach((tag) => {
      const clean = (tag || '').trim();
      if (clean) tags.add(clean);
    });
  });
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function summarizeDeals(deals: PipelineDeal[]): { count: number; total: number } {
  return {
    count: deals.length,
    total: deals.reduce((accumulated, deal) => accumulated + (Number(deal.value) || 0), 0),
  };
}

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

/**
 * Converte uma coluna DATE ('2026-09-10') em Date local, sem o deslocamento de
 * fuso que `new Date('2026-09-10')` produz (a string ISO curta é lida como UTC).
 */
export function parseDateOnly(value?: string | null): Date | undefined {
  if (!value) return undefined;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function toDateOnly(date?: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateOnly(value?: string | null): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return 'Sem previsão';
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatShortDate(value?: string | null): string {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function parseTagsInput(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

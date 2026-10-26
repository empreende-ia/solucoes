import { supabase } from '@/integrations/supabase/client';

/**
 * Camada de dados da ficha do contato (visão 360).
 *
 * Existe separada de services/api.ts por dois motivos:
 * 1. api.fetchContacts devolve a data JÁ formatada em pt-BR, o que obriga a tela
 *    a refazer new Date() em cima de "02/09/2026" e produzir Invalid Date.
 *    Aqui a data sai crua (ISO) e quem formata é a tela, uma única vez.
 * 2. A ficha precisa de contato, memória, tags, deal, agendamentos e mensagens
 *    na mesma leitura — nenhuma função existente entrega esse conjunto.
 */

export type ContactStatus = 'lead' | 'customer' | 'churned';

export interface ContactListItem {
  id: string;
  displayName: string;
  name: string | null;
  callName: string | null;
  phone: string;
  email: string;
  avatarUrl: string | null;
  tags: string[];
  isBlocked: boolean;
  lastActivity: string | null;
  firstContact: string | null;
  instagramUsername: string | null;
  hasWhatsapp: boolean;
  status: ContactStatus;
  statusLabel: string;
  channelLabel: string;
}

export interface ContactRecord {
  id: string;
  displayName: string;
  name: string | null;
  callName: string | null;
  phone: string;
  email: string;
  avatarUrl: string | null;
  tags: string[];
  notes: string;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  isBusiness: boolean;
  whatsappId: string | null;
  instagramUsername: string | null;
  firstContact: string | null;
  lastActivity: string | null;
  createdAt: string | null;
  clientMemory: unknown;
}

export interface ContactDeal {
  id: string;
  title: string;
  value: number;
  priority: string | null;
  stageTitle: string | null;
  stageColor: string | null;
  ownerName: string | null;
  company: string | null;
  tags: string[];
  dueDate: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  outcome: 'aberto' | 'ganho' | 'perdido';
}

export interface ContactAppointment {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  startsAt: string | null;
  duration: number;
  type: string;
  status: string;
  statusLabel: string;
  meetingUrl: string | null;
  description: string | null;
  isPast: boolean;
}

export interface ContactConversation {
  id: string;
  channel: string;
  channelLabel: string;
  status: string;
  statusLabel: string;
  isActive: boolean;
  lastMessageAt: string | null;
  startedAt: string | null;
  isTest: boolean;
}

export interface ContactMessage {
  id: string;
  content: string;
  fromType: string;
  authorLabel: string;
  mediaType: string | null;
  sentAt: string | null;
}

export interface MemoryEntry {
  label: string;
  value: string;
  note?: string;
}

export interface MemoryBlock {
  key: string;
  title: string;
  entries: MemoryEntry[];
}

export interface ContactDetail {
  contact: ContactRecord;
  deals: ContactDeal[];
  appointments: ContactAppointment[];
  conversations: ContactConversation[];
  messages: ContactMessage[];
  memory: MemoryBlock[];
  memoryUpdatedAt: string | null;
}

/* =============================================================
   Datas — o único lugar do módulo autorizado a formatar
   ============================================================= */

/** Devolve Date válido ou null. Nunca lança e nunca produz Invalid Date. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Data curta. Quando o valor é nulo ou inválido, devolve o texto de ausência. */
export function formatDate(value: unknown, fallback = 'Sem registro'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: unknown, fallback = 'Sem registro'): string {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "há 3 dias", "hoje", "em 2 dias". Devolve fallback quando não há data. */
export function formatRelative(value: unknown, fallback = 'Sem registro'): string {
  const date = toDate(value);
  if (!date) return fallback;
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return 'hoje';
  if (diffDays === -1) return 'ontem';
  if (diffDays === 1) return 'amanhã';
  if (diffDays < 0) return `há ${Math.abs(diffDays)} dias`;
  return `em ${diffDays} dias`;
}

export function formatCurrency(value: number | null | undefined): string {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** Combina appointments.date ('2026-09-04') com appointments.time ('14:30:00'). */
function combineDateAndTime(date: unknown, time: unknown): string | null {
  const rawDate = typeof date === 'string' ? date.slice(0, 10) : '';
  if (!rawDate) return null;
  const rawTime = typeof time === 'string' && time.length >= 4 ? time.slice(0, 8) : '00:00:00';
  const composed = toDate(`${rawDate}T${rawTime.length === 5 ? `${rawTime}:00` : rawTime}`);
  return composed ? composed.toISOString() : null;
}

/* =============================================================
   Rótulos
   ============================================================= */

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  webchat: 'Chat do site',
  simulated: 'Simulação',
};

const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  lara: 'Com a Lara',
  human: 'Com humano',
  paused: 'Pausada',
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  canceled: 'Cancelada',
  no_show: 'Não compareceu',
  rescheduled: 'Remarcada',
};

const MESSAGE_AUTHOR_LABELS: Record<string, string> = {
  user: 'Contato',
  lara: 'Lara',
  human: 'Equipe',
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return 'WhatsApp';
  return CHANNEL_LABELS[channel] ?? channel;
}

/* =============================================================
   Memória do cliente (contacts.client_memory, jsonb com blocos)
   ============================================================= */

const MEMORY_LABELS: Record<string, string> = {
  lead_profile: 'Perfil do lead',
  interests: 'Interesses',
  lead_stage: 'Estágio do lead',
  objections: 'Objeções',
  products_discussed: 'Produtos comentados',
  communication_style: 'Estilo de comunicação',
  qualification_score: 'Nota de qualificação',
  sales_intelligence: 'Leitura comercial',
  pain_points: 'Dores',
  next_best_action: 'Próxima ação',
  budget_indication: 'Orçamento',
  decision_timeline: 'Prazo de decisão',
  lead_state: 'Estado do lead',
  company: 'Empresa',
  role: 'Cargo',
  primary_pain: 'Dor principal',
  previous_attempts: 'Tentativas anteriores',
  desired_outcome: 'Resultado desejado',
  urgency: 'Urgência',
  offering_interest: 'Interesse na oferta',
  stage: 'Etapa',
  handoff_requested: 'Pediu atendimento humano',
  opt_out: 'Pediu para não receber',
  conversation_summary: 'Resumo da conversa',
  custom_fields: 'Campos personalizados',
  interaction_summary: 'Resumo das interações',
  response_pattern: 'Padrão de resposta',
  last_contact_reason: 'Motivo do último contato',
  total_conversations: 'Total de conversas',
  preferred_contact_time: 'Melhor horário de contato',
  conversation_history: 'Histórico registrado',
  timestamp: 'Quando',
  user_summary: 'O que o contato disse',
  ai_action: 'O que a Lara fez',
  last_updated: 'Atualizada em',
};

const MEMORY_STATUS_LABELS: Record<string, string> = {
  confirmed: 'confirmado',
  inferred: 'inferido',
  unknown: 'ainda não sabido',
  not_applicable: 'não se aplica',
};

const MEMORY_SKIP_KEYS = new Set(['last_updated']);

function humanizeKey(key: string): string {
  if (MEMORY_LABELS[key]) return MEMORY_LABELS[key];
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Converte um valor jsonb em texto legível. Devolve null quando não há conteúdo. */
function scalarToText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown' || trimmed.toLowerCase() === 'null') return null;
    return trimmed;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map(item => (isPlainObject(item) ? scalarToText(item.value ?? item.title ?? item.name) : scalarToText(item)))
      .filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

function entriesFromObject(source: Record<string, unknown>, prefix = ''): MemoryEntry[] {
  const entries: MemoryEntry[] = [];

  for (const [key, raw] of Object.entries(source)) {
    if (MEMORY_SKIP_KEYS.has(key)) continue;
    const label = prefix ? `${prefix} · ${humanizeKey(key)}` : humanizeKey(key);

    // Campo no formato { value, status } usado pelo lead_state.
    if (isPlainObject(raw) && 'value' in raw) {
      const text = scalarToText(raw.value);
      if (!text) continue;
      const status = typeof raw.status === 'string' ? MEMORY_STATUS_LABELS[raw.status] ?? raw.status : undefined;
      entries.push({ label, value: text, note: status });
      continue;
    }

    if (isPlainObject(raw)) {
      entries.push(...entriesFromObject(raw, label));
      continue;
    }

    const text = scalarToText(raw);
    if (text) entries.push({ label, value: text });
  }

  return entries;
}

export function buildMemoryBlocks(raw: unknown): MemoryBlock[] {
  if (!isPlainObject(raw)) return [];

  const blocks: MemoryBlock[] = [];
  const looseEntries: MemoryEntry[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (MEMORY_SKIP_KEYS.has(key)) continue;

    if (Array.isArray(value) && value.some(isPlainObject)) {
      const entries = value
        .filter(isPlainObject)
        .slice(-5)
        .flatMap((item, index) => {
          const inner = entriesFromObject(item);
          return inner.length ? [{ label: `Registro ${index + 1}`, value: inner.map(e => `${e.label}: ${e.value}`).join(' · ') }] : [];
        });
      if (entries.length) blocks.push({ key, title: humanizeKey(key), entries });
      continue;
    }

    if (isPlainObject(value)) {
      const entries = entriesFromObject(value);
      if (entries.length) blocks.push({ key, title: humanizeKey(key), entries });
      continue;
    }

    const text = scalarToText(value);
    if (text) looseEntries.push({ label: humanizeKey(key), value: text });
  }

  if (looseEntries.length) blocks.push({ key: '__geral', title: 'Outros registros', entries: looseEntries });

  return blocks;
}

/* =============================================================
   Leituras
   ============================================================= */

/** Remove o que quebraria o filtro `or` do PostgREST. */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()%*"\\]/g, ' ').trim();
}

function displayNameOf(row: { name?: string | null; call_name?: string | null; phone_number?: string | null }): string {
  return row.name?.trim() || row.call_name?.trim() || row.phone_number?.trim() || 'Contato sem nome';
}

export interface ContactListOptions {
  search?: string;
  limit?: number;
}

/**
 * Lista de contatos com a busca resolvida no banco (e não só no que já foi
 * carregado) e com a data de atividade crua, para a tela formatar uma vez só.
 */
export async function fetchContactList(options: ContactListOptions = {}): Promise<ContactListItem[]> {
  const limit = options.limit ?? 200;
  const term = sanitizeSearch(options.search ?? '');

  let query = supabase
    .from('contacts')
    .select(
      'id, name, call_name, phone_number, email, avatar_url, profile_picture_url, tags, is_blocked, last_activity, first_contact_date, instagram_username, whatsapp_id'
    )
    .order('last_activity', { ascending: false })
    .limit(limit);

  if (term) {
    const digits = term.replace(/\D/g, '');
    const filters = [
      `name.ilike.%${term}%`,
      `call_name.ilike.%${term}%`,
      `email.ilike.%${term}%`,
      `instagram_username.ilike.%${term}%`,
      `phone_number.ilike.%${digits || term}%`,
    ];
    query = query.or(filters.join(','));
  }

  const { data, error } = await query;

  if (error) {
    console.error('[contactDetail] Erro ao listar contatos:', error);
    throw error;
  }

  const rows = data ?? [];
  const ids = rows.map(row => row.id);
  const outcomeByContact = await fetchDealOutcomes(ids);

  return rows.map(row => {
    const blocked = Boolean(row.is_blocked);
    const outcome = outcomeByContact.get(row.id);
    // O bloqueio vem primeiro: um contato bloqueado que já fechou negócio precisa
    // aparecer como bloqueado na coluna E no filtro, senão some da triagem.
    const status: ContactStatus = blocked ? 'churned' : outcome === 'ganho' ? 'customer' : 'lead';
    const hasWhatsapp = Boolean(row.whatsapp_id || row.phone_number);
    const channels = [hasWhatsapp ? 'WhatsApp' : null, row.instagram_username ? 'Instagram' : null].filter(Boolean);

    return {
      id: row.id,
      displayName: displayNameOf(row),
      name: row.name,
      callName: row.call_name,
      phone: row.phone_number ?? '',
      email: row.email ?? '',
      avatarUrl: row.avatar_url || row.profile_picture_url || null,
      tags: row.tags ?? [],
      isBlocked: blocked,
      lastActivity: row.last_activity ?? null,
      firstContact: row.first_contact_date ?? null,
      instagramUsername: row.instagram_username ?? null,
      hasWhatsapp,
      status,
      statusLabel: status === 'customer' ? 'Cliente' : status === 'churned' ? 'Bloqueado' : 'Lead',
      channelLabel: channels.length ? channels.join(' e ') : 'Sem canal',
    } satisfies ContactListItem;
  });
}

/** Marca quem já tem negócio ganho, para o status da lista não ser inventado. */
async function fetchDealOutcomes(contactIds: string[]): Promise<Map<string, 'ganho' | 'perdido' | 'aberto'>> {
  const result = new Map<string, 'ganho' | 'perdido' | 'aberto'>();
  if (contactIds.length === 0) return result;

  const { data, error } = await supabase
    .from('deals')
    .select('contact_id, won_at, lost_at')
    .in('contact_id', contactIds);

  if (error) {
    console.error('[contactDetail] Erro ao ler negócios dos contatos:', error);
    return result;
  }

  for (const row of data ?? []) {
    if (!row.contact_id) continue;
    const current = result.get(row.contact_id);
    if (current === 'ganho') continue;
    if (row.won_at) result.set(row.contact_id, 'ganho');
    else if (row.lost_at) result.set(row.contact_id, current === 'aberto' ? 'aberto' : 'perdido');
    else result.set(row.contact_id, 'aberto');
  }

  return result;
}

function firstOf<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export async function fetchContactDetail(contactId: string): Promise<ContactDetail> {
  const { data: contactRow, error: contactError } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .maybeSingle();

  if (contactError) {
    console.error('[contactDetail] Erro ao carregar contato:', contactError);
    throw contactError;
  }
  if (!contactRow) {
    throw new Error('Contato não encontrado.');
  }

  const [dealsResult, appointmentsResult, conversationsResult] = await Promise.all([
    supabase
      .from('deals')
      .select(
        'id, title, value, priority, company, tags, due_date, won_at, lost_at, lost_reason, created_at, updated_at, stage:pipeline_stages(title, color), owner:team_members(name)'
      )
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('id, title, date, time, duration, type, status, meeting_url, description')
      .eq('contact_id', contactId)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(20),
    supabase
      .from('conversations')
      .select('id, channel, status, is_active, last_message_at, started_at, metadata')
      .eq('contact_id', contactId)
      .order('last_message_at', { ascending: false })
      .limit(5),
  ]);

  if (dealsResult.error) console.error('[contactDetail] Erro ao carregar negócios:', dealsResult.error);
  if (appointmentsResult.error) console.error('[contactDetail] Erro ao carregar agendamentos:', appointmentsResult.error);
  if (conversationsResult.error) console.error('[contactDetail] Erro ao carregar conversas:', conversationsResult.error);

  const now = Date.now();

  const deals: ContactDeal[] = (dealsResult.data ?? []).map((row: any) => {
    const stage = firstOf<{ title?: string | null; color?: string | null }>(row.stage);
    const owner = firstOf<{ name?: string | null }>(row.owner);
    return {
      id: row.id,
      title: row.title,
      value: Number(row.value) || 0,
      priority: row.priority ?? null,
      stageTitle: stage?.title ?? null,
      stageColor: stage?.color ?? null,
      ownerName: owner?.name ?? null,
      company: row.company ?? null,
      tags: row.tags ?? [],
      dueDate: row.due_date ?? null,
      wonAt: row.won_at ?? null,
      lostAt: row.lost_at ?? null,
      lostReason: row.lost_reason ?? null,
      updatedAt: row.updated_at ?? null,
      createdAt: row.created_at ?? null,
      outcome: row.won_at ? 'ganho' : row.lost_at ? 'perdido' : 'aberto',
    };
  });

  const appointments: ContactAppointment[] = (appointmentsResult.data ?? []).map((row: any) => {
    const startsAt = combineDateAndTime(row.date, row.time);
    const startsDate = toDate(startsAt);
    const status = typeof row.status === 'string' && row.status ? row.status : 'scheduled';
    return {
      id: row.id,
      title: row.title,
      date: row.date ?? null,
      time: typeof row.time === 'string' ? row.time.slice(0, 5) : null,
      startsAt,
      duration: Number(row.duration) || 0,
      type: row.type ?? 'meeting',
      status,
      statusLabel: APPOINTMENT_STATUS_LABELS[status] ?? status,
      meetingUrl: row.meeting_url ?? null,
      description: row.description ?? null,
      isPast: startsDate ? startsDate.getTime() < now : false,
    };
  });

  const conversations: ContactConversation[] = (conversationsResult.data ?? []).map((row: any) => {
    const metadata = isPlainObject(row.metadata) ? row.metadata : {};
    const status = typeof row.status === 'string' ? row.status : 'lara';
    return {
      id: row.id,
      channel: row.channel ?? 'whatsapp',
      channelLabel: channelLabel(row.channel),
      status,
      statusLabel: CONVERSATION_STATUS_LABELS[status] ?? status,
      isActive: Boolean(row.is_active),
      lastMessageAt: row.last_message_at ?? null,
      startedAt: row.started_at ?? null,
      isTest: String(metadata.test ?? '') === 'true' || metadata.test === true,
    };
  });

  const messages = conversations[0] ? await fetchRecentMessages(conversations[0].id, 12) : [];
  const clientMemory = (contactRow as any).client_memory ?? null;
  const memoryUpdated = isPlainObject(clientMemory) ? clientMemory.last_updated : null;

  const contact: ContactRecord = {
    id: contactRow.id,
    displayName: displayNameOf(contactRow),
    name: contactRow.name,
    callName: contactRow.call_name,
    phone: contactRow.phone_number ?? '',
    email: contactRow.email ?? '',
    avatarUrl: contactRow.avatar_url || contactRow.profile_picture_url || null,
    tags: contactRow.tags ?? [],
    notes: contactRow.notes ?? '',
    isBlocked: Boolean(contactRow.is_blocked),
    blockedAt: contactRow.blocked_at ?? null,
    blockedReason: contactRow.blocked_reason ?? null,
    isBusiness: Boolean(contactRow.is_business),
    whatsappId: contactRow.whatsapp_id ?? null,
    instagramUsername: contactRow.instagram_username ?? null,
    firstContact: contactRow.first_contact_date ?? null,
    lastActivity: contactRow.last_activity ?? null,
    createdAt: contactRow.created_at ?? null,
    clientMemory,
  };

  return {
    contact,
    deals,
    appointments,
    conversations,
    messages,
    memory: buildMemoryBlocks(clientMemory),
    memoryUpdatedAt: typeof memoryUpdated === 'string' ? memoryUpdated : null,
  };
}

export async function fetchRecentMessages(conversationId: string, limit = 12): Promise<ContactMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, content, from_type, media_type, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[contactDetail] Erro ao carregar mensagens:', error);
    return [];
  }

  return (data ?? [])
    .map((row: any) => ({
      id: row.id,
      content: row.content ?? '',
      fromType: row.from_type,
      authorLabel: MESSAGE_AUTHOR_LABELS[row.from_type] ?? row.from_type,
      mediaType: row.media_type ?? null,
      sentAt: row.sent_at ?? null,
    }))
    .reverse();
}

/** Renomeia o contato. Não existe equivalente em services/api.ts. */
export async function updateContactName(contactId: string, name: string): Promise<void> {
  const clean = name.trim();
  const { error } = await supabase
    .from('contacts')
    .update({ name: clean || null })
    .eq('id', contactId);

  if (error) {
    console.error('[contactDetail] Erro ao renomear contato:', error);
    throw error;
  }
}

import { supabase } from '@/integrations/supabase/client';
import { calendarApi } from './calendar';
import { currentWorkspaceId } from './workspace';
import {
  Contact,
  StatMetric,
  TeamMember,
  Appointment,
  Deal,
  DBConversation,
  DBMessage,
  UIConversation,
  UIMessage,
  MessageDirection,
  transformDBToUIConversation,
  transformDBToUIMessage
} from '../types';

// Helper function to get current user ID
const getCurrentUserId = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  return user.id;
};

// Cache for system stage IDs (Ganho/Perdido) - keyed by user_id for multi-tenant
const systemStagesCacheByUser: Map<string, { ganhoId: string | null; perdidoId: string | null }> = new Map();

// Helper function to get system stage IDs dynamically
const getSystemStageIds = async (): Promise<{ ganhoId: string | null; perdidoId: string | null }> => {
  const userId = await getCurrentUserId();
  
  if (systemStagesCacheByUser.has(userId)) {
    return systemStagesCacheByUser.get(userId)!;
  }
  
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, title, is_system')
    .eq('is_system', true)
    .eq('is_active', true);
  
  const ganhoStage = stages?.find(s => s.title.toLowerCase() === 'ganho');
  const perdidoStage = stages?.find(s => s.title.toLowerCase() === 'perdido');
  
  const result = {
    ganhoId: ganhoStage?.id || null,
    perdidoId: perdidoStage?.id || null
  };
  
  systemStagesCacheByUser.set(userId, result);
  return result;
};

// Clear cache (call when stages are modified)
export const clearStagesCache = () => {
  systemStagesCacheByUser.clear();
};

// Helper functions for dashboard metrics
const formatResponseTime = (ms: number): string => {
  if (!ms || ms === 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const calculateTrend = (today: number, yesterday: number): string => {
  if (yesterday === 0) return today > 0 ? '+100%' : '0%';
  const diff = ((today - yesterday) / yesterday) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const getDayName = (date: Date): string => {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return days[date.getDay()];
};

const getDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// ============= Inbox (fila de atendimento) =============
// types.ts é compartilhado com outras telas e não recebe edição nesta frente.
// Os campos que o inbox precisa (instante bruto de cada mensagem, motivo real
// da recusa de envio, transferência escrita pela agente, início da espera)
// vivem aqui como extensão de UIConversation/UIMessage.

/** Quantas mensagens a lista carrega por conversa e por página de histórico. */
export const INBOX_PAGE_SIZE = 30;

export interface InboxMessage extends UIMessage {
  /** Instante bruto em ISO — usado para separador de dia e paginação. */
  sentAt: string;
  /** Motivo real da recusa, gravado pelo whatsapp-sender em metadata.send_error. */
  sendError: string | null;
}

export interface HandoffInfo {
  reason: string;
  summary: string;
  requestedAt: string | null;
  requestedBy: string | null;
}

export interface TakeoverInfo {
  byName: string | null;
  at: string | null;
}

export interface InboxConversation extends UIConversation {
  messages: InboxMessage[];
  /** Instante bruto da última atividade, para ordenar a fila. */
  lastMessageAt: string;
  /** Transferência escrita pela agente em conversations.metadata.handoff. */
  handoff: HandoffInfo | null;
  /** Quem assumiu por último, gravado em conversations.metadata.takeover. */
  takeover: TakeoverInfo | null;
  /** Início da espera do lead: última mensagem recebida ainda sem resposta. */
  unansweredSince: string | null;
  /** Início da espera por gente: transferência, ou a espera sem resposta. */
  waitingSince: string | null;
  /** Há mensagens mais antigas para carregar. */
  hasMoreMessages: boolean;
  /** Mensagem mais antiga já carregada, âncora do "carregar anteriores". */
  oldestLoadedAt: string | null;
  loadingOlder: boolean;
}

function readHandoff(metadata: Record<string, any> | null | undefined): HandoffInfo | null {
  const raw = metadata?.handoff;
  if (!raw || typeof raw !== 'object') return null;
  const reason = typeof raw.reason === 'string' ? raw.reason : '';
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  if (!reason && !summary) return null;
  return {
    reason,
    summary,
    requestedAt: typeof raw.requested_at === 'string' ? raw.requested_at : null,
    requestedBy: typeof raw.requested_by === 'string' ? raw.requested_by : null,
  };
}

function readTakeover(metadata: Record<string, any> | null | undefined): TakeoverInfo | null {
  const raw = metadata?.takeover;
  if (!raw || typeof raw !== 'object') return null;
  const at = typeof raw.at === 'string' ? raw.at : null;
  const byName = typeof raw.by_name === 'string' ? raw.by_name : null;
  if (!at && !byName) return null;
  return { byName, at };
}

/** Lê transferência e assunção de conversations.metadata. */
export function readConversationHandling(metadata: Record<string, any> | null | undefined): {
  handoff: HandoffInfo | null;
  takeover: TakeoverInfo | null;
} {
  return { handoff: readHandoff(metadata), takeover: readTakeover(metadata) };
}

/** UIMessage + instante bruto + motivo da recusa. */
export function toInboxMessage(msg: DBMessage): InboxMessage {
  const base = transformDBToUIMessage(msg);
  const sendError = typeof msg.metadata?.send_error === 'string' ? msg.metadata.send_error : null;
  return { ...base, sentAt: msg.sent_at, sendError };
}

/**
 * Recalcula a espera a partir das mensagens já carregadas.
 * unansweredSince = a mensagem recebida mais antiga do bloco final sem resposta.
 */
export function recomputeWaiting<T extends {
  messages: InboxMessage[];
  status: UIConversation['status'];
  handoff: HandoffInfo | null;
  lastMessageAt: string;
}>(conv: T): T {
  let unansweredSince: string | null = null;
  for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
    const msg = conv.messages[i];
    if (msg.direction === MessageDirection.OUTGOING) break;
    unansweredSince = msg.sentAt;
  }

  const waitingSince = conv.status === 'human'
    ? (conv.handoff?.requestedAt || unansweredSince || conv.lastMessageAt)
    : unansweredSince;

  return { ...conv, unansweredSince, waitingSince };
}

/** DBConversation + mensagens já em ordem cronológica → linha do inbox. */
export function toInboxConversation(
  conv: DBConversation,
  messages: DBMessage[],
  hasMoreMessages: boolean,
): InboxConversation {
  const base = transformDBToUIConversation(conv, messages);
  const inboxMessages = messages.map(toInboxMessage);
  return recomputeWaiting({
    ...base,
    messages: inboxMessages,
    lastMessageAt: conv.last_message_at,
    handoff: readHandoff(conv.metadata),
    takeover: readTakeover(conv.metadata),
    unansweredSince: null,
    waitingSince: null,
    hasMoreMessages,
    oldestLoadedAt: inboxMessages[0]?.sentAt ?? null,
    loadingOlder: false,
  });
}

/** % e _ são curingas do ilike: escapar antes de mandar o termo do operador. */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export const api = {
  /**
   * Fetch dashboard metrics with real data from Supabase
   * @param days - Number of days to fetch (1 = today, 7 = last 7 days, 30 = last 30 days)
   */
  fetchDashboardMetrics: async (days: number = 1): Promise<StatMetric[]> => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    // Period start
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);
    const periodStartStr = periodStart.toISOString();
    
    // Previous period for comparison
    const prevPeriodEnd = new Date(periodStart);
    prevPeriodEnd.setMilliseconds(-1);
    const prevPeriodEndStr = prevPeriodEnd.toISOString();
    
    const prevPeriodStart = new Date(periodStart);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - days);
    const prevPeriodStartStr = prevPeriodStart.toISOString();

    try {
      // Fetch all metrics in parallel
      const [
        messagesPeriodResult,
        messagesPrevResult,
        contactsPeriodResult,
        contactsPrevResult,
        wonDealsPeriodResult,
        wonDealsPrevResult,
        appointmentsPeriodResult,
        appointmentsPrevResult,
        avgResponseResult
      ] = await Promise.all([
        // Atendimentos = conversas únicas com atividade no período
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .gte('last_message_at', periodStartStr),
        // Atendimentos no período anterior
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .gte('last_message_at', prevPeriodStartStr)
          .lt('last_message_at', periodStartStr),
        // New contacts in period
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', periodStartStr),
        // New contacts in previous period
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        // Won deals in period
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .not('won_at', 'is', null)
          .gte('won_at', periodStartStr),
        // Won deals in previous period
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .not('won_at', 'is', null)
          .gte('won_at', prevPeriodStartStr)
          .lt('won_at', periodStartStr),
        // Appointments in period
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', periodStartStr),
        // Appointments in previous period
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        // Average response time (for the period)
        supabase
          .from('messages')
          .select('lara_response_time')
          .not('lara_response_time', 'is', null)
          .gt('lara_response_time', 0)
          .gte('sent_at', periodStartStr)
      ]);

      const atendimentosPeriod = messagesPeriodResult.count || 0;
      const atendimentosPrev = messagesPrevResult.count || 0;
      const contactsPeriod = contactsPeriodResult.count || 0;
      const contactsPrev = contactsPrevResult.count || 0;
      
      // Conversões = deals ganhos + appointments agendados
      const conversionsPeriod = (wonDealsPeriodResult.count || 0) + (appointmentsPeriodResult.count || 0);
      const conversionsPrev = (wonDealsPrevResult.count || 0) + (appointmentsPrevResult.count || 0);
      
      const responseTimes = (avgResponseResult.data?.map(m => m.lara_response_time).filter(Boolean) || []) as number[];
      const avgResponseMs = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      return [
        {
          label: 'Atendimentos',
          value: atendimentosPeriod.toString(),
          trend: calculateTrend(atendimentosPeriod, atendimentosPrev),
          trendUp: atendimentosPeriod >= atendimentosPrev
        },
        {
          label: 'Conversões',
          value: conversionsPeriod.toString(),
          trend: calculateTrend(conversionsPeriod, conversionsPrev),
          trendUp: conversionsPeriod >= conversionsPrev
        },
        {
          label: 'Tempo Médio',
          value: formatResponseTime(avgResponseMs),
          trend: '-',
          trendUp: true
        },
        {
          label: 'Novos Leads',
          value: contactsPeriod.toString(),
          trend: calculateTrend(contactsPeriod, contactsPrev),
          trendUp: contactsPeriod >= contactsPrev
        }
      ];
    } catch (error) {
      console.error('[API] Error fetching dashboard metrics:', error);
      // Return fallback metrics
      return [
        { label: 'Atendimentos', value: '0', trend: '0%', trendUp: true },
        { label: 'Conversões', value: '0', trend: '0%', trendUp: true },
        { label: 'Tempo Médio', value: '0s', trend: '-', trendUp: true },
        { label: 'Novos Leads', value: '0', trend: '0%', trendUp: true }
      ];
    }
  },

  /**
   * Fetch chart data for the specified number of days
   * @param days - Number of days to fetch
   */
  fetchChartData: async (days: number = 7): Promise<any[]> => {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);

    try {
      const [messagesResult, dealsResult, appointmentsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('sent_at')
          .gte('sent_at', periodStart.toISOString()),
        supabase
          .from('deals')
          .select('won_at')
          .not('won_at', 'is', null)
          .gte('won_at', periodStart.toISOString()),
        supabase
          .from('appointments')
          .select('created_at')
          .gte('created_at', periodStart.toISOString())
      ]);

      // Group messages by day
      const messagesMap = new Map<string, number>();
      (messagesResult.data || []).forEach(m => {
        const dateStr = getDateString(new Date(m.sent_at));
        messagesMap.set(dateStr, (messagesMap.get(dateStr) || 0) + 1);
      });

      // Group conversions by day (deals + appointments)
      const conversionsMap = new Map<string, number>();
      (dealsResult.data || []).forEach(d => {
        if (d.won_at) {
          const dateStr = getDateString(new Date(d.won_at));
          conversionsMap.set(dateStr, (conversionsMap.get(dateStr) || 0) + 1);
        }
      });
      (appointmentsResult.data || []).forEach(a => {
        if (a.created_at) {
          const dateStr = getDateString(new Date(a.created_at));
          conversionsMap.set(dateStr, (conversionsMap.get(dateStr) || 0) + 1);
        }
      });

      // Generate days
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = getDateString(date);
        
        // Format name based on number of days
        let name: string;
        if (days === 1) {
          name = 'Hoje';
        } else if (days <= 7) {
          name = getDayName(date);
        } else {
          name = `${date.getDate()}/${date.getMonth() + 1}`;
        }
        
        result.push({
          name,
          chats: messagesMap.get(dateStr) || 0,
          sales: conversionsMap.get(dateStr) || 0
        });
      }

      return result;
    } catch (error) {
      console.error('[API] Error fetching chart data:', error);
      // Return empty data
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        result.push({
          name: days === 1 ? 'Hoje' : (days <= 7 ? getDayName(date) : `${date.getDate()}/${date.getMonth() + 1}`),
          chats: 0,
          sales: 0
        });
      }
      return result;
    }
  },

  /**
   * Fetch contacts from database
   */
  fetchContacts: async (): Promise<Contact[]> => {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[API] Error fetching contacts:', error);
      return []; // Return empty array on error
    }

    if (!data || data.length === 0) {
      return []; // Return empty array if no data
    }

    return data.map(c => ({
      id: c.id,
      name: c.name || c.call_name || c.phone_number || '',
      phone: c.phone_number || '',
      email: c.email || '',
      status: 'lead' as const, // Map from tags or client_memory in future
      lastContact: new Date(c.last_activity).toLocaleDateString('pt-BR')
    }));
  },

  /**
   * Fetch team members from database
   */
  fetchTeam: async (): Promise<TeamMember[]> => {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        *,
        team:teams(*),
        function:team_functions(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching team members:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role as 'admin' | 'manager' | 'agent',
      status: m.status as 'active' | 'invited' | 'disabled',
      avatar: m.avatar || `https://ui-avatars.com/api/?name=${m.name.replace(' ', '+')}&background=random`,
      lastActive: m.last_active || undefined,
      team_id: m.team_id,
      function_id: m.function_id,
      weight: m.weight ?? undefined,
      team: m.team as any,
      function: m.function as any
    }));
  },

  /**
   * Create team member
   */
  createTeamMember: async (member: {
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'agent';
    team_id?: string;
    function_id?: string;
    weight?: number;
  }): Promise<TeamMember> => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('team_members')
      .insert({
        name: member.name,
        email: member.email,
        role: member.role,
        team_id: member.team_id,
        function_id: member.function_id,
        weight: member.weight || 1,
        status: 'invited',
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team member:', error);
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as 'admin' | 'manager' | 'agent',
      status: data.status as 'active' | 'invited' | 'disabled',
      avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name.replace(' ', '+')}&background=random`,
      team_id: data.team_id,
      function_id: data.function_id,
      weight: data.weight ?? undefined
    };
  },

  /**
   * Update team member
   */
  updateTeamMember: async (id: string, updates: Partial<{
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'agent';
    status: 'active' | 'invited' | 'disabled';
    team_id: string | null;
    function_id: string | null;
    weight: number;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team member:', error);
      throw error;
    }
  },

  /**
   * Delete team member
   */
  deleteTeamMember: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team member:', error);
      throw error;
    }
  },

  /**
   * Fetch teams
   */
  fetchTeams: async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching teams:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create team
   */
  createTeam: async (team: { name: string; description?: string; color?: string }) => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        description: team.description,
        color: team.color || '#141414',
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update team
   */
  updateTeam: async (id: string, updates: Partial<{ name: string; description: string; color: string }>) => {
    const { error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team:', error);
      throw error;
    }
  },

  /**
   * Delete team
   */
  deleteTeam: async (id: string) => {
    const { error } = await supabase
      .from('teams')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team:', error);
      throw error;
    }
  },

  /**
   * Fetch team functions
   */
  fetchTeamFunctions: async () => {
    const { data, error } = await supabase
      .from('team_functions')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching team functions:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create team function
   */
  createTeamFunction: async (func: { name: string; description?: string }) => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('team_functions')
      .insert({
        name: func.name,
        description: func.description,
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team function:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update team function
   */
  updateTeamFunction: async (id: string, updates: Partial<{ name: string; description: string }>) => {
    const { error } = await supabase
      .from('team_functions')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team function:', error);
      throw error;
    }
  },

  /**
   * Delete team function
   */
  deleteTeamFunction: async (id: string) => {
    const { error } = await supabase
      .from('team_functions')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team function:', error);
      throw error;
    }
  },

  /**
   * Fetch appointments from database
   */
  fetchAppointments: async (): Promise<Appointment[]> => {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        contact:contacts(id, name, phone_number)
      `)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('[API] Error fetching appointments:', error);
      return []; // Return empty array on error
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      time: a.time,
      duration: a.duration,
      type: a.type as 'demo' | 'meeting' | 'support' | 'followup',
      description: a.description ?? undefined,
      attendees: a.attendees || [],
      contact_id: a.contact_id ?? undefined,
      contact: a.contact ? {
        id: a.contact.id,
        name: a.contact.name,
        phone_number: a.contact.phone_number || ''
      } : undefined,
      metadata: a.metadata as Appointment['metadata'],
      meeting_url: a.meeting_url ?? undefined,
      external_calendar_event_id: a.external_calendar_event_id ?? undefined,
      calendar_sync_status: a.calendar_sync_status as Appointment['calendar_sync_status'],
      calendar_synced_at: a.calendar_synced_at ?? undefined,
      calendar_sync_error: a.calendar_sync_error ?? undefined,
    }));
  },

  /**
   * Create new appointment
   */
  createAppointment: async (appointment: {
    title: string;
    description?: string;
    date: string;
    time: string;
    duration?: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    attendees?: string[];
    contact_id?: string;
    meeting_url?: string;
  }): Promise<Appointment> => {
    const [userId, workspaceId] = await Promise.all([getCurrentUserId(), currentWorkspaceId()]);

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        title: appointment.title,
        description: appointment.description,
        date: appointment.date,
        time: appointment.time,
        duration: appointment.duration || 60,
        type: appointment.type,
        attendees: appointment.attendees || [],
        contact_id: appointment.contact_id,
        meeting_url: appointment.meeting_url,
        status: 'scheduled',
        user_id: userId,
        // O gatilho do banco preencheria isso, mas mandar explícito mantém a
        // escrita legível e falha cedo se o usuário não tiver workspace ativo.
        workspace_id: workspaceId
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating appointment:', error);
      throw error;
    }

    try {
      await calendarApi.syncEvent(data.id);
    } catch (syncError) {
      // O agendamento local é a fonte da verdade. A function registra o erro no
      // próprio item para permitir nova tentativa sem perder o que foi criado.
      console.warn('[API] Appointment created, but calendar sync failed:', syncError);
    }

    return {
      id: data.id,
      title: data.title,
      date: data.date,
      time: data.time,
      duration: data.duration,
      type: data.type as 'demo' | 'meeting' | 'support' | 'followup',
      description: data.description ?? undefined,
      attendees: data.attendees || [],
      meeting_url: data.meeting_url ?? undefined,
      calendar_sync_status: data.calendar_sync_status as Appointment['calendar_sync_status'],
    };
  },

  /**
   * Update existing appointment
   */
  updateAppointment: async (id: string, updates: Partial<{
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    attendees: string[];
    meeting_url: string;
    status: string;
    contact_id: string;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating appointment:', error);
      throw error;
    }


    try {
      await calendarApi.syncEvent(id);
    } catch (syncError) {
      console.warn('[API] Appointment updated, but calendar sync failed:', syncError);
    }
  },

  /**
   * Delete appointment
   */
  deleteAppointment: async (id: string): Promise<void> => {
    // Remove primeiro no provedor para evitar um evento órfão sem vínculo local.
    await calendarApi.deleteEvent(id);

    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting appointment:', error);
      throw error;
    }
  },
  
  /**
   * Fetch pipeline/deals with real data
   */
  fetchPipeline: async (): Promise<Deal[]> => {
    const { data, error } = await supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(name, call_name, phone_number, email, client_memory),
        owner:team_members(name, avatar)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching pipeline:', error);
      return [];
    }

    // Buscar conversation IDs para cada deal com contact_id
    const contactIds = (data?.filter(d => d.contact_id).map(d => d.contact_id) || []).filter((id): id is string => id !== null);
    
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, contact_id')
      .in('contact_id', contactIds);

    const convMap = new Map(conversations?.map(c => [c.contact_id, c.id]) || []);

    return (data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      company: d.company || d.contact?.name || d.contact?.call_name || 'Sem empresa',
      value: Number(d.value) || 0,
      stage: d.stage,
      stageId: d.stage_id,
      ownerAvatar: d.owner?.avatar || 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
      ownerId: d.owner_id,
      ownerName: d.owner?.name,
      tags: d.tags || [],
      dueDate: d.due_date,
      priority: (d.priority || 'medium') as 'low' | 'medium' | 'high',
      contactId: d.contact_id,
      contactName: d.contact?.name || d.contact?.call_name,
      contactPhone: d.contact?.phone_number,
      contactEmail: d.contact?.email,
      wonAt: d.won_at,
      lostAt: d.lost_at,
      lostReason: d.lost_reason,
      clientMemory: d.contact?.client_memory || null,
      conversationId: convMap.get(d.contact_id) ?? undefined,
    }));
  },

  // Pipeline Stages CRUD
  fetchPipelineStages: async (): Promise<any[]> => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching pipeline stages:', error);
      throw error;
    }

    return data.map(stage => ({
      id: stage.id,
      title: stage.title,
      color: stage.color,
      position: stage.position,
      isSystem: stage.is_system,
      isActive: stage.is_active,
      isAiManaged: stage.is_ai_managed || false,
      aiTriggerCriteria: stage.ai_trigger_criteria
    }));
  },

  createPipelineStage: async (stage: { title: string; color: string; isAiManaged?: boolean; aiTriggerCriteria?: string }): Promise<any> => {
    const userId = await getCurrentUserId();
    
    // Get the highest position for all active stages
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('position')
      .eq('is_active', true)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = stages && stages.length > 0 ? stages[0].position + 1 : 0;

    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({
        title: stage.title,
        color: stage.color,
        position: nextPosition,
        is_system: false,
        is_active: true,
        is_ai_managed: stage.isAiManaged || false,
        ai_trigger_criteria: stage.aiTriggerCriteria || null,
        user_id: null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pipeline stage:', error);
      throw error;
    }

    // Clear cache since stages changed
    clearStagesCache();

    return {
      id: data.id,
      title: data.title,
      color: data.color,
      position: data.position,
      isSystem: data.is_system,
      isActive: data.is_active,
      isAiManaged: data.is_ai_managed || false,
      aiTriggerCriteria: data.ai_trigger_criteria
    };
  },

  updatePipelineStage: async (id: string, updates: any): Promise<void> => {
    const dbUpdates: any = {};
    
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isAiManaged !== undefined) dbUpdates.is_ai_managed = updates.isAiManaged;
    if (updates.aiTriggerCriteria !== undefined) dbUpdates.ai_trigger_criteria = updates.aiTriggerCriteria;

    const { error } = await supabase
      .from('pipeline_stages')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating pipeline stage:', error);
      throw error;
    }
    
    // Clear cache since stages changed
    clearStagesCache();
  },

  deletePipelineStage: async (id: string, moveToStageId?: string): Promise<void> => {
    // If moveToStageId is provided, move all deals to that stage first
    if (moveToStageId) {
      const { error: moveError } = await supabase
        .from('deals')
        .update({ stage_id: moveToStageId })
        .eq('stage_id', id);

      if (moveError) {
        console.error('Error moving deals:', moveError);
        throw moveError;
      }
    }

    // Delete the stage
    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting pipeline stage:', error);
      throw error;
    }
    
    // Clear cache since stages changed
    clearStagesCache();
  },

  reorderPipelineStages: async (stageIds: string[]): Promise<void> => {
    // Update position for each stage
    const updates = stageIds.map((id, index) => 
      supabase
        .from('pipeline_stages')
        .update({ position: index })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Error reordering stages:', errors);
      throw errors[0].error;
    }
  },

  /**
   * Create a new deal
   */
  createDeal: async (deal: {
    contact_id: string;
    title: string;
    company?: string;
    value?: number;
    stage?: string;
    stage_id?: string;
    priority?: string;
    tags?: string[];
    due_date?: string;
    owner_id?: string;
    notes?: string;
  }): Promise<Deal> => {
    const userId = await getCurrentUserId();
    
    // Remove undefined stage_id to let DB use default
    const dealData: any = { ...deal, user_id: userId };
    if (!dealData.stage_id) {
      delete dealData.stage_id;
    }
    
    const { data, error } = await supabase
      .from('deals')
      .insert([dealData])
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating deal:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      company: data.company || 'Sem empresa',
      value: Number(data.value) || 0,
      stage: data.stage ?? '',
      stageId: data.stage_id,
      ownerAvatar: 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
      tags: data.tags || [],
      dueDate: data.due_date ?? undefined,
      priority: (data.priority ?? 'medium') as 'low' | 'medium' | 'high',
    };
  },

  /**
   * Update a deal
   */
  updateDeal: async (id: string, updates: Partial<{
    title: string;
    company: string;
    value: number;
    stage: string;
    priority: string;
    tags: string[];
    due_date: string;
    owner_id: string;
    notes: string;
    lost_reason: string;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating deal:', error);
      throw error;
    }
  },

  /**
   * Delete a deal
   */
  deleteDeal: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting deal:', error);
      throw error;
    }
  },

  /**
   * Move deal to a new stage
   * Clears won_at/lost_at/lost_reason when moving away from Ganho/Perdido
   */
  moveDealStage: async (id: string, newStageId: string): Promise<void> => {
    const { ganhoId, perdidoId } = await getSystemStageIds();
    
    // Build update object - clear won_at/lost_at if moving away from those stages
    const updates: Record<string, any> = { stage_id: newStageId };
    
    if (newStageId !== ganhoId && newStageId !== perdidoId) {
      updates.won_at = null;
      updates.lost_at = null;
      updates.lost_reason = null;
      updates.stage = 'in_progress';
    }
    
    const { error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error moving deal stage:', error);
      throw error;
    }
  },

  /**
   * Mark deal as won
   */
  markDealWon: async (dealId: string): Promise<void> => {
    const { ganhoId } = await getSystemStageIds();
    
    if (!ganhoId) {
      console.error('[API] Ganho stage not found');
      throw new Error('Stage "Ganho" not found in pipeline');
    }
    
    const { error } = await supabase
      .from('deals')
      .update({ 
        stage: 'won',
        stage_id: ganhoId,
        won_at: new Date().toISOString()
      })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error marking deal as won:', error);
      throw error;
    }
  },

  /**
   * Mark deal as lost with reason
   */
  markDealLost: async (dealId: string, reason: string): Promise<void> => {
    const { perdidoId } = await getSystemStageIds();
    
    if (!perdidoId) {
      console.error('[API] Perdido stage not found');
      throw new Error('Stage "Perdido" not found in pipeline');
    }
    
    const { error } = await supabase
      .from('deals')
      .update({ 
        stage: 'lost',
        stage_id: perdidoId,
        lost_at: new Date().toISOString(),
        lost_reason: reason
      })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error marking deal as lost:', error);
      throw error;
    }
  },

  /**
   * Update deal owner
   */
  updateDealOwner: async (dealId: string, ownerId: string): Promise<void> => {
    const { data, error } = await supabase
      .from('deals')
      .update({ owner_id: ownerId })
      .eq('id', dealId)
      .select('id')
      .maybeSingle();
      
    if (error) {
      console.error('[API] Error updating deal owner:', error);
      throw error;
    }

    if (!data) {
      throw new Error('Deal not found or owner update not permitted');
    }
  },

  /**
   * Fetch activities for a deal
   */
  fetchDealActivities: async (dealId: string): Promise<any[]> => {
    const { data, error } = await supabase
      .from('deal_activities')
      .select(`
        *,
        created_by_member:team_members!deal_activities_created_by_fkey(name)
      `)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching deal activities:', error);
      throw error;
    }
    
    return data || [];
  },

  /**
   * Create a new deal activity
   */
  createDealActivity: async (activity: {
    dealId: string;
    type: 'note' | 'call' | 'email' | 'meeting' | 'task';
    title: string;
    description?: string;
    scheduledAt?: string;
    createdBy?: string;
  }): Promise<any> => {
    const { data, error } = await supabase
      .from('deal_activities')
      .insert({
        deal_id: activity.dealId,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        scheduled_at: activity.scheduledAt,
        created_by: activity.createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating deal activity:', error);
      throw error;
    }
    
    return data;
  },

  /**
   * Update a deal activity
   */
  updateDealActivity: async (id: string, updates: {
    title?: string;
    description?: string;
    scheduledAt?: string;
    isCompleted?: boolean;
  }): Promise<void> => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.scheduledAt !== undefined) dbUpdates.scheduled_at = updates.scheduledAt;
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }

    const { error } = await supabase
      .from('deal_activities')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating deal activity:', error);
      throw error;
    }
  },

  /**
   * Delete a deal activity
   */
  deleteDealActivity: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('deal_activities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting deal activity:', error);
      throw error;
    }
  },

  /**
   * Fetch conversations with messages from database
   * Carrega as INBOX_PAGE_SIZE mensagens MAIS RECENTES de cada conversa
   * (desc + reverse). Trazer as mais antigas fazia o operador ler o começo do
   * relacionamento achando que era o presente.
   */
  fetchConversations: async (): Promise<InboxConversation[]> => {
    console.log('[API] Fetching conversations from Supabase...');

    // Fetch active conversations with contact data
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (convError) {
      console.error('[API] Error fetching conversations:', convError);
      throw convError;
    }

    if (!conversations || conversations.length === 0) {
      console.log('[API] No conversations found');
      return [];
    }

    console.log(`[API] Found ${conversations.length} conversations`);

    // Não lidas contadas em UMA consulta sobre todas as conversas: contar
    // dentro da página de 30 mensagens truncaria o badge de um lead quente.
    const conversationIds = conversations.map((conv: any) => conv.id);
    const unreadByConversation = new Map<string, number>();
    const { data: unreadRows, error: unreadError } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('from_type', 'user')
      .neq('status', 'read')
      .limit(5000);

    if (unreadError) {
      console.error('[API] Error counting unread messages:', unreadError);
    } else {
      (unreadRows || []).forEach((row: any) => {
        unreadByConversation.set(
          row.conversation_id,
          (unreadByConversation.get(row.conversation_id) || 0) + 1
        );
      });
    }

    // Fetch messages for each conversation
    const conversationsWithMessages: InboxConversation[] = await Promise.all(
      conversations.map(async (conv) => {
        // +1 para saber se existe página anterior sem uma segunda consulta.
        const { data: rows, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(INBOX_PAGE_SIZE + 1);

        if (msgError) {
          console.error(`[API] Error fetching messages for ${conv.id}:`, msgError);
        }

        const descending = (rows || []) as unknown as DBMessage[];
        const hasMore = descending.length > INBOX_PAGE_SIZE;
        const page = hasMore ? descending.slice(0, INBOX_PAGE_SIZE) : descending;

        const inbox = toInboxConversation(
          conv as unknown as DBConversation,
          [...page].reverse(),
          hasMore
        );

        return unreadError
          ? inbox
          : { ...inbox, unreadCount: unreadByConversation.get(conv.id) || 0 };
      })
    );

    return conversationsWithMessages;
  },

  /**
   * Página anterior do histórico de uma conversa ("carregar anteriores").
   * Devolve em ordem cronológica e diz se ainda há mais para trás.
   */
  fetchOlderMessages: async (
    conversationId: string,
    beforeSentAt: string,
    limit: number = INBOX_PAGE_SIZE
  ): Promise<{ messages: InboxMessage[]; hasMore: boolean }> => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      // lte, e nao lt: o whatsapp-webhook grava sent_at a partir de um
      // timestamp em SEGUNDOS (whatsapp-webhook/index.ts:270), entao duas
      // mensagens do mesmo segundo tem sent_at identico. Com lt, as que
      // caissem no mesmo segundo da borda da pagina sumiam do historico
      // para sempre. O chamador descarta por id o que ja tem.
      .lte('sent_at', beforeSentAt)
      .order('sent_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      console.error('[API] Error fetching older messages:', error);
      throw error;
    }

    const descending = (data || []) as unknown as DBMessage[];
    const hasMore = descending.length > limit;
    const page = hasMore ? descending.slice(0, limit) : descending;

    return { messages: [...page].reverse().map(toInboxMessage), hasMore };
  },

  /**
   * Busca por conteúdo de mensagem: devolve os ids das conversas que têm
   * alguma mensagem com o termo. Nome e telefone são filtrados na lista já
   * carregada; só o conteúdo precisa ir ao banco.
   */
  searchConversationsByMessage: async (term: string): Promise<string[]> => {
    const cleaned = term.trim();
    if (cleaned.length < 2) return [];

    const { data, error } = await supabase
      .from('messages')
      .select('conversation_id')
      .ilike('content', `%${escapeLikeTerm(cleaned)}%`)
      .order('sent_at', { ascending: false })
      .limit(300);

    if (error) {
      console.error('[API] Error searching messages:', error);
      throw error;
    }

    return Array.from(new Set((data || []).map((row: any) => row.conversation_id).filter(Boolean)));
  },

  /**
   * Reenfileira uma mensagem que a Meta recusou.
   * Volta o registro para 'processing', limpa o erro anterior e joga o mesmo
   * conteúdo em send_queue — o mesmo caminho de um envio normal.
   */
  resendMessage: async (messageId: string): Promise<void> => {
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('id, conversation_id, type, metadata')
      .eq('id', messageId)
      .single();

    if (msgError || !message) {
      console.error('[API] Error loading message to resend:', msgError);
      throw new Error('Mensagem não encontrada');
    }

    // O envio manual do chat só produz texto; mídia recusada precisaria do
    // media_id na fila e não tem caminho de reenvio hoje.
    if (message.type !== 'text') {
      throw new Error('Só é possível reenviar mensagem de texto.');
    }

    const metadata = { ...(message.metadata as Record<string, any> || {}) };
    delete metadata.send_error;
    await supabase.from('messages').update({ metadata }).eq('id', messageId);

    // send_queue tem RLS sem policy para authenticated (hardening de 24/jul):
    // inserir direto daqui falha silenciosamente. A RPC valida a membership no
    // workspace da conversa e enfileira com privilégio.
    const { error: rpcError } = await supabase.rpc('enqueue_outbound_message', {
      _conversation_id: message.conversation_id,
      _message_id: messageId,
    });

    if (rpcError) {
      console.error('[API] Error queueing resend:', rpcError);
      await supabase
        .from('messages')
        .update({ status: 'failed', metadata: message.metadata })
        .eq('id', messageId);
      throw rpcError;
    }

    try {
      await supabase.functions.invoke('whatsapp-sender');
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender on resend:', err);
    }
  },

  /**
   * Troca quem responde a conversa e deixa registro de quem assumiu.
   * O registro vai em conversations.metadata.takeover (e não numa mensagem
   * falsa na thread, que entraria no histórico lido pela agente).
   */
  setConversationHandling: async (
    conversationId: string,
    status: 'lara' | 'human' | 'paused',
    operatorName: string | null
  ): Promise<{ byName: string | null; at: string } | null> => {
    const { data: current, error: readError } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();

    if (readError) {
      console.error('[API] Error reading conversation metadata:', readError);
      throw readError;
    }

    const metadata = { ...(current?.metadata as Record<string, any> || {}) };
    let takeover: { byName: string | null; at: string } | null = null;

    if (status === 'human') {
      const at = new Date().toISOString();
      metadata.takeover = { by_name: operatorName, at };
      takeover = { byName: operatorName, at };
    } else {
      delete metadata.takeover;
    }

    const { error } = await supabase
      .from('conversations')
      .update({ status, metadata })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error updating conversation handling:', error);
      throw error;
    }

    return takeover;
  },

  /**
   * Send a message (insert into send_queue for human messages)
   * Returns the ID of the created message
   */
  sendMessage: async (conversationId: string, content: string): Promise<string> => {
    console.log(`[API] Sending message to conversation ${conversationId}`);

    // Uma única RPC cria a mensagem e enfileira o envio. Antes eram dois
    // inserts do front, e o segundo (send_queue) batia em RLS sem policy: a
    // mensagem aparecia na tela e nunca saía.
    const { data: messageId, error } = await supabase.rpc('enqueue_outbound_message', {
      _conversation_id: conversationId,
      _content: content,
    });

    if (error || !messageId) {
      console.error('[API] Error queueing message:', error);
      throw error ?? new Error('Não foi possível enfileirar a mensagem');
    }

    console.log('[API] Message queued for sending:', messageId);

    // Dispara o sender para não esperar a varredura do cron.
    try {
      const { error: triggerError } = await supabase.functions.invoke('whatsapp-sender');
      if (triggerError) {
        console.error('[API] Error triggering whatsapp-sender:', triggerError);
      }
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender:', err);
    }

    return messageId as string;
  },

  /**
   * Update conversation status (lara/human/paused)
   */
  updateConversationStatus: async (
    conversationId: string, 
    status: 'lara' | 'human' | 'paused'
  ): Promise<void> => {
    const { error } = await supabase
      .from('conversations')
      .update({ status })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error updating conversation status:', error);
      throw error;
    }

    console.log(`[API] Conversation ${conversationId} status updated to ${status}`);
  },

  /**
   * Mark all unread messages in a conversation as read
   */
  markMessagesAsRead: async (conversationId: string): Promise<void> => {
    const { error } = await supabase
      .from('messages')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('from_type', 'user')
      .in('status', ['sent', 'delivered']);

    if (error) {
      console.error('[API] Error marking messages as read:', error);
      throw error;
    }

    console.log(`[API] Messages marked as read for conversation ${conversationId}`);
  },

  /**
   * Assign conversation to a team member and sync with deal
   */
  assignConversation: async (conversationId: string, userId: string | null, contactId: string): Promise<void> => {
    // Update conversation
    const { error: convError } = await supabase
      .from('conversations')
      .update({ assigned_user_id: userId })
      .eq('id', conversationId);

    if (convError) {
      console.error('[API] Error assigning conversation:', convError);
      throw convError;
    }

    // Update deal(s) with same contact_id
    const { error: dealError } = await supabase
      .from('deals')
      .update({ owner_id: userId })
      .eq('contact_id', contactId);

    if (dealError) {
      console.error('[API] Error updating deal owner:', dealError);
      throw dealError;
    }

    console.log(`[API] Conversation ${conversationId} and deals assigned to user ${userId}`);
  },

  /**
   * Update contact notes
   */
  updateContactNotes: async (contactId: string, notes: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ notes })
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error updating contact notes:', error);
      throw error;
    }
  },

  /**
   * Block/unblock contact
   */
  toggleContactBlock: async (contactId: string, blocked: boolean, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ 
        is_blocked: blocked,
        blocked_at: blocked ? new Date().toISOString() : null,
        blocked_reason: blocked ? reason : null
      })
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error toggling contact block:', error);
      throw error;
    }
  },

  /**
   * Fetch tag definitions
   */
  fetchTagDefinitions: async () => {
    const { data, error } = await supabase
      .from('tag_definitions')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true });
    
    if (error) {
      console.error('[API] Error fetching tag definitions:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Update contact tags
   */
  updateContactTags: async (contactId: string, tags: string[]): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ tags })
      .eq('id', contactId);
    
    if (error) {
      console.error('[API] Error updating contact tags:', error);
      throw error;
    }
  },

  /**
   * Create new tag definition
   */
  createTagDefinition: async (tag: { key: string; label: string; color: string; category: string }) => {
    const userId = await getCurrentUserId();
    
    const { data, error } = await supabase
      .from('tag_definitions')
      .insert({
        key: tag.key,
        label: tag.label,
        color: tag.color,
        category: tag.category,
        is_active: true,
        user_id: null
      })
      .select()
      .single();
    
    if (error) {
      console.error('[API] Error creating tag definition:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch recent messages for a conversation (for deal drawer)
   */
  fetchConversationMessages: async (conversationId: string, limit: number = 10): Promise<any[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, from_type, type, sent_at, media_url')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[API] Error fetching conversation messages:', error);
      return [];
    }

    return (data || []).reverse(); // Reverter para ordem cronológica
  },
};

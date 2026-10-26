import {
  Campaign,
  CampaignStatus,
  Message,
  MessageStatus,
  CampaignFolder,
  CampaignTag,
  CreateCampaignFolderDTO,
  UpdateCampaignFolderDTO,
  CreateCampaignTagDTO,
} from '../types';
import type { MissingParamDetail } from '../lib/whatsapp/template-contract';

interface CreateCampaignInput {
  name: string;
  templateName: string;
  recipients: number;
  selectedContacts?: {
    id?: string;
    contactId?: string;
    contact_id?: string;
    name: string;
    phone: string;
    email?: string | null;
    custom_fields?: Record<string, unknown>;
  }[];
  selectedContactIds?: string[];  // For resume functionality
  scheduledAt?: string;           // ISO timestamp for scheduling
  templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> };   // Meta API structure
  // Flow/MiniApp fields
  flowId?: string | null;
  flowName?: string | null;
  // Organização
  folderId?: string | null;
  // Se true, salva como rascunho sem disparar
  isDraft?: boolean;
  // A/B Testing
  abTestEnabled?: boolean;
  abTemplateNameB?: string;
  abTemplateVariablesB?: { header: string[], body: string[], buttons?: Record<string, string> };
  abSplitRatio?: number;
  // Auto-replies (Story 001)
  quickReplyResponses?: Record<string, string> | null;
  fallbackResponse?: string | null;
}

export interface CampaignListParams {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  folderId?: string | null;  // null = todas, 'none' = sem pasta
  tagIds?: string[];         // IDs das tags para filtrar
}

export interface CampaignListResult {
  data: Campaign[];
  total: number;
  limit: number;
  offset: number;
}

interface RealMessageStatus {
  phone: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
  timestamp?: string;
  sentAt?: string; // Alternativo ao timestamp
  webhookStatus?: 'delivered' | 'read' | 'failed'; // From Meta webhook
  webhookTimestamp?: string;
}

// Helper para extrair timestamp de forma segura
function getTimestamp(msg: RealMessageStatus): string {
  const ts = msg.timestamp || msg.sentAt;
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString('pt-BR');
  } catch {
    return '-';
  }
}

interface CampaignStatusResponse {
  campaignId: string;
  stats: {
    sent: number;
    delivered: number;
    read: number;
    skipped?: number;
    failed: number;
    total: number;
  };
  messages: RealMessageStatus[];
}

interface PrecheckContactInput {
  id?: string;
  contactId?: string;
  contact_id?: string;
  name?: string;
  phone: string;
  email?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface CampaignPrecheckResult {
  ok: true;
  templateName: string;
  totals: { total: number; valid: number; skipped: number };
  results: Array<
    | { ok: true; contactId?: string; name: string; phone: string; normalizedPhone: string }
    | {
        ok: false;
        contactId?: string;
        name: string;
        phone: string;
        normalizedPhone?: string;
        skipCode: string;
        reason: string;
        missing?: MissingParamDetail[];
      }
  >;
}

export const campaignService = {
  list: async (params: CampaignListParams): Promise<CampaignListResult> => {
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(params.limit));
    searchParams.set('offset', String(params.offset));
    if (params.search) searchParams.set('search', params.search);
    if (params.status && params.status !== 'All') searchParams.set('status', params.status);
    if (params.folderId) searchParams.set('folderId', params.folderId);
    if (params.tagIds && params.tagIds.length > 0) searchParams.set('tagIds', params.tagIds.join(','));

    const response = await fetch(`/api/campaigns?${searchParams.toString()}`);
    if (!response.ok) {
      console.error('Failed to fetch campaigns:', response.statusText);
      return { data: [], total: 0, limit: params.limit, offset: params.offset };
    }
    return response.json();
  },

  getAll: async (): Promise<Campaign[]> => {
    // Fetch from real API
    const response = await fetch('/api/campaigns');
    if (!response.ok) {
      console.error('Failed to fetch campaigns:', response.statusText);
      return [];
    }
    return response.json();
  },

  getById: async (id: string): Promise<Campaign | undefined> => {
    // Fetch from Database (SOURCE OF TRUTH for persisted data)
    const response = await fetch(`/api/campaigns/${id}`);
    if (!response.ok) {
      if (response.status === 404) return undefined;
      console.error('Failed to fetch campaign:', response.statusText);
      return undefined;
    }

    // Importante: este endpoint já é no-store/force-dynamic.
    // Chamadas extras ao endpoint /api/campaign/[id]/status eram redundantes (hoje ele lê do mesmo DB)
    // e, quando cacheado por edge, causavam atraso perceptível na UI.
    return await response.json();
  },

  /**
   * Igual ao getById, mas distingue "não existe" (404) de falha transitória
   * (5xx, rede, sessão expirando) — quem guarda cache negativo só deve fazê-lo no 404.
   */
  lookupById: async (
    id: string
  ): Promise<{ status: 'found'; campaign: Campaign } | { status: 'not_found' } | { status: 'error' }> => {
    try {
      const response = await fetch(`/api/campaigns/${id}`);
      if (response.status === 404) return { status: 'not_found' };
      if (!response.ok) return { status: 'error' };
      return { status: 'found', campaign: (await response.json()) as Campaign };
    } catch {
      return { status: 'error' };
    }
  },

  getMetrics: async (id: string): Promise<any | null> => {
    try {
      const response = await fetch(`/api/campaigns/${id}/metrics`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  },

  // INSTANT: Get pending messages - returns empty array (real data comes from getMessages)
  getPendingMessages: (_id: string): Message[] => {
    // During creation, messages are pending. After dispatch, use getMessages() for real status.
    return [];
  },

  // ASYNC: Get real message status from campaign_contacts table (paginated)
  getMessages: async (id: string, options?: { limit?: number; offset?: number; status?: string; includeRead?: boolean }): Promise<{
    messages: Message[];
    stats: { total: number; pending: number; sent: number; delivered: number; read: number; skipped: number; failed: number };
    pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.status) params.set('status', options.status);
    if (options?.includeRead) params.set('includeRead', '1');

    const url = `/api/campaigns/${id}/messages${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Failed to fetch messages:', response.statusText);
      return { messages: [], stats: { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, skipped: 0, failed: 0 }, pagination: { limit: 50, offset: 0, total: 0, hasMore: false } };
    }
    return response.json();
  },

  // Busca status em tempo real
  getRealStatus: async (id: string): Promise<CampaignStatusResponse | null> => {
    try {
      const response = await fetch(`/api/campaign/${id}/status`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch real status:', error);
    }
    return null;
  },

  create: async (input: CreateCampaignInput): Promise<Campaign> => {
    const { name, templateName, recipients, selectedContacts, selectedContactIds, scheduledAt, templateVariables, flowId, flowName, folderId, isDraft, abTestEnabled, abTemplateNameB, abTemplateVariablesB, abSplitRatio, quickReplyResponses, fallbackResponse } = input;

    // 1. Create campaign in Database (source of truth) with contacts
    const response = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        templateName,
        recipients,
        scheduledAt,
        selectedContactIds,
        contacts: selectedContacts, // Pass contacts to be saved in campaign_contacts
        templateVariables, // Pass template variables to be saved in database
        status: scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.SENDING,
        flowId,   // Flow/MiniApp ID (se template usar Flow)
        flowName, // Flow name para exibição
        folderId, // Organização por pasta
        // A/B Testing
        abTestEnabled,
        abTemplateNameB,
        abTemplateVariablesB,
        abSplitRatio,
        // Auto-replies (Story 001)
        quickReplyResponses,
        fallbackResponse,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create campaign');
    }

    const newCampaign = await response.json();

    // 2. If saving as draft, don't dispatch - keep as DRAFT status
    if (isDraft) {
      console.log(`Campaign ${newCampaign.id} saved as draft`);
      return newCampaign;
    }

    // 3. If scheduled for later, don't dispatch now
    if (scheduledAt) {
      console.log(`Campaign ${newCampaign.id} scheduled for ${scheduledAt}`);
      return newCampaign;
    }

    // 4. Dispatch to Backend immediately (Execution)
    // Se o dispatch falhar (ex.: QSTASH_TOKEN ausente), precisamos falhar visivelmente
    // para o usuário não ficar com campanha "Enviando" sem nada sair.
    if (selectedContacts && selectedContacts.length > 0) {
      await campaignService.dispatchToBackend(newCampaign.id, templateName, selectedContacts, templateVariables)
    }

    return newCampaign;
  },

  // Dry-run: valida contatos/variáveis SEM criar campanha e SEM persistir.
  precheck: async (input: { templateName: string; contacts: PrecheckContactInput[]; templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> } }): Promise<CampaignPrecheckResult> => {
    const response = await fetch('/api/campaign/precheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: input.templateName,
        contacts: input.contacts,
        templateVariables: input.templateVariables,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao validar destinatários')
    }
    return payload as CampaignPrecheckResult
  },

  // Internal: dispatch campaign to backend queue
  dispatchToBackend: async (campaignId: string, templateName: string, contacts?: { id?: string; contactId?: string; name: string; phone: string; email?: string | null; custom_fields?: Record<string, unknown> }[], templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> }): Promise<void> => {
    try {
      // Allow omitting contacts: backend will load from campaign_contacts (preferred for scheduled/clone/start).
      // When provided, contacts must include contactId to satisfy dispatch hardening.

      // Não envie credenciais do frontend: servidor busca credenciais salvas (Supabase/env)
      const response = await fetch('/api/campaign/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          templateName,
          ...(contacts && contacts.length > 0 ? { contacts } : {}),
          templateVariables, // Pass template variables to workflow
          // whatsappCredentials buscadas no servidor (Supabase/env)
        })
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        let details = text
        try {
          const parsed = JSON.parse(text)
          const base = parsed?.error || 'Falha ao iniciar envio'
          const extra = parsed?.details ? String(parsed.details) : ''
          details = extra ? `${base}: ${extra}` : base
        } catch {
          // keep raw text
        }
        console.error('Dispatch failed:', details)
        throw new Error(details || 'Falha ao iniciar envio')
      }
      return;
    } catch (error) {
      console.error('Failed to dispatch campaign to backend:', error);
      throw error;
    }
  },

  // Re-enqueue only skipped contacts after revalidation
  resendSkipped: async (campaignId: string): Promise<{ status: string; resent: number; stillSkipped: number; message?: string }> => {
    const response = await fetch(`/api/campaigns/${campaignId}/resend-skipped`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const base = payload?.error || 'Falha ao reenviar ignorados'
      const details = payload?.details ? String(payload.details) : ''
      throw new Error(details ? `${base}: ${details}` : base)
    }
    return payload
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('Failed to delete campaign');
    }
  },

  duplicate: async (id: string): Promise<Campaign> => {
    const response = await fetch(`/api/campaigns/${id}/clone`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to duplicate campaign');
    }
    return response.json();
  },

  // Pause a running campaign
  pause: async (id: string): Promise<Campaign | undefined> => {
    // Update Database first (source of truth)
    const updateResponse = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: CampaignStatus.PAUSED,
        pausedAt: new Date().toISOString(),
      }),
    });

    if (!updateResponse.ok) {
      console.error('Failed to pause campaign in Database');
      return undefined;
    }

    const campaign = await updateResponse.json();

    // Fire-and-forget: notify backend to pause queue processing
    // Não bloqueia a UI enquanto o backend processa
    fetch(`/api/campaign/${id}/pause`, { method: 'POST' })
      .catch((error) => console.error('Failed to pause campaign on backend:', error));

    return campaign;
  },

  // Resume a paused campaign
  resume: async (id: string): Promise<Campaign | undefined> => {
    // Get campaign from Database
    const campaign = await campaignService.getById(id);
    if (!campaign) return undefined;

    // Update status in Database
    const updateResponse = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: CampaignStatus.SENDING,
        pausedAt: null,
      }),
    });

    if (!updateResponse.ok) {
      console.error('Failed to resume campaign in Database');
      return undefined;
    }

    const updatedCampaign = await updateResponse.json();

    // Fire-and-forget: notify backend to resume processing
    // Não bloqueia a UI enquanto o backend processa
    fetch(`/api/campaign/${id}/resume`, { method: 'POST' })
      .catch((error) => console.error('Failed to resume campaign on backend:', error));

    return updatedCampaign;
  },

  // Cancel a sending campaign (terminal)
  cancel: async (id: string): Promise<Campaign | undefined> => {
    const response = await fetch(`/api/campaign/${id}/cancel`, { method: 'POST' })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      const base = payload?.error || 'Falha ao cancelar envio'
      const details = payload?.details ? String(payload.details) : ''
      throw new Error(details ? `${base}: ${details}` : base)
    }

    return payload?.campaign as Campaign | undefined
  },

  // Start a scheduled or draft campaign immediately
  // Optimized: retorna resultado do PATCH diretamente ao invés de fazer getById extra
  start: async (id: string): Promise<Campaign | undefined> => {
    console.log('🚀 Starting campaign:', { id });

    // Get campaign from Database first to get templateVariables and templateName
    const campaignData = await campaignService.getById(id);
    if (!campaignData) {
      console.error('❌ Campaign not found!');
      return undefined;
    }

    // Prefer backend to load recipients snapshot from campaign_contacts.
    // This avoids losing custom_fields when starting scheduled/duplicated campaigns.
    try {
      await campaignService.dispatchToBackend(
        id,
        campaignData.templateName,
        undefined,
        campaignData.templateVariables as { header: string[], body: string[], buttons?: Record<string, string> } | undefined
      )
    } catch (e) {
      console.error('❌ Failed to dispatch campaign to backend:', e)
      return undefined
    }

    // Atualiza estado imediatamente no DB para a UI não ficar "Iniciar Agora" enquanto já está enviando.
    // O workflow também setará status/startedAt, mas isso pode demorar alguns segundos.
    const nowIso = new Date().toISOString()

    // Clear scheduledAt once dispatch is queued.
    const updateResponse = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: CampaignStatus.SENDING,
        startedAt: (campaignData as any).startedAt || nowIso,
        scheduledAt: null,
        qstashScheduleMessageId: null,
        qstashScheduleEnqueuedAt: null,
      }),
    });

    if (!updateResponse.ok) {
      console.warn('Failed to clear scheduled fields after dispatch');
      // Retorna dados originais com status atualizado otimisticamente
      return { ...campaignData, status: CampaignStatus.SENDING };
    }

    // Retorna diretamente o resultado do PATCH (evita getById extra)
    return updateResponse.json();
  },

  // Cancel a scheduled campaign (QStash one-shot)
  cancelSchedule: async (id: string): Promise<{ ok: boolean; campaign?: Campaign | null; error?: string }> => {
    const response = await fetch(`/api/campaigns/${id}/cancel-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, error: payload?.error || 'Falha ao cancelar agendamento' }
    }

    return { ok: true, campaign: payload?.campaign ?? null }
  },

  // Update campaign stats from real-time polling
  // Optimized: fetch realStatus and campaign in parallel
  updateStats: async (id: string): Promise<Campaign | undefined> => {
    // Parallel fetch - both requests start at the same time
    const [realStatus, campaign] = await Promise.all([
      campaignService.getRealStatus(id),
      campaignService.getById(id),
    ]);

    // If no campaign, return early
    if (!campaign) return undefined;

    // If realStatus has data, update the campaign
    if (realStatus && realStatus.stats.total > 0) {
      const isComplete = realStatus.stats.sent + realStatus.stats.failed >= campaign.recipients;

      // Update in Database
      const response = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sent: realStatus.stats.sent,
          delivered: realStatus.stats.delivered,
          read: realStatus.stats.read,
          failed: realStatus.stats.failed,
          status: isComplete ? CampaignStatus.COMPLETED : campaign.status,
          completedAt: isComplete ? new Date().toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        console.error('Failed to update campaign stats');
        return campaign;
      }

      return response.json();
    }

    // No realStatus data, return campaign as-is
    return campaign;
  },

  // Get traces for a campaign (debug/executions)
  getTraces: async (id: string, limit?: number): Promise<{
    traces: Array<{
      traceId: string
      source: 'run_metrics' | 'campaign_contacts'
      createdAt?: string | null
      lastSeenAt?: string | null
      recipients?: number | null
      sentTotal?: number | null
      failedTotal?: number | null
      skippedTotal?: number | null
    }>
  }> => {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(id)}/trace?limit=${limit || 50}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao carregar execuções')
    }

    return {
      traces: Array.isArray(payload?.traces) ? payload.traces : [],
    }
  },

  // Get trace events (timeline) for a specific trace
  getTraceEvents: async (
    id: string,
    params: {
      traceId: string
      limit?: number
      offset?: number
      phase?: string
      ok?: 'all' | 'ok' | 'fail'
    }
  ): Promise<{
    events: Array<{
      id: string
      trace_id: string
      ts: string
      step: string | null
      phase: string
      ok: boolean | null
      ms: number | null
      batch_index: number | null
      contact_id: string | null
      phone_masked: string | null
      extra: Record<string, unknown> | null
    }>
    pagination: { total: number }
  }> => {
    const searchParams = new URLSearchParams()
    searchParams.set('traceId', params.traceId)
    searchParams.set('limit', String(params.limit || 200))
    searchParams.set('offset', String(params.offset || 0))
    if (params.phase?.trim()) searchParams.set('phase', params.phase.trim())
    if (params.ok === 'ok') searchParams.set('ok', '1')
    if (params.ok === 'fail') searchParams.set('ok', '0')

    const response = await fetch(`/api/campaigns/${encodeURIComponent(id)}/trace-events?${searchParams}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || 'Falha ao carregar timeline')
    }

    return {
      events: Array.isArray(payload?.events) ? payload.events : [],
      pagination: { total: typeof payload?.pagination?.total === 'number' ? payload.pagination.total : 0 },
    }
  },

  // ============================================================================
  // FOLDERS
  // ============================================================================

  listFolders: async (): Promise<{
    folders: CampaignFolder[];
    totalCount: number;
    unfiledCount: number;
  }> => {
    const response = await fetch('/api/campaigns/folders');
    if (!response.ok) {
      console.error('Failed to fetch folders:', response.statusText);
      return { folders: [], totalCount: 0, unfiledCount: 0 };
    }
    return response.json();
  },

  createFolder: async (dto: CreateCampaignFolderDTO): Promise<CampaignFolder> => {
    const response = await fetch('/api/campaigns/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao criar pasta');
    }
    return response.json();
  },

  updateFolder: async (id: string, dto: UpdateCampaignFolderDTO): Promise<CampaignFolder> => {
    const response = await fetch(`/api/campaigns/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao atualizar pasta');
    }
    return response.json();
  },

  deleteFolder: async (id: string): Promise<void> => {
    const response = await fetch(`/api/campaigns/folders/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao deletar pasta');
    }
  },

  // ============================================================================
  // TAGS
  // ============================================================================

  listTags: async (): Promise<CampaignTag[]> => {
    const response = await fetch('/api/campaigns/tags');
    if (!response.ok) {
      console.error('Failed to fetch tags:', response.statusText);
      return [];
    }
    return response.json();
  },

  createTag: async (dto: CreateCampaignTagDTO): Promise<CampaignTag> => {
    const response = await fetch('/api/campaigns/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao criar tag');
    }
    return response.json();
  },

  deleteTag: async (id: string): Promise<void> => {
    const response = await fetch(`/api/campaigns/tags/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao deletar tag');
    }
  },

  // ============================================================================
  // CAMPAIGN ORGANIZATION
  // ============================================================================

  updateCampaignFolder: async (campaignId: string, folderId: string | null): Promise<Campaign> => {
    const response = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao atualizar pasta da campanha');
    }
    return response.json();
  },

  updateCampaignTags: async (campaignId: string, tagIds: string[]): Promise<Campaign> => {
    const response = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || 'Falha ao atualizar tags da campanha');
    }
    return response.json();
  },
};

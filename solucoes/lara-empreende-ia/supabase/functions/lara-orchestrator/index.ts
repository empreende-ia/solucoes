import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runLaraAgent,
  fetchCanonicalFacts,
  buildGroundingSection,
  buildEnhancedPrompt,
  processPromptTemplate,
  resolveModelSettings,
  modelForTier,
} from "../_shared/lara-engine.ts";
import { ensureEdgeSecrets } from "../_shared/system-config.ts";
import { resolveOpenAIKey } from "../_shared/llm.ts";
import {
  fetchPublishedAgentRuntimeConfigForConversation,
  RESOLUTION_MESSAGES,
  type PublishedAgentRuntimeConfig,
} from "../_shared/agent-config.ts";
import {
  getActionPolicy,
  hasExplicitConfirmation,
  validateScheduleRequest, isPastInTimezone } from "../_shared/action-policy.ts";
import { redactSensitiveText, redactSensitiveValue } from "../_shared/privacy.ts";
import { buildIdempotencyKey } from "../_shared/action-audit.ts";
import { resolveEmptyReplyFallback } from "../_shared/reply-fallback.ts";
import { consumeRateLimit, RateLimitError } from "../_shared/rate-limit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

const checkAvailabilityTool = {
  type: "function",
  function: {
    name: "check_availability",
    description: "Consultar se uma data e horário estão livres antes de propor ou confirmar um agendamento. Esta ação não cria evento.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Data no formato YYYY-MM-DD" },
        time: { type: "string", description: "Horário no formato HH:MM" },
        duration: { type: "number", description: "Duração em minutos" },
      },
      required: ["date", "time"],
    },
  },
};

// Tool definition for appointment creation
const createAppointmentTool = {
  type: "function",
  function: {
    name: "create_appointment",
    description: "Criar um agendamento/reunião/demo para o cliente. Use quando o cliente solicitar agendar algo, confirmar uma data/horário para reunião, demo ou suporte.",
    parameters: {
      type: "object",
      properties: {
        title: { 
          type: "string", 
          description: "Título do agendamento (ex: 'Demo do Produto', 'Reunião de Kickoff', 'Suporte Técnico')" 
        },
        date: { 
          type: "string", 
          description: "Data no formato YYYY-MM-DD. Use a data mencionada pelo cliente." 
        },
        time: { 
          type: "string", 
          description: "Horário no formato HH:MM (24h). Ex: '14:00', '09:30'" 
        },
        duration: { 
          type: "number", 
          description: "Duração em minutos. Padrão: 60. Opções comuns: 15, 30, 45, 60, 90, 120" 
        },
        type: { 
          type: "string", 
          enum: ["demo", "meeting", "support", "followup"],
          description: "Tipo do agendamento: demo (demonstração), meeting (reunião geral), support (suporte técnico), followup (acompanhamento)" 
        },
        description: { 
          type: "string", 
          description: "Descrição ou pauta da reunião. Resuma o que será discutido." 
        },
        confirmation_evidence: {
          type: "string",
          description: "Trecho literal recente escrito pelo lead que confirma data e horário. Sem essa evidência, não execute.",
        },
      },
      required: ["title", "date", "time", "type", "confirmation_evidence"]
    }
  }
};

// Tool definition for rescheduling appointments
const rescheduleAppointmentTool = {
  type: "function",
  function: {
    name: "reschedule_appointment",
    description: "Reagendar um agendamento existente do cliente. Use quando o cliente pedir para mudar a data ou horário de um agendamento já existente.",
    parameters: {
      type: "object",
      properties: {
        new_date: { 
          type: "string", 
          description: "Nova data no formato YYYY-MM-DD" 
        },
        new_time: { 
          type: "string", 
          description: "Novo horário no formato HH:MM (24h). Ex: '14:00', '09:30'" 
        },
        reason: { 
          type: "string", 
          description: "Motivo do reagendamento (opcional)" 
        },
        confirmation_evidence: {
          type: "string",
          description: "Trecho literal recente escrito pelo lead autorizando o novo dia e horário.",
        },
      },
      required: ["new_date", "new_time", "confirmation_evidence"]
    }
  }
};

// Tool definition for canceling appointments
const cancelAppointmentTool = {
  type: "function",
  function: {
    name: "cancel_appointment",
    description: "Cancelar um agendamento existente do cliente. Use quando o cliente pedir para cancelar ou desmarcar um agendamento.",
    parameters: {
      type: "object",
      properties: {
        reason: { 
          type: "string", 
          description: "Motivo do cancelamento" 
        },
        confirmation_evidence: {
          type: "string",
          description: "Trecho literal recente escrito pelo lead confirmando o cancelamento.",
        },
      },
      required: ["confirmation_evidence"]
    }
  }
};

const humanHandoffTool = {
  type: "function",
  function: {
    name: "human_handoff",
    description: "Transferir a conversa para atendimento humano. Use em pedido explícito do lead ou quando a política publicada exigir handoff.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo objetivo do encaminhamento" },
        summary: { type: "string", description: "Resumo factual e curto para a equipe humana" },
        confirmation_evidence: {
          type: "string",
          description: "Trecho literal recente escrito pelo lead pedindo ou aceitando o atendimento humano.",
        },
      },
      required: ["reason", "summary", "confirmation_evidence"],
    },
  },
};

// Regra fixa da plataforma: opt-out independe da configuração comercial da
// agente. A ferramenta transforma o pedido explícito em estado persistente.
const registerOptOutTool = {
  type: "function",
  function: {
    name: "register_opt_out",
    description: "Registrar imediatamente que o lead não quer mais receber mensagens e pausar a conversa. Use quando ele pedir para parar, sair da lista ou não receber novos contatos.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo curto e factual" },
        confirmation_evidence: {
          type: "string",
          description: "Trecho literal recente escrito pelo lead pedindo para não receber novas mensagens.",
        },
      },
      required: ["reason", "confirmation_evidence"],
    },
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // O endpoint drena uma fila global com service role. Apenas webhooks, cron e
  // outras Edge Functions internas podem acioná-lo; um JWT comum não basta.
  const { requireServiceRole } = await import("../_shared/auth.ts");
  const authFail = requireServiceRole(req, corsHeaders);
  if (authFail) return authFail;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Lara] Starting orchestration...');

    // Mantém os secrets do Vault em dia (cron sweeps dependem deles) —
    // idempotente: a RPC só escreve quando o valor mudou
    await ensureEdgeSecrets(supabase);

    // Claim batch of messages to process
    const { data: queueItems, error: claimError } = await supabase
      .rpc('claim_lara_processing_batch', { p_limit: 10 });

    if (claimError) {
      console.error('[Lara] Error claiming batch:', claimError);
      throw claimError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('[Lara] No messages to process');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Lara] Processing ${queueItems.length} messages`);

    let processed = 0;

    for (const item of queueItems) {
      let runtimeContext: PublishedAgentRuntimeConfig | null = null;
      try {
        // Renova o lease ANTES de cada item: num lote de 10 itens longos, o
        // item 8 começaria com o updated_at do claim já com vários minutos —
        // outro sweep o resgataria como "morto" enquanto ele está vivo aqui,
        // e o lead receberia duas respostas.
        await supabase
          .from('lara_processing_queue')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'processing');
        // Get user_id from conversation to fetch correct settings
        const { data: conversation } = await supabase
          .from('conversations')
          .select('user_id, workspace_id')
          .eq('id', item.conversation_id)
          .single();

        if (!conversation) {
          console.log('[Lara] Conversation not found:', item.conversation_id);
          await supabase
            .from('lara_processing_queue')
            .update({ 
              status: 'failed', 
              processed_at: new Date().toISOString(),
              error_message: 'Conversation not found'
            })
            .eq('id', item.id);
          continue;
        }

        // Buscar settings com fallback triplo (user_id → global → any)
        let settings = null;
        
        // 1. Tentar buscar por user_id da conversa
        if (conversation.user_id) {
          const { data: userSettings } = await supabase
            .from('lara_settings')
            .select('*')
            .eq('user_id', conversation.user_id)
            .maybeSingle();
          settings = userSettings;
          if (settings) {
            console.log('[Lara] Found settings for user:', conversation.user_id);
          }
        }
        
        // 2. Se não encontrou, tentar buscar global (user_id is null)
        if (!settings) {
          console.log('[Lara] No user-specific settings, trying global...');
          const { data: globalSettings } = await supabase
            .from('lara_settings')
            .select('*')
            .is('user_id', null)
            .maybeSingle();
          settings = globalSettings;
          if (settings) {
            console.log('[Lara] Found global settings (user_id is null)');
          }
        }
        
        // 3. Último fallback: buscar qualquer settings existente
        if (!settings) {
          console.log('[Lara] No global settings, fetching any available...');
          const { data: anySettings } = await supabase
            .from('lara_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
          settings = anySettings;
          if (settings) {
            console.log('[Lara] Using fallback settings from:', settings.id);
          }
        }

        // Use default settings if nothing found
        const effectiveSettings = settings || {
          is_active: true,
          auto_response_enabled: true,
          ai_model_mode: 'flash',
          response_delay_min: 1000,
          response_delay_max: 3000,
          message_breaking_enabled: false,
          audio_response_enabled: false,
          elevenlabs_api_key: null,
          ai_scheduling_enabled: true,
          user_id: conversation.user_id
        };
        
        if (!settings) {
          console.log('[Lara] No settings found in database, using hardcoded defaults');
        }

        // Check if Lara is active for this user
        if (!effectiveSettings.is_active) {
          console.log('[Lara] Lara is disabled for user:', conversation.user_id);
          await supabase
            .from('lara_processing_queue')
            .update({ 
              status: 'completed', 
              processed_at: new Date().toISOString(),
              error_message: 'Lara disabled for this user'
            })
            .eq('id', item.id);
          continue;
        }

        // Produção lê exclusivamente o ponteiro publicado do agente. O
        // armazenamento operacional legado continua contendo integrações e
        // preferências de modelo, mas nunca mais fornece o comportamento.
        // Resolve pelo WORKSPACE DA CONVERSA. Resolver por user_id fazia toda
        // mensagem real falhar: o lead não é usuário do sistema, então a
        // conversa nasce com user_id nulo.
        const resolution = await fetchPublishedAgentRuntimeConfigForConversation(
          supabase,
          conversation,
        );
        if (!resolution.ok) {
          const motivo = RESOLUTION_MESSAGES[resolution.reason];
          console.error(`[Lara] Atendimento bloqueado (${resolution.reason}): ${motivo}`);
          await supabase
            .from('lara_processing_queue')
            .update({
              status: 'failed',
              processed_at: new Date().toISOString(),
              error_message: motivo,
            })
            .eq('id', item.id);

          // agent_runtime_events exige agent_version_id NOT NULL — por
          // definição não existe versão nesta falha. O rastro fica na própria
          // fila (error_message acima), lido pela RPC conversation_delivery_trace.
          continue;
        }
        const publishedAgent = resolution.config;
        runtimeContext = publishedAgent;
        const systemPrompt = publishedAgent.compiledPrompt;
        
        console.log('[Lara] Processing with settings:', {
          is_active: effectiveSettings.is_active,
          auto_response_enabled: effectiveSettings.auto_response_enabled,
          ai_model_mode: effectiveSettings.ai_model_mode,
          has_compiled_prompt: true,
          agent_version_id: publishedAgent.versionId,
          agent_version_number: publishedAgent.versionNumber,
          has_whatsapp_config: !!effectiveSettings.whatsapp_phone_number_id,
          has_elevenlabs: !!effectiveSettings.elevenlabs_api_key,
        });
        
        await processQueueItem(supabase, item, systemPrompt, effectiveSettings, publishedAgent);
        
        // Mark as completed
        await supabase
          .from('lara_processing_queue')
          .update({ 
            status: 'completed', 
            processed_at: new Date().toISOString() 
          })
          .eq('id', item.id);
        
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Lara] Error processing item ${item.id}:`, error);

        if (runtimeContext) {
          const { error: eventError } = await supabase.from('agent_runtime_events').insert({
            workspace_id: runtimeContext.workspaceId,
            agent_id: runtimeContext.agentId,
            agent_version_id: runtimeContext.versionId,
            conversation_id: item.conversation_id || null,
            source_message_id: item.message_id || null,
            event_kind: 'error',
            compiler_version: runtimeContext.compilerVersion,
            route: 'orchestrator',
            error_code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
            metadata: {
              queue_item_id: item.id,
              retry_count: item.retry_count || 0,
              error_message: redactSensitiveText(errorMessage, 500),
            },
          });
          if (eventError) console.error('[Lara] Failed to persist runtime error event:', eventError);
        }
        
        // Mark as failed with retry
        const newRetryCount = (item.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < 3;
        
        await supabase
          .from('lara_processing_queue')
          .update({ 
            status: shouldRetry ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: redactSensitiveText(errorMessage, 500),
            scheduled_for: shouldRetry 
              ? new Date(Date.now() + newRetryCount * 30000).toISOString() 
              : null
          })
          .eq('id', item.id);
      }
    }

    console.log(`[Lara] Processed ${processed}/${queueItems.length} messages`);

    return new Response(JSON.stringify({ processed, total: queueItems.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Lara] Orchestrator error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Generate audio using ElevenLabs
async function generateAudioElevenLabs(settings: any, text: string): Promise<ArrayBuffer | null> {
  if (!settings.elevenlabs_api_key) {
    console.log('[Lara] ElevenLabs API key not configured');
    return null;
  }

  try {
    const voiceId = settings.elevenlabs_voice_id || '33B4UnXyTNbgLmdEDh5P'; // Keren - Young Brazilian Female
    const model = settings.elevenlabs_model || 'eleven_turbo_v2_5';

    console.log('[Lara] Generating audio with ElevenLabs, voice:', voiceId);

    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': settings.elevenlabs_api_key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: settings.elevenlabs_stability || 0.75,
          similarity_boost: settings.elevenlabs_similarity_boost || 0.80,
          style: settings.elevenlabs_style || 0.30,
          use_speaker_boost: settings.elevenlabs_speaker_boost !== false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Lara] ElevenLabs error:', response.status, errorText);
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('[Lara] Error generating audio:', error);
    return null;
  }
}

// Upload audio to Supabase Storage
async function uploadAudioToStorage(
  supabase: any, 
  audioBuffer: ArrayBuffer, 
  conversationId: string
): Promise<string | null> {
  try {
    const fileName = `${conversationId}/${Date.now()}.mp3`;
    
    const { data, error } = await supabase.storage
      .from('audio-messages')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600'
      });

    if (error) {
      console.error('[Lara] Error uploading audio:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('audio-messages')
      .getPublicUrl(fileName);

    console.log('[Lara] Audio uploaded:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('[Lara] Error uploading audio to storage:', error);
    return null;
  }
}

// Create appointment from AI tool call
// Helper function to parse time string to minutes
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

async function checkAvailabilityFromAI(
  supabase: any,
  workspaceId: string,
  args: { date: string; time: string; duration?: number },
  excludedAppointmentId?: string,
): Promise<any> {
  let query = supabase
    .from('appointments')
    .select('id, time, duration, title')
    .eq('workspace_id', workspaceId)
    .eq('date', args.date)
    .eq('status', 'scheduled');
  if (excludedAppointmentId) query = query.neq('id', excludedAppointmentId);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const requestedStart = parseTimeToMinutes(args.time);
  const requestedEnd = requestedStart + (args.duration || 60);
  const conflict = (data || []).find((existing: any) => {
    const existingStart = parseTimeToMinutes(String(existing.time).slice(0, 5));
    const existingEnd = existingStart + (existing.duration || 60);
    return requestedStart < existingEnd && requestedEnd > existingStart;
  });

  return conflict
    ? { success: true, available: false, conflict: { time: conflict.time, title: conflict.title } }
    : { success: true, available: true, date: args.date, time: args.time, duration: args.duration || 60 };
}

async function runAuditedAction(
  supabase: any,
  context: {
    workspaceId: string;
    versionId: string | null;
    conversationId: string;
    contactId: string;
    sourceMessageId: string;
    actionKey: string;
    input: Record<string, unknown>;
  },
  execute: () => Promise<any>,
): Promise<any> {
  // A chave inclui um hash dos argumentos: duas chamadas legítimas da mesma
  // ferramenta na mesma mensagem (dois horários consultados) não podem colidir
  // — a colisão devolvia à segunda o resultado da primeira.
  const idempotencyKey = buildIdempotencyKey(context.sourceMessageId, context.actionKey, context.input);
  const { data: run, error: insertError } = await supabase
    .from('agent_action_runs')
    .insert({
      workspace_id: context.workspaceId,
      agent_version_id: context.versionId,
      conversation_id: context.conversationId,
      contact_id: context.contactId,
      source_message_id: context.sourceMessageId,
      action_key: context.actionKey,
      mode: 'live',
      idempotency_key: idempotencyKey,
      input: redactSensitiveValue(context.input),
    })
    .select('id')
    .single();

  if (insertError?.code === '23505') {
    const { data: existing } = await supabase
      .from('agent_action_runs')
      .select('status, output, error_code')
      .eq('workspace_id', context.workspaceId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing?.status === 'succeeded') return { ...existing.output, replayed: true };
    return {
      success: false,
      error: existing?.error_code || 'action_state_unknown',
      message: 'A ação já foi tentada nesta mensagem e não será repetida automaticamente.',
    };
  }
  if (insertError) return { success: false, error: insertError.message };

  try {
    await consumeRateLimit(supabase, {
      workspaceId: context.workspaceId,
      subjectKey: context.conversationId,
      operation: 'runtime_tool',
      maxRequests: 30,
      windowSeconds: 60,
    });
    const output = await execute();
    const succeeded = output?.success === true;
    await supabase
      .from('agent_action_runs')
      .update({
        status: succeeded ? 'succeeded' : 'failed',
        output: redactSensitiveValue(output),
        error_code: succeeded ? null : redactSensitiveText(String(output?.error || 'action_failed'), 160),
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return output;
  } catch (error) {
    const message = error instanceof RateLimitError
      ? 'action_rate_limited'
      : redactSensitiveText(error instanceof Error ? error.message : 'action_failed', 160);
    await supabase
      .from('agent_action_runs')
      .update({ status: 'failed', error_code: message, finished_at: new Date().toISOString() })
      .eq('id', run.id);
    return { success: false, error: message };
  }
}

// Mantém o efeito da tool independente do provedor de agenda: o agendamento
// local sempre é concluído e a integração registra eventual erro para retry.
async function syncAppointmentToExternalCalendar(
  appointmentId: string,
  action: 'sync_event' | 'delete_event' = 'sync_event',
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return;
    const response = await fetch(`${supabaseUrl}/functions/v1/nylas-calendar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, appointmentId }),
    });
    if (!response.ok) {
      console.error('[Lara] Calendar sync failed:', response.status, await response.text());
    }
  } catch (error) {
    console.error('[Lara] Calendar sync request failed:', error);
  }
}

async function createAppointmentFromAI(
  supabase: any,
  workspaceId: string,
  contactId: string,
  conversationId: string,
  sourceMessageId: string,
  userId: string | null,
  args: {
    title: string;
    date: string;
    time: string;
    duration?: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    description?: string;
    bufferMinutes?: number;
  }
): Promise<any> {
  console.log('[Lara] Creating appointment from AI:', args, 'for user:', userId);
  
  // Validate date is not in the past — na parede de relógio do fuso da agenda.
  // new Date('...T14:30:00') sem sufixo é interpretado como UTC no Deno, o que
  // deslocava São Paulo em 3 horas e rejeitava agendamentos válidos próximos.
  if (isPastInTimezone(args.date, args.time, (args as any).timeZone || 'America/Sao_Paulo')) {
    console.log('[Lara] Attempted to create appointment in the past, skipping');
    return { error: 'date_in_past' };
  }
  
  // Check for time conflicts (only for this user's appointments)
  const query = supabase
    .from('appointments')
    .select('id, time, duration, title')
    .eq('workspace_id', workspaceId)
    .eq('date', args.date)
    .eq('status', 'scheduled');
  
  if (userId) {
    query.eq('user_id', userId);
  }
  
  const { data: existingAppointments } = await query;
  
  const requestedStart = parseTimeToMinutes(args.time) - (args.bufferMinutes || 0);
  const requestedDuration = args.duration || 60;
  const requestedEnd = parseTimeToMinutes(args.time) + requestedDuration + (args.bufferMinutes || 0);
  
  for (const existing of existingAppointments || []) {
    const existingStart = parseTimeToMinutes(existing.time);
    const existingEnd = existingStart + (existing.duration || 60);
    
    // Check for overlap: new appointment starts before existing ends AND new appointment ends after existing starts
    if (requestedStart < existingEnd && requestedEnd > existingStart) {
      console.log('[Lara] Time conflict detected with appointment:', existing.id);
      return { 
        error: 'time_conflict', 
        conflictWith: existing.time,
        conflictTitle: existing.title 
      };
    }
  }
  
  const insertData: any = {
    workspace_id: workspaceId,
    title: args.title,
    date: args.date,
    time: args.time,
    duration: args.duration || 60,
    type: args.type,
    description: args.description || null,
    contact_id: contactId,
    status: 'scheduled',
    metadata: {
      source: 'lara_ai',
      conversation_id: conversationId,
      source_message_id: sourceMessageId,
      created_at_conversation: new Date().toISOString()
    }
  };
  
  // Add user_id if available (for RLS compliance)
  if (userId) {
    insertData.user_id = userId;
  }
  
  const { data, error } = await supabase
    .from('appointments')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[Lara] Error creating appointment:', error);
    return { error: error.message };
  }

  await syncAppointmentToExternalCalendar(data.id);
  console.log('[Lara] Appointment created successfully:', data.id);
  return { success: true, appointment: data };
}

// Reschedule an existing appointment
async function rescheduleAppointmentFromAI(
  supabase: any,
  workspaceId: string,
  contactId: string,
  userId: string | null,
  args: {
    new_date: string;
    new_time: string;
    reason?: string;
    bufferMinutes?: number;
  }
): Promise<any> {
  console.log('[Lara] Rescheduling appointment for contact:', contactId, 'user:', userId, args);
  
  // Find the most recent scheduled appointment for this contact
  const query = supabase
    .from('appointments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .eq('status', 'scheduled')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(1);
  
  if (userId) {
    query.eq('user_id', userId);
  }
  
  const { data: existingAppointments } = await query;
  
  if (!existingAppointments || existingAppointments.length === 0) {
    console.log('[Lara] No appointment found to reschedule');
    return { error: 'no_appointment_found' };
  }
  
  const appointment = existingAppointments[0];
  
  // Validate new date is not in the past
  const newAppointmentDate = new Date(`${args.new_date}T${args.new_time}:00`);
  const now = new Date();
  
  if (newAppointmentDate < now) {
    console.log('[Lara] Attempted to reschedule to a past date');
    return { error: 'date_in_past' };
  }
  
  // Check for conflicts at new time (only for this user's appointments)
  const conflictQuery = supabase
    .from('appointments')
    .select('id, time, duration, title')
    .eq('workspace_id', workspaceId)
    .eq('date', args.new_date)
    .eq('status', 'scheduled')
    .neq('id', appointment.id);
  
  if (userId) {
    conflictQuery.eq('user_id', userId);
  }
  
  const { data: conflictingAppointments } = await conflictQuery;
  
  const requestedStart = parseTimeToMinutes(args.new_time) - (args.bufferMinutes || 0);
  const requestedEnd = parseTimeToMinutes(args.new_time) + (appointment.duration || 60) + (args.bufferMinutes || 0);
  
  for (const existing of conflictingAppointments || []) {
    const existingStart = parseTimeToMinutes(existing.time);
    const existingEnd = existingStart + (existing.duration || 60);
    
    if (requestedStart < existingEnd && requestedEnd > existingStart) {
      console.log('[Lara] Time conflict detected at new time');
      return { 
        error: 'time_conflict', 
        conflictWith: existing.time,
        conflictTitle: existing.title 
      };
    }
  }
  
  // Update the appointment
  const { data, error } = await supabase
    .from('appointments')
    .update({
      date: args.new_date,
      time: args.new_time,
      metadata: {
        ...appointment.metadata,
        rescheduled_at: new Date().toISOString(),
        rescheduled_reason: args.reason || null,
        previous_date: appointment.date,
        previous_time: appointment.time
      }
    })
    .eq('id', appointment.id)
    .select()
    .single();
  
  if (error) {
    console.error('[Lara] Error rescheduling appointment:', error);
    return { error: error.message };
  }

  await syncAppointmentToExternalCalendar(data.id);
  console.log('[Lara] Appointment rescheduled successfully:', data.id);
  return { success: true, appointment: { ...data, previous_date: appointment.date, previous_time: appointment.time } };
}

// Cancel an existing appointment
async function cancelAppointmentFromAI(
  supabase: any,
  workspaceId: string,
  contactId: string,
  userId: string | null,
  args: {
    reason?: string;
  }
): Promise<any> {
  console.log('[Lara] Canceling appointment for contact:', contactId, 'user:', userId);
  
  // Find the most recent scheduled appointment for this contact
  const query = supabase
    .from('appointments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .eq('status', 'scheduled')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(1);
  
  if (userId) {
    query.eq('user_id', userId);
  }
  
  const { data: existingAppointments } = await query;
  
  if (!existingAppointments || existingAppointments.length === 0) {
    console.log('[Lara] No appointment found to cancel');
    return { error: 'no_appointment_found' };
  }
  
  const appointment = existingAppointments[0];
  
  // Update status to cancelled
  const { data, error } = await supabase
    .from('appointments')
    .update({
      status: 'cancelled',
      metadata: {
        ...appointment.metadata,
        cancelled_at: new Date().toISOString(),
        cancelled_reason: args.reason || null,
        cancelled_by: 'lara_ai'
      }
    })
    .eq('id', appointment.id)
    .select()
    .single();
  
  if (error) {
    console.error('[Lara] Error canceling appointment:', error);
    return { error: error.message };
  }

  await syncAppointmentToExternalCalendar(data.id, 'delete_event');
  console.log('[Lara] Appointment cancelled successfully:', data.id);
  return { success: true, appointment: data };
}

async function handoffConversationFromAI(
  supabase: any,
  workspaceId: string,
  conversation: any,
  args: { reason: string; summary: string },
): Promise<any> {
  const { data, error } = await supabase
    .from('conversations')
    .update({
      status: 'human',
      metadata: {
        ...(conversation.metadata || {}),
        handoff: {
          workspace_id: workspaceId,
          reason: args.reason,
          summary: args.summary,
          requested_at: new Date().toISOString(),
          requested_by: 'lara_ai',
        },
      },
    })
    .eq('id', conversation.id)
    .select('id, status')
    .single();
  if (error) return { success: false, error: error.message };
  const memory = conversation.contact?.client_memory && typeof conversation.contact.client_memory === 'object'
    ? conversation.contact.client_memory
    : {};
  const leadState = memory.lead_state && typeof memory.lead_state === 'object' ? memory.lead_state : {};
  const { error: memoryError } = await supabase
    .from('contacts')
    .update({
      client_memory: {
        ...memory,
        lead_state: {
          ...leadState,
          handoff_requested: true,
          conversation_summary: args.summary || leadState.conversation_summary || '',
        },
      },
    })
    .eq('id', conversation.contact_id);
  if (memoryError) return { success: false, error: memoryError.message };
  return { success: true, handoff: data, reason: args.reason };
}

async function processQueueItem(
  supabase: any,
  item: any,
  systemPrompt: string,
  settings: any,
  runtimeAgent: PublishedAgentRuntimeConfig
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  console.log(`[Lara] Processing queue item: ${item.id}`);

  // Get the message
  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', item.message_id)
    .maybeSingle();

  if (!message) {
    throw new Error('Message not found');
  }

  // Get conversation with contact info
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*, contact:contacts(*)')
    .eq('id', item.conversation_id)
    .maybeSingle();

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Check if conversation is still in Lara mode
  if (conversation.status !== 'lara') {
    console.log('[Lara] Conversation no longer in Lara mode, skipping');
    return;
  }

  // Check if auto-response is enabled
  if (!settings?.auto_response_enabled) {
    console.log('[Lara] Auto-response disabled, marking as processed without responding');
    await supabase
      .from('messages')
      .update({ processed_by_lara: true })
      .eq('id', message.id);
    return;
  }

  // Get recent messages for context (last 20)
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: false })
    .limit(20);

  // Build conversation history for AI
  const conversationHistory = (recentMessages || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.from_type === 'user' ? 'user' : 'assistant',
      content: msg.content || '[media]'
    }));

  // Get client memory
  const clientMemory = conversation.contact?.client_memory || {};

  // Build enhanced system prompt with context
  const enhancedSystemPrompt = buildEnhancedPrompt(
    systemPrompt, 
    conversation.contact, 
    clientMemory
  );

  // Process template variables ({{ data_hora }}, {{ dia_semana }}, etc.)
  const processedPrompt = processPromptTemplate(enhancedSystemPrompt, conversation.contact);

  console.log('[Lara] Calling LLM (agent loop)...');

  // Get AI model settings based on user configuration
  const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);

  console.log('[Lara] Using AI settings:', aiSettings);

  // Grounding anti-alucinação: fatos canônicos + regras de verdade no prompt
  if (!runtimeAgent) throw new Error('Published agent context not available');
  const facts = await fetchCanonicalFacts(supabase, runtimeAgent.workspaceId);
  const groundedPrompt = processedPrompt + buildGroundingSection(facts);

  // A versão publicada é a autoridade das ações. Flags legadas não podem
  // habilitar uma ferramenta que o snapshot publicado desabilitou.
  const appointmentPolicy = getActionPolicy(runtimeAgent?.config, 'appointments');
  const handoffPolicy = getActionPolicy(runtimeAgent?.config, 'human_handoff');
  const extraTools: any[] = [registerOptOutTool];
  if (appointmentPolicy) extraTools.push(checkAvailabilityTool, createAppointmentTool, rescheduleAppointmentTool, cancelAppointmentTool);
  if (handoffPolicy) extraTools.push(humanHandoffTool);

  let appointmentCreated: any = null;

  const agentResult = await runLaraAgent({
    supabase,
    provider: aiSettings.provider,
    apiKeys: {
      anthropic: settings?.anthropic_api_key ?? null,
      openai: resolveOpenAIKey(settings),
    },
    model: aiSettings.model,
    temperature: aiSettings.temperature,
    systemPrompt: groundedPrompt,
    history: conversationHistory,
    extraTools,
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    workspaceId: runtimeAgent.workspaceId,
    executeExtraTool: async (name: string, args: any) => {
      const audit = (actionKey: string, execute: () => Promise<any>) => runAuditedAction(
        supabase,
        {
          workspaceId: runtimeAgent!.workspaceId,
          versionId: runtimeAgent!.versionId,
          conversationId: conversation.id,
          contactId: conversation.contact_id,
          sourceMessageId: message.id,
          actionKey,
          input: args,
        },
        execute,
      );

      if (name === 'check_availability' && appointmentPolicy && runtimeAgent) {
        const validation = validateScheduleRequest(args, appointmentPolicy);
        if (!validation.ok) return { result: { success: false, error: validation.code }, ok: false, summary: validation.code };
        const result = await audit(name, () => checkAvailabilityFromAI(
          supabase, runtimeAgent.workspaceId, {
            date: args.date,
            time: args.time,
            duration: args.duration || (appointmentPolicy.scheduling as any)?.durationMinutes,
          },
        ));
        return { result, ok: result.success === true, summary: result.available ? 'available' : 'time_conflict' };
      }

      const confirmed = hasExplicitConfirmation(conversationHistory, args.confirmation_evidence);
      if (!confirmed) {
        return {
          result: { success: false, error: 'explicit_confirmation_required', message: 'Peça ao lead para confirmar explicitamente antes de executar.' },
          ok: false,
          summary: 'explicit_confirmation_required',
        };
      }

      if (name === 'register_opt_out') {
        if (!runtimeAgent) return { result: { success: false, error: 'agent_not_published' }, ok: false };
        const result = await audit(name, async () => {
          const now = new Date().toISOString();
          const currentTags = Array.isArray(conversation.contact?.tags) ? conversation.contact.tags : [];
          const memory = conversation.contact?.client_memory && typeof conversation.contact.client_memory === 'object'
            ? conversation.contact.client_memory
            : {};
          const leadState = memory.lead_state && typeof memory.lead_state === 'object' ? memory.lead_state : {};
          const { error: contactError } = await supabase
            .from('contacts')
            .update({
              tags: Array.from(new Set([...currentTags, 'opt_out'])),
              client_memory: {
                ...memory,
                opt_out: true,
                opt_out_at: now,
                opt_out_reason: args.reason || null,
                lead_state: { ...leadState, opt_out: true },
              },
            })
            .eq('id', conversation.contact_id);
          if (contactError) return { success: false, error: contactError.message };
          const { error: conversationError } = await supabase
            .from('conversations')
            .update({ status: 'paused' })
            .eq('id', conversation.id);
          if (conversationError) return { success: false, error: conversationError.message };
          return { success: true, status: 'paused', registered_at: now };
        });
        return { result, ok: result.success === true, summary: result.error || 'opt_out_registered' };
      }

      if (name === 'create_appointment') {
        if (!appointmentPolicy || !runtimeAgent) return { result: { success: false, error: 'action_not_enabled' }, ok: false };
        const validation = validateScheduleRequest(args, appointmentPolicy);
        if (!validation.ok) return { result: { success: false, error: validation.code }, ok: false, summary: validation.code };
        const result = await audit(name, () => createAppointmentFromAI(
          supabase,
          runtimeAgent.workspaceId,
          conversation.contact_id,
          conversation.id,
          message.id,
          settings?.user_id || null,
          {
            ...args,
            duration: args.duration || (appointmentPolicy.scheduling as any)?.durationMinutes,
            timeZone: (appointmentPolicy.scheduling as any)?.timeZone,
            bufferMinutes: (appointmentPolicy.scheduling as any)?.bufferMinutes || 0,
          },
        ));
        appointmentCreated = result.success ? result.appointment : null;
        return {
          result,
          ok: result.success === true,
          summary: result.error || 'appointment_created',
        };
      }
      if (name === 'reschedule_appointment') {
        if (!appointmentPolicy || !runtimeAgent) return { result: { success: false, error: 'action_not_enabled' }, ok: false };
        const validation = validateScheduleRequest({ date: args.new_date, time: args.new_time }, appointmentPolicy);
        if (!validation.ok) return { result: { success: false, error: validation.code }, ok: false, summary: validation.code };
        const result = await audit(name, () => rescheduleAppointmentFromAI(
          supabase,
          runtimeAgent.workspaceId,
          conversation.contact_id,
          settings?.user_id || null,
          { ...args, bufferMinutes: (appointmentPolicy.scheduling as any)?.bufferMinutes || 0 },
        ));
        return { result, ok: result.success === true, summary: result.error || 'appointment_rescheduled' };
      }
      if (name === 'cancel_appointment') {
        if (!appointmentPolicy || !runtimeAgent) return { result: { success: false, error: 'action_not_enabled' }, ok: false };
        const result = await audit(name, () => cancelAppointmentFromAI(
          supabase, runtimeAgent.workspaceId, conversation.contact_id, settings?.user_id || null, args
        ));
        return { result, ok: result.success === true, summary: result.error || 'appointment_cancelled' };
      }
      if (name === 'human_handoff') {
        if (!handoffPolicy || !runtimeAgent) return { result: { success: false, error: 'action_not_enabled' }, ok: false };
        const result = await audit(name, () => handoffConversationFromAI(
          supabase, runtimeAgent.workspaceId, conversation, args
        ));
        return { result, ok: result.success === true, summary: result.error || 'human_handoff_completed' };
      }
      return { result: { erro: `Ferramenta desconhecida: ${name}` }, ok: false };
    },
  });

  let aiContent = agentResult.content;
  const grounding = agentResult.grounding;

  console.log('[Lara] Agent finished:', {
    iterations: agentResult.iterations,
    searches: grounding.searches.length,
    unanswered: grounding.unanswered.length,
    tool_events: grounding.tool_events.length,
  });

  // O que EFETIVAMENTE respondeu (o fallback pode ter trocado provedor/modelo)
  const effectiveAi = {
    provider: agentResult.usedProvider,
    model: agentResult.usedModel,
    fallback: agentResult.usedFallback,
  };
  if (agentResult.usedFallback) {
    console.warn(`[Lara] Provedor ${aiSettings.provider} falhou — resposta veio do fallback ${effectiveAi.provider}/${effectiveAi.model}`);
  }

  // Fallback for empty AI response - use default greeting instead of throwing error.
  // Se o motor degradou APÓS criar um agendamento real, confirma o agendamento
  // em vez de responder algo genérico (e nunca relança — relançar reprocessaria
  // o item da fila e duplicaria o efeito).
  if (!aiContent) {
    console.warn('[Lara] Empty AI response received (degraded:', agentResult.degraded, '), using fallback');
    // O fallback respeita o efeito colateral mais importante do turno: nunca
    // reengajar quem registrou opt-out, nunca retomar conversa já transferida.
    aiContent = resolveEmptyReplyFallback(grounding.tool_events, appointmentCreated);
  }

  console.log('[Lara] Final response length:', aiContent.length);

  // Calculate response time
  const responseTime = Date.now() - new Date(message.sent_at).getTime();

  // Update original message as processed
  await supabase
    .from('messages')
    .update({ 
      processed_by_lara: true,
      lara_response_time: responseTime
    })
    .eq('id', message.id);

  const toolSummaries = grounding.tool_events.map((event: any) => ({
    tool: event.tool,
    ok: event.ok === true,
    summary: event.summary || null,
  }));
  const sourceSummaries = grounding.searches.flatMap((search: any) => (
    (search.results || []).map((source: any) => ({
      query: search.query,
      source_type: source.source_type,
      title: source.title,
      rank: source.rank,
    }))
  ));
  const handoffObserved = toolSummaries.some((event: any) => event.tool === 'human_handoff' && event.ok);
  const guards = [
    ...(grounding.unanswered.length > 0 ? ['unknown_answer_policy'] : []),
    ...(toolSummaries.some((event: any) => event.summary === 'explicit_confirmation_required') ? ['explicit_confirmation_required'] : []),
    ...(toolSummaries.some((event: any) => event.tool === 'register_opt_out' && event.ok) ? ['opt_out'] : []),
  ];
  const { error: runtimeEventError } = await supabase.from('agent_runtime_events').insert({
    workspace_id: runtimeAgent.workspaceId,
    agent_id: runtimeAgent.agentId,
    agent_version_id: runtimeAgent.versionId,
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    source_message_id: message.id,
    event_kind: handoffObserved ? 'handoff' : 'response',
    compiler_version: runtimeAgent.compilerVersion,
    model_provider: effectiveAi.provider,
    model_name: effectiveAi.model,
    route: toolSummaries[0]?.tool || 'conversation',
    sources: sourceSummaries,
    tools: toolSummaries,
    guards,
    latency_ms: responseTime,
    handoff: handoffObserved,
    metadata: {
      used_fallback: effectiveAi.fallback,
      iterations: agentResult.iterations,
      unanswered_count: grounding.unanswered.length,
      response_characters: aiContent.length,
    },
  });
  if (runtimeEventError) console.error('[Lara] Failed to persist runtime observability:', runtimeEventError);

  // Add response delay if configured
  const delayMin = settings?.response_delay_min || 1000;
  const delayMax = settings?.response_delay_max || 3000;
  const delay = Math.random() * (delayMax - delayMin) + delayMin;

  // Check if audio response should be sent - pure mirroring: only respond with audio if incoming was audio
  const incomingWasAudio = message.type === 'audio';
  const shouldSendAudio = incomingWasAudio && settings?.elevenlabs_api_key;

  if (shouldSendAudio) {
    console.log(`[Lara] Audio response enabled (incoming was audio: ${incomingWasAudio})`);
    
    const audioBuffer = await generateAudioElevenLabs(settings, aiContent);
    
    if (audioBuffer) {
      const audioUrl = await uploadAudioToStorage(supabase, audioBuffer, conversation.id);
      
      if (audioUrl) {
        const { error: sendQueueError } = await supabase
          .from('send_queue')
          .insert({
            conversation_id: conversation.id,
            contact_id: conversation.contact_id,
            content: aiContent,
            from_type: 'lara',
            message_type: 'audio',
            media_url: audioUrl,
            priority: 1,
            scheduled_at: new Date(Date.now() + delay).toISOString(),
            metadata: {
              response_to_message_id: message.id,
              ai_model: effectiveAi.model,
              ai_provider: effectiveAi.provider,
              ai_fallback: effectiveAi.fallback,
              audio_generated: true,
              text_content: aiContent,
              appointment_created: appointmentCreated?.id || null,
              grounding: grounding || null
            }
          });

        if (sendQueueError) {
          console.error('[Lara] Error queuing audio response:', sendQueueError);
          throw sendQueueError;
        }

        console.log('[Lara] Audio response queued for sending');
      } else {
        console.log('[Lara] Failed to upload audio, falling back to text');
        await queueTextResponse(supabase, conversation, message, aiContent, settings, effectiveAi, delay, appointmentCreated, grounding);
      }
    } else {
      console.log('[Lara] Failed to generate audio, falling back to text');
      await queueTextResponse(supabase, conversation, message, aiContent, settings, effectiveAi, delay, appointmentCreated, grounding);
    }
  } else {
    await queueTextResponse(supabase, conversation, message, aiContent, settings, effectiveAi, delay, appointmentCreated, grounding);
  }

  // Trigger whatsapp-sender
  try {
    const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
    console.log('[Lara] Triggering whatsapp-sender at:', senderUrl);
    
    fetch(senderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ triggered_by: 'lara-orchestrator' })
    }).catch(err => console.error('[Lara] Error triggering whatsapp-sender:', err));
  } catch (err) {
    console.error('[Lara] Failed to trigger whatsapp-sender:', err);
  }

  // Trigger analyze-conversation
  fetch(`${supabaseUrl}/functions/v1/analyze-conversation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      user_message: message.content,
      ai_response: aiContent,
    })
  }).catch(err => console.error('[Lara] Error triggering analyze-conversation:', err));
}

// Helper function to queue text response with chunking
async function queueTextResponse(
  supabase: any,
  conversation: any,
  message: any,
  aiContent: string,
  settings: any,
  aiSettings: any,
  delay: number,
  appointmentCreated?: any,
  grounding?: any
) {
  // Break message into chunks if enabled
  const messageChunks = settings?.message_breaking_enabled 
    ? breakMessageIntoChunks(aiContent)
    : [aiContent];

  console.log(`[Lara] Sending ${messageChunks.length} text message chunk(s)`);

  // Queue each chunk for sending
  for (let i = 0; i < messageChunks.length; i++) {
    const chunkDelay = delay + (i * 1500);
    
    const { error: sendQueueError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        content: messageChunks[i],
        from_type: 'lara',
        message_type: 'text',
        priority: 1,
        scheduled_at: new Date(Date.now() + chunkDelay).toISOString(),
        metadata: {
          response_to_message_id: message.id,
          ai_model: aiSettings.model,
          ai_provider: aiSettings.provider,
          ai_fallback: aiSettings.fallback ?? false,
          chunk_index: i,
          total_chunks: messageChunks.length,
          appointment_created: appointmentCreated?.id || null,
          grounding: i === 0 ? (grounding || null) : null
        }
      });

    if (sendQueueError) {
      console.error('[Lara] Error queuing response chunk:', sendQueueError);
      throw sendQueueError;
    }
  }

  console.log('[Lara] Text response(s) queued for sending');
}


function breakMessageIntoChunks(content: string): string[] {
  const chunks = content
    .split(/\n\n+/)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);
  
  return chunks.length > 0 ? chunks : [content];
}

function getModelSettings(
  settings: any,
  conversationHistory: any[],
  message: any,
  contact: any,
  clientMemory: any
): { provider: 'anthropic' | 'openai'; model: string; temperature: number } {
  const resolved = resolveModelSettings(settings);
  if (!resolved.adaptive) {
    return { provider: resolved.provider, model: resolved.model, temperature: resolved.temperature };
  }
  // Adaptativo: a heurística escolhe o TIER; o modelo vem do provedor configurado.
  const adaptive = getAdaptiveTier(conversationHistory, message, clientMemory);
  return {
    provider: resolved.provider,
    model: modelForTier(resolved.provider, adaptive.tier),
    temperature: adaptive.temperature,
  };
}

function getAdaptiveTier(
  conversationHistory: any[],
  message: any,
  clientMemory: any
): { tier: 'low' | 'medium' | 'high'; temperature: number } {
  const messageCount = conversationHistory.length;
  const userContent = message.content?.toLowerCase() || '';

  const isComplaintKeywords = ['problema', 'erro', 'não funciona', 'reclamação', 'péssimo', 'horrível'];
  const isSalesKeywords = ['preço', 'valor', 'desconto', 'comprar', 'contratar', 'plano'];
  const isTechnicalKeywords = ['como funciona', 'integração', 'api', 'configurar', 'instalar'];
  const isUrgentKeywords = ['urgente', 'agora', 'rápido', 'emergência'];

  const isComplaint = isComplaintKeywords.some(k => userContent.includes(k));
  const isSales = isSalesKeywords.some(k => userContent.includes(k));
  const isTechnical = isTechnicalKeywords.some(k => userContent.includes(k));
  const isUrgent = isUrgentKeywords.some(k => userContent.includes(k));

  const qualificationScore = clientMemory?.lead_profile?.qualification_score || 0;

  // Semântica herdada do adaptativo original: alterna entre a classe padrão
  // (medium) e a mais cognitiva (high) — nunca rebaixa a abertura do funil
  // para o tier mais barato.
  if (isComplaint || isUrgent) return { tier: 'high', temperature: 0.3 };
  if (isSales && qualificationScore > 50) return { tier: 'medium', temperature: 0.5 };
  if (isTechnical) return { tier: 'high', temperature: 0.4 };
  if (messageCount < 5) return { tier: 'medium', temperature: 0.8 };
  if (messageCount > 15) return { tier: 'medium', temperature: 0.5 };
  return { tier: 'medium', temperature: 0.7 };
}

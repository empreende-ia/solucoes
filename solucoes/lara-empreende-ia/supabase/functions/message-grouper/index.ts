import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOpenAIKey } from "../_shared/llm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Endpoint interno: varre a fila global da plataforma, então exige a service
  // role (mesmo modelo do lara-orchestrator). Só o whatsapp-webhook, o cron e a
  // própria função (re-agendamento) chamam aqui — nenhum caminho de UI.
  const { requireServiceRole } = await import("../_shared/auth.ts");
  const authFail = requireServiceRole(req, corsHeaders);
  if (authFail) return authFail;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[MessageGrouper] Starting message grouping...');

    // Fetch messages ready to process (timer expired and not processed)
    const { data: readyMessages, error: fetchError } = await supabase
      .from('message_grouping_queue')
      .select('*')
      .eq('processed', false)
      .lte('process_after', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[MessageGrouper] Error fetching messages:', fetchError);
      throw fetchError;
    }

    if (!readyMessages || readyMessages.length === 0) {
      console.log('[MessageGrouper] No messages ready to process');
      
      // Check if there are pending messages with future process_after and schedule re-invocation
      await scheduleNextProcessing(supabase, supabaseUrl, supabaseServiceKey);
      
      return new Response(JSON.stringify({ processed: 0, groups: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[MessageGrouper] Found ${readyMessages.length} messages ready to process`);

    // Marca tudo como processado ANTES de agrupar para evitar processamento
    // duplicado por varreduras concorrentes. Se um grupo falhar, a flag é
    // revertida logo abaixo (requeueGroup) para o próximo ciclo tentar de novo —
    // sem isso a mensagem do lead se perdia silenciosamente.
    const readyIds = readyMessages.map(m => m.id);
    await supabase
      .from('message_grouping_queue')
      .update({ processed: true })
      .in('id', readyIds);

    console.log(`[MessageGrouper] Marked ${readyIds.length} messages as processed`);

    // Group messages by phone number
    const grouped: Record<string, typeof readyMessages> = {};
    for (const msg of readyMessages) {
      const phone = msg.message_data?.from;
      if (!phone) continue;
      if (!grouped[phone]) grouped[phone] = [];
      grouped[phone].push(msg);
    }

    const groupCount = Object.keys(grouped).length;
    console.log(`[MessageGrouper] Grouped into ${groupCount} phone numbers`);

    let processedCount = 0;

    // Process each group
    for (const [phoneNumber, messages] of Object.entries(grouped)) {
      try {
        console.log(`[MessageGrouper] Processing group for ${phoneNumber} with ${messages.length} messages`);

        // Get the phone_number_id from the first message
        const phoneNumberId = messages[0].phone_number_id;

        // Get owner settings for this phone_number_id
        const { data: ownerSettings } = await supabase
          .from('lara_settings')
          .select('user_id, whatsapp_access_token')
          .eq('whatsapp_phone_number_id', phoneNumberId)
          .maybeSingle();

        // Get all message_ids from the queue entries
        const messageIds = messages.map(m => m.message_id).filter(Boolean);
        
        if (messageIds.length === 0) {
          console.log(`[MessageGrouper] No message_ids found for group ${phoneNumber}, skipping`);
          continue;
        }

        // Fetch the actual messages from the database
        const { data: dbMessages, error: dbMsgError } = await supabase
          .from('messages')
          .select('*')
          .in('id', messageIds)
          .order('sent_at', { ascending: true });

        if (dbMsgError || !dbMessages || dbMessages.length === 0) {
          console.error('[MessageGrouper] Error fetching messages from DB:', dbMsgError);
          await requeueGroup(supabase, messages);
          continue;
        }

        // Get the last message's conversation for context
        const lastDbMessage = dbMessages[dbMessages.length - 1];
        const conversationId = lastDbMessage.conversation_id;

        // Get conversation details
        const { data: conversation } = await supabase
          .from('conversations')
          .select('*, contacts(*)')
          .eq('id', conversationId)
          .single();

        if (!conversation) {
          console.error('[MessageGrouper] Conversation not found:', conversationId);
          await requeueGroup(supabase, messages);
          continue;
        }

        // Combine content and handle audio transcription
        const combinedContent = await combineAndTranscribeMessages(
          supabase,
          messages,
          dbMessages,
          ownerSettings,
          resolveOpenAIKey(ownerSettings)
        );

        console.log(`[MessageGrouper] Combined content for ${phoneNumber}:`, combinedContent.substring(0, 200));

        // Update the last message with combined content if multiple messages
        if (dbMessages.length > 1) {
          await supabase
            .from('messages')
            .update({
              content: combinedContent,
              metadata: {
                ...lastDbMessage.metadata,
                grouped_messages: messageIds,
                message_count: messageIds.length
              }
            })
            .eq('id', lastDbMessage.id);
          
          console.log(`[MessageGrouper] Updated last message with combined content`);
        } else if (dbMessages[0].type === 'audio' && combinedContent.trim() && combinedContent !== dbMessages[0].content) {
          // Update single audio message with transcription
          await supabase
            .from('messages')
            .update({ content: combinedContent })
            .eq('id', dbMessages[0].id);
          
          console.log(`[MessageGrouper] Updated audio message with transcription`);
        }

        // If conversation is handled by Lara, queue for AI processing
        if (conversation.status === 'lara' && !combinedContent.trim()) {
          console.warn('[MessageGrouper] Grupo sem conteúdo utilizável — nada para a Lara responder', messageIds);
        }
        if (conversation.status === 'lara' && combinedContent.trim()) {
          // Check if already in queue to avoid duplicates
          const { data: existingQueue } = await supabase
            .from('lara_processing_queue')
            .select('id')
            .eq('message_id', lastDbMessage.id)
            .maybeSingle();

          if (!existingQueue) {
            const { error: laraQueueError } = await supabase
              .from('lara_processing_queue')
              .insert({
                message_id: lastDbMessage.id,
                conversation_id: conversationId,
                contact_id: conversation.contact_id,
                priority: 1,
                context_data: {
                  phone_number_id: phoneNumberId,
                  contact_name: conversation.contacts?.name || conversation.contacts?.call_name,
                  message_type: lastDbMessage.type,
                  grouped_count: messageIds.length,
                  combined_content: combinedContent
                }
              });

            if (laraQueueError) {
              // Índice único parcial em (message_id): duas execuções
              // concorrentes do grouper convergem aqui, e a que perde a
              // corrida recebe 23505 — é o dedupe funcionando, não erro.
              if (laraQueueError.code === '23505') {
                console.log('[MessageGrouper] Mensagem já enfileirada para a Lara (corrida entre execuções):', lastDbMessage.id);
              } else {
                console.error('[MessageGrouper] Error queuing for Lara:', laraQueueError);
              }
            } else {
              console.log('[MessageGrouper] Message queued for Lara processing');
              
              // Trigger lara-orchestrator — precisa de waitUntil, senão o runtime
              // pode encerrar o fetch quando a resposta HTTP retorna e a Lara só
              // responderia na próxima varredura do cron.
              const orchestratorCall = fetch(`${supabaseUrl}/functions/v1/lara-orchestrator`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`
                },
                body: JSON.stringify({ triggered_by: 'message-grouper' })
              }).catch(err => console.error('[MessageGrouper] Error triggering lara-orchestrator:', err));
              // deno-lint-ignore no-explicit-any
              (globalThis as any).EdgeRuntime?.waitUntil?.(orchestratorCall);
            }
          } else {
            console.log('[MessageGrouper] Message already in Lara queue, skipping');
          }
        }

        processedCount += messages.length;
        console.log(`[MessageGrouper] Group ${phoneNumber} processed successfully`);

      } catch (groupError) {
        console.error(`[MessageGrouper] Error processing group ${phoneNumber}:`, groupError);
        await requeueGroup(supabase, messages);
      }
    }

    console.log(`[MessageGrouper] Completed. Processed ${processedCount} messages in ${groupCount} groups`);

    // Check if there are more pending messages and schedule re-invocation
    await scheduleNextProcessing(supabase, supabaseUrl, supabaseServiceKey);

    return new Response(JSON.stringify({ 
      processed: processedCount, 
      groups: groupCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[MessageGrouper] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Número máximo de tentativas antes de desistir de um grupo. Sem isso, um grupo
// permanentemente quebrado seria reprocessado para sempre a cada varredura.
const MAX_GROUP_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;

/**
 * Devolve as mensagens de um grupo que falhou para a fila, com backoff.
 * O contador de tentativas vive em message_data._grouping_attempts para não
 * exigir mudança de schema.
 */
async function requeueGroup(supabase: any, queueMessages: any[]): Promise<void> {
  for (const queueMessage of queueMessages) {
    const attempts = Number(queueMessage.message_data?._grouping_attempts ?? 0) + 1;
    if (attempts >= MAX_GROUP_ATTEMPTS) {
      console.error(
        `[MessageGrouper] Giving up on queue item ${queueMessage.id} after ${attempts} attempts`,
      );
      continue;
    }
    const { error } = await supabase
      .from('message_grouping_queue')
      .update({
        processed: false,
        process_after: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
        message_data: { ...(queueMessage.message_data ?? {}), _grouping_attempts: attempts },
      })
      .eq('id', queueMessage.id);
    if (error) {
      console.error(`[MessageGrouper] Failed to requeue ${queueMessage.id}:`, error);
    }
  }
}

// Combine content from multiple messages and transcribe audio
async function combineAndTranscribeMessages(
  supabase: any,
  queueMessages: any[],
  dbMessages: any[],
  settings: any,
  openaiApiKey: string | null
): Promise<string> {
  const contentParts: string[] = [];

  for (let i = 0; i < queueMessages.length; i++) {
    const queueMsg = queueMessages[i];
    const dbMsg = dbMessages.find(m => m.id === queueMsg.message_id);
    const messageData = queueMsg.message_data;
    
    if (!dbMsg) continue;

    let content = dbMsg.content || '';

    // Handle audio transcription
    if (messageData.type === 'audio') {
      const audioMediaId = messageData.audio?.id;
      if (audioMediaId && settings?.whatsapp_access_token && openaiApiKey) {
        console.log('[MessageGrouper] Transcribing audio:', audioMediaId);
        const audioBuffer = await downloadWhatsAppMedia(settings, audioMediaId);
        if (audioBuffer) {
          const transcription = await transcribeAudio(audioBuffer, openaiApiKey);
          if (transcription) {
            content = transcription;
            // Update the message in database with transcription
            await supabase
              .from('messages')
              .update({ content: transcription })
              .eq('id', dbMsg.id);
          }
        }
      }
      // Transcrição indisponível (sem token, download falhou, modelo falhou):
      // o áudio vira um marcador explícito. Sem isto o placeholder era
      // filtrado adiante, o combinado saía vazio, o conteúdo da mensagem era
      // APAGADO e a Lara recebia texto vazio para responder.
      if (!content.trim() || content === '[áudio - processando transcrição...]') {
        content = '[áudio recebido — transcrição indisponível]';
        // CAS: só grava o marcador se a linha AINDA estiver em placeholder.
        // Sem a condição, uma execução concorrente cuja transcrição falhou
        // sobrescrevia a transcrição boa que a outra acabou de gravar.
        await supabase
          .from('messages')
          .update({ content })
          .eq('id', dbMsg.id)
          .in('content', ['', '[áudio - processando transcrição...]']);
      }
    }

    if (content && content !== '[áudio - processando transcrição...]') {
      contentParts.push(content);
    }
  }

  return contentParts.join('\n');
}

// Download media from WhatsApp API
async function downloadWhatsAppMedia(settings: any, mediaId: string): Promise<ArrayBuffer | null> {
  if (!settings?.whatsapp_access_token) {
    console.error('[MessageGrouper] No WhatsApp access token configured');
    return null;
  }

  try {
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`
        }
      }
    );

    if (!mediaInfoResponse.ok) {
      console.error('[MessageGrouper] Failed to get media info:', await mediaInfoResponse.text());
      return null;
    }

    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;

    if (!mediaUrl) {
      console.error('[MessageGrouper] No media URL in response');
      return null;
    }

    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`
      }
    });

    if (!mediaResponse.ok) {
      console.error('[MessageGrouper] Failed to download media:', await mediaResponse.text());
      return null;
    }

    return await mediaResponse.arrayBuffer();
  } catch (error) {
    console.error('[MessageGrouper] Error downloading media:', error);
    return null;
  }
}

// Transcreve áudio na OpenAI (Whisper); cascata de chave: UI → secret OPENAI_API_KEY
async function transcribeAudio(audioBuffer: ArrayBuffer, openaiApiKey: string | null): Promise<string | null> {
  try {
    console.log('[MessageGrouper] Transcribing audio, size:', audioBuffer.byteLength, 'bytes');

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MessageGrouper] Transcription error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    // Whisper pode devolver só espaços (áudio mudo); trim antes do || null
    // para whitespace não passar por transcrição válida.
    const transcription = typeof result.text === 'string' ? result.text.trim() : '';
    
    console.log('[MessageGrouper] Transcription result:', transcription);
    return transcription || null;
  } catch (error) {
    console.error('[MessageGrouper] Error transcribing audio:', error);
    return null;
  }
}

// Schedule next processing if there are pending messages with future process_after
async function scheduleNextProcessing(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  try {
    // Check for pending messages with future process_after
    const { data: pendingMessages, error } = await supabase
      .from('message_grouping_queue')
      .select('id, process_after')
      .eq('processed', false)
      .gt('process_after', new Date().toISOString())
      .order('process_after', { ascending: true })
      .limit(1);

    if (error) {
      console.error('[MessageGrouper] Error checking pending messages:', error);
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      console.log('[MessageGrouper] No pending messages to schedule');
      return;
    }

    const nextProcessAt = new Date(pendingMessages[0].process_after);
    const now = Date.now();
    const delayMs = Math.max(nextProcessAt.getTime() - now + 500, 1000); // +500ms buffer, min 1s
    
    // Cap delay at 30 seconds to prevent edge function timeout issues
    const cappedDelayMs = Math.min(delayMs, 30000);

    console.log(`[MessageGrouper] Scheduling self-invocation in ${cappedDelayMs}ms for pending message ${pendingMessages[0].id}`);

    // Use EdgeRuntime.waitUntil for background task
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            console.log('[MessageGrouper] Self-invoking after scheduled delay');
            await fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ triggered_by: 'self-reschedule' })
            });
            console.log('[MessageGrouper] Self-invocation completed');
          } catch (err) {
            console.error('[MessageGrouper] Self-reschedule error:', err);
          }
          resolve();
        }, cappedDelayMs);
      })
    );
  } catch (error) {
    console.error('[MessageGrouper] Error scheduling next processing:', error);
  }
}

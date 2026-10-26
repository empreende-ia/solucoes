import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSendPayload, parseTemplateSendSpec } from "../_shared/whatsapp-templates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

// messages.type é um ENUM Postgres sem 'template'. O registro no chat guarda o
// texto já renderizado (queueItem.content), então persiste como 'text' — sem isso
// o INSERT falharia e, como o erro é só logado, a mensagem sumiria do histórico.
function chatMessageType(messageType: string): string {
  return messageType === 'template' ? 'text' : messageType;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // requireAuth (service role OU usuário logado) é intencional aqui: além do cron
  // e do lara-orchestrator, a UI dispara o envio imediato ao mandar uma mensagem
  // manual (src/services/api.ts). O modelo é single-tenant, então não há fila de
  // outro workspace exposta — diferente do message-grouper, que é só interno.
  const { requireAuth } = await import("../_shared/auth.ts");
  const authFail = await requireAuth(req, corsHeaders);
  if (authFail) return authFail;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting send process...');

    const MAX_EXECUTION_TIME = 25000; // 25 seconds
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;

    console.log('[Sender] Starting polling loop');

    // Cache de settings por user_id para evitar múltiplas queries
    const settingsCache: Record<string, any> = {};

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;
      console.log(`[Sender] Iteration ${iterations}, elapsed: ${Date.now() - startTime}ms`);

      // Claim batch of messages to send
      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) {
        console.error('[Sender] Error claiming batch:', claimError);
        throw claimError;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[Sender] No messages ready to send, checking for scheduled messages...');
        
        // Check for messages scheduled in the next 5 seconds
        const { data: upcoming, error: upcomingError } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcomingError) {
          console.error('[Sender] Error checking upcoming messages:', upcomingError);
        }

        if (upcoming && upcoming.length > 0) {
          const scheduledAt = new Date(upcoming[0].scheduled_at).getTime();
          const now = Date.now();
          const waitTime = Math.min(
            Math.max(scheduledAt - now + 100, 0),
            5000
          );
          
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            console.log(`[Sender] Waiting ${waitTime}ms for scheduled message at ${upcoming[0].scheduled_at}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // No more messages to process
        console.log('[Sender] No more messages to process, exiting loop');
        break;
      }

      console.log(`[Sender] Processing batch of ${queueItems.length} messages`);

      for (const item of queueItems) {
        try {
          // Buscar conversation (canal + roteamento Zernio)
          const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('user_id, channel, zernio_conversation_id, zernio_account_id, metadata')
            .eq('id', item.conversation_id)
            .single();

          if (convError || !conversation) {
            console.error(`[Sender] Error fetching conversation ${item.conversation_id}:`, convError);
            throw new Error('Conversation not found');
          }

          // Lead de teste: a resposta já está no Chat e o número é fictício.
          // Sem este desvio o teste sempre falharia na última etapa, tentando
          // entregar a um contato que não existe no WhatsApp.
          if (conversation.metadata?.test === true) {
            console.log(`[Sender] Conversa de teste ${item.conversation_id} — envio simulado`);
            await supabase
              .from('messages')
              .update({ metadata: { simulated: true }, status: 'sent' })
              .eq('id', item.message_id);
            await supabase
              .from('send_queue')
              .update({ status: 'completed', sent_at: new Date().toISOString() })
              .eq('id', item.id);
            totalSent++;
            continue;
          }

          // Conversas conectadas via Zernio (WhatsApp coexistência / Instagram DM)
          // são enviadas pela Zernio API; as demais seguem pela Meta Cloud API.
          if (conversation.zernio_conversation_id) {
            let zernioKey = settingsCache['__zernio_key'];
            if (!zernioKey) {
              const { data: zSettings } = await supabase
                .from('lara_settings')
                .select('zernio_api_key')
                .not('zernio_api_key', 'is', null)
                .limit(1)
                .maybeSingle();
              zernioKey = zSettings?.zernio_api_key;
              if (!zernioKey) throw new Error('Zernio API key not configured');
              settingsCache['__zernio_key'] = zernioKey;
            }

            await sendMessageViaZernio(supabase, zernioKey, item, conversation);

            await supabase
              .from('send_queue')
              .update({
                status: 'completed',
                sent_at: new Date().toISOString()
              })
              .eq('id', item.id);

            totalSent++;
            console.log(`[Sender] Sent via Zernio ${item.id} (${totalSent} total)`);
            continue;
          }

          const userId = conversation.user_id;
          
          // Buscar settings do cache ou do banco com fallback triplo
          const cacheKey = userId || 'global';
          let settings = settingsCache[cacheKey];
          if (!settings) {
            let settingsData = null;

            // 1. Tentar por user_id da conversa
            if (userId) {
              const { data } = await supabase
                .from('lara_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .eq('user_id', userId)
                .maybeSingle();
              settingsData = data;
            }

            // 2. Fallback: buscar global (user_id IS NULL)
            if (!settingsData) {
              console.log('[Sender] No user-specific settings, trying global...');
              const { data } = await supabase
                .from('lara_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .is('user_id', null)
                .maybeSingle();
              settingsData = data;
            }

            // 3. Último fallback: qualquer settings com WhatsApp configurado
            if (!settingsData) {
              console.log('[Sender] No global settings, fetching any with WhatsApp...');
              const { data } = await supabase
                .from('lara_settings')
                .select('whatsapp_access_token, whatsapp_phone_number_id')
                .not('whatsapp_phone_number_id', 'is', null)
                .limit(1)
                .maybeSingle();
              settingsData = data;
            }

            if (!settingsData) {
              console.error('[Sender] No settings found with any fallback');
              throw new Error('Settings not found');
            }

            if (!settingsData.whatsapp_access_token || !settingsData.whatsapp_phone_number_id) {
              console.error('[Sender] WhatsApp not configured in settings');
              throw new Error('WhatsApp not configured');
            }

            settings = settingsData;
            settingsCache[cacheKey] = settings;
          }

          await sendMessage(supabase, settings, item);
          
          // Mark as completed
          await supabase
            .from('send_queue')
            .update({ 
              status: 'completed', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', item.id);
          
          totalSent++;
          console.log(`[Sender] Successfully sent message ${item.id} (${totalSent} total)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending item ${item.id}:`, error);
          
          // Mark as failed with retry
          const newRetryCount = (item.retry_count || 0) + 1;
          const shouldRetry = newRetryCount < 3;
          
          await supabase
            .from('send_queue')
            .update({ 
              status: shouldRetry ? 'pending' : 'failed',
              retry_count: newRetryCount,
              error_message: errorMessage,
              scheduled_at: shouldRetry 
                ? new Date(Date.now() + newRetryCount * 60000).toISOString() 
                : null
            })
            .eq('id', item.id);

          // Falha definitiva precisa chegar ao CHAT: sem isto a mensagem do
          // operador ficava 'processing' para sempre, indistinguível de
          // entregue — envio fora da janela virava erro totalmente silencioso.
          if (!shouldRetry && item.message_id) {
            // Mescla sobre o metadata DA MENSAGEM (não o do item da fila, que
            // tem outro formato e sobrescreveria campos como media_id).
            const { data: messageRow } = await supabase
              .from('messages')
              .select('metadata')
              .eq('id', item.message_id)
              .maybeSingle();
            await supabase
              .from('messages')
              .update({
                status: 'failed',
                metadata: { ...(messageRow?.metadata || {}), send_error: errorMessage.slice(0, 300) },
              })
              .eq('id', item.message_id);
          }
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Sender] Completed: sent ${totalSent} messages in ${iterations} iterations (${executionTime}ms)`);

    return new Response(JSON.stringify({ 
      sent: totalSent, 
      iterations,
      executionTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sender] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendMessageViaZernio(supabase: any, apiKey: string, queueItem: any, conversation: any) {
  console.log(`[Sender] Sending via Zernio: ${queueItem.id} (${conversation.channel})`);

  const payload: Record<string, unknown> = {
    accountId: conversation.zernio_account_id,
  };

  switch (queueItem.message_type) {
    case 'image':
      payload.attachmentUrl = queueItem.media_url;
      payload.attachmentType = 'image';
      if (queueItem.content) payload.message = queueItem.content;
      break;
    case 'audio':
      payload.attachmentUrl = queueItem.media_url;
      payload.attachmentType = 'audio';
      if (conversation.channel === 'whatsapp') payload.voiceNote = true;
      break;
    case 'document':
      payload.attachmentUrl = queueItem.media_url;
      payload.attachmentType = 'file';
      payload.attachmentName = queueItem.content || 'documento';
      break;
    case 'template':
      // Template é conceito do WhatsApp Cloud oficial; a Zernio gerencia os
      // dela. Nesta rota enviamos deliberadamente o texto já renderizado que
      // veio em content — decisão documentada em docs/whatsapp-templates.md.
      payload.message = queueItem.content;
      break;
    default:
      payload.message = queueItem.content;
  }

  const response = await fetch(
    `https://zernio.com/api/v1/inbox/conversations/${conversation.zernio_conversation_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[Sender] Zernio API error:', responseData);
    throw new Error(responseData.error?.message || responseData.message || `Zernio API error (HTTP ${response.status})`);
  }

  const zernioMessageId = responseData.data?.messageId ?? responseData.messageId ?? null;

  // Persistir o zernio_message_id é o que permite ao zernio-webhook reconhecer
  // o eco do nosso envio (message.sent) — falha aqui não pode ser silenciosa.
  if (queueItem.message_id) {
    const { error: updError } = await supabase
      .from('messages')
      .update({
        zernio_message_id: zernioMessageId,
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', queueItem.message_id);
    if (updError) console.error('[Sender] Error persisting zernio_message_id (update):', updError);
  } else {
    const { error: insError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        zernio_message_id: zernioMessageId,
        content: queueItem.content,
        type: chatMessageType(queueItem.message_type),
        from_type: queueItem.from_type,
        status: 'sent',
        media_url: queueItem.media_url || null,
        sent_at: new Date().toISOString(),
        metadata: { ...(queueItem.metadata || {}), source: 'zernio' }
      });
    if (insError && insError.code !== '23505') {
      console.error('[Sender] Error persisting sent message (insert):', insError);
    }
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);
}

async function sendMessage(supabase: any, settings: any, queueItem: any) {
  console.log(`[Sender] Sending message: ${queueItem.id}`);

  // Get contact phone number
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();

  if (!contact) {
    throw new Error('Contact not found');
  }

  const recipient = contact.whatsapp_id || contact.phone_number;

  // Build WhatsApp API payload
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient
  };

  switch (queueItem.message_type) {
    case 'text':
      payload.type = 'text';
      payload.text = { body: queueItem.content };
      break;
    
    case 'image':
      payload.type = 'image';
      payload.image = { 
        link: queueItem.media_url,
        caption: queueItem.content || undefined
      };
      break;
    
    case 'audio':
      payload.type = 'audio';
      payload.audio = { link: queueItem.media_url };
      break;
    
    case 'document':
      payload.type = 'document';
      payload.document = {
        link: queueItem.media_url,
        filename: queueItem.content || 'document'
      };
      break;

    case 'template': {
      // A especificação viaja em metadata.template; content guarda o texto
      // renderizado apenas para o histórico do chat. Spec inválida é erro de
      // fila explícito — enviar como texto livre fora da janela de 24h falharia
      // na Meta de forma muito menos diagnosticável.
      const spec = parseTemplateSendSpec(queueItem.metadata);
      if (!spec) {
        throw new Error('Item de template sem especificação válida em metadata.template.');
      }
      payload.type = 'template';
      payload.template = buildSendPayload(spec);
      break;
    }

    default:
      payload.type = 'text';
      payload.text = { body: queueItem.content };
  }

  console.log('[Sender] WhatsApp API payload:', JSON.stringify(payload, null, 2));

  // Send via WhatsApp Cloud API
  const response = await fetch(
    `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  // Depois do 200 da Meta a mensagem JÁ FOI entregue ao provedor: um corpo
  // ilegível aqui não pode virar exceção, senão o item volta a 'pending' e o
  // lead recebe a mesma mensagem duas vezes. Paridade com o caminho Zernio.
  const responseData = await response.json().catch(() => ({} as Record<string, never>));

  if (!response.ok) {
    console.error('[Sender] WhatsApp API error:', responseData);
    throw new Error((responseData as any).error?.message || 'WhatsApp API error');
  }

  const whatsappMessageId = responseData.messages?.[0]?.id;
  console.log('[Sender] Message sent, WA ID:', whatsappMessageId);

  // Update or create message record in database
  if (queueItem.message_id) {
    // UPDATE existing message (for human messages)
    console.log('[Sender] Updating existing message:', queueItem.message_id);
    const { error: msgError } = await supabase
      .from('messages')
      .update({
        whatsapp_message_id: whatsappMessageId,
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', queueItem.message_id);

    if (msgError) {
      console.error('[Sender] Error updating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  } else {
    // INSERT new message (for Lara messages)
    console.log('[Sender] Creating new message record');
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        whatsapp_message_id: whatsappMessageId,
        content: queueItem.content,
        type: chatMessageType(queueItem.message_type),
        from_type: queueItem.from_type,
        status: 'sent',
        media_url: queueItem.media_url || null,
        sent_at: new Date().toISOString(),
        metadata: queueItem.metadata || {}
      });

    if (msgError) {
      console.error('[Sender] Error creating message record:', msgError);
      // Don't throw - message was sent successfully
    }
  }

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);
}

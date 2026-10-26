import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureEdgeSecrets } from "../_shared/system-config.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROUPING_DELAY_MS = 10000; // 10 seconds

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const requestUrl = new URL(req.url);
    const requestWebhookKey = requestUrl.searchParams.get('key');
    const { data: webhookSettings, error: webhookSettingsError } = await supabase
      .from('lara_settings')
      .select('whatsapp_verify_token, whatsapp_webhook_key')
      .limit(1)
      .maybeSingle();

    if (webhookSettingsError) {
      console.error('[Webhook] Failed to load webhook settings:', webhookSettingsError);
      return new Response('Webhook configuration unavailable', { status: 503, headers: corsHeaders });
    }

    // Instalações legadas, sem chave, continuam aceitando a URL estática.
    // Depois da primeira rotação, a chave passa a ser obrigatória em GET e POST,
    // o que invalida de verdade toda Callback URL anterior.
    if (
      webhookSettings?.whatsapp_webhook_key &&
      requestWebhookKey !== webhookSettings.whatsapp_webhook_key
    ) {
      console.error('[Webhook] Callback URL key mismatch');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    // GET request = Webhook verification from WhatsApp
    if (req.method === 'GET') {
      const mode = requestUrl.searchParams.get('hub.mode');
      const token = requestUrl.searchParams.get('hub.verify_token');
      const challenge = requestUrl.searchParams.get('hub.challenge');
      const verifyToken = webhookSettings?.whatsapp_verify_token || 'webhook-verify-token';

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Verification successful');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      } else {
        console.error('[Webhook] Verification failed');
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }
    }

    // POST request = Incoming message from WhatsApp
    if (req.method === 'POST') {
      const body = await req.json();
      console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));

      // Garante os secrets do Vault (cron sweeps) no caminho síncrono —
      // o waitUntil que dispara o orchestrator pode morrer, o sweep não
      await ensureEdgeSecrets(supabase);

      // A Meta agrega notificações: um POST pode trazer VÁRIOS entries e
      // changes, e um mesmo value pode trazer statuses E messages. Processar
      // só o primeiro e responder 200 descartava o resto do lote — sem log e
      // sem reenvio pela Meta, a mensagem do lead se perdia em definitivo.
      let hadMessages = false;
      for (const entryItem of (Array.isArray(body.entry) ? body.entry : [])) {
        for (const change of (Array.isArray(entryItem?.changes) ? entryItem.changes : [])) {
          const value = change?.value;
          if (!value) continue;
          const messages = value.messages;
          const contacts = value.contacts;
          const phoneNumberId = value.metadata?.phone_number_id;

          // (Lookup de dono removido: ownerId era computado e nunca usado —
          // contato e conversa gravam user_id null por padrão single-tenant.
          // Custava 1-2 consultas por change, inclusive em lotes só de status.)

          // Handle status updates (delivered, read, etc)
          if (value.statuses) {
            for (const status of value.statuses) {
              console.log('[Webhook] Status update:', status);
          
              // Update message status in database
              if (status.id) {
                const statusMap: Record<string, string> = {
                  'sent': 'sent',
                  'delivered': 'delivered',
                  'read': 'read',
                  'failed': 'failed'
                };
            
                const newStatus = statusMap[status.status];
                if (newStatus) {
                  await supabase
                    .from('messages')
                    .update({ 
                      status: newStatus,
                      ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
                      ...(newStatus === 'read' && { read_at: new Date().toISOString() })
                    })
                    .eq('whatsapp_message_id', status.id);
                }
              }
            }
          }

          // Process incoming messages - CREATE RECORDS IMMEDIATELY
          if (messages && messages.length > 0) {
            const processAfter = new Date(Date.now() + GROUPING_DELAY_MS).toISOString();

            for (const message of messages) {
              const contactInfo = contacts?.find((c: any) => c.wa_id === message.from);
              const phoneNumber = message.from;
              const whatsappId = contactInfo?.wa_id || phoneNumber;
              const contactName = contactInfo?.profile?.name || null;

              // 1. Get or create contact IMMEDIATELY
              let { data: contact } = await supabase
                .from('contacts')
                .select('*')
                .eq('phone_number', phoneNumber)
                .maybeSingle();

              if (!contact) {
                const { data: newContact, error: contactError } = await supabase
                  .from('contacts')
                  .insert({
                    phone_number: phoneNumber,
                    whatsapp_id: whatsappId,
                    name: contactName,
                    call_name: contactName?.split(' ')[0] || null,
                    user_id: null
                  })
                  .select()
                  .single();

                if (contactError) {
                  // Duas mensagens do mesmo lead novo podem correr: o INSERT que
                  // perde a corrida recebe 23505. Descartar aqui perdia a PRIMEIRA
                  // mensagem da pessoa — rebusca e segue com o contato existente.
                  if (contactError.code === '23505') {
                    const { data: existing } = await supabase
                      .from('contacts')
                      .select('*')
                      .eq('phone_number', phoneNumber)
                      .maybeSingle();
                    if (!existing) {
                      console.error('[Webhook] Contato sumiu após 23505:', phoneNumber);
                      continue;
                    }
                    contact = existing;
                  } else {
                    console.error('[Webhook] Error creating contact:', contactError);
                    continue;
                  }
                } else {
                  contact = newContact;
                }
                console.log('[Webhook] Contact resolved:', contact.id);
              } else {
                // Update contact activity
                const updates: any = { last_activity: new Date().toISOString() };
                if (contactName && !contact.name) {
                  updates.name = contactName;
                  updates.call_name = contactName.split(' ')[0];
                }
                // Removed user_id update to maintain single-tenant null pattern
            
                await supabase
                  .from('contacts')
                  .update(updates)
                  .eq('id', contact.id);
              }

              // 2. Get or create conversation IMMEDIATELY
              // order+limit(1): se algum dia existirem duas conversas ativas do
              // mesmo contato, usa a mais recente em vez de falhar o maybeSingle e
              // criar uma TERCEIRA a cada mensagem (runaway).
              let { data: conversation } = await supabase
                .from('conversations')
                .select('*')
                .eq('contact_id', contact.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!conversation) {
                const { data: newConversation, error: convError } = await supabase
                  .from('conversations')
                  .insert({
                    contact_id: contact.id,
                    status: 'lara',
                    is_active: true,
                    user_id: null
                  })
                  .select()
                  .single();

                if (convError) {
                  console.error('[Webhook] Error creating conversation:', convError);
                  continue;
                }
                conversation = newConversation;
                console.log('[Webhook] Created new conversation:', conversation.id);
              }
              // Removed user_id update to maintain single-tenant null pattern

              // 3. Determine message content and type
              let messageContent = '';
              let messageType = 'text';
              let mediaType = null;

              switch (message.type) {
                case 'text':
                  messageContent = message.text?.body || '';
                  messageType = 'text';
                  break;
                case 'image':
                  messageContent = message.image?.caption || '[imagem recebida]';
                  messageType = 'image';
                  mediaType = 'image';
                  break;
                case 'audio':
                  // Audio will be transcribed by message-grouper
                  messageContent = '[áudio - processando transcrição...]';
                  messageType = 'audio';
                  mediaType = 'audio';
                  break;
                case 'video':
                  messageContent = message.video?.caption || '[vídeo recebido]';
                  messageType = 'video';
                  mediaType = 'video';
                  break;
                case 'document':
                  messageContent = message.document?.filename || '[documento recebido]';
                  messageType = 'document';
                  mediaType = 'document';
                  break;
                default:
                  messageContent = `[${message.type}]`;
              }

              // 4. Create message IMMEDIATELY (for realtime updates)
              const { data: dbMessage, error: msgError } = await supabase
                .from('messages')
                .insert({
                  conversation_id: conversation.id,
                  whatsapp_message_id: message.id,
                  content: messageContent,
                  type: messageType,
                  from_type: 'user',
                  status: 'sent',
                  media_type: mediaType,
                  sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
                  metadata: { 
                    original_type: message.type,
                    media_id: message.audio?.id || message.image?.id || message.video?.id || message.document?.id || null
                  }
                })
                .select()
                .single();

              if (msgError) {
                // If duplicate key error, message was already processed
                if (msgError.code === '23505') {
                  console.log('[Webhook] Duplicate message ignored:', message.id);
                  continue;
                }
                console.error('[Webhook] Error creating message:', msgError);
                continue;
              }

              console.log('[Webhook] Created message:', dbMessage.id, 'for conversation:', conversation.id);

              // 5. Update conversation last_message_at
              await supabase
                .from('conversations')
                .update({ last_message_at: new Date().toISOString() })
                .eq('id', conversation.id);

              // 6. FIRST reset timer for all pending messages from same phone, THEN insert new queue entry
              await supabase
                .from('message_grouping_queue')
                .update({ process_after: processAfter })
                .eq('processed', false)
                .eq('phone_number_id', phoneNumberId)
                .filter('message_data->>from', 'eq', phoneNumber);

              // 7. Insert into message_grouping_queue with message_id reference
              const { error: queueError } = await supabase
                .from('message_grouping_queue')
                .insert({
                  whatsapp_message_id: message.id,
                  phone_number_id: phoneNumberId,
                  message_id: dbMessage.id,
                  message_data: message,
                  contacts_data: contactInfo || null,
                  process_after: processAfter
                });

              if (queueError) {
                if (queueError.code === '23505') {
                  console.log('[Webhook] Duplicate queue entry ignored:', message.id);
                } else {
                  console.error('[Webhook] Queue insert error:', queueError);
                }
              } else {
                console.log('[Webhook] Message queued:', message.id, 'process_after:', processAfter);
              }
            }

            hadMessages = true;
          }

        }
      }

      if (hadMessages) {
        // Trigger message-grouper in background (non-blocking)
        EdgeRuntime.waitUntil(
          fetch(`${supabaseUrl}/functions/v1/message-grouper`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'whatsapp-webhook' })
          }).catch(err => console.error('[Webhook] Error triggering message-grouper:', err))
        );
      }

      return new Response(JSON.stringify({ status: 'processed' }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

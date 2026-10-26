import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureEdgeSecrets } from "../_shared/system-config.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zernio-signature, x-zernio-event-id',
};

const DEBOUNCE_MS = 10000;

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

const MAX_PERSIST_BYTES = 50 * 1024 * 1024;

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
    'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/opus': 'opus',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return map[ct.split(';')[0].trim().toLowerCase()] ?? 'bin';
}

// A mídia expira na Zernio em poucos dias (404 autenticado verificado) —
// baixa na chegada e persiste no bucket privado chat-media; a zernio-media
// serve do Storage primeiro e só cai na Zernio se o path não existir.
async function persistMedia(supabase: any, messageId: string, conversationId: string, attachmentUrl: string) {
  try {
    const { data: settings } = await supabase
      .from('lara_settings')
      .select('zernio_api_key')
      .not('zernio_api_key', 'is', null)
      .limit(1)
      .maybeSingle();
    const apiKey = settings?.zernio_api_key;
    if (!apiKey) return;

    const res = await fetch(attachmentUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!res.ok) {
      console.error('[ZernioWebhook] persistMedia upstream', res.status, 'message', messageId);
      return;
    }
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_PERSIST_BYTES) {
      await res.body?.cancel();
      console.log('[ZernioWebhook] persistMedia: arquivo acima do limite, mantendo só proxy:', messageId);
      return;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PERSIST_BYTES) return;

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const path = `${conversationId}/${messageId}.${extFromContentType(contentType)}`;
    const { error: upErr } = await supabase.storage
      .from('chat-media')
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) {
      console.error('[ZernioWebhook] persistMedia upload error:', upErr);
      return;
    }
    // Merge não-destrutivo: nada mais escreve metadata de messages depois do insert
    const { data: msg } = await supabase.from('messages').select('metadata').eq('id', messageId).maybeSingle();
    await supabase
      .from('messages')
      .update({ metadata: { ...(msg?.metadata ?? {}), storage_path: path } })
      .eq('id', messageId);
    console.log('[ZernioWebhook] persistMedia ok:', path);
  } catch (err) {
    console.error('[ZernioWebhook] persistMedia error:', err);
  }
}

function extractMessageContent(message: any): { content: string; type: string; mediaType: string | null; attachmentUrl: string | null } {
  const text = message?.text ?? message?.message ?? message?.content ?? '';
  const attachment = message?.attachments?.[0] ?? message?.attachment ?? null;
  if (attachment?.url || attachment?.type) {
    const aType = String(attachment.type || '').toLowerCase();
    const mapped = aType.includes('image') ? 'image'
      : aType.includes('audio') || aType.includes('voice') ? 'audio'
      : aType.includes('video') ? 'video'
      : 'document';
    const label = mapped === 'image' ? '[imagem recebida]'
      : mapped === 'audio' ? '[áudio recebido]'
      : mapped === 'video' ? '[vídeo recebido]'
      : '[arquivo recebido]';
    return {
      content: text || label,
      type: mapped,
      mediaType: mapped,
      attachmentUrl: attachment.url ?? null,
    };
  }
  return { content: text || '[mensagem]', type: 'text', mediaType: null, attachmentUrl: null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawBody = await req.text();

    // Verificação HMAC-SHA256 (X-Zernio-Signature = hex do HMAC do body com o secret)
    const { data: settings } = await supabase
      .from('lara_settings')
      .select('id, zernio_webhook_secret')
      .not('zernio_webhook_secret', 'is', null)
      .limit(1)
      .maybeSingle();

    const secret = settings?.zernio_webhook_secret;
    if (!secret) {
      console.error('[ZernioWebhook] No webhook secret configured — rejecting');
      return new Response('Webhook not configured', { status: 401, headers: corsHeaders });
    }

    const signature = req.headers.get('X-Zernio-Signature') ?? req.headers.get('X-Late-Signature');
    if (!signature) {
      return new Response('No signature', { status: 401, headers: corsHeaders });
    }
    const expected = await hmacSha256Hex(secret, rawBody);
    if (!timingSafeEqual(signature.toLowerCase(), expected)) {
      console.error('[ZernioWebhook] Invalid signature');
      return new Response('Invalid signature', { status: 401, headers: corsHeaders });
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.id ?? req.headers.get('X-Zernio-Event-Id');
    const eventType = payload.event ?? 'unknown';

    console.log('[ZernioWebhook] Event:', eventType, eventId);

    // Garante os secrets do Vault (cron sweeps) no caminho síncrono —
    // o waitUntil que dispara o orchestrator pode morrer, o sweep não
    await ensureEdgeSecrets(supabase);

    // Dedup: entrega at-least-once — insert com unique(event_id).
    // Evento já visto SÓ é descartado se foi processado com sucesso (processed=true);
    // se a tentativa anterior falhou no meio, o retry da Zernio reprocessa.
    if (eventId) {
      const { error: dedupError } = await supabase
        .from('zernio_webhook_events')
        .insert({ event_id: eventId, event_type: eventType, payload });
      if (dedupError) {
        if (dedupError.code === '23505') {
          const { data: seen } = await supabase
            .from('zernio_webhook_events')
            .select('processed')
            .eq('event_id', eventId)
            .maybeSingle();
          if (seen?.processed) {
            console.log('[ZernioWebhook] Duplicate event ignored:', eventId);
            return new Response(JSON.stringify({ status: 'duplicate' }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          console.log('[ZernioWebhook] Reprocessing previously failed event:', eventId);
        } else {
          console.error('[ZernioWebhook] Dedup insert error:', dedupError);
        }
      }
    }

    switch (eventType) {
      case 'webhook.test':
        break;

      case 'message.received':
        await handleMessageReceived(supabase, supabaseUrl, supabaseServiceKey, payload);
        break;

      case 'message.sent':
        await handleMessageSent(supabase, payload);
        break;

      case 'message.delivered':
      case 'message.read':
      case 'message.failed': {
        const zMsgId = payload.message?.id ?? payload.message?.messageId;
        if (zMsgId) {
          const statusValue = eventType.split('.')[1];
          await supabase
            .from('messages')
            .update({
              status: statusValue,
              ...(statusValue === 'delivered' && { delivered_at: new Date().toISOString() }),
              ...(statusValue === 'read' && { read_at: new Date().toISOString() }),
            })
            .eq('zernio_message_id', zMsgId);
        }
        break;
      }

      case 'account.connected':
      case 'account.disconnected': {
        const account = payload.account ?? {};
        const accountId = account.id ?? account.accountId;
        if (accountId) {
          const isConnected = eventType === 'account.connected';
          await supabase
            .from('channel_connections')
            .upsert(
              {
                provider: 'zernio',
                zernio_account_id: accountId,
                platform: account.platform === 'instagram' ? 'instagram' : 'whatsapp',
                username: account.username ?? account.name ?? null,
                display_name: account.displayName ?? account.name ?? null,
                status: isConnected ? 'active' : 'disconnected',
                ...(isConnected
                  ? { connected_at: new Date().toISOString(), disconnected_at: null }
                  : { disconnected_at: new Date().toISOString() }),
                metadata: account,
              },
              { onConflict: 'provider,zernio_account_id' }
            );
        }
        break;
      }

      default:
        console.log('[ZernioWebhook] Unhandled event type:', eventType);
    }

    if (eventId) {
      await supabase.from('zernio_webhook_events').update({ processed: true }).eq('event_id', eventId);
    }

    return new Response(JSON.stringify({ status: 'processed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ZernioWebhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function resolveContact(supabase: any, platform: string, conversation: any) {
  const participantId = conversation?.participantId ?? null;
  const participantName = conversation?.participantName ?? null;
  const participantPicture = conversation?.participantPicture ?? null;

  const isPhone = platform === 'whatsapp' && participantId && /^\+?\d{8,16}$/.test(String(participantId).replace(/\D/g, ''));
  const phoneNumber = isPhone ? String(participantId).replace(/[^\d+]/g, '') : null;

  let contact = null;
  if (phoneNumber) {
    const { data } = await supabase.from('contacts').select('*').eq('phone_number', phoneNumber).maybeSingle();
    contact = data;
  }
  if (!contact && platform === 'whatsapp' && participantId) {
    // Coexistência: participantId pode não ser telefone legível (LID/JID) —
    // o contato foi criado com whatsapp_id + phone_number 'zernio:<id>'
    const { data } = await supabase.from('contacts').select('*').eq('whatsapp_id', String(participantId)).limit(1).maybeSingle();
    contact = data;
    if (!contact) {
      const { data: byPrefix } = await supabase.from('contacts').select('*').eq('phone_number', `zernio:${participantId}`).maybeSingle();
      contact = byPrefix;
    }
  }
  if (!contact && platform === 'instagram' && participantId) {
    const { data } = await supabase.from('contacts').select('*').eq('instagram_user_id', String(participantId)).maybeSingle();
    contact = data;
  }

  if (!contact) {
    const insert: Record<string, unknown> = {
      phone_number: phoneNumber,
      name: participantName,
      call_name: participantName?.split(' ')[0] ?? null,
      avatar_url: participantPicture,
      user_id: null,
    };
    if (platform === 'instagram' && participantId) {
      insert.instagram_user_id = String(participantId);
      insert.instagram_username = participantName ?? null;
    }
    if (platform === 'whatsapp' && participantId) {
      insert.whatsapp_id = String(participantId);
      // Coexistência sem telefone legível: mantém unicidade via instagram_user_id vazio + zernio conv
      if (!phoneNumber) insert.phone_number = `zernio:${participantId}`;
    }
    const { data: newContact, error } = await supabase.from('contacts').insert(insert).select().single();
    if (error) {
      if (error.code === '23505') {
        // corrida: outro evento criou primeiro — rebusca por todas as chaves possíveis
        const candidates: Array<{ col: string; val: string }> = [];
        if (phoneNumber) candidates.push({ col: 'phone_number', val: phoneNumber });
        if (platform === 'whatsapp' && participantId) {
          candidates.push({ col: 'whatsapp_id', val: String(participantId) });
          candidates.push({ col: 'phone_number', val: `zernio:${participantId}` });
        }
        if (platform === 'instagram' && participantId) {
          candidates.push({ col: 'instagram_user_id', val: String(participantId) });
        }
        for (const key of candidates) {
          const { data: existing } = await supabase.from('contacts').select('*').eq(key.col, key.val).limit(1).maybeSingle();
          if (existing) return existing;
        }
        return null;
      }
      throw error;
    }
    return newContact;
  }

  const updates: Record<string, unknown> = { last_activity: new Date().toISOString() };
  if (participantName && !contact.name) {
    updates.name = participantName;
    updates.call_name = participantName.split(' ')[0];
  }
  if (participantPicture && !contact.avatar_url) updates.avatar_url = participantPicture;
  await supabase.from('contacts').update(updates).eq('id', contact.id);
  return contact;
}

async function resolveConversation(supabase: any, contact: any, platform: string, zConversation: any, zAccountId: string | null) {
  const zConvId = zConversation?.id ?? null;
  if (zConvId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('zernio_conversation_id', zConvId)
      .maybeSingle();
    if (existing) return existing;
  }

  // Reaproveita conversa ativa do contato no mesmo canal (evita duplicar thread)
  const { data: active } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('is_active', true)
    .eq('channel', platform)
    .maybeSingle();
  if (active) {
    if (zConvId && !active.zernio_conversation_id) {
      await supabase
        .from('conversations')
        .update({ zernio_conversation_id: zConvId, zernio_account_id: zAccountId })
        .eq('id', active.id);
      active.zernio_conversation_id = zConvId;
      active.zernio_account_id = zAccountId;
    }
    return active;
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      contact_id: contact.id,
      status: 'lara',
      is_active: true,
      channel: platform,
      zernio_conversation_id: zConvId,
      zernio_account_id: zAccountId,
      user_id: null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505' && zConvId) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('*')
        .eq('zernio_conversation_id', zConvId)
        .maybeSingle();
      return existing;
    }
    throw error;
  }
  return created;
}

async function handleMessageReceived(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  payload: any
) {
  const message = payload.message ?? {};
  const zConversation = payload.conversation ?? {};
  const account = payload.account ?? {};
  const platform = (zConversation.platform ?? account.platform) === 'instagram' ? 'instagram' : 'whatsapp';
  const zAccountId = account.id ?? account.accountId ?? zConversation.accountId ?? null;
  const zMessageId = message.id ?? message.messageId ?? null;

  const contact = await resolveContact(supabase, platform, zConversation);
  if (!contact) {
    // throw → 500 → retry da Zernio reprocessa (o dedup só descarta eventos processados)
    throw new Error('Could not resolve contact for message.received');
  }
  const conversation = await resolveConversation(supabase, contact, platform, zConversation, zAccountId);
  if (!conversation) {
    throw new Error('Could not resolve conversation for message.received');
  }

  const { content, type, mediaType, attachmentUrl } = extractMessageContent(message);

  let { data: dbMessage, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      zernio_message_id: zMessageId,
      content,
      type,
      from_type: 'user',
      status: 'sent',
      media_type: mediaType,
      sent_at: message.createdAt ?? payload.timestamp ?? new Date().toISOString(),
      metadata: {
        source: 'zernio',
        platform,
        attachment_url: attachmentUrl,
        zernio_metadata: payload.metadata ?? null,
      },
    })
    .select()
    .single();

  if (msgError) {
    if (msgError.code === '23505' && zMessageId) {
      // Reprocesso de evento que falhou depois do insert: reaproveita a linha e segue o fluxo
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('zernio_message_id', zMessageId)
        .maybeSingle();
      if (!existingMsg) throw msgError;
      if (existingMsg.processed_by_lara) {
        // A 1ª tentativa morreu depois da Lara já ter respondido — não re-enfileira
        console.log('[ZernioWebhook] Reprocessed message already answered by Lara, skipping enqueue:', zMessageId);
        return;
      }
      dbMessage = existingMsg;
    } else {
      throw msgError;
    }
  }

  if (attachmentUrl && dbMessage?.id) {
    EdgeRuntime.waitUntil(persistMedia(supabase, dbMessage.id, conversation.id, attachmentUrl));
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // Lara responde apenas conversas em modo 'lara'
  if (conversation.status !== 'lara') {
    console.log('[ZernioWebhook] Conversation not in lara mode, skipping AI:', conversation.id);
    return;
  }

  // Debounce de rajada: substitui item pendente da mesma conversa e agenda +10s.
  // A RPC serializa por conversa (advisory lock) — dois webhooks concorrentes
  // não deixam dois itens pending. O orchestrator monta o contexto com as
  // últimas mensagens da conversa, então um único item cobre a rajada inteira.
  const { error: queueError } = await supabase.rpc('enqueue_lara_processing', {
    p_message_id: dbMessage.id,
    p_conversation_id: conversation.id,
    p_contact_id: contact.id,
    p_delay_seconds: Math.round(DEBOUNCE_MS / 1000),
    p_context: { source: 'zernio', platform },
  });
  if (queueError) {
    throw new Error(`Queue insert error: ${queueError.message}`);
  }

  // Dispara o orchestrator com atraso (após a janela de debounce)
  EdgeRuntime.waitUntil(
    (async () => {
      await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 500));
      await fetch(`${supabaseUrl}/functions/v1/lara-orchestrator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ triggered_by: 'zernio-webhook' }),
      }).catch((err) => console.error('[ZernioWebhook] Error triggering orchestrator:', err));
    })()
  );
}

// message.sent: eco dos nossos envios OU resposta humana vinda do app (coexistência).
// Resposta humana externa pausa a Lara (status 'human') — o dono assumiu a conversa.
// CUIDADO com a corrida: o eco pode chegar ANTES do sender persistir o
// zernio_message_id — nesse caso o envio da própria Lara pareceria takeover
// humano e pausaria a Lara. Por isso: janela de graça + casamento por conteúdo.
async function handleMessageSent(supabase: any, payload: any) {
  const message = payload.message ?? {};
  const zConversation = payload.conversation ?? {};
  const zMessageId = message.id ?? message.messageId ?? null;
  const zConvId = zConversation.id ?? null;
  if (!zMessageId || !zConvId) return;

  const isOurEcho = async () => {
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('zernio_message_id', zMessageId)
      .maybeSingle();
    return !!data;
  };

  if (await isOurEcho()) return; // eco de envio nosso

  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('zernio_conversation_id', zConvId)
    .maybeSingle();
  if (!conversation) return;

  const { content, type, mediaType, attachmentUrl } = extractMessageContent(message);

  // Casamento por conteúdo: envio nosso ainda sem zernio_message_id gravado
  // (linha criada pelo app com status 'processing', ou INSERT do sender em andamento).
  // Para mídia o content do eco é um rótulo ('[áudio recebido]') que nunca bate
  // com o gravado — nesse caso casa por tipo de mídia compatível.
  const matchPendingOutbound = async () => {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: candidates } = await supabase
      .from('messages')
      .select('id, content, type, media_type, from_type, status')
      .eq('conversation_id', conversation.id)
      .neq('from_type', 'user')
      .is('zernio_message_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);
    const list = candidates ?? [];
    if (type !== 'text') {
      return list.find((m: any) => m.type === type || m.media_type === mediaType) ?? null;
    }
    return list.find((m: any) => (m.content ?? '') === (content ?? '')) ?? null;
  };

  let pendingMatch = await matchPendingOutbound();
  if (!pendingMatch) {
    // Janela de graça: dá tempo do sender terminar de gravar o zernio_message_id
    await new Promise((r) => setTimeout(r, 2500));
    if (await isOurEcho()) return;
    pendingMatch = await matchPendingOutbound();
  }
  if (pendingMatch) {
    await supabase
      .from('messages')
      .update({ zernio_message_id: zMessageId, status: 'sent', sent_at: message.createdAt ?? new Date().toISOString() })
      .eq('id', pendingMatch.id)
      .is('zernio_message_id', null);
    return; // envio nosso — não é takeover
  }

  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      zernio_message_id: zMessageId,
      content,
      type,
      from_type: 'human',
      status: 'sent',
      media_type: mediaType,
      sent_at: message.createdAt ?? payload.timestamp ?? new Date().toISOString(),
      metadata: { source: 'zernio_external', attachment_url: attachmentUrl },
    })
    .select('id')
    .maybeSingle();
  if (insertError && insertError.code !== '23505') {
    console.error('[ZernioWebhook] Error recording external message:', insertError);
    return;
  }
  if (attachmentUrl && inserted?.id) {
    EdgeRuntime.waitUntil(persistMedia(supabase, inserted.id, conversation.id, attachmentUrl));
  }

  if (conversation.status === 'lara') {
    await supabase.from('conversations').update({ status: 'human' }).eq('id', conversation.id);
    await supabase
      .from('lara_processing_queue')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('status', 'pending');
    console.log('[ZernioWebhook] Human takeover detected, Lara paused for conversation:', conversation.id);
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);
}

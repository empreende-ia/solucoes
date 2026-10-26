import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Proxy de mídia da Zernio: <img>/<audio>/<video> não mandam header
// Authorization, e a URL de anexo da Zernio exige Bearer com a API key.
// Fluxo: valida o token do usuário (query param), busca a mensagem,
// baixa da Zernio com a chave do banco e streama a resposta.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return jsonError('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    const messageId = url.searchParams.get('id') ?? '';
    // Token na query porque tags de mídia não enviam headers; a function
    // nunca loga a URL para o token não parar em logs.
    const token = url.searchParams.get('token') ?? req.headers.get('authorization')?.replace('Bearer ', '').trim() ?? '';
    if (!messageId || !token) return jsonError('id e token são obrigatórios', 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) return jsonError('Unauthorized', 401);

    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: message } = await supabase
      .from('messages')
      .select('id, media_type, metadata')
      .eq('id', messageId)
      .maybeSingle();
    if (!message) return jsonError('Mensagem não encontrada', 404);
    const meta = (message.metadata ?? {}) as Record<string, unknown>;

    // 1º: cópia persistida pelo webhook (bucket privado; a mídia da Zernio
    // expira em poucos dias, o Storage é a fonte durável)
    const storagePath = meta.storage_path as string | undefined;
    if (storagePath) {
      const { data: blob, error: dlError } = await supabase.storage.from('chat-media').download(storagePath);
      if (!dlError && blob) {
        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', blob.type || 'application/octet-stream');
        headers.set('Cache-Control', 'private, max-age=86400');
        return new Response(blob.stream(), { status: 200, headers });
      }
      console.error('[ZernioMedia] Storage falhou, tentando Zernio:', storagePath);
    }

    // 2º: busca ao vivo na Zernio (mídia recente ainda não persistida)
    const attachmentUrl = meta.attachment_url as string | undefined;
    if (!attachmentUrl) return jsonError('Mensagem sem anexo', 404);

    // Só faz proxy de URLs da própria Zernio — evita virar open proxy
    // caso metadata seja gravado com origem inesperada
    let parsed: URL;
    try { parsed = new URL(attachmentUrl); } catch { return jsonError('URL de anexo inválida', 422); }
    if (parsed.protocol !== 'https:' || (parsed.hostname !== 'zernio.com' && !parsed.hostname.endsWith('.zernio.com'))) {
      return jsonError('Origem de anexo não suportada', 422);
    }

    const { data: settings } = await supabase
      .from('lara_settings')
      .select('zernio_api_key')
      .not('zernio_api_key', 'is', null)
      .limit(1)
      .maybeSingle();
    const apiKey = settings?.zernio_api_key;
    if (!apiKey) return jsonError('Chave da API Zernio não configurada', 409);

    const range = req.headers.get('range');
    const upstream = await fetch(attachmentUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...(range ? { 'Range': range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.error('[ZernioMedia] Upstream error', upstream.status, 'message', messageId);
      if (upstream.status === 404) {
        // A Zernio descarta a mídia após alguns dias; sem cópia no Storage
        // (mensagens anteriores ao pipeline de persistência) não há recuperação
        return jsonError('Mídia expirada na Zernio', 404);
      }
      return jsonError(`Mídia indisponível na Zernio (HTTP ${upstream.status})`, 502);
    }

    const headers = new Headers(corsHeaders);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('Cache-Control', 'private, max-age=3600');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error('[ZernioMedia] Error:', error instanceof Error ? error.message : error);
    return jsonError('Erro ao buscar mídia', 500);
  }
});

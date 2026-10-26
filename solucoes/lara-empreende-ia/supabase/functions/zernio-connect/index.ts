import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZERNIO_BASE = 'https://zernio.com/api/v1';

const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'account.connected',
  'account.disconnected',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function zernioFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${ZERNIO_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Autenticação: exige usuário logado com papel admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '').trim();

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: 'Unauthorized' }, 401);

    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'Apenas administradores podem gerenciar canais' }, 403);

    const body = await req.json();
    const action = body.action as string;

    const { data: settings } = await supabase
      .from('lara_settings')
      .select('id, company_name, zernio_api_key, zernio_profile_id, zernio_webhook_id, zernio_webhook_secret')
      .limit(1)
      .maybeSingle();

    if (!settings) return json({ error: 'Sistema não inicializado (lara_settings ausente)' }, 400);

    // ---------------------------------------------------------------
    if (action === 'save_key') {
      const apiKey = String(body.apiKey ?? '').trim();
      if (!apiKey.startsWith('sk_')) {
        return json({ error: 'Chave inválida: deve começar com sk_' }, 400);
      }
      const probe = await zernioFetch(apiKey, '/profiles');
      if (!probe.ok) {
        return json({ error: `Chave rejeitada pela Zernio (HTTP ${probe.status})` }, 400);
      }

      // Garante um profile para agrupar as contas
      const profiles = probe.data?.profiles ?? probe.data?.data ?? [];
      let profileId = profiles.find((p: any) => p.isDefault)?._id ?? profiles[0]?._id ?? null;
      if (!profileId) {
        const created = await zernioFetch(apiKey, '/profiles', {
          method: 'POST',
          body: JSON.stringify({ name: settings.company_name || 'Lara' }),
        });
        profileId = created.data?.profile?._id ?? created.data?._id ?? created.data?.id ?? null;
      }
      if (!profileId) return json({ error: 'Não foi possível obter/criar um profile na Zernio' }, 500);

      await supabase
        .from('lara_settings')
        .update({ zernio_api_key: apiKey, zernio_profile_id: profileId })
        .eq('id', settings.id);

      return json({ success: true, profileId });
    }

    // ---------------------------------------------------------------
    // status NÃO exige chave: é como o frontend descobre se ela existe
    // (sem isso, toda instalação nova recebe 400 ao abrir a tela de canais)
    if (action === 'status') {
      const { data: connections } = await supabase
        .from('channel_connections')
        .select('*')
        .order('created_at', { ascending: false });
      return json({
        success: true,
        hasKey: !!settings.zernio_api_key,
        profileId: settings.zernio_profile_id,
        webhookConfigured: !!settings.zernio_webhook_id,
        connections: connections ?? [],
      });
    }

    // Demais ações exigem chave salva
    const apiKey = settings.zernio_api_key;
    if (!apiKey) return json({ error: 'Configure a chave da API Zernio primeiro' }, 400);

    // Chave salva pode ter sido revogada/rotacionada na Zernio: valida antes de
    // qualquer chamada para devolver mensagem acionável em vez de 500 genérico.
    const keyProbe = await zernioFetch(apiKey, '/profiles');
    if (keyProbe.status === 401 || keyProbe.status === 403) {
      return json({
        error: 'A chave da API Zernio salva foi rejeitada (não autorizada). Gere uma nova chave em zernio.com e salve novamente em Configurações → Canais.',
        code: 'zernio_key_invalid',
      }, 400);
    }


    // ---------------------------------------------------------------
    if (action === 'connect') {
      if (body.platform && body.platform !== 'whatsapp') {
        return json({ error: 'Apenas conexões com WhatsApp estão disponíveis' }, 400);
      }
      const platform = 'whatsapp';
      const redirectUrl = String(body.redirectUrl ?? '');
      if (!redirectUrl) return json({ error: 'redirectUrl é obrigatório' }, 400);

      // Garante webhook registrado ANTES de conectar (eventos fluem imediatamente)
      let webhookId = settings.zernio_webhook_id;
      if (!webhookId) {
        const secret = randomHex(32);
        const created = await zernioFetch(apiKey, '/webhooks/settings', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Lara SDR',
            url: `${supabaseUrl}/functions/v1/zernio-webhook`,
            secret,
            events: WEBHOOK_EVENTS,
            isActive: true,
          }),
        });
        webhookId = created.data?.webhook?._id ?? created.data?._id ?? null;
        if (!webhookId) {
          // Webhooks message.* exigem o Inbox da Zernio (add-on nos planos
          // fixos; incluso no usage-based) — sem ele a conexão não tem como funcionar
          const zernioError = String(created.data?.error ?? '');
          if (created.data?.code === 'feature_not_available' || zernioError.includes('Inbox access')) {
            return json({
              error:
                'Sua conta Zernio precisa do plano usage-based — é o único que inclui WhatsApp e o Inbox, e as 2 primeiras contas conectadas são grátis. Troque em zernio.com/dashboard/billing ("Switch to usage-based pricing") e clique em Conectar de novo.',
              code: 'zernio_inbox_required',
            }, 400);
          }
          return json({ error: 'Falha ao registrar webhook na Zernio', details: created.data }, 500);
        }
        await supabase
          .from('lara_settings')
          .update({ zernio_webhook_id: webhookId, zernio_webhook_secret: secret })
          .eq('id', settings.id);
      }

      const params = new URLSearchParams({
        profileId: settings.zernio_profile_id ?? '',
        redirectUrl,
        redirect_url: redirectUrl,
      });
      const connect = await zernioFetch(apiKey, `/connect/${platform}?${params.toString()}`);
      const authUrl = connect.data?.authUrl ?? connect.data?.url ?? null;
      if (!connect.ok || !authUrl) {
        return json({ error: 'Falha ao gerar URL de conexão', details: connect.data }, 500);
      }
      return json({ success: true, authUrl });
    }

    // ---------------------------------------------------------------
    if (action === 'sync') {
      const res = await zernioFetch(apiKey, '/accounts');
      if (!res.ok) return json({ error: `Falha ao listar contas (HTTP ${res.status})` }, 500);
      const accounts = res.data?.accounts ?? res.data?.data ?? [];
      const supported = accounts.filter(
        (account: any) => String(account.platform ?? '').toLowerCase() === 'whatsapp'
      );

      for (const a of supported) {
        const accountId = a.id ?? a._id ?? a.accountId;
        if (!accountId) continue;
        await supabase.from('channel_connections').upsert(
          {
            provider: 'zernio',
            zernio_account_id: accountId,
            zernio_profile_id: a.profileId ?? settings.zernio_profile_id ?? null,
            platform: 'whatsapp',
            username: a.username ?? a.handle ?? null,
            display_name: a.name ?? a.displayName ?? a.username ?? null,
            status: 'active',
            connected_at: new Date().toISOString(),
            disconnected_at: null,
            metadata: a,
          },
          { onConflict: 'provider,zernio_account_id' }
        );
      }

      const { data: connections } = await supabase
        .from('channel_connections')
        .select('*')
        .order('created_at', { ascending: false });

      return json({ success: true, connections: connections ?? [] });
    }

    // ---------------------------------------------------------------
    if (action === 'disconnect') {
      const accountId = String(body.accountId ?? '');
      if (!accountId) return json({ error: 'accountId é obrigatório' }, 400);
      const res = await zernioFetch(apiKey, `/accounts/${accountId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        return json({ error: `Falha ao desconectar (HTTP ${res.status})`, details: res.data }, 500);
      }
      await supabase
        .from('channel_connections')
        .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
        .eq('zernio_account_id', accountId);
      return json({ success: true });
    }

    // ---------------------------------------------------------------
    if (action === 'remove') {
      const accountId = String(body.accountId ?? '');
      if (!accountId) return json({ error: 'accountId é obrigatório' }, 400);

      // Best-effort: revoga na Zernio antes de remover o registro local.
      const res = await zernioFetch(apiKey, `/accounts/${accountId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        console.warn('[ZernioConnect] remove: revogação falhou', res.status, res.data);
      }

      const { error: deleteError } = await supabase
        .from('channel_connections')
        .delete()
        .eq('zernio_account_id', accountId);
      if (deleteError) {
        return json({ error: `Falha ao remover a conta: ${deleteError.message}` }, 500);
      }
      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (error) {
    console.error('[ZernioConnect] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: errorMessage }, 500);
  }
});

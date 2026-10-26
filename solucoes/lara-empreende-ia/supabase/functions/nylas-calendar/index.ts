import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildNylasEventPayload, parseNylasEvent } from '../_shared/nylas-events.ts';

// Contrato de ações da agenda (mesmas ações e mesmo shape
// de status): o frontend e o orquestrador trocam de backend de agenda apenas
// escolhendo qual function invocar. O Nylas guarda os tokens do provedor; aqui
// vive somente o grant_id.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sem o generic Database, os types atuais do esm.sh inferem as tabelas como
// never; o acesso a dados usa o mesmo cast local das demais functions do repo.
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
type CalendarIntegration = {
  id: string;
  grant_id: string | null;
  grant_provider: string | null;
  calendar_id: string;
  account_email: string | null;
  status: 'active' | 'error' | 'disconnected';
  sync_enabled: boolean;
  create_meet: boolean;
  time_zone: string;
  last_synced_at: string | null;
  last_error: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function oauthResultPage(ok: boolean, message: string) {
  const safeMessage = escapeHtml(message);
  const payload = JSON.stringify({
    type: 'nylas-calendar-oauth',
    ok,
    message,
  }).replaceAll('<', '\\u003c');

  return new Response(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Agenda · Lara</title>
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #F7F8FA; color: #141414; }
      main { width: min(420px, calc(100% - 40px)); padding: 32px; border: 1px solid rgba(20,20,20,.1); border-radius: 20px; background: white; box-shadow: 0 20px 60px rgba(20,20,20,.12); text-align: center; }
      h1 { margin: 0 0 12px; font-size: 24px; font-weight: 600; }
      p { margin: 0; color: #526176; line-height: 1.55; }
    </style>
  </head>
  <body>
    <main>
      <h1>${ok ? 'Agenda conectada' : 'Não foi possível conectar'}</h1>
      <p>${safeMessage}</p>
    </main>
    <script>
      if (window.opener) window.opener.postMessage(${payload}, '*');
      if (${ok ? 'true' : 'false'}) window.setTimeout(() => window.close(), 900);
    </script>
  </body>
</html>`, {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function randomToken(bytes = 32) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type NylasConfig = {
  clientId: string;
  apiKey: string;
  apiUri: string;
  redirectUri: string;
};

/**
 * Credenciais vindas do banco (`lara_settings`), preenchidas pela tela de
 * Configurações. Carregadas uma vez por requisição; os secrets de ambiente
 * seguem valendo como fallback para instalações antigas.
 */
type StoredNylasCredentials = {
  clientId: string | null;
  apiKey: string | null;
  apiUri: string | null;
};

let storedCredentials: StoredNylasCredentials = { clientId: null, apiKey: null, apiUri: null };

async function loadStoredCredentials(supabase: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('lara_settings')
      .select('nylas_client_id, nylas_api_key, nylas_api_uri')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    storedCredentials = {
      clientId: data?.nylas_client_id ?? null,
      apiKey: data?.nylas_api_key ?? null,
      apiUri: data?.nylas_api_uri ?? null,
    };
  } catch (error) {
    // Coluna ausente (migration não aplicada) não pode derrubar a function:
    // o ambiente ainda pode estar configurado por secrets.
    console.error('[nylas-calendar] leitura das credenciais falhou', describeError(error));
    storedCredentials = { clientId: null, apiKey: null, apiUri: null };
  }
}

/** Versão que não lança: o `status` precisa relatar a falta de configuração. */
function nylasConfigOrNull(): NylasConfig | null {
  const clientId = storedCredentials.clientId || Deno.env.get('NYLAS_CLIENT_ID');
  const apiKey = storedCredentials.apiKey || Deno.env.get('NYLAS_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const apiUri = (storedCredentials.apiUri || Deno.env.get('NYLAS_API_URI') || 'https://api.us.nylas.com').replace(/\/$/, '');
  if (!clientId || !apiKey || !supabaseUrl) return null;
  return {
    clientId,
    apiKey,
    apiUri,
    redirectUri: `${supabaseUrl}/functions/v1/nylas-calendar`,
  };
}

/** Onde as credenciais em uso foram lidas — a tela precisa dizer isso. */
function credentialsSource(): 'settings' | 'env' | null {
  if (storedCredentials.clientId && storedCredentials.apiKey) return 'settings';
  if (Deno.env.get('NYLAS_CLIENT_ID') && Deno.env.get('NYLAS_API_KEY')) return 'env';
  return null;
}

function nylasConfig(): NylasConfig {
  const config = nylasConfigOrNull();
  if (!config) {
    throw new Error('A integração de agenda via Nylas ainda não foi configurada no servidor');
  }
  return config;
}

/**
 * Provedores realmente habilitados na aplicação Nylas, lidos dos connectors.
 * A interface só oferece o que existe — prometer Outlook sem connector leva o
 * cliente a uma tela de erro do Nylas.
 *
 * Lista vazia e `null` são coisas diferentes e a interface reage a cada uma:
 * `[]` é "a conta não tem connector nenhum" (não há o que oferecer), `null` é
 * "não deu para consultar" (aí a escolha volta para o próprio Nylas).
 */
const CONNECTORS_TTL_MS = 5 * 60_000;
// A falha também é cacheada, com prazo curto: sem isso, um Nylas fora do ar faz
// a tela de conexão bater no /v3/connectors a cada 2 segundos.
const CONNECTORS_FAILURE_TTL_MS = 30_000;
let connectorsCache: { providers: string[] | null; at: number } | null = null;

function rememberConnectors(providers: string[] | null): string[] | null {
  connectorsCache = { providers, at: Date.now() };
  return providers;
}

async function listNylasProviders(): Promise<string[] | null> {
  // A lista muda quando alguém mexe no dashboard do Nylas, não entre dois polls
  // de 2 segundos da tela de conexão.
  if (connectorsCache) {
    const ttl = connectorsCache.providers === null ? CONNECTORS_FAILURE_TTL_MS : CONNECTORS_TTL_MS;
    if (Date.now() - connectorsCache.at < ttl) return connectorsCache.providers;
  }
  try {
    const { response, data } = await nylasFetch('/v3/connectors');
    if (!response.ok || !Array.isArray(data?.data)) return rememberConnectors(null);
    const providers = data.data
      .map((connector: { provider?: unknown }) => connector?.provider)
      .filter((provider: unknown): provider is string => typeof provider === 'string' && provider.length > 0);
    return rememberConnectors(Array.from(new Set(providers)) as string[]);
  } catch (error) {
    console.error('[nylas-calendar] connectors list failed', error);
    return rememberConnectors(null);
  }
}

async function nylasFetch(path: string, init: RequestInit = {}) {
  const config = nylasConfig();
  const response = await fetch(`${config.apiUri}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/**
 * Erro do PostgREST é objeto simples, não Error — `instanceof Error` o
 * transformaria em "Erro interno" e a causa real (coluna inexistente, RLS)
 * ficaria só no log.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = error as { message?: unknown; code?: unknown; details?: unknown } | null;
  const message = typeof record?.message === 'string' ? record.message : null;
  const code = typeof record?.code === 'string' ? record.code : null;
  if (message) return code ? `${message} (${code})` : message;
  return 'Erro interno';
}

function nylasErrorMessage(data: unknown, fallback: string) {
  const record = data as { error?: { message?: string }; message?: string } | null;
  return record?.error?.message || record?.message || fallback;
}

async function getIntegration(supabase: SupabaseClient): Promise<CalendarIntegration | null> {
  const { data, error } = await supabase
    .from('calendar_integrations')
    .select('id, grant_id, grant_provider, calendar_id, account_email, status, sync_enabled, create_meet, time_zone, last_synced_at, last_error')
    .eq('provider', 'nylas')
    .maybeSingle();
  if (error) throw error;
  return (data as CalendarIntegration | null) ?? null;
}

/**
 * Leitura tolerante para o `status`: se a migration do Nylas não tiver sido
 * aplicada, as colunas grant_id/grant_provider não existem e o PostgREST
 * devolve 42703. Sem isto o `status` responde 500 e a interface não consegue
 * distinguir "não conectado" de "ambiente incompleto".
 */
async function probeIntegration(
  supabase: SupabaseClient,
): Promise<{ integration: CalendarIntegration | null; schemaReady: boolean }> {
  try {
    return { integration: await getIntegration(supabase), schemaReady: true };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === '42703' || code === '42P01') {
      console.error('[nylas-calendar] schema incompleto para o Nylas', code);
      return { integration: null, schemaReady: false };
    }
    throw error;
  }
}

async function markSyncError(supabase: SupabaseClient, appointmentId: string, cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  await supabase
    .from('appointments')
    .update({ calendar_sync_status: 'error', calendar_sync_error: message.slice(0, 500) })
    .eq('id', appointmentId);
  await supabase
    .from('calendar_integrations')
    .update({ status: 'error', last_error: message.slice(0, 500) })
    .eq('provider', 'nylas');
}

function grantPath(integration: CalendarIntegration, suffix = '') {
  if (!integration.grant_id) throw new Error('A conexão de agenda não possui um grant válido. Reconecte a agenda.');
  return `/v3/grants/${encodeURIComponent(integration.grant_id)}${suffix}`;
}

async function deleteExternalEvent(
  supabase: SupabaseClient,
  integration: CalendarIntegration,
  appointment: { id: string; external_calendar_event_id: string | null },
) {
  const eventId = appointment.external_calendar_event_id;
  if (!eventId) return;
  const calendarId = encodeURIComponent(integration.calendar_id || 'primary');
  const { response, data } = await nylasFetch(
    grantPath(integration, `/events/${encodeURIComponent(eventId)}?calendar_id=${calendarId}&notify_participants=true`),
    { method: 'DELETE' },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(nylasErrorMessage(data, `Falha ao remover evento na agenda (${response.status})`));
  }
  await supabase
    .from('appointments')
    .update({ external_calendar_event_id: null, calendar_sync_status: 'not_connected' })
    .eq('id', appointment.id);
}

/**
 * Retry sem duplicar: procura um evento já criado para este agendamento.
 * A chave reservada key1 é a única forma pesquisável de metadata no Nylas v3.
 */
async function findEventByAppointment(integration: CalendarIntegration, appointmentId: string): Promise<string | null> {
  const calendarId = encodeURIComponent(integration.calendar_id || 'primary');
  const { response, data } = await nylasFetch(
    grantPath(integration, `/events?calendar_id=${calendarId}&metadata_pair=${encodeURIComponent(`key1:${appointmentId}`)}&limit=1`),
  );
  if (!response.ok) return null;
  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const parsed = parseNylasEvent(first);
  return parsed?.id ?? null;
}

async function syncAppointment(supabase: SupabaseClient, appointmentId: string) {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .select('*, contact:contacts(email)')
    .eq('id', appointmentId)
    .single();
  if (error || !appointment) throw error || new Error('Agendamento não encontrado');

  const integration = await getIntegration(supabase);
  if (!integration || integration.status === 'disconnected' || !integration.sync_enabled || !integration.grant_id) {
    await supabase
      .from('appointments')
      .update({ calendar_sync_status: 'not_connected', calendar_sync_error: null })
      .eq('id', appointmentId);
    return { synced: false, reason: 'not_connected' };
  }

  // Claim atômico: dois syncs simultâneos do mesmo agendamento (retry do cron +
  // clique manual) criariam eventos duplicados — a busca por metadata não cobre
  // a janela entre consulta e criação. Um claim preso há mais de 2 min é
  // considerado morto e pode ser retomado.
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('appointments')
    .update({ calendar_sync_status: 'pending', calendar_sync_error: null })
    .eq('id', appointmentId)
    .or(`calendar_sync_status.neq.pending,updated_at.lt.${staleBefore}`)
    .select('id');
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return { synced: false, reason: 'sync_in_flight' };

  try {
    if (appointment.status === 'cancelled') {
      await deleteExternalEvent(supabase, integration, appointment);
      if (!appointment.external_calendar_event_id) {
        // Sem evento externo não há o que remover; o claim de 'pending' não
        // pode ficar preso para sempre.
        await supabase
          .from('appointments')
          .update({ calendar_sync_status: 'not_connected', calendar_sync_error: null })
          .eq('id', appointmentId);
      }
      return { synced: true, deleted: true };
    }

    const participants: Array<{ email: string }> = [];
    for (const attendee of appointment.attendees ?? []) {
      if (typeof attendee === 'string' && attendee.includes('@')) participants.push({ email: attendee });
    }
    if (typeof appointment.contact?.email === 'string' && appointment.contact.email.includes('@')) {
      participants.push({ email: appointment.contact.email });
    }

    const payload = buildNylasEventPayload({
      title: appointment.title,
      description: [appointment.description, 'Agendamento criado pela Lara · Empreende.IA']
        .filter(Boolean)
        .join('\n\n'),
      date: String(appointment.date),
      time: String(appointment.time).slice(0, 5),
      durationMinutes: appointment.duration || 60,
      timeZone: integration.time_zone,
      participants,
      appointmentId: appointment.id,
      createMeet: integration.create_meet,
      grantProvider: integration.grant_provider || '',
    });

    const calendarId = encodeURIComponent(integration.calendar_id || 'primary');
    let eventId = appointment.calendar_provider === 'nylas'
      ? (appointment.external_calendar_event_id as string | null)
      : null;
    let result: unknown = null;

    if (eventId) {
      const { response, data } = await nylasFetch(
        grantPath(integration, `/events/${encodeURIComponent(eventId)}?calendar_id=${calendarId}&notify_participants=true`),
        { method: 'PUT', body: JSON.stringify(payload) },
      );
      if (response.ok) {
        result = data?.data ?? data;
      } else if (response.status === 404 || response.status === 410) {
        eventId = null;
      } else {
        throw new Error(nylasErrorMessage(data, `Falha ao atualizar evento na agenda (${response.status})`));
      }
    }

    if (!eventId) {
      // O Nylas não aceita id de evento escolhido por nós; um retry após falha
      // parcial reencontra o evento pela metadata antes de criar outro.
      const existingId = await findEventByAppointment(integration, appointment.id);
      if (existingId) {
        const { response, data } = await nylasFetch(
          grantPath(integration, `/events/${encodeURIComponent(existingId)}?calendar_id=${calendarId}&notify_participants=true`),
          { method: 'PUT', body: JSON.stringify(payload) },
        );
        if (!response.ok) {
          throw new Error(nylasErrorMessage(data, `Falha ao atualizar evento na agenda (${response.status})`));
        }
        eventId = existingId;
        result = data?.data ?? data;
      } else {
        const { response, data } = await nylasFetch(
          grantPath(integration, `/events?calendar_id=${calendarId}&notify_participants=true`),
          { method: 'POST', body: JSON.stringify(payload) },
        );
        if (!response.ok) {
          throw new Error(nylasErrorMessage(data, `Falha ao criar evento na agenda (${response.status})`));
        }
        result = data?.data ?? data;
        const parsed = parseNylasEvent(result);
        if (!parsed) throw new Error('A agenda não retornou o evento criado.');
        eventId = parsed.id;
      }
    }

    const meetingUrl = parseNylasEvent(result)?.meetingUrl ?? null;
    const update: Record<string, unknown> = {
      calendar_provider: 'nylas',
      external_calendar_event_id: eventId,
      calendar_sync_status: 'synced',
      calendar_synced_at: new Date().toISOString(),
      calendar_sync_error: null,
    };
    if (meetingUrl) update.meeting_url = meetingUrl;

    await supabase.from('appointments').update(update).eq('id', appointment.id);
    await supabase
      .from('calendar_integrations')
      .update({ status: 'active', last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id);

    return { synced: true, eventId, meetingUrl };
  } catch (syncError) {
    await markSyncError(supabase, appointmentId, syncError);
    throw syncError;
  }
}

async function syncUpcoming(supabase: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('status', 'scheduled')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(250);
  if (error) throw error;

  let synced = 0;
  const errors: Array<{ id: string; message: string }> = [];
  for (const appointment of data ?? []) {
    try {
      const result = await syncAppointment(supabase, appointment.id);
      if (result.synced) synced += 1;
    } catch (error) {
      errors.push({
        id: appointment.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { total: data?.length ?? 0, synced, errors };
}

async function authenticate(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token) return null;
  if (serviceKey && token === serviceKey) return { userId: null, serviceRole: true, isAdmin: true };

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: isAdmin } = await supabase.rpc('has_role', {
    _user_id: data.user.id,
    _role: 'admin',
  });
  return { userId: data.user.id, serviceRole: false, isAdmin: !!isAdmin };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);
  await loadStoredCredentials(supabase);
  // Credenciais novas invalidam a lista de provedores em cache.
  connectorsCache = null;

  try {
    // Callback do Hosted OAuth: GET sem Authorization, validado pelo state.
    if (req.method === 'GET') {
      // O popup renderiza o que voltar daqui. Um erro que escapasse para o
      // catch geral chegaria ao cliente como JSON cru dentro da janela.
      try {
        const url = new URL(req.url);
        const oauthError = url.searchParams.get('error');
        if (oauthError) {
          return oauthResultPage(false, url.searchParams.get('error_description') || 'A autorização foi cancelada.');
        }
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) return oauthResultPage(false, 'Resposta de autorização incompleta.');

        const stateHash = await sha256(state);
        const { data: stateRow, error: stateError } = await supabase
          .from('calendar_oauth_states')
          .delete()
          .eq('state_hash', stateHash)
          .gt('expires_at', new Date().toISOString())
          .select('user_id')
          .maybeSingle();
        if (stateError) throw stateError;
        if (!stateRow) return oauthResultPage(false, 'A autorização expirou. Tente conectar novamente.');

        const config = nylasConfig();
        const { response, data } = await nylasFetch('/v3/connect/token', {
          method: 'POST',
          body: JSON.stringify({
            code,
            client_id: config.clientId,
            client_secret: config.apiKey,
            redirect_uri: config.redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        if (!response.ok || !data?.grant_id) {
          console.error('[nylas-calendar] token exchange failed', response.status, JSON.stringify(data).slice(0, 400));
          return oauthResultPage(false, nylasErrorMessage(data, 'O Nylas recusou a autorização.'));
        }

        // O token exchange nem sempre traz o provider; o grant tem a resposta
        // definitiva — e sem ele a sala automática (Meet/Teams) ficaria muda.
        let grantProvider = typeof data.provider === 'string' && data.provider ? data.provider : null;
        if (!grantProvider) {
          try {
            const grantInfo = await nylasFetch(`/v3/grants/${encodeURIComponent(data.grant_id)}`);
            const provider = grantInfo.data?.data?.provider;
            if (typeof provider === 'string' && provider) grantProvider = provider;
          } catch {
            // Sem o provider a conexão ainda funciona; só a sala automática fica desligada.
          }
        }

        // Reconexão preserva as preferências existentes; e-mail só é sobrescrito
        // quando o Nylas o informou.
        const existing = await getIntegration(supabase);
        const { error: upsertError } = await supabase
          .from('calendar_integrations')
          .upsert({
            provider: 'nylas',
            grant_id: data.grant_id,
            grant_provider: grantProvider,
            account_email: typeof data.email === 'string' && data.email ? data.email : existing?.account_email ?? null,
            owner_user_id: stateRow.user_id,
            status: 'active',
            sync_enabled: existing ? existing.sync_enabled : true,
            last_error: null,
          }, { onConflict: 'provider' });
        if (upsertError) throw upsertError;

        // Espelha os próximos agendamentos sem bloquear a página de retorno; o
        // waitUntil impede o runtime de encerrar a function junto com a Response.
        const initialSync = syncUpcoming(supabase).catch((error) => console.error('[nylas-calendar] initial sync', error));
        (globalThis as { EdgeRuntime?: { waitUntil?: (task: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(initialSync);

        return oauthResultPage(true, `Agenda de ${data.email || 'sua conta'} conectada. Pode fechar esta janela.`);
      } catch (callbackError) {
        console.error('[nylas-calendar] callback', callbackError);
        return oauthResultPage(false, describeError(callbackError));
      }
    }

    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    const auth = await authenticate(req, supabase);
    if (!auth) return json({ error: 'Não autorizado' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    const userActions = new Set(['status', 'sync_event', 'delete_event']);
    if (!auth.isAdmin && !userActions.has(action)) {
      return json({ error: 'Apenas administradores podem gerenciar a conexão da agenda.' }, 403);
    }

    if (action === 'status') {
      // O status nunca falha por ambiente incompleto: ele relata. É o único
      // jeito de a interface diferenciar "ninguém conectou ainda" de "esta
      // instalação ainda não tem a integração de pé".
      const config = nylasConfigOrNull();
      const { integration, schemaReady } = await probeIntegration(supabase);
      const alreadyConnected = Boolean(integration && integration.status !== 'disconnected' && integration.grant_id);
      // Quem já conectou não precisa da lista de provedores para nada, e o
      // polling da tela consulta o status de 2 em 2 segundos.
      const providers = config && schemaReady && !alreadyConnected ? await listNylasProviders() : null;
      const noConnector = Array.isArray(providers) && providers.length === 0;
      return json({
        provider: 'nylas',
        configured: Boolean(config) && schemaReady && !noConnector,
        missingConfig: [
          ...(config ? [] : ['credenciais do Nylas']),
          ...(schemaReady ? [] : ['migration da agenda']),
          ...(noConnector ? ['nenhum provedor habilitado no Nylas'] : []),
        ],
        providers,
        credentialsSource: credentialsSource(),
        connected: Boolean(integration && integration.status !== 'disconnected' && integration.grant_id),
        status: integration?.status ?? 'disconnected',
        accountEmail: integration?.account_email ?? null,
        grantProvider: integration?.grant_provider ?? null,
        calendarId: integration?.calendar_id ?? 'primary',
        syncEnabled: integration?.sync_enabled ?? false,
        createMeet: integration?.create_meet ?? false,
        timeZone: integration?.time_zone ?? 'America/Sao_Paulo',
        lastSyncedAt: integration?.last_synced_at ?? null,
        lastError: integration?.last_error ?? null,
      });
    }

    if (action === 'save_credentials') {
      const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const apiUriRaw = typeof body.apiUri === 'string' ? body.apiUri.trim() : '';
      if (!clientId || clientId.length > 200) return json({ error: 'Informe o Application ID (Client ID) do Nylas.' }, 400);
      if (!apiKey || apiKey.length > 400) return json({ error: 'Informe a API Key do Nylas.' }, 400);
      const apiUri = (apiUriRaw || 'https://api.us.nylas.com').replace(/\/$/, '');
      if (!/^https:\/\/[\w.-]+$/.test(apiUri)) return json({ error: 'A URL da API do Nylas é inválida.' }, 400);

      // Valida antes de gravar: chave errada salva vira erro só na conexão.
      const probe = await fetch(`${apiUri}/v3/connectors`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!probe) return json({ error: 'Não foi possível falar com o Nylas para validar a chave.' }, 502);
      if (probe.status === 401 || probe.status === 403) {
        return json({ error: 'O Nylas recusou esta API Key. Gere uma nova em API Keys e tente de novo.' }, 400);
      }
      const probeData = await probe.json().catch(() => ({}));
      if (!probe.ok) {
        return json({ error: nylasErrorMessage(probeData, `O Nylas respondeu ${probe.status} ao validar a chave.`) }, 400);
      }

      const { data: settingsRow, error: settingsError } = await supabase
        .from('lara_settings')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (!settingsRow?.id) return json({ error: 'Configurações da instância não encontradas.' }, 400);

      const { error: saveError } = await supabase
        .from('lara_settings')
        .update({ nylas_client_id: clientId, nylas_api_key: apiKey, nylas_api_uri: apiUri })
        .eq('id', settingsRow.id);
      if (saveError) throw saveError;

      storedCredentials = { clientId, apiKey, apiUri };
      connectorsCache = null;
      const providers = await listNylasProviders();
      return json({ ok: true, providers });
    }

    if (action === 'clear_credentials') {
      const { data: settingsRow } = await supabase.from('lara_settings').select('id').limit(1).maybeSingle();
      if (settingsRow?.id) {
        const { error: clearError } = await supabase
          .from('lara_settings')
          .update({ nylas_client_id: null, nylas_api_key: null, nylas_api_uri: null })
          .eq('id', settingsRow.id);
        if (clearError) throw clearError;
      }
      storedCredentials = { clientId: null, apiKey: null, apiUri: null };
      connectorsCache = null;
      return json({ ok: true });
    }

    if (action === 'connect') {
      if (!auth.userId) {
        // calendar_oauth_states.user_id é NOT NULL; conexão de agenda é um ato
        // de pessoa, não de serviço.
        return json({ error: 'Conecte a agenda pela interface, com uma sessão de usuário.' }, 400);
      }
      const config = nylasConfig();
      const state = randomToken();
      await supabase
        .from('calendar_oauth_states')
        .delete()
        .lt('expires_at', new Date().toISOString());
      const { error: stateError } = await supabase.from('calendar_oauth_states').insert({
        state_hash: await sha256(state),
        user_id: auth.userId,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (stateError) throw stateError;

      const authUrl = new URL(`${config.apiUri}/v3/connect/auth`);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('state', state);
      // Provedor escolhido na nossa tela pula o seletor do Nylas. Omitir o
      // parâmetro mantém o comportamento antigo (o Nylas pergunta).
      if (typeof body.provider === 'string' && body.provider) {
        authUrl.searchParams.set('provider', body.provider);
      }
      // Reconexão: o Nylas reautentica o grant existente em vez de criar outro.
      if (typeof body.loginHint === 'string' && body.loginHint) {
        authUrl.searchParams.set('login_hint', body.loginHint);
      }
      return json({ authUrl: authUrl.toString() });
    }

    if (action === 'update_settings') {
      const patch: Record<string, unknown> = {};
      if (typeof body.syncEnabled === 'boolean') patch.sync_enabled = body.syncEnabled;
      if (typeof body.createMeet === 'boolean') patch.create_meet = body.createMeet;
      if (typeof body.timeZone === 'string' && body.timeZone) {
        // Fuso inválido derrubaria TODA conversão de horário nos próximos syncs.
        try {
          new Intl.DateTimeFormat('pt-BR', { timeZone: body.timeZone }).format();
        } catch {
          return json({ error: 'Fuso horário inválido.' }, 400);
        }
        patch.time_zone = body.timeZone;
      }
      if (Object.keys(patch).length === 0) return json({ updated: false });
      const { error } = await supabase
        .from('calendar_integrations')
        .update(patch)
        .eq('provider', 'nylas');
      if (error) throw error;
      return json({ updated: true });
    }

    if (action === 'sync_all') {
      return json(await syncUpcoming(supabase));
    }

    if (action === 'sync_event') {
      if (typeof body.appointmentId !== 'string' || !body.appointmentId) {
        return json({ error: 'Informe o agendamento a sincronizar.' }, 400);
      }
      return json(await syncAppointment(supabase, body.appointmentId));
    }

    if (action === 'delete_event') {
      if (typeof body.appointmentId !== 'string' || !body.appointmentId) {
        return json({ error: 'Informe o agendamento a remover.' }, 400);
      }
      const integration = await getIntegration(supabase);
      if (!integration || !integration.grant_id) return json({ deleted: false, reason: 'not_connected' });
      const { data: appointment } = await supabase
        .from('appointments')
        .select('id, external_calendar_event_id, calendar_provider')
        .eq('id', body.appointmentId)
        .maybeSingle();
      if (!appointment) return json({ deleted: false, reason: 'not_found' });
      if (appointment.calendar_provider !== 'nylas') return json({ deleted: false, reason: 'not_found' });
      await deleteExternalEvent(supabase, integration, appointment);
      return json({ deleted: true });
    }

    if (action === 'disconnect') {
      const integration = await getIntegration(supabase);
      if (integration?.grant_id) {
        // Revoga o grant no Nylas; falha aqui não impede a desconexão local.
        try {
          await nylasFetch(`/v3/grants/${encodeURIComponent(integration.grant_id)}`, { method: 'DELETE' });
        } catch (revokeError) {
          console.error('[nylas-calendar] grant revoke failed', revokeError);
        }
      }
      const { error } = await supabase
        .from('calendar_integrations')
        .update({ status: 'disconnected', grant_id: null, grant_provider: null, last_error: null })
        .eq('provider', 'nylas');
      if (error) throw error;
      await supabase
        .from('appointments')
        .update({ calendar_sync_status: 'not_connected', calendar_sync_error: null })
        .eq('calendar_provider', 'nylas')
        .in('calendar_sync_status', ['synced', 'pending', 'error']);
      return json({ disconnected: true });
    }

    return json({ error: 'Ação desconhecida' }, 400);
  } catch (error) {
    console.error('[nylas-calendar] Error:', error);
    return json({ error: describeError(error) }, 500);
  }
});

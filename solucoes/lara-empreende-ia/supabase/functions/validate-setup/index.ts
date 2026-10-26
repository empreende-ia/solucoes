import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchAgentDraftRuntimeConfig,
  fetchPublishedAgentRuntimeConfig,
} from '../_shared/agent-config.ts';
import { resolveOpenAIKey } from '../_shared/llm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Para onde a tela manda a pessoa quando o item está pendente. A rota é a do
 *  app (react-router); tab e section viram query string no front. */
interface ValidationAction {
  route: string;
  tab?: string;
  section?: string;
  label?: string;
}

interface ValidationResult {
  component: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
  action?: ValidationAction;
}

/** Os seis itens que decidem se um lead real é atendido. O resto do relatório
 *  é diagnóstico: ajuda a entender, não bloqueia a operação. */
const GO_LIVE_COMPONENTS = [
  'identity',
  'whatsapp',
  'openai',
  'agent_config',
  'agent_prompt',
  'test_lead',
] as const;

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isTimeout(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

function errorText(error: unknown): string {
  if (isTimeout(error)) return `Sem resposta em ${TIMEOUT_MS / 1000} segundos.`;
  return error instanceof Error ? error.message : 'Falha de rede.';
}

function humanAgo(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `há ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/**
 * Validação real da chave: comprimento de string não diz nada sobre uma chave
 * revogada, e era exatamente isso que o card de saúde media antes.
 */
async function pingOpenAI(apiKey: string): Promise<{ ok: boolean; status: number | null; message: string }> {
  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) {
      return { ok: true, status: response.status, message: 'Chave válida' };
    }

    let providerMessage = `A OpenAI respondeu ${response.status}.`;
    try {
      const body = await response.json();
      const detail = body?.error?.message;
      if (typeof detail === 'string' && detail.trim()) providerMessage = detail.trim();
    } catch {
      // corpo não-JSON: fica a mensagem com o código HTTP
    }
    return { ok: false, status: response.status, message: providerMessage };
  } catch (error) {
    return { ok: false, status: null, message: errorText(error) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: ValidationResult[] = [];

    // ------------------------------------------------------------------
    // 1. Vínculo com o workspace — sem ele nada mais funciona de verdade
    // ------------------------------------------------------------------
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, can_publish_agent, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const workspaceId: string | null = membership?.workspace_id ?? null;

    if (membershipError) {
      results.push({
        component: 'workspace_membership',
        status: 'error',
        message: 'Não foi possível verificar o vínculo com o workspace.',
        details: membershipError.message,
        action: { route: '/team', label: 'Abrir equipe' },
      });
    } else if (workspaceId) {
      results.push({
        component: 'workspace_membership',
        status: 'ok',
        message: membership?.can_publish_agent
          ? `Acesso ativo como ${membership.role}, com permissão de publicar.`
          : `Acesso ativo como ${membership?.role ?? 'membro'}.`,
        details: membership?.can_publish_agent
          ? undefined
          : 'Esta conta não pode publicar versões da agente. Peça a um admin.',
        action: { route: '/team', label: 'Abrir equipe' },
      });
    } else {
      results.push({
        component: 'workspace_membership',
        status: 'error',
        message: 'Esta conta não está vinculada a nenhum workspace.',
        details: 'Peça a um admin para liberar o seu e-mail e refazer o primeiro acesso.',
        action: { route: '/team', label: 'Abrir equipe' },
      });
    }

    const publishedAgent = await fetchPublishedAgentRuntimeConfig(supabase, user.id);

    // ------------------------------------------------------------------
    // 2. Configurações (fallback triplo, instalação single-tenant)
    // ------------------------------------------------------------------
    let settings: Record<string, any> | null = null;
    let settingsError: { message?: string } | null = null;

    const { data: userSettings, error: err1 } = await supabase
      .from('lara_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    settings = userSettings;
    settingsError = err1;

    if (!settings) {
      const { data: globalSettings, error: err2 } = await supabase
        .from('lara_settings')
        .select('*')
        .is('user_id', null)
        .maybeSingle();
      settings = globalSettings;
      if (!settingsError) settingsError = err2;
    }

    if (!settings) {
      const { data: anySettings, error: err3 } = await supabase
        .from('lara_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      settings = anySettings;
      if (!settingsError) settingsError = err3;
    }

    if (settingsError || !settings) {
      results.push({
        component: 'lara_settings',
        status: 'error',
        message: 'Configurações não encontradas.',
        details: 'Recarregue a página para o sistema se inicializar. Se persistir, avise um admin.',
        action: { route: '/settings', tab: 'apis' },
      });
      results.push({
        component: 'identity',
        status: 'error',
        message: 'Identidade não configurada.',
        details: 'Sem a linha de configurações não há onde gravar nome da empresa e da agente.',
        action: { route: '/settings', tab: 'agent', section: 'identity' },
      });
    } else {
      // Identidade
      if (settings.company_name && settings.sdr_name) {
        results.push({
          component: 'identity',
          status: 'ok',
          message: `${settings.sdr_name} atende pela ${settings.company_name}.`,
          action: { route: '/settings', tab: 'agent', section: 'identity' },
        });
      } else {
        results.push({
          component: 'identity',
          status: 'error',
          message: 'Identidade não configurada.',
          details: 'Informe o nome da empresa e o nome da agente.',
          action: { route: '/settings', tab: 'agent', section: 'identity' },
        });
      }

      // ElevenLabs (opcional)
      if (settings.elevenlabs_api_key) {
        try {
          const elResponse = await fetchWithTimeout('https://api.elevenlabs.io/v1/user', {
            headers: { 'xi-api-key': settings.elevenlabs_api_key },
          });
          results.push(
            elResponse.ok
              ? { component: 'elevenlabs', status: 'ok', message: 'ElevenLabs conectado' }
              : {
                  component: 'elevenlabs',
                  status: 'error',
                  message: 'Chave do ElevenLabs inválida.',
                  details: `A ElevenLabs respondeu ${elResponse.status}.`,
                  action: { route: '/settings', tab: 'apis' },
                },
          );
        } catch (error) {
          results.push({
            component: 'elevenlabs',
            status: 'warning',
            message: 'Não foi possível validar o ElevenLabs.',
            details: errorText(error),
            action: { route: '/settings', tab: 'apis' },
          });
        }
      } else {
        results.push({
          component: 'elevenlabs',
          status: 'warning',
          message: 'ElevenLabs não configurado (opcional).',
          details: 'Respostas em áudio não estarão disponíveis.',
          action: { route: '/settings', tab: 'apis' },
        });
      }

      // Horário comercial
      if (settings.business_hours_start && settings.business_hours_end) {
        results.push({
          component: 'business_hours',
          status: 'ok',
          message: `Atendimento das ${settings.business_hours_start} às ${settings.business_hours_end}.`,
          action: { route: '/settings', tab: 'agent', section: 'sales' },
        });
      } else {
        results.push({
          component: 'business_hours',
          status: 'warning',
          message: 'Horário comercial não configurado.',
          details: 'A agente responde a qualquer hora enquanto isso não for definido.',
          action: { route: '/settings', tab: 'agent', section: 'sales' },
        });
      }
    }

    // ------------------------------------------------------------------
    // 3. Canal: Zernio (channel_connections) OU Cloud API
    // ------------------------------------------------------------------
    const { data: connections, error: connectionsError } = await supabase
      .from('channel_connections')
      .select('id, platform, display_name, username, status')
      .eq('status', 'active')
      .limit(10);

    const activeChannels = (connections ?? []).filter(
      (row: any) => row.platform === 'whatsapp' || row.platform === 'instagram',
    );
    const whatsappConnection = activeChannels.find((row: any) => row.platform === 'whatsapp');
    const hasCloudCredentials = Boolean(
      settings?.whatsapp_access_token && settings?.whatsapp_phone_number_id,
    );
    const channelAction: ValidationAction = { route: '/settings', tab: 'channels' };

    if (connectionsError) {
      results.push({
        component: 'whatsapp',
        status: 'warning',
        message: 'Não foi possível ler as conexões de canal.',
        details: connectionsError.message,
        action: channelAction,
      });
    } else if (whatsappConnection) {
      const name =
        whatsappConnection.display_name || whatsappConnection.username || 'conta conectada';
      results.push({
        component: 'whatsapp',
        status: 'ok',
        message: `WhatsApp conectado pela Zernio: ${name}.`,
        details: hasCloudCredentials
          ? 'Há também credenciais da Cloud API salvas. Use apenas um caminho por número.'
          : undefined,
        action: channelAction,
      });
    } else if (hasCloudCredentials) {
      try {
        const waResponse = await fetchWithTimeout(
          `https://graph.facebook.com/v18.0/${settings!.whatsapp_phone_number_id}`,
          { headers: { Authorization: `Bearer ${settings!.whatsapp_access_token}` } },
        );

        if (waResponse.ok) {
          const waData = await waResponse.json();
          results.push({
            component: 'whatsapp',
            status: 'ok',
            message: `WhatsApp Cloud API conectada: ${waData.display_phone_number || 'número ativo'}.`,
            action: channelAction,
          });
        } else {
          results.push({
            component: 'whatsapp',
            status: 'error',
            message: 'Token da Cloud API inválido ou expirado.',
            details: `A Meta respondeu ${waResponse.status}. Gere um novo token no Facebook Developer.`,
            action: channelAction,
          });
        }
      } catch (error) {
        results.push({
          component: 'whatsapp',
          status: 'warning',
          message: 'Não foi possível validar a Cloud API.',
          details: errorText(error),
          action: channelAction,
        });
      }
    } else if (activeChannels.length > 0) {
      results.push({
        component: 'whatsapp',
        status: 'warning',
        message: 'Nenhuma conta de WhatsApp conectada.',
        details: 'Existe outro canal ativo, mas o atendimento por WhatsApp ainda não foi ligado.',
        action: channelAction,
      });
    } else {
      results.push({
        component: 'whatsapp',
        status: 'error',
        message: 'Nenhum canal conectado.',
        details: 'Conecte pela Zernio ou informe as credenciais da WhatsApp Cloud API.',
        action: channelAction,
      });
    }

    // ------------------------------------------------------------------
    // 4. Chave da OpenAI — validada de verdade contra o provedor
    // ------------------------------------------------------------------
    const openaiApiKey = resolveOpenAIKey(settings);
    const openaiAction: ValidationAction = { route: '/settings', tab: 'apis' };

    if (!openaiApiKey) {
      results.push({
        component: 'openai',
        status: 'error',
        message: 'Chave da OpenAI não configurada.',
        details: 'Sem a chave a agente não redige resposta nenhuma. Informe em Configurações → APIs.',
        action: openaiAction,
      });
    } else {
      const ping = await pingOpenAI(openaiApiKey);
      if (ping.ok) {
        results.push({
          component: 'openai',
          status: 'ok',
          message: 'Chave da OpenAI validada com o provedor.',
          action: openaiAction,
        });
      } else if (ping.status === 429) {
        results.push({
          component: 'openai',
          status: 'warning',
          message: 'A OpenAI aceitou a chave, mas está limitando as chamadas.',
          details: ping.message,
          action: openaiAction,
        });
      } else if (ping.status === null) {
        results.push({
          component: 'openai',
          status: 'warning',
          message: 'Não foi possível falar com a OpenAI agora.',
          details: ping.message,
          action: openaiAction,
        });
      } else {
        results.push({
          component: 'openai',
          status: 'error',
          message: 'A OpenAI recusou a chave configurada.',
          details: ping.message,
          action: openaiAction,
        });
      }
    }

    // ------------------------------------------------------------------
    // 5. Agente configurada (rascunho) e versão publicada
    // ------------------------------------------------------------------
    const draft = await fetchAgentDraftRuntimeConfig(supabase, user.id);
    const draftIdentity = (draft?.config as any)?.identity ?? {};
    const requiredIdentity: Array<[string, string]> = [
      ['agentName', 'nome da agente'],
      ['companyName', 'nome da empresa'],
      ['role', 'função da agente'],
      ['whatCompanySells', 'o que a empresa vende'],
      ['primaryAudience', 'público principal'],
    ];
    const missingIdentity = requiredIdentity
      .filter(([field]) => !String(draftIdentity?.[field] ?? '').trim())
      .map(([, label]) => label);
    const agentAction: ValidationAction = { route: '/settings', tab: 'agent', section: 'identity' };

    if (!draft) {
      results.push({
        component: 'agent_config',
        status: 'error',
        message: 'Configuração da agente indisponível.',
        details: workspaceId
          ? 'O workspace ainda não tem agente com rascunho. Abra Configurações → Agente.'
          : 'Sem vínculo com workspace não existe rascunho de agente para ler.',
        action: agentAction,
      });
    } else if (missingIdentity.length === 0) {
      results.push({
        component: 'agent_config',
        status: 'ok',
        message: `Agente configurada no rascunho r${draft.revision}.`,
        action: agentAction,
      });
    } else if (publishedAgent) {
      results.push({
        component: 'agent_config',
        status: 'warning',
        message: 'O rascunho perdeu campos que a versão no ar já tem.',
        details: `Faltam: ${missingIdentity.join(', ')}.`,
        action: agentAction,
      });
    } else {
      results.push({
        component: 'agent_config',
        status: 'error',
        message: 'Agente ainda não configurada.',
        details: `Faltam: ${missingIdentity.join(', ')}.`,
        action: agentAction,
      });
    }

    if (publishedAgent) {
      results.push({
        component: 'agent_prompt',
        status: 'ok',
        message: `Versão ${publishedAgent.versionNumber} publicada e no ar.`,
        action: { route: '/settings', tab: 'agent', section: 'publish' },
      });
    } else {
      // Sem versão publicada o orquestrador recusa toda mensagem real: isso é
      // erro, não aviso.
      results.push({
        component: 'agent_prompt',
        status: 'error',
        message: 'Nenhuma versão publicada.',
        details: 'Sem versão publicada a Lara não responde lead nenhum. Rode os testes e publique.',
        action: { route: '/settings', tab: 'agent', section: 'publish' },
      });
    }

    // ------------------------------------------------------------------
    // 6. Lead de teste respondido
    // ------------------------------------------------------------------
    let testConversationId: string | null = null;
    // Filtra pelo workspace desta conta: sem isso o id devolvido poderia ser de
    // outro workspace, e a conversation_delivery_trace recusaria a leitura.
    let testConversationQuery = supabase
      .from('conversations')
      .select('id, created_at, last_message_at')
      .eq('metadata->>test', 'true');
    if (workspaceId) {
      testConversationQuery = testConversationQuery.eq('workspace_id', workspaceId);
    }
    const { data: testConversation } = await testConversationQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (testConversation?.id) {
      testConversationId = testConversation.id;
      const { data: laraReply } = await supabase
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', testConversation.id)
        .eq('from_type', 'lara')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (laraReply?.id) {
        const when = humanAgo(laraReply.created_at);
        results.push({
          component: 'test_lead',
          status: 'ok',
          message: when ? `Lead de teste respondido ${when}.` : 'Lead de teste respondido.',
          action: { route: '/chat', label: 'Abrir conversas' },
        });
      } else {
        results.push({
          component: 'test_lead',
          status: 'error',
          message: 'O lead de teste ainda não foi respondido.',
          details: 'Abra o painel de teste para ver em qual etapa a mensagem parou.',
        });
      }
    } else {
      // Sem lead de teste, uma resposta real já prova a mesma coisa: a agente
      // atendeu alguém. Remover o teste depois de operar não zera o checklist.
      const { data: realReply } = await supabase
        .from('messages')
        .select('created_at')
        .eq('from_type', 'lara')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (realReply?.created_at) {
        const when = humanAgo(realReply.created_at);
        results.push({
          component: 'test_lead',
          status: 'ok',
          message: when ? `A Lara respondeu uma conversa ${when}.` : 'A Lara já respondeu uma conversa.',
          action: { route: '/chat', label: 'Abrir conversas' },
        });
      } else {
        results.push({
          component: 'test_lead',
          status: 'warning',
          message: 'Nenhum lead de teste enviado.',
          details: 'Envie uma mensagem de teste para ver a Lara respondendo antes de anunciar o número.',
        });
      }
    }

    // ------------------------------------------------------------------
    // 7. Sinais de operação: última entrada e último envio
    // ------------------------------------------------------------------
    const { data: lastInbound } = await supabase
      .from('messages')
      .select('created_at')
      .eq('from_type', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const inboundAgo = humanAgo(lastInbound?.created_at);
    results.push(
      inboundAgo
        ? {
            component: 'last_inbound',
            status: 'ok',
            message: `Última mensagem recebida ${inboundAgo}.`,
            action: { route: '/chat', label: 'Abrir conversas' },
          }
        : {
            component: 'last_inbound',
            status: 'warning',
            message: 'Nenhuma mensagem recebida ainda.',
            details: 'O canal está conectado, mas nenhum lead escreveu até agora.',
            action: { route: '/chat', label: 'Abrir conversas' },
          },
    );

    const { data: lastSend } = await supabase
      .from('send_queue')
      .select('status, error_message, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastSend) {
      results.push({
        component: 'last_send',
        status: 'warning',
        message: 'Nenhum envio registrado.',
        details: 'A Lara ainda não entregou nenhuma resposta ao canal.',
        action: { route: '/chat', label: 'Abrir conversas' },
      });
    } else if (lastSend.status === 'completed') {
      const sentAgo = humanAgo(lastSend.sent_at ?? lastSend.created_at);
      results.push({
        component: 'last_send',
        status: 'ok',
        message: sentAgo ? `Último envio concluído ${sentAgo}.` : 'Último envio concluído.',
        action: { route: '/chat', label: 'Abrir conversas' },
      });
    } else if (lastSend.status === 'failed') {
      results.push({
        component: 'last_send',
        status: 'error',
        message: 'O último envio falhou.',
        details: lastSend.error_message || 'O canal recusou a entrega.',
        action: { route: '/chat', label: 'Abrir conversas' },
      });
    } else {
      const queuedAgo = humanAgo(lastSend.created_at);
      results.push({
        component: 'last_send',
        status: 'warning',
        message: queuedAgo ? `Envio na fila desde ${queuedAgo}.` : 'Envio na fila.',
        details: 'A resposta foi redigida e aguarda entrega ao canal.',
        action: { route: '/chat', label: 'Abrir conversas' },
      });
    }

    // ------------------------------------------------------------------
    // 8. Pipeline e perfil
    // ------------------------------------------------------------------
    const { count: stagesCount } = await supabase
      .from('pipeline_stages')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    results.push(
      stagesCount && stagesCount > 0
        ? {
            component: 'pipeline',
            status: 'ok',
            message: `${stagesCount} ${stagesCount === 1 ? 'etapa ativa' : 'etapas ativas'} no funil.`,
            action: { route: '/pipeline' },
          }
        : {
            component: 'pipeline',
            status: 'warning',
            message: 'Funil sem etapas ativas.',
            details: 'As oportunidades criadas pela Lara não terão onde entrar.',
            action: { route: '/pipeline' },
          },
    );

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    results.push(
      profile
        ? {
            component: 'profile',
            status: 'ok',
            message: profile.full_name || 'Perfil criado',
            action: { route: '/team' },
          }
        : {
            component: 'profile',
            status: 'warning',
            message: 'Perfil não encontrado.',
            details: profileError?.message ?? 'O perfil é criado no primeiro acesso.',
            action: { route: '/team' },
          },
    );

    // ------------------------------------------------------------------
    // Resumo
    // ------------------------------------------------------------------
    const hasErrors = results.some((r) => r.status === 'error');
    const hasWarnings = results.some((r) => r.status === 'warning');
    const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok';

    const okCount = results.filter((r) => r.status === 'ok').length;
    const totalCount = results.length;

    const goLiveResults = GO_LIVE_COMPONENTS.map((component) =>
      results.find((r) => r.component === component),
    ).filter(Boolean) as ValidationResult[];
    const goLiveOk = goLiveResults.filter((r) => r.status === 'ok').length;
    const goLivePending = GO_LIVE_COMPONENTS.length - goLiveOk;

    return new Response(JSON.stringify({
      results,
      overallStatus,
      summary: {
        ok: okCount,
        total: totalCount,
        percentage: Math.round((okCount / totalCount) * 100),
      },
      goLive: {
        components: GO_LIVE_COMPONENTS,
        ok: goLiveOk,
        total: GO_LIVE_COMPONENTS.length,
        percentage: Math.round((goLiveOk / GO_LIVE_COMPONENTS.length) * 100),
        ready: goLivePending === 0,
      },
      workspaceId,
      testConversationId,
      generatedAt: new Date().toISOString(),
      // Sem emoji: a mensagem vai direto para a tela, e o ícone de estado já é
      // renderizado pelo componente.
      message: goLivePending === 0
        ? 'A Lara está pronta para atender.'
        : goLivePending === 1
        ? 'Falta 1 item para a Lara atender.'
        : `Faltam ${goLivePending} itens para a Lara atender.`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in validate-setup:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

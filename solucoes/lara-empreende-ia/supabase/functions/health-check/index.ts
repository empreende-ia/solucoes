import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveModelSettings, resolveOpenAIKey } from '../_shared/llm.ts';
import { fetchPublishedAgentRuntimeConfig } from '../_shared/agent-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheckResult {
  component: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user_id from auth token for multi-tenant filtering
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    console.log('[health-check] Running for user:', userId || 'anonymous');

    const results: HealthCheckResult[] = [];
    const publishedAgent = userId
      ? await fetchPublishedAgentRuntimeConfig(supabase, userId)
      : null;

    // 2. Check lara_settings com fallback triplo
    console.log('[health-check] Checking lara_settings...');
    let settings = null;
    let settingsError = null;

    // 1. Tentar por user_id
    if (userId) {
      const { data, error } = await supabase
        .from('lara_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      settings = data;
      settingsError = error;
    }

    // 2. Fallback: buscar global (user_id IS NULL)
    if (!settings && !settingsError) {
      console.log('[health-check] No user-specific settings, trying global...');
      const { data, error } = await supabase
        .from('lara_settings')
        .select('*')
        .is('user_id', null)
        .maybeSingle();
      settings = data;
      settingsError = error;
    }

    // 3. Último fallback: qualquer settings
    if (!settings && !settingsError) {
      console.log('[health-check] No global settings, fetching any...');
      const { data, error } = await supabase
        .from('lara_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      settings = data;
      settingsError = error;
    }

    // 1. Check chave da OpenAI (cascata: lara_settings da UI → secret OPENAI_API_KEY)
    console.log('[health-check] Checking OpenAI key...');
    const openaiApiKey = resolveOpenAIKey(settings);
    if (openaiApiKey && openaiApiKey.length > 10) {
      results.push({
        component: 'openai_api_key',
        status: 'ok',
        message: 'Chave da OpenAI configurada',
        details: { configured: true },
      });
    } else {
      results.push({
        component: 'openai_api_key',
        status: 'error',
        message: 'Chave da OpenAI não configurada. A IA não funcionará — informe na aba APIs ou defina o secret OPENAI_API_KEY.',
        details: { configured: false },
      });
    }

    if (settingsError) {
      results.push({
        component: 'lara_settings',
        status: 'error',
        message: 'Erro ao verificar configurações: ' + settingsError.message,
      });
    } else if (!settings) {
      results.push({
        component: 'lara_settings',
        status: 'error',
        message: 'Configurações não encontradas. Execute o onboarding.',
      });
    } else {
      // Check WhatsApp configuration
      const whatsappConfigured = !!(
        settings.whatsapp_access_token &&
        settings.whatsapp_phone_number_id
      );

      if (whatsappConfigured) {
        results.push({
          component: 'whatsapp',
          status: 'ok',
          message: 'WhatsApp está configurado',
          details: {
            hasAccessToken: !!settings.whatsapp_access_token,
            hasPhoneNumberId: !!settings.whatsapp_phone_number_id,
            hasBusinessAccountId: !!settings.whatsapp_business_account_id,
            hasVerifyToken: !!settings.whatsapp_verify_token,
          },
        });
      } else {
        results.push({
          component: 'whatsapp',
          status: 'warning',
          message: 'WhatsApp não está totalmente configurado',
          details: {
            hasAccessToken: !!settings.whatsapp_access_token,
            hasPhoneNumberId: !!settings.whatsapp_phone_number_id,
            hasBusinessAccountId: !!settings.whatsapp_business_account_id,
            hasVerifyToken: !!settings.whatsapp_verify_token,
          },
        });
      }

      // Check company identity
      if (settings.company_name && settings.sdr_name) {
        results.push({
          component: 'identity',
          status: 'ok',
          message: 'Identidade da empresa configurada',
          details: {
            companyName: settings.company_name,
            sdrName: settings.sdr_name,
          },
        });
      } else {
        results.push({
          component: 'identity',
          status: 'warning',
          message: 'Configure o nome da empresa e do agente',
          details: {
            hasCompanyName: !!settings.company_name,
            hasSdrName: !!settings.sdr_name,
          },
        });
      }

      // O runtime só pode usar uma versão estruturada e publicada.
      if (publishedAgent) {
        results.push({
          component: 'agent_prompt',
          status: 'ok',
          message: `Agente publicado na versão ${publishedAgent.versionNumber}`,
          details: { versionId: publishedAgent.versionId, checksum: publishedAgent.checksum },
        });
      } else {
        results.push({
          component: 'agent_prompt',
          status: 'warning',
          message: 'Ainda não existe uma versão publicada da agente',
          details: { runtimeBlockedUntilPublish: true },
        });
      }

      // Check business hours configuration
      const businessHoursConfigured = !!(
        settings.timezone &&
        settings.business_hours_start &&
        settings.business_hours_end &&
        settings.business_days?.length > 0
      );

      if (businessHoursConfigured) {
        results.push({
          component: 'business_hours',
          status: 'ok',
          message: 'Horário comercial configurado',
          details: {
            timezone: settings.timezone,
            start: settings.business_hours_start,
            end: settings.business_hours_end,
            days: settings.business_days,
          },
        });
      } else {
        results.push({
          component: 'business_hours',
          status: 'warning',
          message: 'Horário comercial não configurado',
        });
      }

      // Check ElevenLabs (optional)
      if (settings.elevenlabs_api_key) {
        results.push({
          component: 'elevenlabs',
          status: 'ok',
          message: 'ElevenLabs configurado para respostas em áudio',
          details: { audioEnabled: settings.audio_response_enabled },
        });
      } else {
        results.push({
          component: 'elevenlabs',
          status: 'warning',
          message: 'ElevenLabs não configurado (opcional - respostas em áudio)',
        });
      }

      results.push({
        component: 'lara_settings',
        status: 'ok',
        message: 'Configurações do sistema encontradas',
        details: (() => {
          // Configuração efetiva de LLM (ai_model_mode é legado e pode estar congelado)
          const llm = resolveModelSettings(settings);
          return {
            isActive: settings.is_active,
            autoResponseEnabled: settings.auto_response_enabled,
            aiProvider: llm.provider,
            aiModel: llm.adaptive ? 'adaptive' : llm.model,
          };
        })(),
      });
    }

    // 3. Check pipeline_stages (single-tenant - no user_id filter)
    console.log('[health-check] Checking pipeline_stages...');
    const { data: stages, error: stagesError } = await supabase
      .from('pipeline_stages')
      .select('id, title')
      .eq('is_active', true);

    if (stagesError) {
      results.push({
        component: 'pipeline_stages',
        status: 'error',
        message: 'Erro ao verificar pipeline: ' + stagesError.message,
      });
    } else if (!stages || stages.length === 0) {
      results.push({
        component: 'pipeline_stages',
        status: 'error',
        message: 'Nenhum estágio de pipeline encontrado. Clique em "Inicializar Sistema".',
      });
    } else {
      results.push({
        component: 'pipeline_stages',
        status: 'ok',
        message: `${stages.length} estágios de pipeline configurados`,
        details: { count: stages.length, stages: stages.map(s => s.title) },
      });
    }

    // 4. Check tag_definitions (single-tenant - no user_id filter)
    console.log('[health-check] Checking tag_definitions...');
    const { data: tags, error: tagsError } = await supabase
      .from('tag_definitions')
      .select('id')
      .eq('is_active', true);

    if (tagsError) {
      results.push({
        component: 'tag_definitions',
        status: 'error',
        message: 'Erro ao verificar tags: ' + tagsError.message,
      });
    } else if (!tags || tags.length === 0) {
      results.push({
        component: 'tag_definitions',
        status: 'warning',
        message: 'Nenhuma tag configurada',
      });
    } else {
      results.push({
        component: 'tag_definitions',
        status: 'ok',
        message: `${tags.length} tags configuradas`,
        details: { count: tags.length },
      });
    }

    // 5. Check teams (single-tenant - no user_id filter)
    console.log('[health-check] Checking teams...');
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name')
      .eq('is_active', true);

    if (teamsError) {
      results.push({
        component: 'teams',
        status: 'error',
        message: 'Erro ao verificar equipes: ' + teamsError.message,
      });
    } else if (!teams || teams.length === 0) {
      results.push({
        component: 'teams',
        status: 'warning',
        message: 'Nenhuma equipe configurada',
      });
    } else {
      results.push({
        component: 'teams',
        status: 'ok',
        message: `${teams.length} equipes configuradas`,
        details: { count: teams.length, teams: teams.map(t => t.name) },
      });
    }

    // Calculate overall status
    const hasErrors = results.some(r => r.status === 'error');
    const hasWarnings = results.some(r => r.status === 'warning');
    const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok';

    console.log('[health-check] Complete:', { overallStatus, results });

    return new Response(
      JSON.stringify({
        success: true,
        status: overallStatus,
        message: hasErrors 
          ? 'Sistema precisa de configuração'
          : hasWarnings 
          ? 'Sistema funcional com algumas pendências' 
          : 'Sistema totalmente configurado',
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[health-check] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Erro desconhecido',
        results: [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  runLaraAgent,
  fetchCanonicalFacts,
  buildGroundingSection,
  buildEnhancedPrompt,
  processPromptTemplate,
  resolveModelSettings,
} from "../_shared/lara-engine.ts";
import { resolveOpenAIKey } from "../_shared/llm.ts";
import {
  fetchAgentDraftRuntimeConfig,
  userCanEditAgent,
} from "../_shared/agent-config.ts";
import { compileAgentPrompt } from "../_shared/agent-prompt-compiler.ts";
import {
  getActionPolicy,
  hasExplicitConfirmation,
  simulationResult,
  validateScheduleRequest,
} from "../_shared/action-policy.ts";
import { consumeRateLimit, RateLimitError } from "../_shared/rate-limit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mesmos contratos expostos em produção; o executor abaixo nunca grava dados.
const simulatedAppointmentTools = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Consultar disponibilidade sem criar evento.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM" },
          duration: { type: "number" },
        },
        required: ["date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_appointment",
      description: "Criar um agendamento/reunião/demo para o cliente.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM" },
          duration: { type: "number" },
          type: { type: "string", enum: ["demo", "meeting", "support", "followup"] },
          description: { type: "string" },
          confirmation_evidence: { type: "string", description: "Trecho literal recente escrito pelo lead confirmando a ação" },
        },
        required: ["title", "date", "time", "type", "confirmation_evidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reagendar um compromisso existente.",
      parameters: {
        type: "object",
        properties: {
          new_date: { type: "string", description: "YYYY-MM-DD" },
          new_time: { type: "string", description: "HH:MM" },
          reason: { type: "string" },
          confirmation_evidence: { type: "string" },
        },
        required: ["new_date", "new_time", "confirmation_evidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancelar um compromisso existente.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          confirmation_evidence: { type: "string" },
        },
        required: ["confirmation_evidence"],
      },
    },
  },
];

const simulatedHandoffTool = {
  type: "function",
  function: {
    name: "human_handoff",
    description: "Transferir a conversa para atendimento humano.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        summary: { type: "string" },
        confirmation_evidence: { type: "string" },
      },
      required: ["reason", "summary", "confirmation_evidence"],
    },
  },
};

const simulatedOptOutTool = {
  type: "function",
  function: {
    name: "register_opt_out",
    description: "Registrar que o lead não quer mais receber mensagens e pausar a conversa.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        confirmation_evidence: { type: "string" },
      },
      required: ["reason", "confirmation_evidence"],
    },
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Exige usuário autenticado
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Administradores e editores do workspace podem testar. Observadores e
    // usuários sem membership continuam bloqueados para evitar proxy de LLM.
    if (!await userCanEditAgent(supabase, userData.user.id)) {
      return new Response(JSON.stringify({ error: 'Sem permissão para usar o simulador' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const history: Array<{ role: string; content: string }> = (body.messages ?? [])
      .filter((m: any) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .slice(-30);

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return new Response(JSON.stringify({ error: 'Envie ao menos uma mensagem de usuário' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabase
      .from('lara_settings')
      .select('ai_model_mode, ai_provider, ai_model, anthropic_api_key, openai_api_key, sdr_name, company_name')
      .limit(1)
      .maybeSingle();

    const draftAgent = await fetchAgentDraftRuntimeConfig(
      supabase,
      userData.user.id,
    );
    if (!draftAgent) {
      return new Response(JSON.stringify({ error: 'Rascunho da agente não encontrado' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    await consumeRateLimit(supabase, {
      workspaceId: draftAgent.workspaceId,
      subjectKey: userData.user.id,
      operation: 'agent_simulator',
      maxRequests: 30,
      windowSeconds: 60,
    });

    // O simulador usa sempre o rascunho atual. A versão publicada continua
    // intacta e é usada exclusivamente no atendimento real.
    const compiledDraft = compileAgentPrompt(draftAgent.config);
    const basePrompt = compiledDraft.prompt;

    const simulatedContact = {
      name: body.contact_name || 'Lead de Teste',
      call_name: (body.contact_name || 'Lead').split(' ')[0],
      phone_number: '+5511999990000',
      tags: [],
    };

    const facts = await fetchCanonicalFacts(supabase, draftAgent.workspaceId);
    const enhanced = buildEnhancedPrompt(basePrompt, simulatedContact, {});
    const processed = processPromptTemplate(enhanced, simulatedContact);
    const profileContext = typeof body.profile_context === 'string'
      ? body.profile_context.trim().slice(0, 1_000)
      : '';
    const groundedPrompt = processed + buildGroundingSection(facts) +
      `\n\n(MODO SIMULADOR: esta é uma conversa de teste do operador. Comporte-se exatamente como em produção. Nenhuma ferramenta produz efeitos reais.)` +
      (profileContext ? `\n<simulated_lead_profile>${profileContext.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</simulated_lead_profile>` : '');

    const modelSettings = resolveModelSettings(settings, body.model_mode);
    const appointmentPolicy = getActionPolicy(draftAgent.config, 'appointments');
    const handoffPolicy = getActionPolicy(draftAgent.config, 'human_handoff');
    const simulatedTools = [
      simulatedOptOutTool,
      ...(appointmentPolicy ? simulatedAppointmentTools : []),
      ...(handoffPolicy ? [simulatedHandoffTool] : []),
    ];

    const result = await runLaraAgent({
      supabase,
      provider: modelSettings.provider,
      apiKeys: {
        anthropic: settings?.anthropic_api_key ?? null,
        openai: resolveOpenAIKey(settings),
      },
      model: modelSettings.model,
      temperature: modelSettings.temperature,
      systemPrompt: groundedPrompt,
      history,
      workspaceId: draftAgent.workspaceId,
      extraTools: simulatedTools,
      dryRun: true, // registrar_duvida não grava no banco em modo teste
      executeExtraTool: async (name: string, args: any) => {
        if (name === 'check_availability' && appointmentPolicy) {
          const validation = validateScheduleRequest(args, appointmentPolicy);
          if (!validation.ok) return { result: { success: false, simulated: true, error: validation.code }, ok: false, summary: validation.code };
          return { result: { ...simulationResult(name, args), available: true }, ok: true, summary: 'simulated_availability' };
        }

        if (['create_appointment', 'reschedule_appointment', 'cancel_appointment', 'human_handoff', 'register_opt_out'].includes(name)) {
          if (!hasExplicitConfirmation(history, args.confirmation_evidence)) {
            return { result: { success: false, simulated: true, error: 'explicit_confirmation_required' }, ok: false, summary: 'explicit_confirmation_required' };
          }
          if (name === 'create_appointment' && appointmentPolicy) {
            const validation = validateScheduleRequest(args, appointmentPolicy);
            if (!validation.ok) return { result: { success: false, simulated: true, error: validation.code }, ok: false, summary: validation.code };
          }
          if (name === 'reschedule_appointment' && appointmentPolicy) {
            const validation = validateScheduleRequest({ date: args.new_date, time: args.new_time }, appointmentPolicy);
            if (!validation.ok) return { result: { success: false, simulated: true, error: validation.code }, ok: false, summary: validation.code };
          }
          const result = simulationResult(name, args);
          return { result, ok: true, summary: `simulated_${name}` };
        }
        return { result: { erro: `Ferramenta desconhecida: ${name}` }, ok: false };
      },
    });

    return new Response(JSON.stringify({
      reply: result.content || '(sem resposta)',
      grounding: result.grounding,
      // Modelo/provedor que EFETIVAMENTE respondeu (fallback troca em runtime)
      model: result.usedModel,
      provider: result.usedProvider,
      used_fallback: result.usedFallback,
      requested_model: modelSettings.model,
      facts_in_prompt: facts.length,
      iterations: result.iterations,
      agent_draft_id: draftAgent.draftId,
      agent_draft_revision: draftAgent.revision,
      compiler_issues: compiledDraft.issues,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Simulator] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: error instanceof RateLimitError ? 429 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Aprendizado assistido: converte evidências de conversas em sugestões
// persistidas. Nunca modifica fatos, rascunho ou versão publicada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OPENAI_URL, resolveOpenAIKey } from "../_shared/lara-engine.ts";
import { fetchAgentDraftRuntimeConfig, userCanEditAgent } from "../_shared/agent-config.ts";
import { redactSensitiveText, redactSensitiveValue } from "../_shared/privacy.ts";
import { consumeRateLimit, RateLimitError } from "../_shared/rate-limit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES_PER_CONVERSATION = 20;
const SUGGESTION_TYPES = [
  'new_fact', 'new_faq', 'new_example', 'new_test_scenario', 'commercial_rule', 'tone_adjustment',
  'handoff_rule', 'missing_material',
] as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json(401, { error: 'Unauthorized' });
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: 'Unauthorized' });
    if (!await userCanEditAgent(service, userData.user.id)) {
      return json(403, { error: 'Sem permissão para analisar conversas' });
    }

    const draft = await fetchAgentDraftRuntimeConfig(service, userData.user.id);
    if (!draft) return json(409, { error: 'Rascunho da agente não encontrado' });
    await consumeRateLimit(service, {
      workspaceId: draft.workspaceId,
      subjectKey: userData.user.id,
      operation: 'prompt_insights',
      maxRequests: 3,
      windowSeconds: 3600,
    });
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 14, 1), 90);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // Conversas ainda usam ownership legado por usuário. O backend resolve os
    // membros do workspace e nunca aceita workspace/owner vindo do cliente.
    const { data: members, error: memberError } = await service
      .from('workspace_members').select('user_id')
      .eq('workspace_id', draft.workspaceId).eq('status', 'active');
    if (memberError) throw memberError;
    const ownerIds = (members ?? []).map((member: any) => member.user_id).filter(Boolean);
    const { data: contacts, error: contactError } = ownerIds.length
      ? await service.from('contacts').select('id').in('user_id', ownerIds)
      : { data: [], error: null };
    if (contactError) throw contactError;
    const contactIds = (contacts ?? []).map((contact: any) => contact.id);
    const { data: conversations, error: conversationError } = contactIds.length
      ? await service.from('conversations').select('id').in('contact_id', contactIds)
        .gte('last_message_at', since).order('last_message_at', { ascending: false }).limit(MAX_CONVERSATIONS)
      : { data: [], error: null };
    if (conversationError) throw conversationError;
    const conversationIds = (conversations ?? []).map((conversation: any) => conversation.id);

    const [messageResult, gapResult, evaluationResult] = await Promise.all([
      conversationIds.length
        ? service.from('messages').select('id, conversation_id, from_type, content, sent_at')
          .in('conversation_id', conversationIds).gte('sent_at', since).order('sent_at')
        : Promise.resolve({ data: [], error: null }),
      service.from('unanswered_questions').select('id, conversation_id, question, context')
        .eq('workspace_id', draft.workspaceId).eq('status', 'open').gte('created_at', since).limit(30),
      service.from('eval_runs').select('id').eq('workspace_id', draft.workspaceId)
        .eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (messageResult.error) throw messageResult.error;
    if (gapResult.error) throw gapResult.error;

    const grouped = new Map<string, any[]>();
    for (const message of messageResult.data ?? []) {
      if (!message.content?.trim()) continue;
      const list = grouped.get(message.conversation_id) ?? [];
      if (list.length < MAX_MESSAGES_PER_CONVERSATION) list.push(message);
      grouped.set(message.conversation_id, list);
    }
    const transcripts = Array.from(grouped.entries())
      .filter(([, messages]) => messages.length >= 3)
      .map(([conversationId, messages], index) => (
        `### Conversa ${index + 1} [${conversationId}]\n` + messages
          .map((message) => `${message.from_type === 'user' ? 'Cliente' : 'Agente'}: ${redactSensitiveText(message.content.trim(), 500)}`)
          .join('\n')
      )).join('\n\n');
    const gaps = (gapResult.data ?? []).map((gap: any) => `- ${redactSensitiveText(gap.question, 500)}`).join('\n');

    let failures = '';
    if (evaluationResult.data?.id) {
      const { data } = await service.from('eval_results')
        .select('query, judge_reason, result_status')
        .eq('run_id', evaluationResult.data.id)
        .in('result_status', ['warning', 'critical_failure', 'unstable']).limit(20);
      failures = (data ?? []).map((item: any) => (
        `- ${redactSensitiveText(String(item.query || ''), 500)} → ${redactSensitiveText(String(item.judge_reason || item.result_status), 500)}`
      )).join('\n');
    }

    if (!transcripts && !gaps && !failures) {
      return json(200, { suggestions: [], analyzed: { conversations: 0, gaps: 0, failures: 0 } });
    }

    // Cascata de chave OpenAI: UI (lara_settings) → secret OPENAI_API_KEY
    const { data: keyRow } = await service
      .from('lara_settings')
      .select('openai_api_key')
      .not('openai_api_key', 'is', null)
      .limit(1)
      .maybeSingle();
    const openaiApiKey = resolveOpenAIKey(keyRow);
    if (!openaiApiKey) {
      return json(503, { error: 'Configure a chave da OpenAI (aba APIs) para gerar sugestões.' });
    }

    // gpt-5.x: sem temperature custom; tools exigem reasoning_effort 'none'.
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        reasoning_effort: 'none',
        max_completion_tokens: 3000,
        messages: [
          {
            role: 'system',
            content:
              'Você analisa conversas de uma agente comercial e cria sugestões para revisão humana. ' +
              'Nunca trate uma fala do lead como verdade da empresa. Fatos comerciais devem ser new_fact e FAQs devem ser new_faq; ambos continuam não confirmados. ' +
              'Cada sugestão precisa de evidência literal curta. Não sugira mudanças genéricas. No máximo 6 itens. ' +
              'proposed_change por tipo: new_fact={title,content,category}; new_faq={question,answer}; new_example/new_test_scenario={query,expected_behavior,expected_content,severity}; ' +
              'commercial_rule/tone_adjustment={instruction}; handoff_rule={reason}; missing_material={description}. ' +
              'Responda somente com a ferramenta emitir_sugestoes.',
          },
          {
            role: 'user',
            content:
              `CONFIGURAÇÃO ESTRUTURADA ATUAL\n${JSON.stringify(draft.config).slice(0, 18000)}\n\n` +
              `CONVERSAS DOS ÚLTIMOS ${days} DIAS\n${transcripts || '(nenhuma)'}\n\n` +
              `INFORMAÇÕES PENDENTES\n${gaps || '(nenhuma)'}\n\n` +
              `FALHAS DE TESTE\n${failures || '(nenhuma)'}`,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'emitir_sugestoes',
            parameters: {
              type: 'object',
              properties: {
                suggestions: {
                  type: 'array', maxItems: 6,
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: SUGGESTION_TYPES },
                      title: { type: 'string' },
                      rationale: { type: 'string' },
                      evidence_quote: { type: 'string' },
                      conversation_id: { type: ['string', 'null'] },
                      proposed_change: { type: 'object' },
                    },
                    required: ['type', 'title', 'rationale', 'evidence_quote', 'proposed_change'],
                  },
                },
              },
              required: ['suggestions'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emitir_sugestoes' } },
      }),
    });
    if (!response.ok) return json(response.status === 429 ? 429 : 502, { error: response.status === 429 ? 'Limite atingido. Tente novamente em instantes.' : 'A análise não pôde ser concluída agora.' });
    const payload = await response.json();
    let args: any = null;
    try { args = JSON.parse(payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? 'null'); } catch { /* resposta inválida */ }
    const rawSuggestions = Array.isArray(args?.suggestions) ? args.suggestions.slice(0, 6) : [];
    const validConversationIds = new Set(conversationIds);
    const rows = [];
    for (const raw of rawSuggestions) {
      if (!SUGGESTION_TYPES.includes(raw?.type)) continue;
      const title = String(raw.title || '').trim().slice(0, 160);
      const quote = redactSensitiveText(String(raw.evidence_quote || '').trim(), 500);
      if (!title || !quote || typeof raw.proposed_change !== 'object' || !raw.proposed_change) continue;
      const fingerprint = await sha256(`${raw.type}\n${quote.toLowerCase().replace(/\s+/g, ' ')}`);
      const conversationId = validConversationIds.has(raw.conversation_id) ? raw.conversation_id : null;
      rows.push({
        workspace_id: draft.workspaceId,
        agent_id: draft.agentId,
        suggestion_type: raw.type,
        title,
        rationale: String(raw.rationale || '').trim().slice(0, 600),
        proposed_change: redactSensitiveValue(raw.proposed_change),
        evidence: { quote, analyzed_days: days },
        fingerprint,
        source_conversation_id: conversationId,
      });
    }
    if (rows.length > 0) {
      const { error } = await service.from('agent_suggestions')
        .upsert(rows, { onConflict: 'workspace_id,fingerprint', ignoreDuplicates: true });
      if (error) throw error;
    }
    const { data: pending, error: pendingError } = await service.from('agent_suggestions')
      .select('*').eq('workspace_id', draft.workspaceId).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (pendingError) throw pendingError;
    return json(200, {
      suggestions: pending ?? [],
      analyzed: { conversations: grouped.size, gaps: gapResult.data?.length ?? 0, failures: failures ? failures.split('\n').length : 0 },
    });
  } catch (error) {
    console.error('[PromptInsights]', error);
    if (error instanceof RateLimitError) return json(429, { error: 'Uma nova análise poderá ser iniciada mais tarde.' });
    return json(500, { error: error instanceof Error ? error.message : 'Erro ao analisar conversas' });
  }
});

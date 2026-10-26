// Motor agêntico compartilhado da Lara (orchestrator + simulador).
// Responsável por: montagem do prompt com grounding anti-alucinação,
// loop de tool use com round-trip real (resultado volta ao modelo),
// busca na base de conhecimento e registro de perguntas sem resposta.
// A chamada de LLM em si (OpenAI / Anthropic + fallback cruzado)
// vive em llm.ts — o loop aqui é agnóstico de provedor.

import {
  callChatWithFallback,
  LLM_CATALOG,
  type LlmProvider,
  type NormalizedChatResult,
} from './llm.ts';
import { buildLeadRuntimeContext } from './lead-state.ts';

export { OPENAI_URL, resolveModelSettings, modelForTier, resolveOpenAIKey } from './llm.ts';
export { LLM_CATALOG };
export type { LlmProvider, LlmTier, ResolvedModelSettings } from './llm.ts';

export const searchKnowledgeTool = {
  type: "function",
  function: {
    name: "buscar_conhecimento",
    description:
      "Busca na base de conhecimento oficial da empresa (fatos, FAQ, documentos). USE SEMPRE antes de responder qualquer pergunta factual sobre preços, produtos, condições, prazos, links, endereços ou políticas que não estejam nos FATOS CANÔNICOS do seu prompt. Nunca responda de memória.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Pergunta ou termos de busca em português (ex: 'preço do plano anual', 'política de cancelamento')",
        },
      },
      required: ["query"],
    },
  },
};

export const registerUnansweredTool = {
  type: "function",
  function: {
    name: "registrar_duvida",
    description:
      "Registra uma pergunta do cliente que você NÃO conseguiu responder com os FATOS CANÔNICOS nem com buscar_conhecimento. Use sempre que precisar dizer 'vou confirmar com a equipe'. Isso alimenta o treinamento da empresa.",
    parameters: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "A pergunta do cliente, reformulada de forma clara" },
        contexto: { type: "string", description: "Contexto breve da conversa que gerou a dúvida" },
      },
      required: ["pergunta"],
    },
  },
};

export interface CanonicalFact {
  id: string;
  category: string;
  question: string | null;
  fact: string;
}

export async function fetchCanonicalFacts(supabase: any, workspaceId?: string | null): Promise<CanonicalFact[]> {
  if (!workspaceId) return [];
  const { data } = await supabase
    .from('knowledge_facts')
    .select('id, category, question, fact')
    .eq('workspace_id', workspaceId)
    .eq('status', 'confirmed')
    .eq('is_active', true)
    .eq('always_include', true)
    .lte('valid_from', new Date().toISOString())
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('category');
  return data ?? [];
}

export function buildGroundingSection(facts: CanonicalFact[]): string {
  let section = `

## REGRAS DE VERDADE (INEGOCIÁVEIS)
1. Os FATOS CANÔNICOS abaixo são a única fonte confiável para preços, links, horários, endereços, condições e números. Cite-os exatamente como estão escritos — não arredonde, não parafraseie valores.
2. Para qualquer pergunta factual que NÃO esteja coberta pelos FATOS CANÔNICOS, chame a ferramenta buscar_conhecimento ANTES de responder.
3. Se a busca não retornar a informação, NÃO INVENTE. Diga com naturalidade que vai confirmar com a equipe e chame registrar_duvida. Continue a conversa normalmente.
4. Nunca crie preços, descontos, prazos, links, telefones ou capacidades de produto que não estejam nos FATOS ou nos resultados de busca.
5. Agendamentos: só confirme data/horário depois que a ferramenta de agendamento retornar sucesso.`;

  if (facts.length > 0) {
    section += `\n\n## FATOS CANÔNICOS\n`;
    let currentCategory = '';
    for (const f of facts) {
      if (f.category !== currentCategory) {
        currentCategory = f.category;
        section += `\n### ${currentCategory}\n`;
      }
      section += f.question ? `- ${f.question} → ${f.fact}\n` : `- ${f.fact}\n`;
    }
  } else {
    section += `\n\n## FATOS CANÔNICOS\n(nenhum fato cadastrado ainda — use buscar_conhecimento e registre dúvidas com registrar_duvida)`;
  }
  return section;
}

export function buildEnhancedPrompt(basePrompt: string, contact: any, memory: any): string {
  return basePrompt + buildLeadRuntimeContext(contact, memory);
}

export function processPromptTemplate(prompt: string, contact: any): string {
  const now = new Date();
  const brOptions: Intl.DateTimeFormatOptions = { timeZone: 'America/Sao_Paulo' };

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    ...brOptions, day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    ...brOptions, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
    ...brOptions, weekday: 'long',
  });

  const variables: Record<string, string> = {
    'data_hora': `${dateFormatter.format(now)} ${timeFormatter.format(now)}`,
    'data': dateFormatter.format(now),
    'hora': timeFormatter.format(now),
    'dia_semana': weekdayFormatter.format(now),
    'cliente_nome': contact?.name || contact?.call_name || 'Cliente',
    'cliente_telefone': contact?.phone_number || '',
  };

  return prompt.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

export interface AgentGrounding {
  searches: Array<{ query: string; results: Array<{ source_type: string; title: string; content: string; rank: number }> }>;
  unanswered: Array<{ pergunta: string; contexto?: string }>;
  tool_events: Array<{ tool: string; args: any; ok: boolean; summary?: string }>;
}

export interface AgentResult {
  content: string;
  grounding: AgentGrounding;
  iterations: number;
  /** true quando a IA falhou APÓS uma tool com efeito colateral já ter executado.
   *  O chamador NÃO deve relançar/reagendar (re-executar duplicaria o efeito) —
   *  deve responder com um fallback. */
  degraded: boolean;
  /** true quando o provedor escolhido falhou e a resposta veio do outro */
  usedFallback: boolean;
  /** provedor/modelo que efetivamente respondeu (difere do pedido após fallback) */
  usedProvider: LlmProvider;
  usedModel: string;
}

export interface RunAgentOptions {
  supabase: any;
  /** default 'openai'; cada provedor exige a própria chave em apiKeys */
  provider?: LlmProvider;
  apiKeys?: { anthropic?: string | null; openai?: string | null };
  model: string;
  temperature: number;
  systemPrompt: string;
  history: Array<{ role: string; content: string }>;
  extraTools?: any[];
  executeExtraTool?: (name: string, args: any) => Promise<{ result: any; ok: boolean; summary?: string }>;
  conversationId?: string | null;
  contactId?: string | null;
  workspaceId?: string | null;
  dryRun?: boolean;
  maxIterations?: number;
  maxTokens?: number;
}

export async function runLaraAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const {
    supabase, model, temperature, systemPrompt, history,
    provider = 'openai', apiKeys = {},
    extraTools = [], executeExtraTool,
    conversationId = null, contactId = null, workspaceId = null,
    dryRun = false, maxIterations = 4, maxTokens = 1000,
  } = opts;

  const grounding: AgentGrounding = { searches: [], unanswered: [], tool_events: [] };
  const tools = [searchKnowledgeTool, registerUnansweredTool, ...extraTools];

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  let content = '';
  let iterations = 0;
  let degraded = false;
  let lastHadToolCalls = false;
  let usedFallback = false;
  // Fallback pegajoso: se o provedor escolhido falhou uma vez, o resto do loop
  // fica no outro (evita reinsistir num provedor fora do ar a cada volta).
  let activeProvider: LlmProvider = provider;
  let activeModel = model;

  // Tools que gravam algo real (agendamento etc.) já executadas nesta rodada.
  // buscar_conhecimento é só leitura; registrar_duvida duplicada é inócua.
  const hasSideEffects = () =>
    grounding.tool_events.some((e) => e.ok && e.tool !== 'buscar_conhecimento' && e.tool !== 'registrar_duvida');

  const callAI = async (forceFinalAnswer: boolean): Promise<NormalizedChatResult> => {
    const result = await callChatWithFallback({
      provider: activeProvider,
      model: activeModel,
      apiKeys: { anthropic: apiKeys.anthropic, openai: apiKeys.openai },
      messages,
      temperature,
      maxTokens,
      // tool_choice 'none' na chamada final: força o modelo a responder em texto
      // (mantém tools no payload — histórico com role:'tool' exige a definição)
      tools,
      toolChoice: forceFinalAnswer ? 'none' : 'auto',
    });
    if (result.usedFallback) {
      usedFallback = true;
      activeProvider = activeProvider === 'openai' ? 'anthropic' : 'openai';
      activeModel = LLM_CATALOG[activeProvider].defaultModel;
    }
    return result;
  };

  // Erro de IA DEPOIS de tool com efeito colateral: relançar faria o item da fila
  // ser reprocessado do zero e duplicaria o efeito (ex.: agendamento em dobro).
  // Nesse caso: 1 retry interno; se falhar de novo, degrada sem lançar.
  const callAIGuarded = async (forceFinalAnswer: boolean) => {
    try {
      return await callAI(forceFinalAnswer);
    } catch (err) {
      if (!hasSideEffects()) throw err;
      console.warn('[LaraEngine] AI error after side-effect tool — retrying once inline');
      await new Promise((r) => setTimeout(r, 2000));
      try {
        return await callAI(forceFinalAnswer);
      } catch (retryErr) {
        console.error('[LaraEngine] AI retry failed after side-effect tool — degrading gracefully:', retryErr);
        degraded = true;
        return null;
      }
    }
  };

  while (iterations < maxIterations) {
    iterations++;

    const data = await callAIGuarded(false);
    if (!data) break; // degradado

    const toolCalls = data.toolCalls;
    content = data.content;
    lastHadToolCalls = toolCalls.length > 0;

    if (toolCalls.length === 0) break;

    // Registra a mensagem do assistant com os tool_calls e executa cada tool,
    // devolvendo o resultado REAL ao modelo (round-trip completo).
    messages.push({
      role: 'assistant',
      content: data.content || null,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name;
      let args: any = {};
      try { args = JSON.parse(toolCall.function?.arguments ?? '{}'); } catch { /* args inválidos */ }

      let result: any;
      let ok = true;
      let summary: string | undefined;

      try {
        if (name === 'buscar_conhecimento') {
          const query = String(args.query ?? '').slice(0, 300);
          const { data: hits, error } = workspaceId
            ? await supabase.rpc('search_workspace_knowledge', {
                _workspace_id: workspaceId,
                p_query: query,
                p_limit: 6,
              })
            : { data: [], error: null };
          if (error) throw error;
          const results = (hits ?? []).map((h: any) => ({
            source_type: h.source_type,
            title: h.title,
            content: h.content,
            rank: h.rank,
          }));
          grounding.searches.push({ query, results });
          result = results.length > 0
            ? { encontrado: true, resultados: results.map((r: any) => ({ fonte: r.title, conteudo: r.content })) }
            : { encontrado: false, aviso: 'Nada encontrado na base de conhecimento. NÃO invente a resposta — diga que vai confirmar e use registrar_duvida.' };
          summary = `${results.length} resultado(s)`;
        } else if (name === 'registrar_duvida') {
          const pergunta = String(args.pergunta ?? '').slice(0, 500);
          grounding.unanswered.push({ pergunta, contexto: args.contexto });
          if (!dryRun && pergunta && workspaceId) {
            await supabase.from('unanswered_questions').insert({
              workspace_id: workspaceId,
              conversation_id: conversationId,
              contact_id: contactId,
              question: pergunta,
              context: args.contexto ?? null,
            });
          }
          result = { registrado: true, instrucao: 'Diga ao cliente com naturalidade que vai confirmar essa informação com a equipe e retorna em breve.' };
        } else if (executeExtraTool) {
          const extra = await executeExtraTool(name, args);
          result = extra.result;
          ok = extra.ok;
          summary = extra.summary;
        } else {
          result = { erro: `Ferramenta desconhecida: ${name}` };
          ok = false;
        }
      } catch (err) {
        ok = false;
        result = { erro: err instanceof Error ? err.message : 'Erro ao executar ferramenta' };
        console.error(`[LaraEngine] Tool ${name} failed:`, err);
      }

      grounding.tool_events.push({ tool: name, args, ok, summary });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Loop esgotado com o modelo ainda pedindo tools: os resultados já executados
  // ficariam sem resposta final ao cliente. Faz UMA chamada extra sem tools
  // para forçar o texto de fechamento.
  if (!degraded && lastHadToolCalls && iterations >= maxIterations) {
    const data = await callAIGuarded(true);
    if (data) {
      if (data.content) content = data.content;
      iterations++;
    }
  }

  return {
    content, grounding, iterations, degraded, usedFallback,
    usedProvider: activeProvider, usedModel: activeModel,
  };
}

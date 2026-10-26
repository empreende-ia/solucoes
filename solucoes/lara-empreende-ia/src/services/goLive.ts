import { supabase } from '@/integrations/supabase/client';

/**
 * Camada de dados do checklist "Colocar no ar".
 *
 * A verificação real mora na edge function validate-setup; aqui ficam os tipos,
 * a tradução de cada resultado em um passo com botão, e as três chamadas do
 * lead de teste (disparo, rastro da fila e remoção).
 */

export type CheckStatus = 'ok' | 'warning' | 'error' | 'unknown';

export interface CheckAction {
  route: string;
  tab?: string;
  section?: string;
  label?: string;
}

export interface ValidationResult {
  component: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
  action?: CheckAction;
}

export interface SetupReport {
  results: ValidationResult[];
  overallStatus: 'ok' | 'warning' | 'error';
  summary: { ok: number; total: number; percentage: number };
  goLive: {
    components: string[];
    ok: number;
    total: number;
    percentage: number;
    ready: boolean;
  };
  workspaceId: string | null;
  testConversationId: string | null;
  generatedAt: string;
  message: string;
}

export type GoLiveStepId =
  | 'identidade'
  | 'canal'
  | 'ia'
  | 'agente'
  | 'publicacao'
  | 'teste';

export interface GoLiveStep {
  id: GoLiveStepId;
  component: string;
  title: string;
  /** O que fazer, em uma linha, quando o passo está pendente. */
  description: string;
  status: CheckStatus;
  isComplete: boolean;
  /** Situação real vinda da verificação; vazio quando ela não rodou. */
  message: string;
  details?: string;
  action?: CheckAction;
}

interface StepDefinition {
  id: GoLiveStepId;
  component: string;
  title: string;
  description: string;
  action?: CheckAction;
}

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: 'identidade',
    component: 'identity',
    title: 'Identidade do negócio',
    description: 'Informe o nome da empresa e o nome da agente.',
    action: { route: '/settings', tab: 'agent', section: 'identity', label: 'Abrir identidade' },
  },
  {
    id: 'canal',
    component: 'whatsapp',
    title: 'Canal de WhatsApp',
    description: 'Conecte pela Zernio ou informe as credenciais da Cloud API.',
    action: { route: '/settings', tab: 'channels', label: 'Conectar canal' },
  },
  {
    id: 'ia',
    component: 'openai',
    title: 'Chave de IA',
    description: 'Sem a chave da OpenAI a agente não redige resposta.',
    action: { route: '/settings', tab: 'apis', label: 'Informar chave' },
  },
  {
    id: 'agente',
    component: 'agent_config',
    title: 'Agente configurada',
    description: 'Descreva o que a empresa vende, o público e a função da agente.',
    action: { route: '/settings', tab: 'agent', section: 'identity', label: 'Configurar agente' },
  },
  {
    id: 'publicacao',
    component: 'agent_prompt',
    title: 'Versão publicada',
    description: 'Rode os testes e publique uma versão para o atendimento valer.',
    action: { route: '/settings', tab: 'agent', section: 'publish', label: 'Testar e publicar' },
  },
  {
    id: 'teste',
    component: 'test_lead',
    title: 'Lead de teste respondido',
    description: 'Envie uma mensagem de teste e acompanhe a resposta ponta a ponta.',
  },
];

/** Rota do app com as query strings que a tela de destino entende. */
export function actionHref(action?: CheckAction | null): string | null {
  if (!action?.route) return null;
  const params = new URLSearchParams();
  if (action.tab && action.tab !== 'agent') params.set('tab', action.tab);
  if (action.section) params.set('section', action.section);
  const query = params.toString();
  return query ? `${action.route}?${query}` : action.route;
}

export async function fetchSetupReport(): Promise<SetupReport> {
  const { data, error } = await supabase.functions.invoke('validate-setup');
  if (error) {
    const context = (error as any)?.context;
    let detail: string | null = null;
    try {
      if (context && typeof context.json === 'function') {
        const parsed = await context.json();
        detail = parsed?.error ?? null;
      }
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(detail || error.message || 'Não foi possível verificar a configuração.');
  }
  if (!data || (data as any).error) {
    throw new Error((data as any)?.error || 'Não foi possível verificar a configuração.');
  }
  return data as SetupReport;
}

export function buildGoLiveSteps(report: SetupReport | null): GoLiveStep[] {
  return STEP_DEFINITIONS.map((definition) => {
    const result = report?.results.find((item) => item.component === definition.component);
    const status: CheckStatus = result?.status ?? 'unknown';
    return {
      id: definition.id,
      component: definition.component,
      title: definition.title,
      description: definition.description,
      status,
      isComplete: status === 'ok',
      message: result?.message ?? '',
      details: result?.details,
      // A verificação devolve a rota certa mas quase nunca um rótulo; sem esta
      // fusão todo botão do checklist viraria um "Abrir" genérico.
      action: result?.action
        ? { ...result.action, label: result.action.label ?? definition.action?.label }
        : definition.action,
    };
  });
}

/** Resultados que não são passo do checklist — o diagnóstico atrás de "Ver detalhes". */
export function diagnosticResults(report: SetupReport | null): ValidationResult[] {
  if (!report) return [];
  const stepComponents = new Set(STEP_DEFINITIONS.map((item) => item.component));
  return report.results.filter((item) => !stepComponents.has(item.component));
}

// ---------------------------------------------------------------------------
// Lead de teste
// ---------------------------------------------------------------------------

export type TraceStage = 'recebida' | 'na fila' | 'respondida' | 'enviada';
export type TraceSituation = 'ok' | 'erro' | 'processando' | 'pendente';

export interface DeliveryTraceRow {
  etapa: TraceStage | string;
  situacao: TraceSituation | string;
  detalhe: string | null;
  tentativas: number | null;
  em: string | null;
}

export interface TestLeadResult {
  conversationId: string;
  contactId: string;
  messageId: string;
  queuedForLara: boolean;
}

export interface TestLeadInput {
  phone: string;
  name: string;
  message: string;
}

export const TEST_LEAD_DEFAULTS: TestLeadInput = {
  phone: '5511900000000',
  name: 'Lead de teste',
  message: 'Oi, vi o site de vocês e quero entender como funciona.',
};

export async function startTestLead(input: TestLeadInput): Promise<TestLeadResult> {
  const { data, error } = await supabase.functions.invoke('simulate-webhook', {
    body: {
      phone: input.phone.trim(),
      name: input.name.trim() || TEST_LEAD_DEFAULTS.name,
      message: input.message.trim(),
      mode: 'test',
    },
  });

  if (error) {
    const context = (error as any)?.context;
    let detail: string | null = null;
    try {
      if (context && typeof context.json === 'function') {
        const parsed = await context.json();
        detail = parsed?.error ?? null;
      }
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(detail || error.message || 'Não foi possível enviar a mensagem de teste.');
  }
  if (!data || (data as any).error || !(data as any).conversation_id) {
    throw new Error((data as any)?.error || 'A mensagem de teste não gerou conversa.');
  }

  const payload = data as any;
  return {
    conversationId: payload.conversation_id,
    contactId: payload.contact_id,
    messageId: payload.message_id,
    queuedForLara: Boolean(payload.queued_for_lara),
  };
}

export async function fetchDeliveryTrace(conversationId: string): Promise<DeliveryTraceRow[]> {
  const { data, error } = await (supabase as any).rpc('conversation_delivery_trace', {
    _conversation_id: conversationId,
  });
  if (error) throw new Error(error.message || 'Não foi possível ler o rastro da conversa.');
  return (data ?? []) as DeliveryTraceRow[];
}

export async function removeTestConversation(conversationId: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('delete_test_conversation', {
    _conversation_id: conversationId,
  });
  if (error) throw new Error(error.message || 'Não foi possível remover a conversa de teste.');
  return Boolean(data);
}

/**
 * O detalhe da etapa travada já vem do runtime em português ("Publique em
 * Configurações → Agente"). Aqui ele vira o botão que abre exatamente aquilo.
 */
export function actionForTraceDetail(detail: string | null | undefined): CheckAction | null {
  const text = (detail ?? '').toLowerCase();
  if (!text) return null;
  if (text.includes('versão publicada') || text.includes('publique')) {
    return { route: '/settings', tab: 'agent', section: 'publish', label: 'Testar e publicar' };
  }
  if (text.includes('workspace') || text.includes('vínculo')) {
    return { route: '/team', label: 'Abrir equipe' };
  }
  if (text.includes('agente ativa') || text.includes('configuração da agente')) {
    return { route: '/settings', tab: 'agent', section: 'identity', label: 'Configurar agente' };
  }
  if (text.includes('openai') || text.includes('api key') || text.includes('chave')) {
    return { route: '/settings', tab: 'apis', label: 'Informar chave' };
  }
  if (text.includes('token') || text.includes('canal') || text.includes('whatsapp')) {
    return { route: '/settings', tab: 'channels', label: 'Conectar canal' };
  }
  return null;
}

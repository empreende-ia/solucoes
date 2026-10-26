import type { AgentConfig } from './agent-config';
import { compileAgentPrompt } from '../../supabase/functions/_shared/agent-prompt-compiler';

/**
 * O que separa "não dá para publicar" de "dá para melhorar".
 *
 * `required` é derivado do PRÓPRIO compilador de prompt: são as issues
 * `blocking` de compileAgentPrompt, mapeadas para a seção da interface que as
 * resolve. Derivar (em vez de replicar as regras à mão) garante que o espelho
 * nunca fura — um blocker novo no compilador aparece aqui sem ninguém lembrar
 * de sincronizar. Uma configuração parcial acima desse piso JÁ publica e JÁ
 * atende. Tudo o mais é `recommended` — melhora a agente, nunca a trava.
 * Stepper, cards da Visão geral e navegação leem daqui para nunca discordarem.
 */

export type AgentSectionId =
  | 'overview'
  | 'identity'
  | 'sales'
  | 'knowledge'
  | 'actions'
  | 'publish'
  | 'advanced';

export interface ReadinessItem {
  label: string;
  section: AgentSectionId;
}

export interface AgentReadiness {
  /** Impede a publicação. Derivado das issues blocking do compilador. */
  required: ReadinessItem[];
  /** Opcional e recomendado: a agente funciona sem, e melhora com. */
  recommended: ReadinessItem[];
  /** O piso de identidade exigido pelo compilador está completo. */
  identityReady: boolean;
  /** Há trabalho real do usuário no processo de vendas (além dos defaults). */
  salesConfigured: boolean;
  /** Objetivos pedem agendamento sem a ação habilitada — promessa sem ferramenta. */
  schedulingWithoutAction: boolean;
}

/** Em qual seção da interface cada campo do config é resolvido. */
function sectionForField(field: string): AgentSectionId {
  if (field.startsWith('identity.')) return 'identity';
  if (field.startsWith('salesProcess.')) return 'sales';
  if (field.startsWith('knowledgePolicy')) return 'knowledge';
  if (field.startsWith('actions')) return 'actions';
  if (field === 'customInstructions') return 'advanced';
  return 'overview';
}

function requiredFromCompiler(config: AgentConfig): ReadinessItem[] {
  try {
    return compileAgentPrompt(config)
      .issues
      .filter((issue) => issue.severity === 'blocking')
      .map((issue) => ({ label: issue.message, section: sectionForField(issue.field) }));
  } catch {
    // O compilador só lança para schemaVersion desconhecida — um config que a
    // tela nem deveria ter. Melhor uma pendência genérica do que fingir pronto.
    return [{ label: 'Não foi possível validar a configuração. Recarregue a página.', section: 'overview' }];
  }
}

export function computeAgentReadiness(config: AgentConfig): AgentReadiness {
  const { identity, salesProcess } = config;

  const required = requiredFromCompiler(config);

  const wantsScheduling = identity.primaryGoals.includes('qualify_and_schedule')
    || salesProcess.desiredOutcomes.includes('schedule_meeting');
  const appointmentsEnabled = config.actions.some(
    (action) => action.actionId === 'appointments' && action.enabled,
  );
  const schedulingWithoutAction = wantsScheduling && !appointmentsEnabled;

  const recommended: ReadinessItem[] = [];
  if (identity.offerings.length === 0) {
    recommended.push({ label: 'Cadastre ao menos uma oferta para a agente recomendar com precisão.', section: 'identity' });
  }
  if (salesProcess.qualificationFields.length === 0) {
    recommended.push({ label: 'Escolha quais informações ajudam a qualificar um lead.', section: 'sales' });
  }
  if (salesProcess.stages.length === 0) {
    recommended.push({ label: 'Defina as etapas da conversa para dar direção ao atendimento.', section: 'sales' });
  }
  if (salesProcess.positiveCriteria.length === 0 && salesProcess.negativeCriteria.length === 0) {
    recommended.push({ label: 'Descreva sinais de bom e mau encaixe para a qualificação.', section: 'sales' });
  }
  if (salesProcess.objections.length === 0) {
    recommended.push({ label: 'Prepare argumentos aprovados para as objeções mais comuns.', section: 'sales' });
  }
  if (schedulingWithoutAction) {
    recommended.push({
      label: 'Os objetivos pedem agendamento, mas a ação está desligada. Ative em Ações ou ajuste os objetivos.',
      section: 'actions',
    });
  }

  return {
    required,
    recommended,
    identityReady: !required.some((item) => item.section === 'identity'),
    salesConfigured: salesProcess.qualificationFields.length > 0,
    schedulingWithoutAction,
  };
}

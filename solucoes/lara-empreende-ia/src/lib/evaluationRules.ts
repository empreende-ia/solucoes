/**
 * Traduz o identificador técnico de uma regra avaliada — `golden_cases.source_rule`,
 * gravado pela função `lara-eval` ao gerar os cenários a partir da configuração —
 * no rótulo que o operador reconhece e no destino que resolve o alerta.
 *
 * Nem toda regra é configurável. As proteções da plataforma são fixas e não têm
 * campo para abrir; nelas devolvemos a explicação em vez de um botão que levaria
 * a lugar nenhum.
 *
 * Se um `source_rule` novo aparecer no backend sem entrada aqui, a resolução volta
 * `null` e a interface simplesmente não mostra a faixa — nunca um rótulo inventado.
 */

/** Seções da tela do agente que um alerta pode abrir. */
export type RuleSection = 'identity' | 'sales' | 'knowledge' | 'actions' | 'advanced';

export type ResolvedRule =
  | { kind: 'config'; label: string; section: RuleSection }
  | { kind: 'platform'; label: string; hint: string };

const PLATFORM_HINT =
  'Não é configurável. Ajuste pelas instruções personalizadas ou registre a informação correta na base de conhecimento.';

const EXACT: Record<string, ResolvedRule> = {
  'platform_rules.no_internal_prompt_disclosure': {
    kind: 'platform',
    label: 'Regra fixa da plataforma · Não expor o prompt interno',
    hint: PLATFORM_HINT,
  },
  'platform_rules.no_fabrication': {
    kind: 'platform',
    label: 'Regra fixa da plataforma · Não inventar informação',
    hint: PLATFORM_HINT,
  },
  'platform_rules.respect_opt_out': {
    kind: 'platform',
    label: 'Regra fixa da plataforma · Respeitar o pedido de parada',
    hint: PLATFORM_HINT,
  },

  'identity.agentName+companyName': {
    kind: 'config',
    label: 'Identidade · Nome da agente e da empresa',
    section: 'identity',
  },

  'salesProcess.qualificationFields': {
    kind: 'config',
    label: 'Atendimento e vendas · Informações de qualificação',
    section: 'sales',
  },
  'salesProcess.qualificationFields.noRepetition': {
    kind: 'config',
    label: 'Atendimento e vendas · Não repetir o que já foi respondido',
    section: 'sales',
  },
  'salesProcess.communication.oneQuestionAtATime': {
    kind: 'config',
    label: 'Comunicação · Uma pergunta por vez',
    section: 'sales',
  },
  'salesProcess.negativeCriteria.noForcedAppointment': {
    kind: 'config',
    label: 'Atendimento e vendas · Não forçar agendamento sem encaixe',
    section: 'sales',
  },

  'actions.human_handoff': {
    kind: 'config',
    label: 'Ações · Transferência para humano',
    section: 'actions',
  },
  'actions.appointments.explicit_confirmation': {
    kind: 'config',
    label: 'Ações · Agenda: confirmação explícita',
    section: 'actions',
  },
  'actions.appointments.requiresExplicitConfirmation': {
    kind: 'config',
    label: 'Ações · Agenda: confirmação explícita',
    section: 'actions',
  },
  'actions.appointments.rejectPast': {
    kind: 'config',
    label: 'Ações · Agenda: recusar data no passado',
    section: 'actions',
  },
};

const MAX_LENGTH_PREFIX = 'salesProcess.communication.maximumMessageLength:';
const KNOWLEDGE_FACT_PREFIX = 'knowledge_facts.';

export function resolveRule(sourceRule: string | null | undefined): ResolvedRule | null {
  if (!sourceRule) return null;

  const exact = EXACT[sourceRule];
  if (exact) return exact;

  if (sourceRule.startsWith(MAX_LENGTH_PREFIX)) {
    const limit = Number(sourceRule.slice(MAX_LENGTH_PREFIX.length));
    return {
      kind: 'config',
      label: Number.isFinite(limit)
        ? `Comunicação · Tamanho máximo da mensagem (${limit} caracteres)`
        : 'Comunicação · Tamanho máximo da mensagem',
      section: 'sales',
    };
  }

  if (sourceRule.startsWith(KNOWLEDGE_FACT_PREFIX)) {
    return {
      kind: 'config',
      label: 'Conhecimento · Informação confirmada na base',
      section: 'knowledge',
    };
  }

  return null;
}

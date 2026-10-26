import type { AgentSetupProposal } from '@/services/agent-setup';

/**
 * Campos que uma pergunta pendente do assistente pode preencher.
 *
 * A lista espelha a ANSWERABLE_FIELDS do prompt da função `agent-setup-assistant`.
 * O modelo devolve um identificador daqui em `missingInformation[].field`, e é ele
 * que decide qual controle a interface abre e onde a resposta é gravada.
 *
 * Identificador fora da lista cai em `null`: a pergunta continua visível, mas sem
 * caixa de resposta. Melhor não oferecer um campo do que gravar no lugar errado.
 */

export type AnswerKind = 'text' | 'longtext' | 'list' | 'choice' | 'multichoice';

export interface AnswerableField {
  /** Rótulo do que a resposta preenche, para a pessoa saber onde vai parar. */
  label: string;
  kind: AnswerKind;
  placeholder?: string;
  /** Só para kind 'choice' e 'multichoice'. */
  options?: Array<{ value: string; label: string }>;
  apply: (proposal: AgentSetupProposal, value: string) => AgentSetupProposal;
}

/** Uma entrada por linha, sem linha vazia. */
function toList(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function identityText(key: 'companyDescription' | 'whatCompanySells' | 'primaryAudience' | 'introduction' | 'segment') {
  return (proposal: AgentSetupProposal, value: string): AgentSetupProposal => ({
    ...proposal,
    identity: { ...proposal.identity, [key]: value.trim() },
  });
}

function identityList(key: 'differentiators' | 'excludedProfiles' | 'serviceRegions') {
  return (proposal: AgentSetupProposal, value: string): AgentSetupProposal => ({
    ...proposal,
    identity: { ...proposal.identity, [key]: toList(value) },
  });
}

function salesList(key: 'positiveCriteria' | 'negativeCriteria') {
  return (proposal: AgentSetupProposal, value: string): AgentSetupProposal => ({
    ...proposal,
    salesProcess: { ...proposal.salesProcess, [key]: toList(value) },
  });
}

/**
 * `desiredOutcomes` é um enum fechado no schema da configuração. A resposta desta
 * pergunta é uma seleção múltipla entre os mesmos valores da tela de vendas — texto
 * livre aqui já quebrou o "Aplicar ao rascunho" com erro de validação.
 */
const DESIRED_OUTCOME_OPTIONS: Array<{
  value: AgentSetupProposal['salesProcess']['desiredOutcomes'][number];
  label: string;
}> = [
  { value: 'schedule_meeting', label: 'Agendar reunião' },
  { value: 'handoff_to_consultant', label: 'Encaminhar para consultor' },
  { value: 'recommend_solution', label: 'Recomendar solução' },
  { value: 'send_purchase_link', label: 'Enviar link de compra' },
  { value: 'collect_information', label: 'Coletar informações' },
  { value: 'resolve_question', label: 'Resolver dúvida' },
  { value: 'identify_no_fit', label: 'Identificar ausência de perfil' },
];

export const ANSWERABLE_FIELDS: Record<string, AnswerableField> = {
  'identity.companyDescription': {
    label: 'Descrição da empresa',
    kind: 'longtext',
    placeholder: 'Ex.: Consultoria de IA que implanta automações comerciais em empresas de serviço.',
    apply: identityText('companyDescription'),
  },
  'identity.whatCompanySells': {
    label: 'O que a empresa vende',
    kind: 'longtext',
    placeholder: 'Ex.: Mentoria em grupo, consultoria de implantação e curso gravado.',
    apply: identityText('whatCompanySells'),
  },
  'identity.primaryAudience': {
    label: 'Público-alvo ideal',
    kind: 'longtext',
    placeholder: 'Ex.: Donos de agência com time de 5 a 50 pessoas que já vendem serviço recorrente.',
    apply: identityText('primaryAudience'),
  },
  'identity.introduction': {
    label: 'Como a agente se apresenta',
    kind: 'longtext',
    placeholder: 'Ex.: Oi, sou a Lara, do time da Empreende.IA.',
    apply: identityText('introduction'),
  },
  'identity.segment': {
    label: 'Segmento de mercado',
    kind: 'text',
    placeholder: 'Ex.: Educação corporativa',
    apply: identityText('segment'),
  },
  'identity.differentiators': {
    label: 'Diferenciais',
    kind: 'list',
    placeholder: 'Um por linha\nEx.: Implantação acompanhada\nEx.: Comunidade ativa',
    apply: identityList('differentiators'),
  },
  'identity.excludedProfiles': {
    label: 'Perfis que não são atendidos',
    kind: 'list',
    placeholder: 'Um por linha\nEx.: Quem não tem time comercial',
    apply: identityList('excludedProfiles'),
  },
  'identity.serviceRegions': {
    label: 'Regiões atendidas',
    kind: 'list',
    placeholder: 'Uma por linha\nEx.: Brasil',
    apply: identityList('serviceRegions'),
  },
  'identity.serviceMode': {
    label: 'Modelo de atendimento',
    kind: 'choice',
    options: [
      { value: 'remote', label: 'Remoto' },
      { value: 'in_person', label: 'Presencial' },
      { value: 'hybrid', label: 'Híbrido' },
      { value: 'not_applicable', label: 'Não se aplica' },
    ],
    apply: (proposal, value) => ({
      ...proposal,
      identity: { ...proposal.identity, serviceMode: value as AgentSetupProposal['identity']['serviceMode'] },
    }),
  },
  'salesProcess.model': {
    label: 'Objetivo principal de vendas',
    kind: 'choice',
    options: [
      { value: 'qualification_and_scheduling', label: 'Qualificar e agendar reunião' },
      { value: 'consultative', label: 'Venda consultiva' },
      { value: 'direct_sale', label: 'Venda direta' },
      { value: 'triage_and_handoff', label: 'Triagem e transferência' },
      { value: 'custom', label: 'Outro modelo' },
    ],
    apply: (proposal, value) => ({
      ...proposal,
      salesProcess: { ...proposal.salesProcess, model: value as AgentSetupProposal['salesProcess']['model'] },
    }),
  },
  'salesProcess.desiredOutcomes': {
    label: 'Resultados desejados',
    kind: 'multichoice',
    options: DESIRED_OUTCOME_OPTIONS,
    apply: (proposal, value) => {
      const allowed = new Set<string>(DESIRED_OUTCOME_OPTIONS.map((option) => option.value));
      const selected = toList(value).filter((item): item is (typeof DESIRED_OUTCOME_OPTIONS)[number]['value'] => allowed.has(item));
      return {
        ...proposal,
        salesProcess: { ...proposal.salesProcess, desiredOutcomes: selected },
      };
    },
  },
  'salesProcess.positiveCriteria': {
    label: 'Sinais de bom encaixe',
    kind: 'list',
    placeholder: 'Um por linha\nEx.: Já investe em tráfego pago',
    apply: salesList('positiveCriteria'),
  },
  'salesProcess.negativeCriteria': {
    label: 'Sinais de não encaixe',
    kind: 'list',
    placeholder: 'Um por linha\nEx.: Procura ferramenta gratuita',
    apply: salesList('negativeCriteria'),
  },
};

export function resolveAnswerableField(field: string | null | undefined): AnswerableField | null {
  if (!field) return null;
  return ANSWERABLE_FIELDS[field] ?? null;
}

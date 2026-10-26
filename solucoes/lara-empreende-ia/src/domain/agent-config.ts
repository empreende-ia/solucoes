import { z } from 'zod';

const optionalText = z.string().trim().max(4_000).default('');
const shortText = z.string().trim().max(240).default('');

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const socialProofSchema = z.object({
  id: z.string().uuid(),
  claim: z.string().trim().min(1).max(1_000),
  source: z.string().trim().max(2_000).default(''),
  approved: z.boolean().default(false),
});

export const offeringSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(2_000).default(''),
  audience: z.string().trim().max(1_000).default(''),
  problemSolved: z.string().trim().max(2_000).default(''),
  relatedLink: z.string().trim().max(2_000).default(''),
  active: z.boolean().default(true),
});

export const identitySchema = z.object({
  // Rascunhos aceitam lacunas temporárias; o compilador decide o que bloqueia
  // publicação. Isso evita perder o autosave enquanto o usuário edita um campo.
  agentName: z.string().trim().max(80).default('Lara'),
  role: z.string().trim().max(160).default('Assistente de vendas'),
  companyName: z.string().trim().max(160).default(''),
  primaryGoals: z.array(z.enum([
    'qualify',
    'qualify_and_schedule',
    'answer_and_recommend',
    'sell_directly',
    'support_and_handoff',
    'collect_information',
  ])).default(['qualify_and_schedule']),
  companyDescription: optionalText,
  whatCompanySells: optionalText,
  primaryAudience: optionalText,
  introduction: z.string().trim().max(1_000).default(''),
  website: z.string().trim().max(2_000).default(''),
  segment: shortText,
  serviceRegions: z.array(z.string().trim().min(1).max(160)).default([]),
  serviceMode: z.enum(['remote', 'in_person', 'hybrid', 'not_applicable']).default('remote'),
  differentiators: z.array(z.string().trim().min(1).max(1_000)).default([]),
  socialProof: z.array(socialProofSchema).default([]),
  excludedProfiles: z.array(z.string().trim().min(1).max(1_000)).default([]),
  offerings: z.array(offeringSchema).default([]),
}).default({});

export const qualificationFieldSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).default(''),
  dataType: z.enum(['text', 'number', 'boolean', 'date', 'single_choice', 'multiple_choice'])
    .default('text'),
  priority: z.enum(['required', 'important', 'contextual']).default('important'),
  captureRule: z.string().trim().max(2_000).default(''),
  crmSource: z.string().trim().max(240).default(''),
  options: z.array(z.string().trim().min(1).max(160)).default([]),
});

export const salesStageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  objective: z.string().trim().max(1_000).default(''),
  order: z.number().int().min(0),
  active: z.boolean().default(true),
});

export const needMappingSchema = z.object({
  id: z.string().uuid(),
  need: z.string().trim().min(1).max(1_000),
  offeringIds: z.array(z.string().uuid()).default([]),
  guidance: z.string().trim().max(2_000).default(''),
});

export const objectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  signals: z.array(z.string().trim().min(1).max(500)).default([]),
  understandFirst: z.string().trim().max(2_000).default(''),
  approvedArguments: z.array(z.string().trim().min(1).max(2_000)).default([]),
  prohibitedPromises: z.array(z.string().trim().min(1).max(1_000)).default([]),
  handoffCondition: z.string().trim().max(1_000).default(''),
});

export const salesProcessSchema = z.object({
  model: z.enum([
    'consultative',
    'qualification_and_scheduling',
    'direct_sale',
    'triage_and_handoff',
    'custom',
  ]).default('consultative'),
  desiredOutcomes: z.array(z.enum([
    'schedule_meeting',
    'handoff_to_consultant',
    'recommend_solution',
    'send_purchase_link',
    'collect_information',
    'resolve_question',
    'identify_no_fit',
  ])).default(['schedule_meeting']),
  stages: z.array(salesStageSchema).default([]),
  qualificationFields: z.array(qualificationFieldSchema).default([]),
  positiveCriteria: z.array(z.string().trim().min(1).max(1_000)).default([]),
  negativeCriteria: z.array(z.string().trim().min(1).max(1_000)).default([]),
  communication: z.object({
    idealMessageLength: z.number().int().min(1).max(2_000).default(320),
    maximumMessageLength: z.number().int().min(1).max(4_000).default(800),
    oneQuestionAtATime: z.boolean().default(true),
    answerDirectQuestionsFirst: z.boolean().default(true),
    formality: z.enum(['informal', 'balanced', 'formal']).default('balanced'),
    useLeadName: z.boolean().default(true),
    emojiUsage: z.enum(['none', 'light', 'moderate']).default('light'),
    allowedMedia: z.array(z.enum(['text', 'audio', 'image', 'document', 'link'])).default(['text', 'link']),
  }).default({}),
  needMappings: z.array(needMappingSchema).default([]),
  objections: z.array(objectionSchema).default([]),
  followUp: z.object({
    enabled: z.boolean().default(false),
    intervalsHours: z.array(z.number().int().positive().max(8_760)).default([]),
    maximumAttempts: z.number().int().min(0).max(20).default(0),
    stopConditions: z.array(z.string().trim().min(1).max(500)).default(['opt_out', 'human_handoff']),
    respectOptOut: z.literal(true).default(true),
    allowedChannels: z.array(z.string().trim().min(1).max(80)).default([]),
  }).default({}),
}).default({});

export const knowledgePolicySchema = z.object({
  clarifyBeforeHandoff: z.boolean().default(true),
  unknownAnswerPolicy: z.enum(['clarify_then_handoff', 'handoff', 'record_and_continue'])
    .default('clarify_then_handoff'),
  trustOrder: z.array(z.enum([
    'live_tool',
    'confirmed_fact',
    'approved_faq',
    'approved_document',
    'approved_url',
    'general_knowledge',
  ])).default([
    'live_tool',
    'confirmed_fact',
    'approved_faq',
    'approved_document',
    'approved_url',
    'general_knowledge',
  ]),
}).default({});

export const actionIdSchema = z.enum(['appointments', 'human_handoff']);

const schedulingPolicySchema = z.object({
  durationMinutes: z.number().int().min(15).max(240).default(60),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  minimumNoticeHours: z.number().int().min(0).max(720).default(2),
  maximumAdvanceDays: z.number().int().min(1).max(730).default(60),
  timeZone: z.string().trim().min(1).max(120).refine(isValidTimeZone, 'Fuso horário inválido').default('America/Sao_Paulo'),
  responsible: z.string().trim().max(240).default(''),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('18:00'),
}).refine((policy) => policy.allowedWeekdays.length > 0, {
  message: 'Escolha ao menos um dia de atendimento',
  path: ['allowedWeekdays'],
}).refine((policy) => policy.startTime < policy.endTime, {
  message: 'O fim do atendimento deve ser posterior ao início',
  path: ['endTime'],
}).default({});

const handoffPolicySchema = z.object({
  destination: z.string().trim().max(240).default('Equipe comercial'),
  humanHours: z.string().trim().max(500).default('Segunda a sexta, das 9h às 18h'),
  reasons: z.array(z.string().trim().min(1).max(500)).default([
    'Pedido explícito para falar com uma pessoa',
    'Dúvida que exige confirmação humana',
    'Reclamação ou situação sensível',
  ]),
  outsideHoursBehavior: z.enum(['queue_and_inform', 'collect_contact', 'continue_safely'])
    .default('queue_and_inform'),
  pauseAgent: z.literal(true).default(true),
  includeConversationSummary: z.literal(true).default(true),
}).default({});

export const actionPolicySchema = z.object({
  actionId: actionIdSchema,
  enabled: z.boolean().default(false),
  purpose: z.string().trim().max(1_000).default(''),
  integration: z.enum(['google_calendar', 'internal_calendar', 'live_chat']).default('live_chat'),
  requiredFields: z.array(z.string().trim().min(1).max(120)).default([]),
  requiresExplicitConfirmation: z.literal(true).default(true),
  successMessage: z.string().trim().max(1_000).default(''),
  failurePolicy: z.enum(['offer_alternative', 'handoff', 'retry_once_then_handoff'])
    .default('offer_alternative'),
  simulationMode: z.literal(true).default(true),
  scheduling: schedulingPolicySchema.optional(),
  handoff: handoffPolicySchema.optional(),
});

const defaultActions = [
  {
    actionId: 'appointments' as const,
    enabled: false,
    purpose: 'Consultar disponibilidade, agendar, reagendar e cancelar reuniões.',
    integration: 'google_calendar' as const,
    requiredFields: ['data', 'horário', 'nome e contato'],
    requiresExplicitConfirmation: true as const,
    successMessage: 'Confirme somente depois que a agenda retornar sucesso.',
    failurePolicy: 'offer_alternative' as const,
    simulationMode: true as const,
    scheduling: schedulingPolicySchema.parse({}),
  },
  {
    actionId: 'human_handoff' as const,
    enabled: true,
    purpose: 'Encaminhar a conversa para uma pessoa quando necessário.',
    integration: 'live_chat' as const,
    requiredFields: ['motivo', 'resumo da conversa'],
    requiresExplicitConfirmation: true as const,
    successMessage: 'Informe que a equipe dará continuidade somente depois que a transferência for confirmada.',
    failurePolicy: 'retry_once_then_handoff' as const,
    simulationMode: true as const,
    handoff: handoffPolicySchema.parse({}),
  },
];

const actionsSchema = z.preprocess((value) => {
  const incoming = Array.isArray(value) ? value : [];
  return defaultActions.map((fallback) => {
    const candidate = incoming.find((item) => (
      typeof item === 'object'
      && item !== null
      && 'actionId' in item
      && item.actionId === fallback.actionId
    ));
    if (!candidate || typeof candidate !== 'object') return fallback;
    const scheduling = fallback.actionId === 'appointments'
      ? { ...fallback.scheduling, ...(('scheduling' in candidate && candidate.scheduling && typeof candidate.scheduling === 'object') ? candidate.scheduling : {}) }
      : undefined;
    const handoff = fallback.actionId === 'human_handoff'
      ? { ...fallback.handoff, ...(('handoff' in candidate && candidate.handoff && typeof candidate.handoff === 'object') ? candidate.handoff : {}) }
      : undefined;
    return { ...fallback, ...candidate, scheduling, handoff };
  });
}, z.array(actionPolicySchema));

export const agentConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  identity: identitySchema,
  salesProcess: salesProcessSchema,
  knowledgePolicy: knowledgePolicySchema,
  actions: actionsSchema.default(defaultActions),
  customInstructions: z.string().trim().max(12_000).default(''),
  migration: z.object({
    legacyPrompt: z.string().nullable().optional(),
    structuredReady: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough();

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentIdentity = z.infer<typeof identitySchema>;
export type AgentSalesProcess = z.infer<typeof salesProcessSchema>;
export type AgentAction = z.infer<typeof actionPolicySchema>;
export type AgentActionId = z.infer<typeof actionIdSchema>;

export function createDefaultAgentConfig(
  seed: Partial<Pick<AgentIdentity, 'agentName' | 'companyName'>> = {},
): AgentConfig {
  return agentConfigSchema.parse({
    schemaVersion: 1,
    identity: seed,
  });
}

export function parseAgentConfig(value: unknown): AgentConfig {
  return agentConfigSchema.parse(value);
}

export function safeParseAgentConfig(value: unknown) {
  return agentConfigSchema.safeParse(value);
}

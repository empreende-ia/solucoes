import { ZodError } from 'zod';

/**
 * Converte falhas de validação da configuração em uma frase que aponta os campos,
 * no vocabulário das seções da interface. Erros do Zod nunca chegam crus ao toast:
 * a mensagem original é um JSON de issues que não orienta ninguém.
 */

const SECTION_LABELS: Record<string, string> = {
  identity: 'Identidade e negócio',
  salesProcess: 'Atendimento e vendas',
  knowledgePolicy: 'Política de conhecimento',
  actions: 'Ações',
  customInstructions: 'Instruções personalizadas',
  migration: 'Configuração importada',
};

const FIELD_LABELS: Record<string, string> = {
  desiredOutcomes: 'resultados desejados',
  qualificationFields: 'informações de qualificação',
  primaryGoals: 'objetivos principais',
  offerings: 'ofertas',
  socialProof: 'provas sociais',
  stages: 'etapas',
  objections: 'objeções',
  needMappings: 'necessidade → oferta',
  communication: 'comunicação',
  followUp: 'follow-up',
  scheduling: 'agenda',
  handoff: 'transferência humana',
};

function describeIssuePath(path: Array<string | number>): string {
  const [head, ...rest] = path;
  const section = typeof head === 'string' ? SECTION_LABELS[head] : undefined;
  const field = rest.find((part): part is string => typeof part === 'string');
  const fieldLabel = field ? FIELD_LABELS[field] ?? field : '';
  if (section && fieldLabel) return `${section} (${fieldLabel})`;
  if (section) return section;
  return path.filter((part) => typeof part === 'string').join('.') || 'configuração';
}

export function formatConfigError(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    const places = [...new Set(error.issues.map((issue) => describeIssuePath(issue.path)))].slice(0, 3);
    if (places.length === 0) return fallback;
    return `Alguns campos ficaram inválidos: ${places.join('; ')}. Ajuste nas seções da configuração e tente novamente.`;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

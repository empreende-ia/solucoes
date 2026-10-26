/**
 * Domínio puro dos templates de mensagem da Meta (WhatsApp Cloud API).
 *
 * Sem imports e sem APIs de plataforma, no mesmo padrão do agent-prompt-compiler:
 * a edge function valida aqui antes de chamar a Graph API, o whatsapp-sender monta
 * o payload de envio aqui, e o frontend importa este módulo para validar e
 * pré-visualizar enquanto a pessoa digita — uma única fonte das regras.
 */

export const TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * AUTHENTICATION fica fora da primeira versão: a Meta exige composição própria
 * (botão de código, sem corpo livre) que esta tela não constrói.
 */
export const TEMPLATE_LANGUAGES = [
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'pt_PT', label: 'Português (Portugal)' },
  { value: 'en_US', label: 'Inglês (EUA)' },
  { value: 'es_ES', label: 'Espanhol (Espanha)' },
  { value: 'es_MX', label: 'Espanhol (México)' },
] as const;

export interface TemplateDraft {
  name: string;
  category: TemplateCategory;
  language: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  /** Um exemplo por variável {{n}} do corpo — a Meta exige na aprovação. */
  exampleValues: string[];
}

export interface TemplateIssue {
  field: 'name' | 'category' | 'language' | 'headerText' | 'bodyText' | 'footerText' | 'exampleValues';
  message: string;
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  bodyText: string;
  headerText: string | null;
  footerText: string | null;
  rejectedReason: string | null;
}

/** Especificação de envio que viaja em send_queue.metadata.template. */
export interface TemplateSendSpec {
  name: string;
  language: string;
  bodyParams: string[];
}

const NAME_PATTERN = /^[a-z0-9_]+$/;
const LANGUAGE_PATTERN = /^[a-z]{2}(_[A-Z]{2})?$/;
const VARIABLE_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

const LIMITS = {
  name: 512,
  body: 1_024,
  header: 60,
  footer: 60,
} as const;

/** Números das variáveis {{n}} na ordem em que aparecem (com repetições). */
export function extractVariables(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const parsed = Number(match[1]);
    if (Number.isInteger(parsed) && parsed > 0) found.push(parsed);
  }
  return found;
}

function hasMalformedVariable(text: string): boolean {
  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const parsed = Number(match[1]);
    if (!Number.isInteger(parsed) || parsed <= 0) return true;
  }
  return false;
}

/** Quantidade de variáveis distintas do corpo (o tamanho esperado dos exemplos). */
export function countBodyVariables(bodyText: string): number {
  return new Set(extractVariables(bodyText)).size;
}

export function validateTemplateDraft(draft: TemplateDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const name = draft.name.trim();
  const body = draft.bodyText.trim();
  const header = draft.headerText?.trim() ?? '';
  const footer = draft.footerText?.trim() ?? '';

  if (!name) {
    issues.push({ field: 'name', message: 'Dê um nome ao template.' });
  } else if (!NAME_PATTERN.test(name)) {
    issues.push({ field: 'name', message: 'O nome aceita apenas letras minúsculas, números e sublinhado (ex.: retomada_diagnostico).' });
  } else if (name.length > LIMITS.name) {
    issues.push({ field: 'name', message: `O nome pode ter no máximo ${LIMITS.name} caracteres.` });
  }

  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(draft.category)) {
    issues.push({ field: 'category', message: 'Escolha a finalidade: utilidade ou marketing.' });
  }

  if (!LANGUAGE_PATTERN.test(draft.language)) {
    issues.push({ field: 'language', message: 'Escolha o idioma do template.' });
  }

  if (!body) {
    issues.push({ field: 'bodyText', message: 'Escreva o corpo da mensagem.' });
  } else if (body.length > LIMITS.body) {
    issues.push({ field: 'bodyText', message: `O corpo pode ter no máximo ${LIMITS.body} caracteres.` });
  } else {
    if (hasMalformedVariable(body)) {
      issues.push({ field: 'bodyText', message: 'Variáveis devem ser {{1}}, {{2}}… — sempre números a partir de 1.' });
    }
    const ordered = [...new Set(extractVariables(body))].sort((a, b) => a - b);
    const expected = Array.from({ length: ordered.length }, (_, index) => index + 1);
    if (ordered.some((value, index) => value !== expected[index])) {
      issues.push({ field: 'bodyText', message: 'As variáveis precisam ser sequenciais a partir de {{1}}, sem pular números.' });
    }
    // A Meta rejeita corpo que começa ou termina numa variável — o lead precisa
    // de contexto textual em volta do valor substituído.
    if (/^\{\{\s*\d+\s*\}\}/.test(body)) {
      issues.push({ field: 'bodyText', message: 'O corpo não pode começar com uma variável — acrescente texto antes dela.' });
    }
    if (/\{\{\s*\d+\s*\}\}$/.test(body)) {
      issues.push({ field: 'bodyText', message: 'O corpo não pode terminar com uma variável — acrescente texto depois dela.' });
    }
  }

  if (header) {
    if (header.length > LIMITS.header) {
      issues.push({ field: 'headerText', message: `O cabeçalho pode ter no máximo ${LIMITS.header} caracteres.` });
    }
    if (extractVariables(header).length > 0 || hasMalformedVariable(header)) {
      issues.push({ field: 'headerText', message: 'Nesta versão o cabeçalho não aceita variáveis.' });
    }
  }

  if (footer) {
    if (footer.length > LIMITS.footer) {
      issues.push({ field: 'footerText', message: `O rodapé pode ter no máximo ${LIMITS.footer} caracteres.` });
    }
    if (extractVariables(footer).length > 0 || hasMalformedVariable(footer)) {
      issues.push({ field: 'footerText', message: 'O rodapé não aceita variáveis.' });
    }
  }

  const variableCount = countBodyVariables(body);
  const examples = draft.exampleValues.map((value) => value.trim());
  if (variableCount > 0) {
    if (examples.length !== variableCount || examples.some((value) => !value)) {
      issues.push({ field: 'exampleValues', message: `Preencha um exemplo para cada uma das ${variableCount} variável(is) — a Meta exige na aprovação.` });
    }
  }

  return issues;
}

/**
 * A Cloud API rejeita parâmetros e exemplos com quebra de linha, tab ou 4+
 * espaços seguidos — normaliza em vez de falhar na hora do envio.
 */
export function sanitizeParameterText(value: string): string {
  return value.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
}

/** Corpo da requisição de criação na Graph API (POST /{waba-id}/message_templates). */
export function buildCreatePayload(draft: TemplateDraft): Record<string, unknown> {
  const header = draft.headerText?.trim();
  const footer = draft.footerText?.trim();
  const body = draft.bodyText.trim();
  const variableCount = countBodyVariables(body);
  const components: Array<Record<string, unknown>> = [];

  if (header) components.push({ type: 'HEADER', format: 'TEXT', text: header });
  components.push({
    type: 'BODY',
    text: body,
    ...(variableCount > 0
      ? { example: { body_text: [draft.exampleValues.slice(0, variableCount).map(sanitizeParameterText)] } }
      : {}),
  });
  if (footer) components.push({ type: 'FOOTER', text: footer });

  return {
    name: draft.name.trim(),
    language: draft.language,
    category: draft.category,
    // Sem isso, categoria "errada" na visão da Meta vira rejeição; com isso, a
    // Meta recategoriza e aprova.
    allow_category_change: true,
    components,
  };
}

/** Objeto `template` do payload de envio (POST /{phone-id}/messages, type=template). */
export function buildSendPayload(spec: TemplateSendSpec): Record<string, unknown> {
  return {
    name: spec.name,
    language: { code: spec.language },
    ...(spec.bodyParams.length > 0
      ? {
        components: [{
          type: 'body',
          parameters: spec.bodyParams.map((text) => ({ type: 'text', text: sanitizeParameterText(text) })),
        }],
      }
      : {}),
  };
}

/**
 * Lê e valida a especificação gravada em send_queue.metadata.template.
 * Devolve null para qualquer forma inválida — o sender transforma isso em erro
 * de fila explícito em vez de enviar algo malformado.
 */
export function parseTemplateSendSpec(metadata: unknown): TemplateSendSpec | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const template = (metadata as Record<string, unknown>).template;
  if (!template || typeof template !== 'object') return null;
  const record = template as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const language = typeof record.language === 'string' ? record.language.trim() : '';
  if (!NAME_PATTERN.test(name) || !LANGUAGE_PATTERN.test(language)) return null;
  const rawParams = Array.isArray(record.bodyParams) ? record.bodyParams : [];
  if (rawParams.some((value) => typeof value !== 'string')) return null;
  return { name, language, bodyParams: rawParams as string[] };
}

/** Substitui {{n}} pelos valores — preview na UI e texto legível gravado no chat. */
export function renderTemplateText(bodyText: string, values: string[]): string {
  return bodyText.replace(VARIABLE_PATTERN, (match, index) => {
    const parsed = Number(index);
    if (!Number.isInteger(parsed) || parsed <= 0) return match;
    const value = values[parsed - 1];
    return value === undefined || value === '' ? match : value;
  });
}

/** Normaliza um template vindo da Graph API para o formato usado pela interface. */
export function parseMetaTemplate(raw: unknown): MetaTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.name !== 'string' || !record.name) return null;
  const components = Array.isArray(record.components) ? record.components : [];
  const findText = (type: string): string | null => {
    for (const component of components) {
      if (component && typeof component === 'object'
        && (component as Record<string, unknown>).type === type
        && typeof (component as Record<string, unknown>).text === 'string') {
        return (component as Record<string, unknown>).text as string;
      }
    }
    return null;
  };
  return {
    id: typeof record.id === 'string' ? record.id : '',
    name: record.name,
    status: typeof record.status === 'string' ? record.status : 'UNKNOWN',
    category: typeof record.category === 'string' ? record.category : '',
    language: typeof record.language === 'string' ? record.language : '',
    bodyText: findText('BODY') ?? '',
    headerText: findText('HEADER'),
    footerText: findText('FOOTER'),
    // A Graph API devolve a string literal 'NONE' (não null) para templates
    // nunca rejeitados quando o campo é solicitado em fields=.
    rejectedReason: typeof record.rejected_reason === 'string' && record.rejected_reason && record.rejected_reason !== 'NONE'
      ? record.rejected_reason
      : null,
  };
}

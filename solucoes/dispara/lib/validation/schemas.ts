/**
 * Zod Schemas para validação de formulários
 * 
 * Padrão: Todas as mensagens em português (pt-BR) para facilitar i18n
 */
import { z } from 'zod';

// ============================================
// ERROR CODES - Para internacionalização
// ============================================
export const ERROR_CODES = {
  // Required fields
  REQUIRED: 'REQUIRED',
  // String validation
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
  INVALID_FORMAT: 'INVALID_FORMAT',
  // Phone
  INVALID_PHONE: 'INVALID_PHONE',
  // Email
  INVALID_EMAIL: 'INVALID_EMAIL',
  // Number
  TOO_SMALL: 'TOO_SMALL',
  TOO_LARGE: 'TOO_LARGE',
  // Custom
  NO_TEMPLATE: 'NO_TEMPLATE',
  NO_RECIPIENTS: 'NO_RECIPIENTS',
  EXCEEDS_LIMIT: 'EXCEEDS_LIMIT',
} as const;

// ============================================
// ERROR MESSAGES - pt-BR
// ============================================
export const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.REQUIRED]: 'Campo obrigatório',
  [ERROR_CODES.TOO_SHORT]: 'Texto muito curto',
  [ERROR_CODES.TOO_LONG]: 'Texto muito longo',
  [ERROR_CODES.INVALID_FORMAT]: 'Formato inválido',
  [ERROR_CODES.INVALID_PHONE]: 'Número de telefone inválido',
  [ERROR_CODES.INVALID_EMAIL]: 'Email inválido',
  [ERROR_CODES.TOO_SMALL]: 'Valor muito baixo',
  [ERROR_CODES.TOO_LARGE]: 'Valor muito alto',
  [ERROR_CODES.NO_TEMPLATE]: 'Selecione um template',
  [ERROR_CODES.NO_RECIPIENTS]: 'Selecione pelo menos um destinatário',
  [ERROR_CODES.EXCEEDS_LIMIT]: 'Quantidade excede o limite da conta',
};

// ============================================
// REUSABLE FIELD SCHEMAS
// ============================================

/** Nome de campanha - 3 a 100 caracteres */
export const campaignNameSchema = z
  .string()
  .min(3, { message: 'Nome deve ter pelo menos 3 caracteres' })
  .max(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  .regex(/^[a-zA-Z0-9À-ÿ\s\-_\[\]()]+$/, { 
    message: 'Nome contém caracteres inválidos' 
  });

/** Template ID - obrigatório */
export const templateIdSchema = z
  .string()
  .min(1, { message: ERROR_MESSAGES[ERROR_CODES.NO_TEMPLATE] });

/** Tipo de destinatário */
export const recipientSourceSchema = z.enum(['all', 'specific', 'test']);

/** Lista de IDs de contatos */
export const contactIdsSchema = z
  .array(z.string())
  .min(0);

/** Telefone brasileiro (E.164) */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{10,14}$/, { 
    message: ERROR_MESSAGES[ERROR_CODES.INVALID_PHONE] 
  });

/** Email */
export const emailSchema = z
  .string()
  .email({ message: ERROR_MESSAGES[ERROR_CODES.INVALID_EMAIL] });

/** Nome de pessoa/empresa */
export const nameSchema = z
  .string()
  .min(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  .max(100, { message: 'Nome deve ter no máximo 100 caracteres' });

/** Data futura (para agendamento) */
export const futureDateSchema = z
  .string()
  .refine((date) => {
    if (!date) return true; // Optional
    const parsed = new Date(date);
    return parsed > new Date();
  }, { message: 'Data deve ser no futuro' });

// ============================================
// FORM SCHEMAS
// ============================================

/** Step 1: Configuração da Campanha */
export const campaignStep1Schema = z.object({
  name: campaignNameSchema,
  templateId: templateIdSchema,
});

/** Step 2: Seleção de Destinatários */
export const campaignStep2Schema = z.object({
  recipientSource: recipientSourceSchema,
  selectedContactIds: contactIdsSchema,
}).refine(
  (data) => {
    // Se escolheu específicos, precisa ter pelo menos 1 contato
    if (data.recipientSource === 'specific') {
      return data.selectedContactIds.length > 0;
    }
    return true;
  },
  {
    message: ERROR_MESSAGES[ERROR_CODES.NO_RECIPIENTS],
    path: ['selectedContactIds'],
  }
);

/** Step 3: Revisão (opcional scheduling) */
export const campaignStep3Schema = z.object({
  scheduleMode: z.enum(['now', 'scheduled']),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
}).refine(
  (data) => {
    if (data.scheduleMode === 'scheduled') {
      return data.scheduledDate && data.scheduledTime;
    }
    return true;
  },
  {
    message: 'Selecione data e horário para agendamento',
    path: ['scheduledDate'],
  }
).refine(
  (data) => {
    if (data.scheduleMode === 'scheduled' && data.scheduledDate && data.scheduledTime) {
      const scheduled = new Date(`${data.scheduledDate}T${data.scheduledTime}`);
      return scheduled > new Date();
    }
    return true;
  },
  {
    message: 'Data de agendamento deve ser no futuro',
    path: ['scheduledDate'],
  }
);

/** Schema completo da campanha */
export const campaignFormSchema = z.object({
  // Step 1
  name: campaignNameSchema,
  templateId: templateIdSchema,
  // Step 2
  recipientSource: recipientSourceSchema,
  selectedContactIds: contactIdsSchema,
  // Step 3
  scheduleMode: z.enum(['now', 'scheduled']).default('now'),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
});

// ============================================
// CONTACT FORM SCHEMA
// ============================================

export const contactFormSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
});

// ============================================
// SETTINGS FORM SCHEMAS
// ============================================

export const credentialsFormSchema = z.object({
  wabaId: z.string().min(1, 'WABA ID é obrigatório'),
  phoneNumberId: z.string().min(1, 'Phone Number ID é obrigatório'),
  accessToken: z.string().min(50, 'Token deve ter pelo menos 50 caracteres'),
});

export const testContactFormSchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema,
});

// ============================================
// TYPE EXPORTS
// ============================================

export type CampaignStep1Form = z.infer<typeof campaignStep1Schema>;
export type CampaignStep2Form = z.infer<typeof campaignStep2Schema>;
export type CampaignStep3Form = z.infer<typeof campaignStep3Schema>;
export type CampaignForm = z.infer<typeof campaignFormSchema>;
export type ContactForm = z.infer<typeof contactFormSchema>;
export type CredentialsForm = z.infer<typeof credentialsFormSchema>;
export type TestContactForm = z.infer<typeof testContactFormSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Valida um valor contra um schema e retorna erros formatados
 */
export function validateField<T>(
  schema: z.ZodType<T>,
  value: unknown
): { success: boolean; error?: string } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true };
  }
  
  // Zod 4 retorna errors como array dentro de uma string JSON no error.message
  // ou diretamente no error.issues
  const issues = result.error.issues || [];
  const firstIssue = issues[0];
  
  return {
    success: false,
    error: firstIssue?.message || ERROR_MESSAGES[ERROR_CODES.INVALID_FORMAT],
  };
}

/**
 * Valida um form inteiro e retorna todos os erros
 */
export function validateForm<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: boolean; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, errors: {} };
  }
  
  const errors: Record<string, string> = {};
  const issues = result.error.issues || [];
  
  issues.forEach((issue) => {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  });
  
  return { success: false, errors };
}

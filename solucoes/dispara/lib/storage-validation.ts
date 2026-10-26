/**
 * Zod Storage Validation Schemas
 *
 * Provides runtime validation for localStorage data
 * Ported from NossoFlow with improvements
 */

import { z } from 'zod';
import { CampaignStatus, ContactStatus, MessageStatus } from '../types';
import { logger } from './logger';

// ============================================================================
// Base Schemas
// ============================================================================

/** Schema Zod para {@link CampaignStatus} (enum nativo). */
export const CampaignStatusSchema = z.nativeEnum(CampaignStatus);
/** Schema Zod para {@link ContactStatus} (enum nativo). */
export const ContactStatusSchema = z.nativeEnum(ContactStatus);
/** Schema Zod para {@link MessageStatus} (enum nativo). */
export const MessageStatusSchema = z.nativeEnum(MessageStatus);

/** Schema Zod para categoria de template (conjunto finito suportado pela UI/API). */
export const TemplateCategorySchema = z.enum(['MARKETING', 'UTILIDADE', 'AUTENTICACAO']);
/** Schema Zod para status de template retornado/armazenado pela aplicação. */
export const TemplateStatusSchema = z.enum(['APPROVED', 'PENDING', 'REJECTED']);

// ============================================================================
// Entity Schemas
// ============================================================================

/** Schema Zod para botões de template do WhatsApp (QUICK_REPLY/URL/PHONE_NUMBER). */
export const TemplateButtonSchema = z.object({
  type: z.enum([
    // Tipos de botão suportados pela Meta API para templates
    'QUICK_REPLY',
    'URL',
    'PHONE_NUMBER',
    'COPY_CODE',
    'OTP',
    'FLOW',
  ]),
  text: z.string().optional(),
  url: z.string().optional(),
  phone_number: z.string().optional(),
  example: z.union([z.string(), z.array(z.string())]).optional(),
  otp_type: z.enum(['COPY_CODE', 'ONE_TAP', 'ZERO_TAP']).optional(),
  flow_id: z.string().optional(),
  payload: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
});

/** Schema Zod para componentes de template (HEADER/BODY/FOOTER/BUTTONS). */
export const TemplateComponentSchema = z.object({
  type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS', 'LIMITED_TIME_OFFER']),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'GIF', 'DOCUMENT', 'LOCATION']).optional(),
  text: z.string().optional(),
  buttons: z.array(TemplateButtonSchema).optional(),
  limited_time_offer: z.object({
    text: z.string(),
    has_expiration: z.boolean().optional(),
  }).optional(),
  example: z.unknown().optional(),
});

/** Schema Zod para um template (visão local/armazenamento, com campos usados na UI). */
export const TemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: TemplateCategorySchema,
  language: z.string(),
  status: TemplateStatusSchema,
  content: z.string(),
  preview: z.string(),
  lastUpdated: z.string(),
  headerMediaId: z.string().optional(),
  headerMediaHash: z.string().optional(),
  headerMediaPreviewUrl: z.string().optional(),
  headerMediaPreviewExpiresAt: z.string().optional(),
  components: z.array(TemplateComponentSchema).optional(),
});

/** Schema Zod para uma campanha (forma persistida em storage/local). */
export const CampaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: CampaignStatusSchema,
  recipients: z.number().min(0),
  delivered: z.number().min(0),
  read: z.number().min(0),
  createdAt: z.string(),
  templateName: z.string(),
});

/** Schema Zod para um contato (forma persistida em storage/local). */
export const ContactSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  status: ContactStatusSchema,
  tags: z.array(z.string()),
  lastActive: z.string(),
});

/** Schema Zod para uma mensagem (forma persistida em storage/local). */
export const MessageSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  contactName: z.string(),
  contactPhone: z.string(),
  status: MessageStatusSchema,
  sentAt: z.string(),
  error: z.string().optional(),
});

/** Schema Zod para configurações da aplicação (credenciais e estado de conexão). */
export const AppSettingsSchema = z.object({
  phoneNumberId: z.string(),
  businessAccountId: z.string(),
  accessToken: z.string(),
  isConnected: z.boolean(),
  displayPhoneNumber: z.string().optional(),
  qualityRating: z.string().optional(),
  verifiedName: z.string().optional(),
});

// ============================================================================
// Collection Schemas
// ============================================================================

/** Schema Zod para lista de campanhas. */
export const CampaignsArraySchema = z.array(CampaignSchema);
/** Schema Zod para lista de contatos. */
export const ContactsArraySchema = z.array(ContactSchema);
/** Schema Zod para lista de templates. */
export const TemplatesArraySchema = z.array(TemplateSchema);
/** Schema Zod para lista de mensagens. */
export const MessagesArraySchema = z.array(MessageSchema);

// ============================================================================
// Validation Functions
// ============================================================================

export interface ZodValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
}

/**
 * Valida um dado desconhecido (`unknown`) contra um schema Zod.
 *
 * Quando a validação falha, registra um warning com as primeiras issues (path/mensagem).
 *
 * @param schema Schema Zod a ser aplicado.
 * @param data Dado de entrada (tipicamente vindo de `localStorage`/API/arquivo).
 * @returns Objeto com `success` e, em caso de sucesso, `data`; em caso de falha, `errors`.
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ZodValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  logger.warn('Validation failed', {
    errors: result.error.issues.map(i => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  });

  return {
    success: false,
    errors: result.error,
  };
}

/**
 * Valida um dado e retorna o valor validado; em caso de falha retorna um padrão.
 *
 * @param schema Schema Zod a ser aplicado.
 * @param data Dado de entrada (unknown).
 * @param defaultValue Valor padrão a ser retornado quando a validação falhar.
 * @returns O dado validado (tipo `T`) ou `defaultValue`.
 */
export function validateOrDefault<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  defaultValue: T
): T {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  logger.warn('Validation failed, using default', {
    errors: result.error.issues.slice(0, 3).map(i => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  });

  return defaultValue;
}

/**
 * Valida uma lista de campanhas.
 *
 * @param data Dado de entrada (unknown), tipicamente vindo do storage.
 * @returns Lista de campanhas válida; retorna `[]` se inválido.
 */
export function validateCampaigns(data: unknown): Campaign[] {
  return validateOrDefault(CampaignsArraySchema, data, []);
}

/**
 * Valida uma lista de contatos.
 *
 * @param data Dado de entrada (unknown), tipicamente vindo do storage.
 * @returns Lista de contatos válida; retorna `[]` se inválido.
 */
export function validateContacts(data: unknown): Contact[] {
  return validateOrDefault(ContactsArraySchema, data, []);
}

/**
 * Valida uma lista de templates.
 *
 * @param data Dado de entrada (unknown), tipicamente vindo do storage.
 * @returns Lista de templates válida; retorna `[]` se inválido.
 */
export function validateTemplates(data: unknown): Template[] {
  return validateOrDefault(TemplatesArraySchema, data, []);
}

/**
 * Valida as configurações da aplicação.
 *
 * @param data Dado de entrada (unknown), tipicamente vindo do storage.
 * @returns Configurações válidas; retorna um objeto com valores padrão se inválido.
 */
export function validateSettings(data: unknown): AppSettings {
  return validateOrDefault(AppSettingsSchema, data, {
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    isConnected: false,
  });
}

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type Campaign = z.infer<typeof CampaignSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type TemplateComponent = z.infer<typeof TemplateComponentSchema>;
export type TemplateButton = z.infer<typeof TemplateButtonSchema>;

// ============================================================================
// Storage Helpers with Validation
// ============================================================================

/**
 * Lê um valor JSON do `localStorage` e valida com Zod.
 *
 * Em ambiente SSR (sem `window`), retorna `defaultValue`.
 *
 * @param key Chave do `localStorage`.
 * @param schema Schema Zod usado na validação.
 * @param defaultValue Valor padrão retornado quando ausente/ inválido/ erro de parse.
 * @returns Valor validado (T) ou `defaultValue`.
 */
export function safeParseFromStorage<T>(
  key: string,
  schema: z.ZodSchema<T>,
  defaultValue: T
): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;

    const parsed = JSON.parse(stored);
    return validateOrDefault(schema, parsed, defaultValue);
  } catch (error) {
    logger.error('Storage parse error', {
      key,
      error: (error as Error).message,
    });
    return defaultValue;
  }
}

/**
 * Valida e salva um valor no `localStorage` de forma segura.
 *
 * Em ambiente SSR (sem `window`), retorna `false`.
 *
 * @param key Chave do `localStorage`.
 * @param schema Schema Zod usado para validar antes de salvar.
 * @param data Dado a ser salvo.
 * @returns `true` se salvou com sucesso; caso contrário `false`.
 */
export function safeSaveToStorage<T>(
  key: string,
  schema: z.ZodSchema<T>,
  data: T
): boolean {
  if (typeof window === 'undefined') return false;

  // Validate before saving
  const validation = schema.safeParse(data);
  if (!validation.success) {
    logger.error('Validation failed before save', {
      key,
      errors: validation.error.issues.slice(0, 3),
    });
    return false;
  }

  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    logger.error('Storage save error', {
      key,
      error: (error as Error).message,
    });
    return false;
  }
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Migra e valida dados antigos (tipicamente do storage) para um schema novo.
 *
 * Percorre a lista e remove entradas inválidas; registra um warning com a contagem.
 *
 * @param data Lista bruta (unknown[]) a migrar/validar.
 * @param schema Schema Zod que define a nova forma do item.
 * @returns Lista contendo apenas itens válidos (já tipados como `T`).
 */
export function migrateAndValidate<T>(
  data: unknown[],
  schema: z.ZodSchema<T>
): T[] {
  if (!Array.isArray(data)) return [];

  const valid: T[] = [];
  const invalid: number[] = [];

  data.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push(index);
    }
  });

  if (invalid.length > 0) {
    logger.warn('Migration: removed invalid entries', {
      invalidCount: invalid.length,
      totalCount: data.length,
      invalidIndices: invalid.slice(0, 10),
    });
  }

  return valid;
}

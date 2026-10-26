/**
 * Business Logic Layer
 *
 * Este módulo centraliza toda a lógica de negócio da aplicação,
 * separando-a dos componentes de UI e hooks de estado.
 *
 * Benefícios:
 * - Funções puras, fáceis de testar
 * - Reutilizáveis em qualquer contexto
 * - Agnósticas de framework (funcionam em React, Svelte, etc.)
 *
 * @example
 * ```typescript
 * import {
 *   filterContactsByCriteria,
 *   parseTemplateVariables,
 *   validateCampaignForSend
 * } from '@/lib/business'
 * ```
 */

// Audience - Critérios, estatísticas e presets de audiência
export * from './audience'

// Template - Parsing de variáveis, auto-mapping, validação de carousel
export {
  // variable-parser
  extractVariablesFromText,
  parseTemplateVariables,
  getTemplateVariableInfo,
  countTemplateVariables,
  VARIABLE_REGEX,
  type ParsedVariable,
  type ParsedTemplateVariables,
  type VariableInfo,
  type ButtonVariableInfo,
  type TemplateVariableInfo,
  // variable-mapper
  SYSTEM_FIELDS as TEMPLATE_SYSTEM_FIELDS,
  SYSTEM_FIELD_NAMES,
  isSystemField as isTemplateSystemField,
  getSystemFieldKey,
  autoMapVariables,
  generateAutoFillValues,
  resolveVariableValue,
  resolveAllVariables,
  canResolveAllVariables,
  getUnresolvedVariables,
  type VariableMapping,
  type ResolvedVariable,
  type SystemFieldKey,
  // carousel-rules
  CAROUSEL_RULES,
  isValidCarouselCardCount,
  validateCarouselCard,
  validateCarousel,
  validateCarouselWithResult,
  getRemainingCardSlots,
  canAddMoreCards,
  canRemoveCards,
  getRemainingBodyChars,
  getRemainingButtonChars,
  type CarouselCard,
  type CarouselValidationError,
  type CarouselValidationResult,
} from './template'

// Campaign - Regras de negócio, validação de envio, agendamento
export * from './campaign'

// Contact - Transformação, campos de sistema, status
export {
  // transformer
  transformContactForSending,
  transformContactsForSending,
  transformTestContact,
  createEmptyTransformOptions,
  buildVariableMappingsFromArrays,
  type ContactForSending,
  type TransformOptions,
  // system-fields
  SYSTEM_FIELDS as CONTACT_SYSTEM_FIELDS,
  isSystemField as isContactSystemField,
  getSystemFieldValue,
  getAllSystemFieldNames,
  getUniqueSystemFieldKeys,
  type SystemFieldName,
  type SystemFieldDefinition,
  // status
  ContactStatus,
  STATUS_RULES,
  canReceiveMessages,
  getStatusLabel,
  getStatusColor,
  isBlockedStatus,
} from './contact'

// Settings - Health check, webhook, calendar
export {
  // health
  type HealthCheckResult,
  type HealthIssueSeverity,
  type HealthIssue,
  HEALTH_THRESHOLDS,
  SCORE_PENALTIES,
  getHealthIssues,
  getHealthIssueMessages,
  computeScoreFromIssues,
  computeHealthScore,
  getHealthStatus,
  canSendWithSettings,
  areServicesHealthy,
  getCriticalServiceIssue,
  // webhook
  type WebhookValidationResult,
  type WebhookUrlComponents,
  DEFAULT_WEBHOOK_PATH,
  validateWebhookUrl,
  validateWebhookToken,
  buildWebhookUrl,
  buildCallbackUrl,
  parseWebhookToken,
  parseWebhookUrl,
  extractBaseUrl,
  normalizeDomain,
  isProductionUrl,
  // calendar
  type WorkingHours,
  type CalendarConfig,
  type CalendarValidationResult,
  type TimeValidationResult,
  DEFAULT_WORKING_HOURS,
  MIN_SLOT_DURATION,
  MAX_SLOT_DURATION,
  DEFAULT_SLOT_DURATION,
  WEEKDAY_ORDER,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT_LABELS,
  parseTimeToMinutes,
  minutesToTime,
  validateTimeFormat,
  validateWorkingHours,
  validateWorkingHoursDay,
  validateCalendarConfig,
  validateCalendarBookingConfig,
  isWithinWorkingHours,
  isWorkingDay,
  getWorkingHoursForDate,
  getAvailableSlots,
  getAvailableSlotsForDate,
  countSlotsInDay,
} from './settings'

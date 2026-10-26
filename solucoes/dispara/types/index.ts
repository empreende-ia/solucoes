/**
 * Types Index
 *
 * Central export point for all domain types.
 * Import from '@/types' or 'types' for clean imports.
 *
 * @example
 * // Import specific types
 * import { Campaign, Contact, Template } from '@/types';
 *
 * // Import from specific domain
 * import { CampaignStatus, CampaignListParams } from '@/types/campaign.types';
 */

// =============================================================================
// CAMPAIGN DOMAIN
// =============================================================================

export {
  // Enums
  CampaignStatus,
  MessageStatus,
  // Core interfaces
  type Campaign,
  type CampaignTemplateVariables,
  type CampaignPendingContact,
  type Message,
  // Service types
  type CampaignListParams,
  type CampaignListResult,
  type RealMessageStatus,
  type CampaignStatusResponse,
  type CampaignStats,
  type CampaignPrecheckResult,
  type CampaignPrecheckContactResult,
  type CampaignPrecheckContactValid,
  type CampaignPrecheckContactInvalid,
  type MissingParamDetail,
  // Broadcast types
  type CampaignProgressBroadcastPhase,
  type CampaignProgressBroadcastDelta,
  type CampaignProgressBroadcastPayload,
} from './campaign.types';

// =============================================================================
// CONTACT DOMAIN
// =============================================================================

export {
  // Enums
  ContactStatus,
  // Core interfaces
  type Contact,
  type CustomFieldDefinition,
  // Service types
  type ContactListParams,
  type ContactListResult,
  type ContactStats,
  type ImportResult,
  type PhoneValidationResult,
  // Lead forms
  type LeadForm,
  type LeadFormFieldType,
  type LeadFormField,
  type CreateLeadFormDTO,
  type UpdateLeadFormDTO,
} from './contact.types';

// =============================================================================
// TEMPLATE DOMAIN
// =============================================================================

export {
  // Type aliases
  type TemplateCategory,
  type TemplateStatus,
  // Core interfaces
  type Template,
  type TemplateComponent,
  type TemplateButton,
  type TemplateButtonType,
  // Generated template types
  type GeneratedTemplateHeader,
  type GeneratedTemplateFooter,
  type GeneratedTemplateButton,
  type GeneratedTemplate,
  type GeneratedTemplateJudgment,
  type GeneratedTemplateIssue,
  type GeneratedTemplateWithStatus,
  // Workspace types
  type WorkspaceStatus,
  type WorkspaceTemplateStatus,
  type TemplateWorkspace,
  type WorkspaceTemplate,
  // Project types
  type ProjectStatus,
  type TemplateProject,
  type TemplateProjectItem,
  type CreateTemplateProjectDTO,
  // Batch submission types
  type BatchSubmission,
  type BatchSubmissionStats,
  // Service types
  type UtilityCategory,
  type GenerateUtilityParams,
  type GenerateUtilityResponse,
} from './template.types';

// =============================================================================
// SETTINGS DOMAIN
// =============================================================================

export {
  // Core settings
  type AppSettings,
  type TestContact,
  // Account limits
  type AccountLimits,
  type AccountUsage,
  // Calendar booking
  type Weekday,
  type WorkingHoursDay,
  type CalendarBookingConfig,
  // Workflow execution
  type WorkflowExecutionConfig,
  // Meta app configuration
  type MetaAppConfig,
  // Webhook configuration
  type WebhookInfo,
  type WebhookStats,
  type WebhookSubscriptionStatus,
  type WebhookSubscribedApp,
  // Phone number configuration
  type PhoneNumber,
  type PhoneNumberWebhookConfig,
  type DomainOption,
  // System health
  type HealthStatus,
  type HealthServices,
  type DatabaseHealth,
  type WhatsAppHealth,
  type VercelInfo,
  // Setup wizard
  type SetupStep,
  // Throttle configuration
  type WhatsAppThrottleConfig,
  // Auto-suppression
  type AutoSuppressionConfig,
  // UI components
  type StatCardProps,
} from './settings.types';

// =============================================================================
// FLOW DOMAIN
// =============================================================================

export {
  // Core interfaces
  type FlowRow,
  type FlowSubmissionRow,
  // Service types
  type FlowSubmissionsQuery,
  type CreateFlowInput,
  type CreateFlowFromTemplateInput,
  type UpdateFlowInput,
  type PublishFlowInput,
  // Template types
  type FlowTemplate,
  // Builder types
  type FlowScreen,
  type FlowComponent,
  type FlowComponentType,
  type FlowComponentOption,
  type FlowScreenAction,
  // Mapping types
  type FlowFieldMapping,
  type FlowFieldTransform,
} from './flow.types';

// =============================================================================
// API DOMAIN
// =============================================================================

export {
  // Pagination
  type PaginationParams,
  type PaginationMeta,
  type PaginatedResponse,
  // Error handling
  type ApiError,
  type ValidationError,
  type MetaApiError,
  // Success responses
  type SuccessResponse,
  type CreateResponse,
  type CountResponse,
  type BulkOperationResult,
  // Request types
  type BaseFilterParams,
  type SortDirection,
  type SortParams,
  // Realtime types
  type RealtimeTable,
  type RealtimeEventType,
  type RealtimePayload,
  type ChannelStatus,
  type RealtimeSubscriptionConfig,
  type RealtimeState,
  // Telemetry types
  type RealtimeLatencyTelemetryBroadcast,
  type RealtimeLatencyTelemetryDbChange,
  type RealtimeLatencyTelemetryRefetch,
  type RealtimeLatencyTelemetry,
  // Dashboard types
  type DashboardStats,
  type ChartDataPoint,
} from './api.types';

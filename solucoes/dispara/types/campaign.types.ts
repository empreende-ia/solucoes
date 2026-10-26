/**
 * Campaign Domain Types
 *
 * Types related to WhatsApp marketing campaigns, including
 * campaign status, messages, metrics, and related entities.
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Possible states of a campaign throughout its lifecycle.
 */
export enum CampaignStatus {
  /** Campaign is being prepared, not yet ready to send */
  DRAFT = 'Rascunho',
  /** Campaign is scheduled to be sent at a future time */
  SCHEDULED = 'Agendado',
  /** Campaign is currently sending messages */
  SENDING = 'Enviando',
  /** Campaign has finished sending all messages */
  COMPLETED = 'Concluído',
  /** Campaign was paused by the user */
  PAUSED = 'Pausado',
  /** Campaign failed due to an error */
  FAILED = 'Falhou',
  /** Campaign was cancelled by the user */
  CANCELLED = 'Cancelado',
}

/**
 * Status of individual messages within a campaign.
 */
export enum MessageStatus {
  /** Message is queued but not yet sent */
  PENDING = 'Pendente',
  /** Message was sent to WhatsApp API */
  SENT = 'Enviado',
  /** Message was delivered to recipient's device */
  DELIVERED = 'Entregue',
  /** Message was read by recipient */
  READ = 'Lido',
  /** Message was skipped (invalid contact, suppressed, etc.) */
  SKIPPED = 'Ignorado',
  /** Message failed to send */
  FAILED = 'Falhou',
}

// =============================================================================
// CORE INTERFACES
// =============================================================================

/**
 * Represents a WhatsApp marketing campaign.
 */
export interface Campaign {
  /** Unique identifier for the campaign */
  id: string;
  /** Display name of the campaign */
  name: string;
  /** Current status of the campaign */
  status: CampaignStatus;
  /** Total number of recipients */
  recipients: number;
  /** Number of messages sent */
  sent: number;
  /** Number of messages delivered */
  delivered: number;
  /** Number of messages read */
  read: number;
  /** Number of messages skipped */
  skipped: number;
  /** Number of messages that failed */
  failed: number;
  /** ISO timestamp when campaign was created */
  createdAt: string;
  /** Name of the WhatsApp template used */
  templateName: string;
  /** Template variables organized by component type (Meta API structure) */
  templateVariables?: CampaignTemplateVariables;
  /** Snapshot of template at campaign creation time */
  templateSnapshot?: unknown;
  /** Hash of template spec for change detection */
  templateSpecHash?: string | null;
  /** Parameter format of the template */
  templateParameterFormat?: 'positional' | 'named' | null;
  /** ISO timestamp when template was fetched */
  templateFetchedAt?: string | null;
  /** ISO timestamp for scheduled campaigns */
  scheduledAt?: string | null;
  /** QStash message ID for scheduled dispatch */
  qstashScheduleMessageId?: string | null;
  /** ISO timestamp when schedule was enqueued in QStash */
  qstashScheduleEnqueuedAt?: string | null;
  /** ISO timestamp when campaign actually started sending */
  startedAt?: string | null;
  /** ISO timestamp when first contact started dispatching */
  firstDispatchAt?: string | null;
  /** ISO timestamp when last contact was marked as sent */
  lastSentAt?: string | null;
  /** ISO timestamp when campaign finished */
  completedAt?: string | null;
  /** ISO timestamp when campaign was cancelled */
  cancelledAt?: string | null;
  /** ISO timestamp when campaign was paused */
  pausedAt?: string | null;
  /** IDs of selected contacts for resume functionality */
  selectedContactIds?: string[];
  /** Pending contacts for optimistic UI display */
  pendingContacts?: CampaignPendingContact[];

  // ── A/B Testing ──────────────────────────────────────────────────────
  /** Whether A/B testing is enabled for this campaign */
  abTestEnabled?: boolean;
  /** Template name for variant B */
  abTemplateNameB?: string;
  /** Template variables for variant B (same structure as main templateVariables) */
  abTemplateVariablesB?: CampaignTemplateVariables;
  /** Snapshot of template B at campaign creation time */
  abTemplateSnapshotB?: unknown;
  /** Split ratio: percentage of contacts assigned to variant A (0-100) */
  abSplitRatio?: number;

  // ── Auto-replies (Story 001) ─────────────────────────────────────────
  /** Map of quick_reply button text -> automatic response sent when client replies with that exact text */
  quickReplyResponses?: Record<string, string> | null;
  /** Automatic response sent when client replies with free text (not matching any quick_reply) */
  fallbackResponse?: string | null;
  /** Total auto-replies successfully sent (quick + fallback) */
  autoReplySentCount?: number;
  /** Auto-replies triggered by match in quick_reply button text */
  quickReplyMatchCount?: number;
  /** Auto-replies triggered by fallback (free text) */
  fallbackSentCount?: number;
}

/**
 * Template variables organized by component type.
 * Follows Meta WhatsApp Business API structure.
 */
export interface CampaignTemplateVariables {
  /** Variables for header component */
  header: string[];
  /** Variables for body component */
  body: string[];
  /** Variables for button components, keyed by button identifier */
  buttons?: Record<string, string>;
}

/**
 * Simplified contact representation for pending display.
 */
export interface CampaignPendingContact {
  /** Contact display name */
  name: string;
  /** Contact phone number */
  phone: string;
}

/**
 * Represents an individual message within a campaign.
 */
export interface Message {
  /** Unique identifier for the message */
  id: string;
  /** ID of the parent campaign */
  campaignId: string;
  /** ID of the associated contact */
  contactId?: string;
  /** Display name of the contact */
  contactName: string;
  /** Phone number of the contact */
  contactPhone: string;
  /** Current status of the message */
  status: MessageStatus;
  /** WhatsApp message ID returned by API */
  messageId?: string;
  /** ISO timestamp when message was sent */
  sentAt: string;
  /** ISO timestamp when message was delivered */
  deliveredAt?: string;
  /** ISO timestamp when message was read */
  readAt?: string;
  /** Error message if failed */
  error?: string;
  /** A/B test variant assigned to this message/contact */
  variant?: 'A' | 'B';
}

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Parameters for listing campaigns with pagination and filters.
 */
export interface CampaignListParams {
  /** Maximum number of campaigns to return */
  limit: number;
  /** Number of campaigns to skip */
  offset: number;
  /** Optional search term to filter by name */
  search?: string;
  /** Optional status filter */
  status?: string;
}

/**
 * Paginated result from campaign list endpoint.
 */
export interface CampaignListResult {
  /** Array of campaigns for current page */
  data: Campaign[];
  /** Total number of campaigns matching filters */
  total: number;
  /** Limit used in query */
  limit: number;
  /** Offset used in query */
  offset: number;
}

/**
 * Real-time message status from webhook updates.
 */
export interface RealMessageStatus {
  /** Phone number of the recipient */
  phone: string;
  /** Send status */
  status: 'sent' | 'failed';
  /** WhatsApp message ID */
  messageId?: string;
  /** Error message if failed */
  error?: string;
  /** ISO timestamp of the event */
  timestamp?: string;
  /** Alternative timestamp field */
  sentAt?: string;
  /** Status from Meta webhook */
  webhookStatus?: 'delivered' | 'read' | 'failed';
  /** ISO timestamp from webhook */
  webhookTimestamp?: string;
}

/**
 * Response from campaign status endpoint with aggregated stats.
 */
export interface CampaignStatusResponse {
  /** ID of the campaign */
  campaignId: string;
  /** Aggregated statistics */
  stats: CampaignStats;
  /** Individual message statuses */
  messages: RealMessageStatus[];
}

/**
 * Aggregated campaign statistics.
 */
export interface CampaignStats {
  /** Number of messages sent */
  sent: number;
  /** Number of messages delivered */
  delivered: number;
  /** Number of messages read */
  read: number;
  /** Number of messages skipped */
  skipped?: number;
  /** Number of messages failed */
  failed: number;
  /** Total number of messages */
  total: number;
}

/**
 * Result from campaign precheck validation.
 */
export interface CampaignPrecheckResult {
  /** Whether precheck passed */
  ok: true;
  /** Name of the template being used */
  templateName: string;
  /** Summary totals */
  totals: {
    /** Total contacts checked */
    total: number;
    /** Valid contacts that will receive messages */
    valid: number;
    /** Skipped contacts */
    skipped: number;
  };
  /** Individual contact validation results */
  results: CampaignPrecheckContactResult[];
}

/**
 * Validation result for a single contact in precheck.
 */
export type CampaignPrecheckContactResult =
  | CampaignPrecheckContactValid
  | CampaignPrecheckContactInvalid;

/**
 * Valid contact that will receive the message.
 */
export interface CampaignPrecheckContactValid {
  /** Contact passed validation */
  ok: true;
  /** Contact ID if from database */
  contactId?: string;
  /** Contact display name */
  name: string;
  /** Original phone number */
  phone: string;
  /** Normalized phone number */
  normalizedPhone: string;
}

/**
 * Invalid contact that will be skipped.
 */
export interface CampaignPrecheckContactInvalid {
  /** Contact failed validation */
  ok: false;
  /** Contact ID if from database */
  contactId?: string;
  /** Contact display name */
  name: string;
  /** Original phone number */
  phone: string;
  /** Normalized phone number if available */
  normalizedPhone?: string;
  /** Code identifying the skip reason */
  skipCode: string;
  /** Human-readable skip reason */
  reason: string;
  /** Details about missing parameters */
  missing?: MissingParamDetail[];
}

/**
 * Detail about a missing template parameter.
 */
export interface MissingParamDetail {
  /** Component type (header, body, button) */
  component: string;
  /** Parameter index or name */
  param: string | number;
  /** Expected value or description */
  expected?: string;
}

// =============================================================================
// BROADCAST TYPES (Realtime)
// =============================================================================

/**
 * Phase of campaign progress broadcast event.
 */
export type CampaignProgressBroadcastPhase =
  | 'batch_start'
  | 'batch_end'
  | 'cancelled'
  | 'complete';

/**
 * Delta changes in campaign progress.
 */
export interface CampaignProgressBroadcastDelta {
  /** Messages sent in this batch */
  sent: number;
  /** Messages failed in this batch */
  failed: number;
  /** Messages skipped in this batch */
  skipped: number;
}

/**
 * Ephemeral broadcast payload for real-time campaign progress.
 * Does not contain PII. Not source of truth - UI should reconcile with DB.
 */
export interface CampaignProgressBroadcastPayload {
  /** ID of the campaign */
  campaignId: string;
  /** Trace ID for debugging */
  traceId: string;
  /** Index of the current batch */
  batchIndex: number;
  /** Sequence number */
  seq: number;
  /** Unix timestamp */
  ts: number;
  /** Changes in this event */
  delta?: CampaignProgressBroadcastDelta;
  /** Phase of the event */
  phase?: CampaignProgressBroadcastPhase;
}

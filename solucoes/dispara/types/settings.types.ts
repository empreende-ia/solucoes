/**
 * Settings Domain Types
 *
 * Types related to application settings, including
 * WhatsApp API configuration, account limits, and system health.
 */

import type { ReactNode } from 'react';

// =============================================================================
// CORE SETTINGS
// =============================================================================

/**
 * Main application settings.
 */
export interface AppSettings {
  /** Meta WhatsApp Phone Number ID */
  phoneNumberId: string;
  /** Meta Business Account ID (WABA ID) */
  businessAccountId: string;
  /** Meta API Access Token */
  accessToken: string;
  /** Whether WhatsApp is connected and configured */
  isConnected: boolean;
  /** Display phone number from Meta API */
  displayPhoneNumber?: string;
  /** Quality rating from Meta API */
  qualityRating?: string;
  /** Verified business name from Meta API */
  verifiedName?: string;
  /** Test contact for sending test messages */
  testContact?: TestContact;
}

/**
 * Test contact for sending test messages.
 */
export interface TestContact {
  /** Display name */
  name?: string;
  /** Phone number */
  phone: string;
}

// =============================================================================
// ACCOUNT LIMITS
// =============================================================================

/**
 * Account limits and tier information.
 */
export interface AccountLimits {
  /** Current tier ID */
  tierId: string;
  /** Tier display name */
  tierName: string;
  /** Maximum messages per day */
  maxMessagesPerDay: number;
  /** Maximum contacts */
  maxContacts: number;
  /** Maximum campaigns per month */
  maxCampaignsPerMonth: number;
  /** Current usage statistics */
  usage: AccountUsage;
}

/**
 * Current usage statistics.
 */
export interface AccountUsage {
  /** Messages sent today */
  messagesToday: number;
  /** Total contacts */
  contactCount: number;
  /** Campaigns this month */
  campaignsThisMonth: number;
}

// =============================================================================
// CALENDAR BOOKING
// =============================================================================

/**
 * Day of the week for working hours configuration.
 */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/**
 * Working hours configuration for a single day.
 */
export interface WorkingHoursDay {
  /** Day of the week */
  day: Weekday;
  /** Whether this day is enabled */
  enabled: boolean;
  /** Start time (HH:mm format) */
  start: string;
  /** End time (HH:mm format) */
  end: string;
}

/**
 * Calendar booking configuration.
 */
export interface CalendarBookingConfig {
  /** Timezone for booking times */
  timezone: string;
  /** Duration of each slot in minutes */
  slotDurationMinutes: number;
  /** Buffer time between slots in minutes */
  slotBufferMinutes: number;
  /** Working hours for each day */
  workingHours: WorkingHoursDay[];
  /** Minimum advance hours allowed */
  minAdvanceHours?: number;
  /** Maximum advance days allowed */
  maxAdvanceDays?: number;
  /** Allow simultaneous bookings */
  allowSimultaneous?: boolean;
  /** External webhook to receive flow submissions */
  externalWebhookUrl?: string;
}

// =============================================================================
// WORKFLOW EXECUTION
// =============================================================================

/**
 * Workflow execution configuration.
 */
export interface WorkflowExecutionConfig {
  /** Number of retry attempts */
  retryCount: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Timeout for workflow execution in milliseconds */
  timeoutMs: number;
}

// =============================================================================
// META APP CONFIGURATION
// =============================================================================

/**
 * Meta App configuration for advanced diagnostics.
 */
export interface MetaAppConfig {
  /** Source of configuration */
  source: 'db' | 'env' | 'none';
  /** Meta App ID */
  appId: string | null;
  /** Whether app secret is configured */
  hasAppSecret: boolean;
  /** Whether configuration is complete */
  isConfigured: boolean;
}

// =============================================================================
// WEBHOOK CONFIGURATION
// =============================================================================

/**
 * Webhook information and statistics.
 */
export interface WebhookInfo {
  /** Full webhook URL */
  webhookUrl: string;
  /** Webhook verification token */
  webhookToken: string;
  /** Webhook event statistics */
  stats: WebhookStats | null;
}

/**
 * Webhook event statistics.
 */
export interface WebhookStats {
  /** ISO timestamp of last event */
  lastEventAt: string | null;
  /** Messages delivered today */
  todayDelivered: number;
  /** Messages read today */
  todayRead: number;
  /** Failed events today */
  todayFailed: number;
}

/**
 * Meta webhook subscription status.
 */
export interface WebhookSubscriptionStatus {
  /** Whether subscription check succeeded */
  ok: boolean;
  /** WABA ID */
  wabaId?: string;
  /** Whether 'messages' field is subscribed */
  messagesSubscribed?: boolean;
  /** List of subscribed webhook fields */
  subscribedFields?: string[];
  /** Apps subscribed to this WABA */
  apps?: WebhookSubscribedApp[];
  /** Error message if check failed */
  error?: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * App subscribed to WABA webhooks.
 */
export interface WebhookSubscribedApp {
  /** App ID */
  id?: string;
  /** App name */
  name?: string;
  /** Fields this app is subscribed to */
  subscribed_fields?: string[];
}

// =============================================================================
// PHONE NUMBER CONFIGURATION
// =============================================================================

/**
 * Phone number from Meta API.
 */
export interface PhoneNumber {
  /** Phone Number ID */
  id: string;
  /** Display phone number */
  display_phone_number: string;
  /** Verified business name */
  verified_name?: string;
  /** Quality rating */
  quality_rating?: string;
  /** Webhook override configuration */
  webhook_configuration?: PhoneNumberWebhookConfig;
}

/**
 * Phone number webhook configuration.
 */
export interface PhoneNumberWebhookConfig {
  /** Phone number */
  phone_number?: string;
  /** Associated WABA */
  whatsapp_business_account?: string;
  /** Associated application */
  application?: string;
}

/**
 * Domain option for webhook URL selection.
 */
export interface DomainOption {
  /** Full URL */
  url: string;
  /** Source of the domain (env, vercel, etc.) */
  source: string;
  /** Whether this is the recommended option */
  recommended: boolean;
}

// =============================================================================
// SYSTEM HEALTH
// =============================================================================

/**
 * Overall system health status.
 */
export interface HealthStatus {
  /** Overall health state */
  overall: 'healthy' | 'degraded' | 'unhealthy';
  /** Individual service statuses */
  services: HealthServices;
  /** Vercel project info for dynamic linking */
  vercel?: VercelInfo;
  /** ISO timestamp when health was checked */
  timestamp: string;
}

/**
 * Webhook health status.
 */
export interface WebhookHealth {
  /** Service status */
  status: 'ok' | 'error' | 'not_configured';
  /** ISO timestamp of last event received */
  lastEventAt?: string | null;
  /** Status message */
  message?: string;
}

/**
 * Health status of individual services.
 */
export interface HealthServices {
  /** Database service health */
  database: DatabaseHealth;
  /** WhatsApp API service health */
  whatsapp: WhatsAppHealth;
  /** Webhook service health */
  webhook?: WebhookHealth;
}

/**
 * Database health status.
 */
export interface DatabaseHealth {
  /** Connection status */
  status: 'ok' | 'error' | 'not_configured';
  /** Database provider */
  provider?: 'supabase' | 'none';
  /** Connection latency in milliseconds */
  latency?: number;
  /** Status message */
  message?: string;
}

/**
 * WhatsApp API health status.
 */
export interface WhatsAppHealth {
  /** Service status */
  status: 'ok' | 'error' | 'not_configured';
  /** Source of credentials */
  source?: 'db' | 'env' | 'none';
  /** Configured phone number */
  phoneNumber?: string;
  /** Status message */
  message?: string;
}

/**
 * Vercel project information.
 */
export interface VercelInfo {
  /** Dashboard URL */
  dashboardUrl: string | null;
  /** Edge Config stores URL */
  storesUrl: string | null;
  /** Environment name */
  env: string;
}

// =============================================================================
// SETUP WIZARD
// =============================================================================

/**
 * Setup wizard step configuration.
 */
export interface SetupStep {
  /** Step identifier */
  id: string;
  /** Step title */
  title: string;
  /** Step description */
  description: string;
  /** Current status */
  status: 'pending' | 'configured' | 'error';
  /** Icon component */
  icon: ReactNode;
  /** Action button label */
  actionLabel?: string;
  /** Action URL */
  actionUrl?: string;
  /** Error message if in error state */
  errorMessage?: string;
  /** Whether this step is required */
  isRequired: boolean;
}

// =============================================================================
// WHATSAPP THROTTLE
// =============================================================================

/**
 * WhatsApp adaptive throttle configuration.
 */
export interface WhatsAppThrottleConfig {
  /** Whether throttling is enabled */
  enabled: boolean;
  /** Number of concurrent sends */
  sendConcurrency: number;
  /** Batch size for processing */
  batchSize: number;
  /** Starting messages per second */
  startMps: number;
  /** Maximum messages per second */
  maxMps: number;
  /** Minimum messages per second */
  minMps: number;
  /** Cooldown period in seconds */
  cooldownSec: number;
  /** Minimum gap between increases in seconds */
  minIncreaseGapSec: number;
  /** Minimum delay between sends in milliseconds */
  sendFloorDelayMs: number;
}

// =============================================================================
// AUTO-SUPPRESSION
// =============================================================================

/**
 * Auto-suppression configuration for quality protection.
 */
export interface AutoSuppressionConfig {
  /** Whether auto-suppression is enabled */
  enabled: boolean;
  /** Threshold for triggering suppression */
  threshold: number;
  /** Time window for threshold calculation */
  windowHours: number;
  /** Duration of suppression */
  suppressionDays: number;
}

// =============================================================================
// UI COMPONENTS
// =============================================================================

/**
 * Props for stat card component.
 */
export interface StatCardProps {
  /** Card title */
  title: string;
  /** Main value to display */
  value: string;
  /** Trend indicator text */
  trend?: string;
  /** Whether trend is positive */
  trendUp?: boolean;
  /** Icon component */
  icon: ReactNode;
}

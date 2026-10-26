/**
 * Centralized constants for the application.
 * Avoids magic numbers scattered across the codebase.
 */

// ============================================================================
// PAGINATION
// ============================================================================

export const PAGINATION = {
  /** Items per page for campaigns list */
  campaigns: 20,
  /** Items per page for contacts list */
  contacts: 10,
  /** Items per page for messages in campaign details */
  messages: 100,
  /** Items per page for templates list */
  templates: 50,
  /** Items per page for flows/miniapps list */
  flows: 20,
  /** Items per page for lead forms submissions */
  leadForms: 20,
} as const

// ============================================================================
// POLLING INTERVALS
// ============================================================================

export const POLLING = {
  /** Backup polling interval when Realtime is connected (60s) */
  backup: 60 * 1000,
  /** Fallback polling when Realtime is disconnected (10s) */
  disconnected: 10 * 1000,
  /** Polling interval for large campaigns >= 10k recipients (60s) */
  largeCampaign: 60 * 1000,
  /** Window after completion to keep polling (5 minutes) */
  postCompletion: 5 * 60 * 1000,
} as const

// ============================================================================
// CACHE / STALE TIME
// ============================================================================

export const CACHE = {
  /** Stale time for campaigns data (15s) */
  campaigns: 15 * 1000,
  /** Stale time for contacts data (30s) */
  contacts: 30 * 1000,
  /** Stale time for templates (10 min - rarely change) */
  templates: 10 * 60 * 1000,
  /** Stale time for account limits (1 hour) */
  accountLimits: 60 * 60 * 1000,
  /** Stale time for stats (1 minute) */
  stats: 60 * 1000,
  /** Stale time for custom fields (10 min - rarely change) */
  customFields: 10 * 60 * 1000,
  /** Stale time for inbox labels (5 min - rarely change) */
  labels: 5 * 60 * 1000,
  /** Stale time for quick replies (5 min - rarely change) */
  quickReplies: 5 * 60 * 1000,
  /** Stale time for inbox conversations (30s - user-facing list) */
  inbox: 30 * 1000,
  /** Stale time for settings (1 minute) */
  settings: 60 * 1000,
} as const

// ============================================================================
// REALTIME / DEBOUNCE
// ============================================================================

export const REALTIME = {
  /** Debounce time for small campaigns < 1k recipients (250ms) */
  debounceSmall: 250,
  /** Debounce time for medium campaigns 1k-10k recipients (500ms) */
  debounceMedium: 500,
  /** Debounce time for large campaigns > 10k recipients (1000ms) */
  debounceLarge: 1000,
  /** Default debounce for realtime updates (200ms) */
  debounceDefault: 200,
  /** Post-completion window for realtime (5 minutes) */
  postCompletionWindow: 5 * 60 * 1000,
} as const

// ============================================================================
// CAMPAIGN THRESHOLDS
// ============================================================================

export const CAMPAIGN_THRESHOLDS = {
  /** Threshold for considering a campaign "large" */
  large: 10_000,
  /** Threshold for considering a campaign "medium" */
  medium: 1_000,
  /** Maximum recipients per campaign (Meta limit varies by tier) */
  maxDefault: 1_000,
} as const

// ============================================================================
// TIMEOUTS
// ============================================================================

export const TIMEOUTS = {
  /** Default fetch timeout (30s) */
  fetch: 30 * 1000,
  /** Long operation timeout (2 minutes) */
  longOperation: 2 * 60 * 1000,
  /** Meta API timeout (60s) */
  metaApi: 60 * 1000,
} as const

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const UI = {
  /** Toast duration in milliseconds */
  toastDuration: 5000,
  /** Animation duration for modals (ms) */
  modalAnimation: 200,
  /** Sidebar width (px) */
  sidebarWidth: 280,
  /** Sidebar collapsed width (px) */
  sidebarCollapsedWidth: 64,
} as const

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get appropriate debounce time based on recipient count.
 */
export function getDebounceForRecipients(recipients: number): number {
  if (recipients < CAMPAIGN_THRESHOLDS.medium) return REALTIME.debounceSmall
  if (recipients < CAMPAIGN_THRESHOLDS.large) return REALTIME.debounceMedium
  return REALTIME.debounceLarge
}

/**
 * Get appropriate polling interval based on connection status and campaign size.
 */
export function getPollingInterval(
  isConnected: boolean,
  isLarge: boolean
): number {
  if (isLarge) return POLLING.largeCampaign
  return isConnected ? POLLING.backup : POLLING.disconnected
}

/**
 * Check if a campaign is considered "large".
 */
export function isLargeCampaign(recipients: number): boolean {
  return recipients >= CAMPAIGN_THRESHOLDS.large
}

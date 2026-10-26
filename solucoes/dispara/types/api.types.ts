/**
 * API Domain Types
 *
 * Common types for API interactions, including pagination,
 * error handling, and response formats.
 */

// =============================================================================
// PAGINATION
// =============================================================================

/**
 * Standard pagination parameters for list endpoints.
 */
export interface PaginationParams {
  /** Maximum number of items to return */
  limit: number;
  /** Number of items to skip */
  offset: number;
}

/**
 * Pagination metadata in responses.
 */
export interface PaginationMeta {
  /** Limit used in query */
  limit: number;
  /** Offset used in query */
  offset: number;
  /** Total number of items matching filters */
  total: number;
  /** Whether there are more items */
  hasMore: boolean;
}

/**
 * Generic paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  /** Array of items for current page */
  data: T[];
  /** Total number of items */
  total: number;
  /** Limit used in query */
  limit: number;
  /** Offset used in query */
  offset: number;
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * Standard API error response.
 */
export interface ApiError {
  /** Error message */
  error: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Additional error details */
  details?: unknown;
  /** HTTP status code */
  status?: number;
}

/**
 * Validation error with field-level details.
 */
export interface ValidationError extends ApiError {
  /** Field-level validation errors */
  fieldErrors?: Record<string, string[]>;
}

/**
 * Meta API error format.
 */
export interface MetaApiError {
  /** Meta error message */
  message: string;
  /** Meta error type */
  type: string;
  /** Meta error code */
  code: number;
  /** Meta error subcode */
  error_subcode?: number;
  /** Debug trace ID */
  fbtrace_id?: string;
}

// =============================================================================
// SUCCESS RESPONSES
// =============================================================================

/**
 * Generic success response.
 */
export interface SuccessResponse {
  /** Whether operation succeeded */
  ok: true;
  /** Optional message */
  message?: string;
}

/**
 * Success response with created entity.
 */
export interface CreateResponse<T> {
  /** Whether operation succeeded */
  ok: true;
  /** Created entity */
  data: T;
}

/**
 * Success response with count.
 */
export interface CountResponse {
  /** Whether operation succeeded */
  ok: true;
  /** Number of affected items */
  count: number;
}

/**
 * Bulk operation result.
 */
export interface BulkOperationResult<T = string> {
  /** Total items processed */
  total: number;
  /** Successfully processed items */
  success: T[];
  /** Number of successful operations */
  created?: number;
  /** Number of deleted operations */
  deleted?: number;
  /** Number of failed operations */
  failed: number;
  /** Errors for failed items */
  errors: Array<{ item: T; error: string }>;
}

// =============================================================================
// REQUEST TYPES
// =============================================================================

/**
 * Base filter parameters for list endpoints.
 */
export interface BaseFilterParams extends PaginationParams {
  /** Search term */
  search?: string;
}

/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort parameters.
 */
export interface SortParams {
  /** Field to sort by */
  sortBy?: string;
  /** Sort direction */
  sortDirection?: SortDirection;
}

// =============================================================================
// REALTIME TYPES
// =============================================================================

/**
 * Tables that have Realtime enabled.
 */
export type RealtimeTable =
  | 'campaigns'
  | 'campaign_contacts'
  | 'contacts'
  | 'custom_field_definitions'
  | 'account_alerts'
  | 'template_projects'
  | 'template_project_items';

/**
 * Event types for Realtime subscriptions.
 */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * Payload received from Supabase Realtime.
 */
export interface RealtimePayload<T = Record<string, unknown>> {
  /** Schema name */
  schema: 'public';
  /** Table name */
  table: RealtimeTable;
  /** Commit timestamp */
  commit_timestamp: string;
  /** Event type */
  eventType: RealtimeEventType;
  /** New row data for INSERT/UPDATE */
  new: T | null;
  /** Old row data for UPDATE/DELETE */
  old: T | null;
  /** Any errors */
  errors: string[] | null;
}

/**
 * Channel connection status.
 */
export type ChannelStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

/**
 * Subscription configuration.
 */
export interface RealtimeSubscriptionConfig {
  /** Table to subscribe to */
  table: RealtimeTable;
  /** Event type filter */
  event?: RealtimeEventType;
  /** Row filter (e.g., 'id=eq.123') */
  filter?: string;
}

/**
 * Realtime connection state.
 */
export interface RealtimeState {
  /** Whether connected */
  isConnected: boolean;
  /** Current channel status */
  status: ChannelStatus | null;
  /** Error message if any */
  error?: string;
}

// =============================================================================
// TELEMETRY TYPES
// =============================================================================

/**
 * Broadcast latency telemetry.
 */
export interface RealtimeLatencyTelemetryBroadcast {
  /** Trace ID */
  traceId: string;
  /** Sequence number */
  seq: number;
  /** Server timestamp */
  serverTs: number;
  /** Client received timestamp */
  receivedAt: number;
  /** UI painted timestamp */
  paintedAt: number;
  /** Server to client latency */
  serverToClientMs: number;
  /** Handler to paint latency */
  handlerToPaintMs: number;
  /** Total server to paint latency */
  serverToPaintMs: number;
}

/**
 * Database change latency telemetry.
 */
export interface RealtimeLatencyTelemetryDbChange {
  /** Table name */
  table: string;
  /** Event type */
  eventType: string;
  /** Commit timestamp string */
  commitTimestamp: string;
  /** Commit timestamp number */
  commitTs: number;
  /** Client received timestamp */
  receivedAt: number;
  /** UI painted timestamp */
  paintedAt: number;
  /** Commit to client latency */
  commitToClientMs: number;
  /** Handler to paint latency */
  handlerToPaintMs: number;
  /** Total commit to paint latency */
  commitToPaintMs: number;
}

/**
 * Refetch telemetry.
 */
export interface RealtimeLatencyTelemetryRefetch {
  /** Start timestamp */
  startedAt: number;
  /** Finish timestamp */
  finishedAt?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Reason for refetch */
  reason: 'debounced_refetch';
}

/**
 * Combined latency telemetry.
 */
export interface RealtimeLatencyTelemetry {
  /** Broadcast telemetry */
  broadcast?: RealtimeLatencyTelemetryBroadcast;
  /** DB change telemetry */
  dbChange?: RealtimeLatencyTelemetryDbChange;
  /** Refetch telemetry */
  refetch?: RealtimeLatencyTelemetryRefetch;
}

// =============================================================================
// SERVICE RESPONSE TYPES
// =============================================================================

/**
 * Dashboard statistics.
 */
export interface DashboardStats {
  /** Messages sent in last 24 hours */
  sent24h: string;
  /** Delivery rate percentage */
  deliveryRate: string;
  /** Number of active campaigns */
  activeCampaigns: string;
  /** Number of failed messages */
  failedMessages: string;
  /** Chart data points */
  chartData: ChartDataPoint[];
}

/**
 * Data point for dashboard chart.
 */
export interface ChartDataPoint {
  /** Label (date) */
  name: string;
  /** Messages sent */
  sent: number;
  /** Messages read */
  read: number;
  /** Messages delivered */
  delivered: number;
  /** Messages failed */
  failed: number;
  /** Active campaigns */
  active: number;
}

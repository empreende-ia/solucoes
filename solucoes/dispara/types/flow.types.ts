/**
 * Flow Domain Types
 *
 * Types related to WhatsApp Flows (MiniApps) and flow submissions.
 * WhatsApp Flows are interactive forms that can be sent in messages.
 */

// =============================================================================
// CORE INTERFACES
// =============================================================================

/**
 * Represents a WhatsApp Flow (MiniApp).
 */
export interface FlowRow {
  /** Unique identifier */
  id: string;
  /** Display name of the flow */
  name: string;
  /** Current status */
  status: string;
  /** Meta Flow ID after publishing */
  meta_flow_id: string | null;
  /** Status from Meta API */
  meta_status?: string | null;
  /** Preview URL from Meta */
  meta_preview_url?: string | null;
  /** Validation errors from Meta */
  meta_validation_errors?: unknown;
  /** ISO timestamp when Meta status was last checked */
  meta_last_checked_at?: string | null;
  /** ISO timestamp when flow was published to Meta */
  meta_published_at?: string | null;
  /** Template key if created from template */
  template_key?: string | null;
  /** Raw flow JSON definition */
  flow_json?: unknown;
  /** Flow version identifier */
  flow_version?: string | null;
  /** Field mapping configuration */
  mapping?: unknown;
  /** Flow specification */
  spec: unknown;
  /** ISO timestamp when created */
  created_at: string;
  /** ISO timestamp when last updated */
  updated_at: string | null;
}

/**
 * Submission from a WhatsApp Flow.
 */
export interface FlowSubmissionRow {
  /** Unique identifier */
  id: string;
  /** WhatsApp message ID */
  message_id: string;
  /** Phone number of the submitter */
  from_phone: string;
  /** Associated contact ID if linked */
  contact_id: string | null;
  /** Flow ID this submission is for */
  flow_id: string | null;
  /** Flow name at time of submission */
  flow_name: string | null;
  /** Flow token for verification */
  flow_token: string | null;
  /** Associated campaign ID if applicable */
  campaign_id?: string | null;
  /** Raw JSON response as string */
  response_json_raw: string;
  /** Parsed JSON response */
  response_json: unknown | null;
  /** WABA ID */
  waba_id: string | null;
  /** Phone Number ID */
  phone_number_id: string | null;
  /** ISO timestamp of the message */
  message_timestamp: string | null;
  /** ISO timestamp when record was created */
  created_at: string;
}

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Query parameters for listing flow submissions.
 */
export interface FlowSubmissionsQuery {
  /** Filter by flow ID */
  flowId?: string;
  /** Filter by campaign ID */
  campaignId?: string;
  /** Filter by phone number */
  phone?: string;
  /** Maximum number of submissions to return */
  limit?: number;
}

/**
 * Input for creating a new flow.
 */
export interface CreateFlowInput {
  /** Flow display name */
  name: string;
}

/**
 * Input for creating a flow from a template.
 */
export interface CreateFlowFromTemplateInput {
  /** Flow display name */
  name: string;
  /** Template key to use */
  templateKey: string;
}

/**
 * Input for updating a flow.
 */
export interface UpdateFlowInput {
  /** New display name */
  name?: string;
  /** New status */
  status?: string;
  /** Meta Flow ID */
  metaFlowId?: string;
  /** Updated spec */
  spec?: unknown;
  /** Template key */
  templateKey?: string;
  /** Flow JSON */
  flowJson?: unknown;
  /** Field mapping */
  mapping?: unknown;
}

/**
 * Input for publishing a flow to Meta.
 */
export interface PublishFlowInput {
  /** Whether to publish immediately */
  publish?: boolean;
  /** Flow categories */
  categories?: string[];
  /** Whether to update if flow already exists */
  updateIfExists?: boolean;
}

// =============================================================================
// FLOW TEMPLATES
// =============================================================================

/**
 * Flow template for creating new flows.
 */
export interface FlowTemplate {
  /** Template key identifier */
  key: string;
  /** Display name */
  name: string;
  /** Template description */
  description: string;
  /** Preview image URL */
  previewUrl?: string;
  /** Template category */
  category: string;
  /** Base flow spec */
  spec: unknown;
  /** Default field mapping */
  defaultMapping?: unknown;
}

// =============================================================================
// FLOW BUILDER TYPES
// =============================================================================

/**
 * Flow screen definition.
 */
export interface FlowScreen {
  /** Screen identifier */
  id: string;
  /** Screen title */
  title: string;
  /** Components on this screen */
  components: FlowComponent[];
  /** Action to take on completion */
  onComplete?: FlowScreenAction;
}

/**
 * Component within a flow screen.
 */
export interface FlowComponent {
  /** Component type */
  type: FlowComponentType;
  /** Component identifier */
  id: string;
  /** Component label */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether component is required */
  required?: boolean;
  /** Options for select/radio components */
  options?: FlowComponentOption[];
  /** Additional properties */
  props?: Record<string, unknown>;
}

/**
 * Types of flow components.
 */
export type FlowComponentType =
  | 'text_input'
  | 'text_area'
  | 'date_picker'
  | 'time_picker'
  | 'dropdown'
  | 'radio_buttons'
  | 'checkbox'
  | 'image'
  | 'text_heading'
  | 'text_body'
  | 'text_caption'
  | 'footer';

/**
 * Option for select/radio components.
 */
export interface FlowComponentOption {
  /** Option value */
  value: string;
  /** Display label */
  label: string;
}

/**
 * Action to take when flow screen completes.
 */
export interface FlowScreenAction {
  /** Action type */
  type: 'navigate' | 'complete';
  /** Next screen ID for navigate */
  nextScreenId?: string;
  /** Payload for complete action */
  payload?: Record<string, unknown>;
}

// =============================================================================
// FLOW MAPPING
// =============================================================================

/**
 * Mapping configuration for flow fields.
 */
export interface FlowFieldMapping {
  /** Flow field name */
  flowField: string;
  /** Target entity field */
  targetField: string;
  /** Target entity type */
  targetEntity: 'contact' | 'custom_field';
  /** Transformation to apply */
  transform?: FlowFieldTransform;
}

/**
 * Transformation for flow field values.
 */
export interface FlowFieldTransform {
  /** Transform type */
  type: 'none' | 'lowercase' | 'uppercase' | 'trim' | 'phone_normalize';
  /** Additional transform options */
  options?: Record<string, unknown>;
}

/**
 * Contact Domain Types
 *
 * Types related to contacts management, including
 * contact status, filtering, import/export, and tags.
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Consent status of a contact for receiving messages.
 */
export enum ContactStatus {
  /** Contact has opted in to receive messages */
  OPT_IN = 'Opt-in',
  /** Contact has opted out from receiving messages */
  OPT_OUT = 'Opt-out',
  /** Contact consent status is unknown */
  UNKNOWN = 'Desconhecido',
}

// =============================================================================
// CORE INTERFACES
// =============================================================================

/**
 * Represents a contact in the system.
 */
export interface Contact {
  /** Unique identifier for the contact */
  id: string;
  /** Display name of the contact */
  name?: string;
  /** Phone number in E.164 format */
  phone: string;
  /** Email address (optional) */
  email?: string | null;
  /** Current consent status */
  status: ContactStatus;
  /** Tags for categorization */
  tags: string[];
  /** ISO timestamp of last activity */
  lastActive: string;
  /** ISO timestamp when contact was created */
  createdAt?: string;
  /** ISO timestamp when contact was last updated */
  updatedAt?: string;
  /** Custom field values keyed by field name */
  custom_fields?: Record<string, unknown>;
  /** Reason for suppression if contact is suppressed */
  suppressionReason?: string | null;
  /** Source that caused the suppression */
  suppressionSource?: string | null;
  /** ISO timestamp when suppression expires */
  suppressionExpiresAt?: string | null;
}

/**
 * Definition of a custom field for contacts.
 */
export interface CustomFieldDefinition {
  /** Unique identifier */
  id: string;
  /** Field key used in custom_fields object */
  key: string;
  /** Display label */
  label: string;
  /** Data type of the field */
  type: 'text' | 'number' | 'date' | 'select';
  /** Options for select type fields */
  options?: string[];
  /** Entity type this field applies to */
  entity_type: 'contact' | 'deal';
  /** ISO timestamp when field was created */
  created_at?: string;
}

// =============================================================================
// SERVICE TYPES
// =============================================================================

/**
 * Parameters for listing contacts with pagination and filters.
 */
export interface ContactListParams {
  /** Maximum number of contacts to return */
  limit: number;
  /** Number of contacts to skip */
  offset: number;
  /** Optional search term to filter by name or phone */
  search?: string;
  /** Optional status filter */
  status?: string;
  /** Optional tag filter */
  tag?: string;
}

/**
 * Paginated result from contact list endpoint.
 */
export interface ContactListResult {
  /** Array of contacts for current page */
  data: Contact[];
  /** Total number of contacts matching filters */
  total: number;
  /** Limit used in query */
  limit: number;
  /** Offset used in query */
  offset: number;
}

/**
 * Contact statistics summary.
 */
export interface ContactStats {
  /** Total number of contacts */
  total: number;
  /** Number of opted-in contacts */
  optIn: number;
  /** Number of opted-out contacts */
  optOut: number;
}

/**
 * Result from contact import operation.
 */
export interface ImportResult {
  /** Number of contacts successfully imported */
  imported: number;
  /** Number of contacts that failed to import */
  failed: number;
  /** Number of duplicate contacts found */
  duplicates: number;
  /** Human-readable import report */
  report: string;
}

/**
 * Result of phone number validation.
 */
export interface PhoneValidationResult {
  /** Whether the phone number is valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Normalized phone number if valid */
  normalized?: string;
}

// =============================================================================
// LEAD FORMS
// =============================================================================

/**
 * Lead capture form configuration.
 */
export interface LeadForm {
  /** Unique identifier */
  id: string;
  /** Display name of the form */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Tag to apply to captured contacts */
  tag: string;
  /** Whether the form is active */
  isActive: boolean;
  /** Whether to collect email addresses */
  collectEmail?: boolean;
  /** Custom success message after submission */
  successMessage?: string | null;
  /** Token for webhook authentication */
  webhookToken?: string | null;
  /** Custom fields to collect */
  fields?: LeadFormField[];
  /** ISO timestamp when form was created */
  createdAt?: string;
  /** ISO timestamp when form was last updated */
  updatedAt?: string | null;
}

/**
 * Type of lead form field.
 */
export type LeadFormFieldType = 'text' | 'number' | 'date' | 'select';

/**
 * Custom field definition for lead forms.
 */
export interface LeadFormField {
  /** Field key (maps to contact.custom_fields.key) */
  key: string;
  /** Display label for the field */
  label: string;
  /** Data type of the field */
  type: LeadFormFieldType;
  /** Whether the field is required */
  required?: boolean;
  /** Options for select type fields */
  options?: string[];
  /** Display order of the field */
  order?: number;
}

/**
 * Data transfer object for creating a lead form.
 */
export interface CreateLeadFormDTO {
  /** Display name of the form */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Tag to apply to captured contacts */
  tag: string;
  /** Whether the form is active */
  isActive?: boolean;
  /** Whether to collect email addresses */
  collectEmail?: boolean;
  /** Custom success message */
  successMessage?: string | null;
  /** Custom fields to collect */
  fields?: LeadFormField[];
}

/**
 * Data transfer object for updating a lead form.
 */
export interface UpdateLeadFormDTO extends Partial<CreateLeadFormDTO> {}

'use client';

import { Contact, ContactStatus, CustomFieldDefinition } from '../../../../types';

// Contact statistics for the dashboard cards
export interface ContactStatsData {
  total: number;
  optIn: number;
  optOut: number;
  unknown?: number;
}

// Contact data structure for import operations
export interface ImportContact {
  phone: string;
  name?: string;
  tags: string[];
  status: ContactStatus;
  custom_fields?: Record<string, any>;
}

// CSV preview data structure
export interface CsvPreviewData {
  headers: string[];
  rows: string[][];
}

// Column mapping configuration for CSV import
export interface ColumnMapping {
  name: string;
  phone: string;
  email: string;
  tags: string;
  defaultTag: string;
  custom_fields: Record<string, string>;
}

// Import result summary
export interface ImportResult {
  total: number;
  inserted: number;
  updated: number;
  errors: number;
}

// Form data for creating a new contact
export interface NewContactForm {
  name: string;
  phone: string;
  email: string;
  tags: string;
  custom_fields: Record<string, any>;
}

// Form data for editing an existing contact
export interface EditContactForm {
  name: string;
  phone: string;
  email: string;
  tags: string;
  status: ContactStatus;
  custom_fields: Record<string, any>;
}

// Delete target specification
export interface DeleteTarget {
  type: 'single' | 'bulk';
  id?: string;
}

// Status filter option
export interface StatusOption {
  value: ContactStatus | 'ALL' | 'SUPPRESSED';
  label: string;
}

// Re-export types from main types file for convenience
export type { Contact, CustomFieldDefinition };
export { ContactStatus };

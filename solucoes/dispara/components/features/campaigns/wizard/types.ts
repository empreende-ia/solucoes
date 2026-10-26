import type { Template, Contact, ContactStatus, TestContact, CustomFieldDefinition } from '@/types';
import type { CampaignValidation, AccountLimits } from '@/lib/meta-limits';
import type { MissingParamDetail } from '@/lib/whatsapp/template-contract';
import type { AudienceDraft } from '@/hooks/campaigns/useCampaignWizardUI';

export type QuickEditTarget = 
  | { type: 'name' } 
  | { type: 'email' } 
  | { type: 'custom_field'; key: string };

export type QuickEditFocus = 
  | QuickEditTarget 
  | { type: 'multi'; targets: QuickEditTarget[] } 
  | null;

export interface TemplateVariables {
  header: string[];
  body: string[];
  buttons?: Record<string, string>;
  headerLocation?: {
    latitude: string;
    longitude: string;
    name: string;
    address: string;
  };
}

export interface TemplateVariableInfo {
  body: { index: number; key: string; placeholder: string; context: string }[];
  header: { index: number; key: string; placeholder: string; context: string }[];
  buttons: { index: number; key: string; buttonIndex: number; buttonText: string; context: string }[];
  totalExtra: number;
}

export interface AudienceCriteria {
  status: 'OPT_IN' | 'OPT_OUT' | 'UNKNOWN' | 'ALL';
  includeTag?: string | null;
  createdWithinDays?: number | null;
  excludeOptOut?: boolean;
  noTags?: boolean;
  uf?: string | null;
  ddi?: string | null;
  customFieldKey?: string | null;
  customFieldMode?: 'exists' | 'equals' | null;
  customFieldValue?: string | null;
}

export interface AudienceStats {
  eligible: number;
  optInEligible: number;
  suppressed: number;
  topTagEligible: number;
  noTagsEligible: number;
  brUfCounts?: Array<{ uf: string; count: number }>;
  tagCountsEligible?: Array<{ tag: string; count: number }>;
  ddiCountsEligible?: Array<{ ddi: string; count: number }>;
  customFieldCountsEligible?: Array<{ key: string; count: number }>;
}

export interface PrecheckResult {
  templateName: string;
  totals: { total: number; valid: number; skipped: number };
  results: Array<
    | { ok: true; contactId?: string; name: string; phone: string; normalizedPhone: string }
    | { ok: false; contactId?: string; name: string; phone: string; normalizedPhone?: string; skipCode: string; reason: string; missing?: MissingParamDetail[] }
  >;
}

export interface PricingInfo {
  totalBRLFormatted: string;
  pricePerMessageBRLFormatted: string;
}

export interface MissingSummaryItem {
  where: MissingParamDetail['where'];
  key: string;
  buttonIndex?: number;
  count: number;
  rawSamples: Set<string>;
}

export interface BatchFixCandidate {
  contactId: string;
  focus: QuickEditFocus;
}

export type AudiencePreset = 'opt_in' | 'new_7d' | 'tag_top' | 'no_tags' | 'manual' | 'all' | 'test';

export type RecipientSource = 'all' | 'specific' | 'test' | null;

export type ScheduleMode = 'now' | 'scheduled';

export type TemplateCategoryFilter = 'all' | 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface WizardStep {
  number: number;
  title: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { number: 1, title: 'Configuração & Template' },
  { number: 2, title: 'Público' },
  { number: 3, title: 'Revisão & Lançamento' },
];

// Re-export types that are used throughout the wizard
export type {
  Template,
  Contact,
  ContactStatus,
  TestContact,
  CustomFieldDefinition,
  CampaignValidation,
  AccountLimits,
  MissingParamDetail,
  AudienceDraft,
};

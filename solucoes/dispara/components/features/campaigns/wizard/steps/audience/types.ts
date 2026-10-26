import { Contact, ContactStatus, TestContact, Template, CustomFieldDefinition } from '@/types';
import { AudienceDraft } from '@/hooks/campaigns/useCampaignWizardUI';
import { CampaignValidation } from '@/lib/meta-limits';

// Types for audience criteria
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

export type AudiencePreset =
  | 'opt_in'
  | 'new_7d'
  | 'tag_top'
  | 'no_tags'
  | 'manual'
  | 'all'
  | 'test'
  | null;

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

export interface StepAudienceSelectionProps {
  // Recipient source state
  recipientSource: 'all' | 'specific' | 'test' | null;
  setRecipientSource: (source: 'all' | 'specific' | 'test' | null) => void;

  // Contact data
  totalContacts: number;
  recipientCount: number;
  allContacts: Contact[];
  filteredContacts: Contact[];
  selectedContacts: Contact[];
  selectedContactIds: string[];

  // Contact search
  contactSearchTerm: string;
  setContactSearchTerm: (term: string) => void;

  // Contact selection
  toggleContact: (contactId: string) => void;

  // Test contact
  testContact?: TestContact;

  // Template & pricing
  selectedTemplate?: Template;
  exchangeRate?: number | null;

  // Audience mode (Jobs/Ive)
  isJobsAudienceMode: boolean;
  audiencePreset?: AudiencePreset;
  audienceCriteria?: AudienceCriteria;
  audienceStats?: AudienceStats;
  topTag?: string | null;

  // Audience actions
  selectAudiencePreset?: (preset: NonNullable<AudiencePreset>) => void;
  applyAudienceCriteria?: (criteria: AudienceCriteria, preset?: NonNullable<AudiencePreset>) => void;

  // Limits
  currentLimit: number;
  isOverLimit?: boolean;

  // UI State from hook
  isAudienceRefineOpen: boolean;
  setIsAudienceRefineOpen: (open: boolean) => void;
  isSegmentsSheetOpen: boolean;
  setIsSegmentsSheetOpen: (open: boolean) => void;
  segmentTagDraft: string;
  setSegmentTagDraft: (value: string) => void;
  segmentDdiDraft: string;
  setSegmentDdiDraft: (value: string) => void;
  segmentCustomFieldKeyDraft: string;
  setSegmentCustomFieldKeyDraft: (value: string) => void;
  segmentCustomFieldModeDraft: 'exists' | 'equals';
  setSegmentCustomFieldModeDraft: (value: 'exists' | 'equals') => void;
  segmentCustomFieldValueDraft: string;
  setSegmentCustomFieldValueDraft: (value: string) => void;
  segmentOneContactDraft: string;
  setSegmentOneContactDraft: (value: string) => void;
  audienceDraft: AudienceDraft;
  setAudienceDraft: (value: AudienceDraft | ((prev: AudienceDraft) => AudienceDraft)) => void;

  // Custom fields
  customFields: CustomFieldDefinition[];

  // Live validation
  liveValidation?: CampaignValidation | null;

  // Upgrade modal
  setShowUpgradeModal: (open: boolean) => void;
}

// Props for subcomponents
export interface TestContactCardProps {
  testContact: TestContact;
  isSelected: boolean;
  onSelect: () => void;
  selectedTemplate?: Template;
  exchangeRate?: number | null;
}

export interface AudienceCardAllProps {
  eligibleContactsCount: number;
  currentLimit: number;
  isSelected: boolean;
  onSelect: () => void;
  selectedTemplate?: Template;
  exchangeRate?: number | null;
}

export interface AudienceCardSegmentsProps {
  isSelected: boolean;
  subtitle: string;
  recipientCount: number;
  onSelect: () => void;
  selectedTemplate?: Template;
  exchangeRate?: number | null;
}

export interface SegmentsSheetProps {
  audienceStats?: AudienceStats;
  audienceCriteria?: AudienceCriteria;
  customFields: CustomFieldDefinition[];
  allContacts: Contact[];
  recipientSource: 'all' | 'specific' | 'test' | null;
  
  // Drafts
  segmentTagDraft: string;
  setSegmentTagDraft: (value: string) => void;
  segmentDdiDraft: string;
  setSegmentDdiDraft: (value: string) => void;
  segmentCustomFieldKeyDraft: string;
  setSegmentCustomFieldKeyDraft: (value: string) => void;
  segmentCustomFieldModeDraft: 'exists' | 'equals';
  setSegmentCustomFieldModeDraft: (value: 'exists' | 'equals') => void;
  segmentCustomFieldValueDraft: string;
  setSegmentCustomFieldValueDraft: (value: string) => void;
  segmentOneContactDraft: string;
  setSegmentOneContactDraft: (value: string) => void;
  
  // Actions
  applyAudienceCriteria?: (criteria: AudienceCriteria, preset?: NonNullable<AudiencePreset>) => void;
  onClose: () => void;
  onOpenRefine: () => void;
  onPickOneContact: (contactId: string, prefillSearch?: string) => void;
}

export interface RefineSheetProps {
  audienceDraft: AudienceDraft;
  setAudienceDraft: (value: AudienceDraft | ((prev: AudienceDraft) => AudienceDraft)) => void;
  audienceCriteria?: AudienceCriteria;
  applyAudienceCriteria?: (criteria: AudienceCriteria, preset?: NonNullable<AudiencePreset>) => void;
  recipientSource: 'all' | 'specific' | 'test' | null;
  onClose: () => void;
  onOpenSegments: () => void;
}

export interface ContactSelectionListProps {
  contacts: Contact[];
  selectedContactIds: string[];
  toggleContact: (contactId: string) => void;
  contactSearchTerm: string;
  setContactSearchTerm: (term: string) => void;
  totalContacts: number;
  recipientCount: number;
  isAutoSelection: boolean;
  onSwitchToManual?: () => void;
}

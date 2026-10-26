import type { MissingParamDetail } from '@/lib/whatsapp/template-contract';
import type { QuickEditFocus } from '@/hooks/campaigns/useCampaignWizardUI';

// Types for pricing breakdown (can be full or fallback)
export interface PricingBreakdown {
  totalBRLFormatted: string;
  pricePerMessageBRLFormatted: string;
  // Optional fields (only present when template and rate available)
  category?: string;
  recipients?: number;
  pricePerMessageUSD?: number;
  pricePerMessageBRL?: number;
  totalUSD?: number;
  totalBRL?: number;
}

// Types for precheck result
export interface PrecheckResultItem {
  ok: boolean;
  contactId?: string;
  name: string;
  phone: string;
  normalizedPhone?: string;
  skipCode?: string;
  reason?: string;
  missing?: MissingParamDetail[];
}

export interface PrecheckResult {
  templateName: string;
  totals: { total: number; valid: number; skipped: number };
  results: PrecheckResultItem[];
}

// Types for missing summary
export interface MissingSummaryItem {
  where: MissingParamDetail['where'];
  key: string;
  buttonIndex?: number;
  count: number;
  rawSamples: Set<string>;
}

// Types for batch fix
export interface BatchFixCandidate {
  contactId: string;
  focus: QuickEditFocus;
}

// Types for fixed value dialog slot
export interface FixedValueDialogSlot {
  where: 'header' | 'body' | 'button';
  key: string;
  buttonIndex?: number;
}

// Template variables type
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

// Template variable info type
export interface TemplateVariableInfo {
  body: { index: number; key: string; placeholder: string; context: string }[];
  header: { index: number; key: string; placeholder: string; context: string }[];
  buttons: { index: number; key: string; buttonIndex: number; buttonText: string; context: string }[];
  totalExtra: number;
}

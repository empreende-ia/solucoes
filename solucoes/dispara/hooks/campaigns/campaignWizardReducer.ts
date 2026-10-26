import type { AudienceCriteria, AudiencePresetId } from '@/lib/business/audience';

// =============================================================================
// WIZARD STATE - Controls the campaign creation flow
// =============================================================================

export interface WizardState {
  step: number;
  name: string;
  selectedTemplateId: string;
  templateVariables: {
    header: string[];
    body: string[];
    buttons?: Record<string, string>;
    headerLocation?: {
      latitude: string;
      longitude: string;
      name: string;
      address: string;
    };
  };
}

export type WizardAction =
  | { type: 'SET_STEP'; payload: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_TEMPLATE'; payload: string }
  | { type: 'SET_TEMPLATE_VARIABLES'; payload: WizardState['templateVariables'] }
  | { type: 'RESET' };

export const initialWizardState: WizardState = {
  step: 1,
  name: '',
  selectedTemplateId: '',
  templateVariables: { header: [], body: [] },
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };
    case 'NEXT_STEP':
      return { ...state, step: Math.min(state.step + 1, 3) };
    case 'PREV_STEP':
      return { ...state, step: Math.max(state.step - 1, 1) };
    case 'SET_NAME':
      return { ...state, name: action.payload };
    case 'SET_TEMPLATE':
      return { ...state, selectedTemplateId: action.payload };
    case 'SET_TEMPLATE_VARIABLES':
      return { ...state, templateVariables: action.payload };
    case 'RESET':
      return initialWizardState;
    default:
      return state;
  }
}

// =============================================================================
// AUDIENCE STATE - Controls recipient selection
// =============================================================================

export interface AudienceState {
  recipientSource: 'all' | 'specific' | 'test' | null;
  selectedContactIds: string[];
  audiencePreset: AudiencePresetId | null;
  audienceCriteria: AudienceCriteria;
  contactSearchTerm: string;
}

export type AudienceAction =
  | { type: 'SET_SOURCE'; payload: AudienceState['recipientSource'] }
  | { type: 'SET_SELECTED_IDS'; payload: string[] }
  | { type: 'TOGGLE_CONTACT'; payload: string }
  | { type: 'SET_PRESET'; payload: AudiencePresetId | null }
  | { type: 'SET_CRITERIA'; payload: AudienceCriteria }
  | { type: 'SET_SEARCH'; payload: string }
  | {
      type: 'APPLY_PRESET';
      payload: {
        source: 'all' | 'specific' | 'test';
        preset: AudiencePresetId;
        criteria: AudienceCriteria;
        selectedIds: string[];
      };
    }
  | { type: 'RESET' };

export const initialAudienceState: AudienceState = {
  recipientSource: null,
  selectedContactIds: [],
  audiencePreset: null,
  audienceCriteria: {
    status: 'OPT_IN',
    includeTag: null,
    createdWithinDays: null,
    excludeOptOut: true,
    noTags: false,
    uf: null,
    ddi: null,
    customFieldKey: null,
    customFieldMode: null,
    customFieldValue: null,
  },
  contactSearchTerm: '',
};

export function audienceReducer(state: AudienceState, action: AudienceAction): AudienceState {
  switch (action.type) {
    case 'SET_SOURCE':
      return { ...state, recipientSource: action.payload };
    case 'SET_SELECTED_IDS':
      return { ...state, selectedContactIds: action.payload };
    case 'TOGGLE_CONTACT': {
      const id = action.payload;
      const ids = state.selectedContactIds;
      return {
        ...state,
        selectedContactIds: ids.includes(id)
          ? ids.filter((i) => i !== id)
          : [...ids, id],
      };
    }
    case 'SET_PRESET':
      return { ...state, audiencePreset: action.payload };
    case 'SET_CRITERIA':
      return { ...state, audienceCriteria: action.payload };
    case 'SET_SEARCH':
      return { ...state, contactSearchTerm: action.payload };
    case 'APPLY_PRESET':
      return {
        ...state,
        recipientSource: action.payload.source,
        audiencePreset: action.payload.preset,
        audienceCriteria: action.payload.criteria,
        selectedContactIds: action.payload.selectedIds,
      };
    case 'RESET':
      return initialAudienceState;
    default:
      return state;
  }
}

// =============================================================================
// SCHEDULING STATE - Controls campaign scheduling
// =============================================================================

export interface SchedulingState {
  scheduledAt: string | null;
  isScheduling: boolean;
}

export type SchedulingAction =
  | { type: 'SET_SCHEDULED_AT'; payload: string | null }
  | { type: 'SET_IS_SCHEDULING'; payload: boolean }
  | { type: 'RESET' };

export const initialSchedulingState: SchedulingState = {
  scheduledAt: null,
  isScheduling: false,
};

export function schedulingReducer(state: SchedulingState, action: SchedulingAction): SchedulingState {
  switch (action.type) {
    case 'SET_SCHEDULED_AT':
      return { ...state, scheduledAt: action.payload };
    case 'SET_IS_SCHEDULING':
      return { ...state, isScheduling: action.payload };
    case 'RESET':
      return initialSchedulingState;
    default:
      return state;
  }
}

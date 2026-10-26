import { useState, useRef, useCallback } from 'react';
import { CustomFieldDefinition, TestContact } from '../../types';

// Tipos para Quick Edit (compatível com CampaignWizardView)
export type QuickEditTarget =
  | { type: 'name' }
  | { type: 'email' }
  | { type: 'custom_field'; key: string };

export type QuickEditFocus =
  | QuickEditTarget
  | { type: 'multi'; targets: QuickEditTarget[] }
  | null;

// Tipos para Audience Draft
export interface AudienceDraft {
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

// Tipos para Fixed Value Dialog
interface FixedValueDialogSlot {
  where: 'header' | 'body' | 'button';
  key: string;
  buttonIndex?: number;
}

export interface CampaignWizardUIState {
  // Template selection
  templateSearch: string;
  hoveredTemplateId: string | null;
  templateCategoryFilter: 'ALL' | 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO';

  // Scheduling
  scheduleMode: 'now' | 'scheduled';
  scheduledDate: string;
  scheduledTime: string;

  // UI Modals/Sheets
  showUpgradeModal: boolean;
  isFieldsSheetOpen: boolean;
  isAudienceRefineOpen: boolean;
  isSegmentsSheetOpen: boolean;

  // Quick Edit
  quickEditContactId: string | null;
  quickEditFocus: QuickEditFocus;
  batchFixQueue: Array<{ contactId: string; focus: QuickEditFocus }>;
  batchFixIndex: number;

  // Segment Drafts
  segmentTagDraft: string;
  segmentDdiDraft: string;
  segmentCustomFieldKeyDraft: string;
  segmentCustomFieldModeDraft: 'exists' | 'equals';
  segmentCustomFieldValueDraft: string;
  segmentOneContactDraft: string;
  audienceDraft: AudienceDraft;

  // Fixed Value Dialog
  fixedValueDialogOpen: boolean;
  fixedValueDialogSlot: FixedValueDialogSlot | null;
  fixedValueDialogTitle: string;
  fixedValueDialogValue: string;

  // Data
  testContacts: TestContact[];
  customFields: CustomFieldDefinition[];
}

export interface CampaignWizardUIActions {
  // Template selection
  setTemplateSearch: (value: string) => void;
  setHoveredTemplateId: (value: string | null) => void;
  setTemplateCategoryFilter: (value: 'ALL' | 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO') => void;

  // Scheduling
  setScheduleMode: (value: 'now' | 'scheduled') => void;
  setScheduledDate: (value: string) => void;
  setScheduledTime: (value: string) => void;

  // UI Modals/Sheets
  setShowUpgradeModal: (value: boolean) => void;
  setIsFieldsSheetOpen: (value: boolean) => void;
  setIsAudienceRefineOpen: (value: boolean) => void;
  setIsSegmentsSheetOpen: (value: boolean) => void;

  // Quick Edit
  setQuickEditContactId: (value: string | null) => void;
  setQuickEditFocus: (value: QuickEditFocus) => void;
  setBatchFixQueue: (value: Array<{ contactId: string; focus: QuickEditFocus }>) => void;
  setBatchFixIndex: (value: number | ((prev: number) => number)) => void;
  resetBatchFix: () => void;

  // Segment Drafts
  setSegmentTagDraft: (value: string) => void;
  setSegmentDdiDraft: (value: string) => void;
  setSegmentCustomFieldKeyDraft: (value: string) => void;
  setSegmentCustomFieldModeDraft: (value: 'exists' | 'equals') => void;
  setSegmentCustomFieldValueDraft: (value: string) => void;
  setSegmentOneContactDraft: (value: string) => void;
  setAudienceDraft: (value: AudienceDraft | ((prev: AudienceDraft) => AudienceDraft)) => void;
  resetSegmentDrafts: () => void;

  // Fixed Value Dialog
  openFixedValueDialog: (slot: FixedValueDialogSlot, title: string, currentValue?: string) => void;
  closeFixedValueDialog: () => void;
  setFixedValueDialogValue: (value: string) => void;

  // Data
  setTestContacts: (value: TestContact[]) => void;
  setCustomFields: (value: CustomFieldDefinition[]) => void;
}

export interface UseCampaignWizardUIReturn {
  state: CampaignWizardUIState;
  actions: CampaignWizardUIActions;
  refs: {
    quickEditFocusRef: React.MutableRefObject<QuickEditFocus>;
    batchCloseReasonRef: React.MutableRefObject<'advance' | 'finish' | null>;
    batchNextRef: React.MutableRefObject<{ contactId: string; focus: QuickEditFocus } | null>;
  };
}

const DEFAULT_AUDIENCE_DRAFT: AudienceDraft = {
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
};

export function useCampaignWizardUI(
  initialAudienceDraft?: Partial<AudienceDraft>
): UseCampaignWizardUIReturn {
  // Template selection states
  const [templateSearch, setTemplateSearch] = useState('');
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<'ALL' | 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO'>('ALL');

  // Scheduling states
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // UI Modal/Sheet states
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isFieldsSheetOpen, setIsFieldsSheetOpen] = useState(false);
  const [isAudienceRefineOpen, setIsAudienceRefineOpen] = useState(false);
  const [isSegmentsSheetOpen, setIsSegmentsSheetOpen] = useState(false);

  // Quick Edit states
  const [quickEditContactId, setQuickEditContactId] = useState<string | null>(null);
  const [quickEditFocus, setQuickEditFocus] = useState<QuickEditFocus>(null);
  const quickEditFocusRef = useRef<QuickEditFocus>(null);
  const [batchFixQueue, setBatchFixQueue] = useState<Array<{ contactId: string; focus: QuickEditFocus }>>([]);
  const [batchFixIndex, setBatchFixIndex] = useState(0);
  const batchCloseReasonRef = useRef<'advance' | 'finish' | null>(null);
  const batchNextRef = useRef<{ contactId: string; focus: QuickEditFocus } | null>(null);

  // Segment Draft states
  const [segmentTagDraft, setSegmentTagDraft] = useState('');
  const [segmentDdiDraft, setSegmentDdiDraft] = useState('');
  const [segmentCustomFieldKeyDraft, setSegmentCustomFieldKeyDraft] = useState<string>('');
  const [segmentCustomFieldModeDraft, setSegmentCustomFieldModeDraft] = useState<'exists' | 'equals'>('exists');
  const [segmentCustomFieldValueDraft, setSegmentCustomFieldValueDraft] = useState('');
  const [segmentOneContactDraft, setSegmentOneContactDraft] = useState('');
  const [audienceDraft, setAudienceDraft] = useState<AudienceDraft>({
    ...DEFAULT_AUDIENCE_DRAFT,
    ...initialAudienceDraft,
  });

  // Fixed Value Dialog states
  const [fixedValueDialogOpen, setFixedValueDialogOpen] = useState(false);
  const [fixedValueDialogSlot, setFixedValueDialogSlot] = useState<FixedValueDialogSlot | null>(null);
  const [fixedValueDialogTitle, setFixedValueDialogTitle] = useState<string>('');
  const [fixedValueDialogValue, setFixedValueDialogValue] = useState<string>('');

  // Data states
  const [testContacts, setTestContacts] = useState<TestContact[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);

  // Safe setters that also update refs
  const setQuickEditFocusSafe = useCallback((focus: QuickEditFocus) => {
    quickEditFocusRef.current = focus;
    setQuickEditFocus(focus);
  }, []);

  // Helpers
  const resetBatchFix = useCallback(() => {
    setBatchFixQueue([]);
    setBatchFixIndex(0);
    batchNextRef.current = null;
    batchCloseReasonRef.current = null;
  }, []);

  const resetSegmentDrafts = useCallback(() => {
    setSegmentTagDraft('');
    setSegmentDdiDraft('');
    setSegmentCustomFieldKeyDraft('');
    setSegmentCustomFieldModeDraft('exists');
    setSegmentCustomFieldValueDraft('');
    setSegmentOneContactDraft('');
  }, []);

  const openFixedValueDialog = useCallback((slot: FixedValueDialogSlot, title: string, currentValue?: string) => {
    setFixedValueDialogSlot(slot);
    setFixedValueDialogTitle(title);
    setFixedValueDialogValue(currentValue || '');
    setFixedValueDialogOpen(true);
  }, []);

  const closeFixedValueDialog = useCallback(() => {
    setFixedValueDialogOpen(false);
    setFixedValueDialogSlot(null);
    setFixedValueDialogTitle('');
    setFixedValueDialogValue('');
  }, []);

  return {
    state: {
      // Template
      templateSearch,
      hoveredTemplateId,
      templateCategoryFilter,
      // Scheduling
      scheduleMode,
      scheduledDate,
      scheduledTime,
      // Modals/Sheets
      showUpgradeModal,
      isFieldsSheetOpen,
      isAudienceRefineOpen,
      isSegmentsSheetOpen,
      // Quick Edit
      quickEditContactId,
      quickEditFocus,
      batchFixQueue,
      batchFixIndex,
      // Segment Drafts
      segmentTagDraft,
      segmentDdiDraft,
      segmentCustomFieldKeyDraft,
      segmentCustomFieldModeDraft,
      segmentCustomFieldValueDraft,
      segmentOneContactDraft,
      audienceDraft,
      // Fixed Value Dialog
      fixedValueDialogOpen,
      fixedValueDialogSlot,
      fixedValueDialogTitle,
      fixedValueDialogValue,
      // Data
      testContacts,
      customFields,
    },
    actions: {
      // Template
      setTemplateSearch,
      setHoveredTemplateId,
      setTemplateCategoryFilter,
      // Scheduling
      setScheduleMode,
      setScheduledDate,
      setScheduledTime,
      // Modals/Sheets
      setShowUpgradeModal,
      setIsFieldsSheetOpen,
      setIsAudienceRefineOpen,
      setIsSegmentsSheetOpen,
      // Quick Edit
      setQuickEditContactId,
      setQuickEditFocus: setQuickEditFocusSafe,
      setBatchFixQueue,
      setBatchFixIndex,
      resetBatchFix,
      // Segment Drafts
      setSegmentTagDraft,
      setSegmentDdiDraft,
      setSegmentCustomFieldKeyDraft,
      setSegmentCustomFieldModeDraft,
      setSegmentCustomFieldValueDraft,
      setSegmentOneContactDraft,
      setAudienceDraft,
      resetSegmentDrafts,
      // Fixed Value Dialog
      openFixedValueDialog,
      closeFixedValueDialog,
      setFixedValueDialogValue,
      // Data
      setTestContacts,
      setCustomFields,
    },
    refs: {
      quickEditFocusRef,
      batchCloseReasonRef,
      batchNextRef,
    },
  };
}

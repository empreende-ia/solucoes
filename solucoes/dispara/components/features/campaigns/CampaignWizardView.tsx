import React, { useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// UI Components
import { CustomFieldsSheet } from '../contacts/CustomFieldsSheet';
import { Container } from '@/components/ui/container';
import { Skeleton } from '@/components/ui/skeleton';

// Wizard Components
import {
  CampaignBlockModal,
  UpgradeRoadmapModal,
  WizardStepper,
  WizardHeader,
  WizardNavigation,
  WizardPreviewPanel,
} from './wizard/components';

// Lazy-loaded wizard steps para reduzir bundle inicial
// Cada step só é carregado quando o usuário navega para ele
const StepTemplateConfig = dynamic(
  () => import('./wizard/steps/StepTemplateConfig').then(m => ({ default: m.StepTemplateConfig })),
  {
    loading: () => <StepSkeleton />,
    ssr: false,
  }
);

const StepAudienceSelection = dynamic(
  () => import('./wizard/steps/StepAudienceSelection').then(m => ({ default: m.StepAudienceSelection })),
  {
    loading: () => <StepSkeleton />,
    ssr: false,
  }
);

const StepReviewLaunch = dynamic(
  () => import('./wizard/steps/StepReviewLaunch').then(m => ({ default: m.StepReviewLaunch })),
  {
    loading: () => <StepSkeleton />,
    ssr: false,
  }
);

// Skeleton para loading state dos steps
function StepSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <div className="grid grid-cols-2 gap-4 pt-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

// Hooks
import { useCampaignWizardUI } from '@/hooks/campaigns/useCampaignWizardUI';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useWizardPrecheckLogic } from './wizard/hooks';

// Services
import { customFieldService } from '@/services/customFieldService';

// Utils
import { getPricingBreakdown } from '@/lib/whatsapp-pricing';

// Types
import type {
  Template,
  Contact,
  TestContact,
  CampaignValidation,
  AccountLimits,
  AudienceCriteria,
  AudienceStats,
  PrecheckResult,
  TemplateVariables,
  TemplateVariableInfo,
  AudiencePreset,
  RecipientSource,
} from './wizard/types';

// =============================================================================
// Props Interface
// =============================================================================

export interface CampaignWizardViewProps {
  step: number;
  setStep: (step: number) => void;
  name: string;
  setName: (name: string) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  recipientSource: RecipientSource;
  setRecipientSource: (source: RecipientSource) => void;
  totalContacts: number;
  recipientCount: number;
  allContacts: Contact[];
  filteredContacts: Contact[];
  contactSearchTerm: string;
  setContactSearchTerm: (term: string) => void;
  selectedContacts: Contact[];
  selectedContactIds: string[];
  toggleContact: (contactId: string) => void;
  audiencePreset?: AudiencePreset | null;
  audienceCriteria?: AudienceCriteria;
  topTag?: string | null;
  audienceStats?: AudienceStats;
  applyAudienceCriteria?: (criteria: AudienceCriteria, preset?: AudiencePreset) => void;
  selectAudiencePreset?: (preset: AudiencePreset) => void;
  availableTemplates: Template[];
  selectedTemplate?: Template;
  handleNext: () => void;
  handleBack: () => void;
  handlePrecheck: () => void | Promise<unknown>;
  precheckResult?: PrecheckResult | null;
  isPrechecking?: boolean;
  handleSend: (scheduledAt?: string) => void | Promise<void>;
  isCreating: boolean;
  testContact?: TestContact;
  isEnsuringTestContact?: boolean;
  templateVariables: TemplateVariables;
  setTemplateVariables: (vars: TemplateVariables) => void;
  templateVariableCount: number;
  templateVariableInfo?: TemplateVariableInfo;
  accountLimits?: AccountLimits | null;
  isBlockModalOpen: boolean;
  setIsBlockModalOpen: (open: boolean) => void;
  blockReason: CampaignValidation | null;
  liveValidation?: CampaignValidation | null;
  isOverLimit?: boolean;
  currentLimit?: number;
}

// =============================================================================
// Main Component
// =============================================================================

export const CampaignWizardView: React.FC<CampaignWizardViewProps> = (props) => {
  const {
    step, setStep, name, setName, selectedTemplateId, setSelectedTemplateId,
    recipientSource, setRecipientSource, totalContacts, recipientCount,
    allContacts, filteredContacts, contactSearchTerm, setContactSearchTerm,
    selectedContacts, selectedContactIds, toggleContact,
    audiencePreset, audienceCriteria, topTag, audienceStats,
    applyAudienceCriteria, selectAudiencePreset,
    availableTemplates, selectedTemplate,
    handleNext, handleBack, handlePrecheck, precheckResult, isPrechecking,
    handleSend, isCreating, testContact, isEnsuringTestContact,
    templateVariables, setTemplateVariables, templateVariableInfo,
    accountLimits, isBlockModalOpen, setIsBlockModalOpen, blockReason,
    liveValidation, isOverLimit = false, currentLimit = 250,
  } = props;

  const router = useRouter();

  // UI State Hook
  const { state: uiState, actions: uiActions, refs: uiRefs } = useCampaignWizardUI({
    status: audienceCriteria?.status ?? 'OPT_IN',
    includeTag: audienceCriteria?.includeTag ?? null,
    createdWithinDays: audienceCriteria?.createdWithinDays ?? null,
    excludeOptOut: audienceCriteria?.excludeOptOut ?? true,
    noTags: audienceCriteria?.noTags ?? false,
    uf: audienceCriteria?.uf ?? null,
    ddi: audienceCriteria?.ddi ?? null,
    customFieldKey: audienceCriteria?.customFieldKey ?? null,
    customFieldMode: audienceCriteria?.customFieldMode ?? null,
    customFieldValue: audienceCriteria?.customFieldValue ?? null,
  });

  const { rate: exchangeRate, hasRate } = useExchangeRate();

  // Pricing calculations
  const pricing = useMemo(() => {
    if (selectedTemplate && recipientCount > 0 && hasRate) {
      return getPricingBreakdown(selectedTemplate.category, recipientCount, 0, exchangeRate!);
    }
    return { totalBRLFormatted: 'R$ --', pricePerMessageBRLFormatted: 'R$ --' };
  }, [selectedTemplate, recipientCount, hasRate, exchangeRate]);

  const pricePerMessage = useMemo(() => {
    if (selectedTemplate && hasRate) {
      return getPricingBreakdown(selectedTemplate.category, 1, 0, exchangeRate!).pricePerMessageBRLFormatted;
    }
    return 'R$ --';
  }, [selectedTemplate, hasRate, exchangeRate]);

  // Custom field label map
  const customFieldLabelByKey = useMemo(() => {
    return Object.fromEntries(
      (uiState.customFields || []).map((f) => [f.key, f.label])
    ) as Record<string, string>;
  }, [uiState.customFields]);

  // Precheck logic
  const { missingSummary, batchFixCandidates, getFixedValueSuggestion, getFixedValueDialogTitle } = 
    useWizardPrecheckLogic({
      precheckResult,
      customFieldLabelByKey,
      templateVariables,
      templateVariableInfo,
      setTemplateVariables,
    });

  // Template preview
  const previewTemplate = useMemo(() => {
    if (uiState.hoveredTemplateId) {
      return availableTemplates.find(t => t.id === uiState.hoveredTemplateId);
    }
    return selectedTemplate;
  }, [uiState.hoveredTemplateId, selectedTemplate, availableTemplates]);

  // Effects
  useEffect(() => {
    if (!uiState.isAudienceRefineOpen) return;
    uiActions.setAudienceDraft({
      status: audienceCriteria?.status ?? 'OPT_IN',
      includeTag: audienceCriteria?.includeTag ?? null,
      createdWithinDays: audienceCriteria?.createdWithinDays ?? null,
      excludeOptOut: audienceCriteria?.excludeOptOut ?? true,
      noTags: audienceCriteria?.noTags ?? false,
      uf: audienceCriteria?.uf ?? null,
      ddi: audienceCriteria?.ddi ?? null,
      customFieldKey: audienceCriteria?.customFieldKey ?? null,
      customFieldMode: audienceCriteria?.customFieldMode ?? null,
      customFieldValue: audienceCriteria?.customFieldValue ?? null,
    });
  }, [uiState.isAudienceRefineOpen, audienceCriteria, uiActions]);

  useEffect(() => {
    if (recipientSource !== 'test') return;
    uiActions.setQuickEditContactId(null);
    uiActions.setQuickEditFocus(null);
    uiActions.setBatchFixQueue([]);
    uiActions.setBatchFixIndex(0);
    uiRefs.batchNextRef.current = null;
    uiRefs.batchCloseReasonRef.current = null;
  }, [recipientSource, uiActions, uiRefs]);

  useEffect(() => {
    customFieldService.getAll()
      .then(fields => uiActions.setCustomFields(fields))
      .catch(console.error);
  }, [uiState.isFieldsSheetOpen, uiActions]);

  // Handlers
  const handleGoBack = useCallback(() => {
    if (typeof window === 'undefined') {
      router.push('/campaigns');
      return;
    }
    const hasHistory = window.history.length > 1;
    const ref = document.referrer;
    let sameOrigin = false;
    try { sameOrigin = ref ? new URL(ref).origin === window.location.origin : false; } catch {}
    if (hasHistory && (sameOrigin || !ref)) router.back();
    else router.push('/campaigns');
  }, [router]);

  const startBatchFix = useCallback(() => {
    if (!batchFixCandidates.length) return;
    uiActions.setBatchFixQueue(batchFixCandidates);
    uiActions.setBatchFixIndex(0);
    uiActions.setQuickEditContactId(batchFixCandidates[0].contactId);
    uiActions.setQuickEditFocus(batchFixCandidates[0].focus);
  }, [batchFixCandidates, uiActions]);

  const openFixedValueDialogWithSuggestion = useCallback((
    slot: { where: 'header' | 'body' | 'button'; key: string; buttonIndex?: number }
  ) => {
    uiActions.openFixedValueDialog(slot, getFixedValueDialogTitle(slot.key), getFixedValueSuggestion(slot.key));
  }, [getFixedValueSuggestion, getFixedValueDialogTitle, uiActions]);

  const isJobsAudienceMode = typeof selectAudiencePreset === 'function' && typeof applyAudienceCriteria === 'function';

  return (
    <div className="h-full flex flex-col py-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between shrink-0 mb-8 gap-8">
        <WizardHeader
          step={step}
          selectedTemplate={selectedTemplate}
          recipientCount={recipientCount}
          pricing={pricing}
          pricePerMessage={pricePerMessage}
          onGoBack={handleGoBack}
        />
        <div className="hidden lg:block flex-1 max-w-2xl px-8">
          <WizardStepper currentStep={step} onStepClick={setStep} />
        </div>
        <div className="hidden md:block shrink-0 min-w-30" />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="flex flex-col min-h-0 lg:col-span-9">
          <Container variant="glass" padding="none" className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            {step === 1 && (
              <StepTemplateConfig
                name={name} setName={setName}
                selectedTemplateId={selectedTemplateId} setSelectedTemplateId={setSelectedTemplateId}
                availableTemplates={availableTemplates} selectedTemplate={selectedTemplate}
                templateVariableInfo={templateVariableInfo}
                templateVariables={templateVariables} setTemplateVariables={setTemplateVariables}
                templateCategoryFilter={uiState.templateCategoryFilter}
                setTemplateCategoryFilter={uiActions.setTemplateCategoryFilter}
                templateSearch={uiState.templateSearch} setTemplateSearch={uiActions.setTemplateSearch}
                hoveredTemplateId={uiState.hoveredTemplateId} setHoveredTemplateId={uiActions.setHoveredTemplateId}
                customFields={uiState.customFields} setIsFieldsSheetOpen={uiActions.setIsFieldsSheetOpen}
              />
            )}
            {step === 2 && (
              <StepAudienceSelection
                recipientSource={recipientSource} setRecipientSource={setRecipientSource}
                totalContacts={totalContacts} recipientCount={recipientCount}
                allContacts={allContacts} filteredContacts={filteredContacts}
                selectedContacts={selectedContacts} selectedContactIds={selectedContactIds}
                contactSearchTerm={contactSearchTerm} setContactSearchTerm={setContactSearchTerm}
                toggleContact={toggleContact} testContact={testContact}
                selectedTemplate={selectedTemplate} exchangeRate={exchangeRate}
                isJobsAudienceMode={isJobsAudienceMode}
                audiencePreset={audiencePreset} audienceCriteria={audienceCriteria}
                audienceStats={audienceStats} topTag={topTag}
                selectAudiencePreset={selectAudiencePreset} applyAudienceCriteria={applyAudienceCriteria}
                currentLimit={currentLimit} isOverLimit={isOverLimit}
                isAudienceRefineOpen={uiState.isAudienceRefineOpen}
                setIsAudienceRefineOpen={uiActions.setIsAudienceRefineOpen}
                isSegmentsSheetOpen={uiState.isSegmentsSheetOpen}
                setIsSegmentsSheetOpen={uiActions.setIsSegmentsSheetOpen}
                segmentTagDraft={uiState.segmentTagDraft} setSegmentTagDraft={uiActions.setSegmentTagDraft}
                segmentDdiDraft={uiState.segmentDdiDraft} setSegmentDdiDraft={uiActions.setSegmentDdiDraft}
                segmentCustomFieldKeyDraft={uiState.segmentCustomFieldKeyDraft}
                setSegmentCustomFieldKeyDraft={uiActions.setSegmentCustomFieldKeyDraft}
                segmentCustomFieldModeDraft={uiState.segmentCustomFieldModeDraft}
                setSegmentCustomFieldModeDraft={uiActions.setSegmentCustomFieldModeDraft}
                segmentCustomFieldValueDraft={uiState.segmentCustomFieldValueDraft}
                setSegmentCustomFieldValueDraft={uiActions.setSegmentCustomFieldValueDraft}
                segmentOneContactDraft={uiState.segmentOneContactDraft}
                setSegmentOneContactDraft={uiActions.setSegmentOneContactDraft}
                audienceDraft={uiState.audienceDraft} setAudienceDraft={uiActions.setAudienceDraft}
                customFields={uiState.customFields}
                liveValidation={liveValidation} setShowUpgradeModal={uiActions.setShowUpgradeModal}
              />
            )}
            {step === 3 && (
              <StepReviewLaunch
                pricing={pricing} recipientCount={recipientCount} recipientSource={recipientSource}
                selectedTemplate={selectedTemplate} selectedTemplateId={selectedTemplateId} name={name}
                testContact={testContact} isEnsuringTestContact={isEnsuringTestContact} setStep={setStep}
                scheduleMode={uiState.scheduleMode} scheduledDate={uiState.scheduledDate}
                scheduledTime={uiState.scheduledTime}
                setScheduleMode={uiActions.setScheduleMode} setScheduledDate={uiActions.setScheduledDate}
                setScheduledTime={uiActions.setScheduledTime}
                isOverLimit={isOverLimit} currentLimit={currentLimit}
                precheckResult={precheckResult} isPrechecking={isPrechecking} handlePrecheck={handlePrecheck}
                missingSummary={missingSummary} customFieldLabelByKey={customFieldLabelByKey}
                batchFixCandidates={batchFixCandidates} startBatchFix={startBatchFix}
                quickEditContactId={uiState.quickEditContactId}
                setQuickEditContactId={uiActions.setQuickEditContactId}
                setQuickEditFocusSafe={uiActions.setQuickEditFocus}
                quickEditFocus={uiState.quickEditFocus}
                batchFixQueue={uiState.batchFixQueue} batchFixIndex={uiState.batchFixIndex}
                setBatchFixQueue={uiActions.setBatchFixQueue} setBatchFixIndex={uiActions.setBatchFixIndex}
                batchNextRef={uiRefs.batchNextRef} batchCloseReasonRef={uiRefs.batchCloseReasonRef}
                templateVariables={templateVariables} setTemplateVariables={setTemplateVariables}
                templateVariableInfo={templateVariableInfo} customFields={uiState.customFields}
                fixedValueDialogOpen={uiState.fixedValueDialogOpen}
                fixedValueDialogSlot={uiState.fixedValueDialogSlot}
                fixedValueDialogTitle={uiState.fixedValueDialogTitle}
                fixedValueDialogValue={uiState.fixedValueDialogValue}
                openFixedValueDialogWithSuggestion={openFixedValueDialogWithSuggestion}
                closeFixedValueDialog={uiActions.closeFixedValueDialog}
                setFixedValueDialogValue={uiActions.setFixedValueDialogValue}
              />
            )}
            <WizardNavigation
              step={step} isOverLimit={isOverLimit} isCreating={isCreating}
              scheduleMode={uiState.scheduleMode} scheduledDate={uiState.scheduledDate}
              scheduledTime={uiState.scheduledTime}
              onBack={handleBack} onNext={handleNext} onSend={handleSend} variant="mobile"
            />
          </Container>
        </div>

        <WizardPreviewPanel
          step={step} isOverLimit={isOverLimit} previewTemplate={previewTemplate}
          selectedTemplateId={selectedTemplateId} templateVariables={templateVariables}
          recipientSource={recipientSource} testContact={testContact}
          selectedContacts={selectedContacts} allContacts={allContacts}
          isCreating={isCreating} scheduleMode={uiState.scheduleMode}
          scheduledDate={uiState.scheduledDate} scheduledTime={uiState.scheduledTime}
          onBack={handleBack} onNext={handleNext} onSend={handleSend}
        />
      </div>

      {/* Modals */}
      <CampaignBlockModal
        isOpen={isBlockModalOpen} onClose={() => setIsBlockModalOpen(false)}
        validation={blockReason} accountLimits={accountLimits}
      />
      <UpgradeRoadmapModal
        isOpen={uiState.showUpgradeModal} onClose={() => uiActions.setShowUpgradeModal(false)}
        accountLimits={accountLimits}
      />
      <CustomFieldsSheet
        open={uiState.isFieldsSheetOpen} onOpenChange={uiActions.setIsFieldsSheetOpen}
        entityType="contact"
      />
    </div>
  );
};

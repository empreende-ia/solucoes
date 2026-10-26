'use client';

import React from 'react';
import type { Template, TestContact, CustomFieldDefinition } from '@/types';
import type { QuickEditFocus } from '@/hooks/campaigns/useCampaignWizardUI';
import {
  PricingBreakdown,
  PrecheckResult,
  MissingSummaryItem,
  BatchFixCandidate,
  FixedValueDialogSlot,
  TemplateVariables,
  TemplateVariableInfo,
  createApplyQuickFill,
  SummaryCards,
  CampaignDetails,
  FinalCheckWarning,
  SchedulingOptions,
  FixedValueDialog,
  PrecheckSection,
  ContactQuickEditWrapper,
} from './review';
import { LimitWarning } from '@/components/ui/LimitWarning';

export interface StepReviewLaunchProps {
  pricing: PricingBreakdown;
  recipientCount: number;
  recipientSource: 'all' | 'specific' | 'test' | null;
  selectedTemplate?: Template;
  selectedTemplateId: string;
  name: string;
  testContact?: TestContact;
  isEnsuringTestContact?: boolean;
  setStep: (step: number) => void;
  scheduleMode: 'now' | 'scheduled';
  scheduledDate: string;
  scheduledTime: string;
  setScheduleMode: (mode: 'now' | 'scheduled') => void;
  setScheduledDate: (date: string) => void;
  setScheduledTime: (time: string) => void;
  isOverLimit?: boolean;
  currentLimit: number;
  precheckResult?: PrecheckResult | null;
  isPrechecking?: boolean;
  handlePrecheck: () => void | Promise<unknown>;
  missingSummary: MissingSummaryItem[];
  customFieldLabelByKey: Record<string, string>;
  batchFixCandidates: BatchFixCandidate[];
  startBatchFix: () => void;
  quickEditContactId: string | null;
  setQuickEditContactId: (id: string | null) => void;
  setQuickEditFocusSafe: (focus: QuickEditFocus) => void;
  quickEditFocus: QuickEditFocus;
  batchFixQueue: BatchFixCandidate[];
  batchFixIndex: number;
  setBatchFixQueue: (queue: BatchFixCandidate[]) => void;
  setBatchFixIndex: (index: number | ((prev: number) => number)) => void;
  batchNextRef: React.MutableRefObject<BatchFixCandidate | null>;
  batchCloseReasonRef: React.MutableRefObject<'advance' | 'finish' | null>;
  templateVariables: TemplateVariables;
  setTemplateVariables: (vars: TemplateVariables) => void;
  templateVariableInfo?: TemplateVariableInfo;
  customFields: CustomFieldDefinition[];
  fixedValueDialogOpen: boolean;
  fixedValueDialogSlot: FixedValueDialogSlot | null;
  fixedValueDialogTitle: string;
  fixedValueDialogValue: string;
  openFixedValueDialogWithSuggestion: (slot: FixedValueDialogSlot) => void;
  closeFixedValueDialog: () => void;
  setFixedValueDialogValue: (value: string) => void;
}

export function StepReviewLaunch(props: StepReviewLaunchProps) {
  const {
    pricing, recipientCount, recipientSource, selectedTemplate, selectedTemplateId,
    name, testContact, isEnsuringTestContact, setStep,
    scheduleMode, scheduledDate, scheduledTime, setScheduleMode, setScheduledDate, setScheduledTime,
    isOverLimit, currentLimit, precheckResult, isPrechecking, handlePrecheck,
    missingSummary, customFieldLabelByKey, batchFixCandidates, startBatchFix,
    quickEditContactId, setQuickEditContactId, setQuickEditFocusSafe, quickEditFocus,
    batchFixQueue, batchFixIndex, setBatchFixQueue, setBatchFixIndex,
    batchNextRef, batchCloseReasonRef,
    templateVariables, setTemplateVariables, templateVariableInfo,
    customFields,
    fixedValueDialogOpen, fixedValueDialogSlot, fixedValueDialogTitle, fixedValueDialogValue,
    openFixedValueDialogWithSuggestion, closeFixedValueDialog, setFixedValueDialogValue,
  } = props;

  const applyQuickFill = createApplyQuickFill(templateVariables, setTemplateVariables, templateVariableInfo);

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-auto p-6">
      <SummaryCards pricing={pricing} recipientCount={recipientCount} selectedTemplate={selectedTemplate} />

      <CampaignDetails
        name={name}
        selectedTemplateId={selectedTemplateId}
        recipientSource={recipientSource}
        recipientCount={recipientCount}
        testContact={testContact}
        setStep={setStep}
      />

      <FinalCheckWarning />

      <PrecheckSection
        recipientSource={recipientSource}
        isPrechecking={isPrechecking}
        isEnsuringTestContact={isEnsuringTestContact}
        precheckResult={precheckResult}
        handlePrecheck={handlePrecheck}
        missingSummary={missingSummary}
        customFieldLabelByKey={customFieldLabelByKey}
        customFields={customFields}
        batchFixCandidates={batchFixCandidates}
        startBatchFix={startBatchFix}
        quickEditContactId={quickEditContactId}
        setQuickEditContactId={setQuickEditContactId}
        setQuickEditFocusSafe={setQuickEditFocusSafe}
        setBatchFixQueue={setBatchFixQueue}
        setBatchFixIndex={setBatchFixIndex}
        batchNextRef={batchNextRef}
        batchCloseReasonRef={batchCloseReasonRef}
        onApplyQuickFill={applyQuickFill}
        onOpenFixedValueDialog={openFixedValueDialogWithSuggestion}
      />

      <ContactQuickEditWrapper
        quickEditContactId={quickEditContactId}
        quickEditFocus={quickEditFocus}
        setQuickEditContactId={setQuickEditContactId}
        setQuickEditFocusSafe={setQuickEditFocusSafe}
        batchFixQueue={batchFixQueue}
        batchFixIndex={batchFixIndex}
        setBatchFixQueue={setBatchFixQueue}
        setBatchFixIndex={setBatchFixIndex}
        batchNextRef={batchNextRef}
        batchCloseReasonRef={batchCloseReasonRef}
        handlePrecheck={handlePrecheck}
      />

      <FixedValueDialog
        open={fixedValueDialogOpen}
        slot={fixedValueDialogSlot}
        title={fixedValueDialogTitle}
        value={fixedValueDialogValue}
        onClose={closeFixedValueDialog}
        onValueChange={setFixedValueDialogValue}
        onApply={applyQuickFill}
      />

      <SchedulingOptions
        scheduleMode={scheduleMode}
        scheduledDate={scheduledDate}
        scheduledTime={scheduledTime}
        setScheduleMode={setScheduleMode}
        setScheduledDate={setScheduledDate}
        setScheduledTime={setScheduledTime}
      />

      {isOverLimit && (
        <LimitWarning
          recipientCount={recipientCount}
          currentLimit={currentLimit}
          variant="compact"
          onGoBack={() => setStep(2)}
        />
      )}
    </div>
  );
}

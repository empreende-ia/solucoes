import React from 'react';
import { Eye } from 'lucide-react';
import { WhatsAppPhonePreview } from '@/components/ui/WhatsAppPhonePreview';
import { WizardNavigation } from './WizardNavigation';
import type { 
  Template, 
  Contact, 
  TestContact,
  TemplateVariables,
  RecipientSource,
  ScheduleMode,
} from '../types';

interface WizardPreviewPanelProps {
  step: number;
  isOverLimit: boolean;
  previewTemplate?: Template;
  selectedTemplateId: string;
  templateVariables: TemplateVariables;
  recipientSource: RecipientSource;
  testContact?: TestContact;
  selectedContacts: Contact[];
  allContacts: Contact[];
  // Navigation props
  isCreating: boolean;
  scheduleMode: ScheduleMode;
  scheduledDate: string;
  scheduledTime: string;
  onBack: () => void;
  onNext: () => void;
  onSend: (scheduledAt?: string) => void;
}

export const WizardPreviewPanel: React.FC<WizardPreviewPanelProps> = ({
  step,
  isOverLimit,
  previewTemplate,
  selectedTemplateId,
  templateVariables,
  recipientSource,
  testContact,
  selectedContacts,
  allContacts,
  // Navigation props
  isCreating,
  scheduleMode,
  scheduledDate,
  scheduledTime,
  onBack,
  onNext,
  onSend,
}) => {
  // Resolve variables for preview
  const resolveVariables = (values: string[]) => {
    let contactName = '';
    let contactPhone = '';
    let contactEmail = '';
    let customFields: Record<string, unknown> = {};

    if (recipientSource === 'test' && testContact) {
      contactName = testContact.name || '';
      contactPhone = testContact.phone || '';
    } else if (recipientSource === 'specific' && selectedContacts.length > 0) {
      contactName = selectedContacts[0].name || '';
      contactPhone = selectedContacts[0].phone || '';
      contactEmail = selectedContacts[0].email || '';
      customFields = selectedContacts[0].custom_fields || {};
    } else if (recipientSource === 'all' && allContacts.length > 0) {
      contactName = allContacts[0].name || '';
      contactPhone = allContacts[0].phone || '';
      contactEmail = allContacts[0].email || '';
      customFields = allContacts[0].custom_fields || {};
    }

    return values.map(val => {
      if (val === '{{nome}}' || val === '{{contact.name}}' || val === '{{name}}') {
        return contactName || val;
      } else if (val === '{{telefone}}' || val === '{{contact.phone}}' || val === '{{phone}}') {
        return contactPhone || val;
      } else if (val === '{{email}}' || val === '{{contact.email}}') {
        return contactEmail || val;
      } else {
        // Check for custom field tokens
        const match = val.match(/^\{\{(\w+)\}\}$/);
        if (match && customFields[match[1]] !== undefined) {
          return String(customFields[match[1]]);
        }
      }
      return val;
    });
  };

  const bodyVariables = resolveVariables(templateVariables.body);
  const headerVariables = templateVariables.header.length > 0 
    ? resolveVariables(templateVariables.header) 
    : undefined;

  return (
    <div className="hidden lg:flex flex-col lg:col-span-3 bg-[var(--ds-bg-elevated)] rounded-2xl border border-[var(--ds-border-subtle)] p-4">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[var(--ds-text-secondary)] text-xs uppercase tracking-widest font-bold">
            <Eye size={14} /> Pré-visualização
          </div>
          {step === 2 && isOverLimit && (
            <span className="text-[var(--ds-status-error-text)] text-[10px]">(ajuste os contatos)</span>
          )}
        </div>

        {/* Phone Mockup - Universal Component */}
        <div className={`flex-1 min-h-0 flex items-center justify-center ${step === 2 && isOverLimit ? 'opacity-30 pointer-events-none' : ''}`}>
          <WhatsAppPhonePreview
            className="w-[320px] h-155 max-h-full"
            components={previewTemplate?.components}
            fallbackContent={previewTemplate?.content}
            headerMediaPreviewUrl={previewTemplate?.headerMediaPreviewUrl || null}
            variables={bodyVariables}
            headerVariables={headerVariables}
            showEmptyState={!selectedTemplateId}
            emptyStateMessage="Selecione um template ao lado para visualizar"
            size="adaptive"
          />
        </div>

        {/* Desktop Navigation */}
        <WizardNavigation
          step={step}
          isOverLimit={isOverLimit}
          isCreating={isCreating}
          scheduleMode={scheduleMode}
          scheduledDate={scheduledDate}
          scheduledTime={scheduledTime}
          onBack={onBack}
          onNext={onNext}
          onSend={onSend}
          variant="desktop"
        />
      </div>
    </div>
  );
};

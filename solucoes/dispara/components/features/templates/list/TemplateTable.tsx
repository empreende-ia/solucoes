'use client';

import React from 'react';
import { FileText, Check } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { Template } from '../../../../types';
import { TemplateTableRow } from './TemplateTableRow';
import { TemplateCardList } from './TemplateCard';
import { StatusFilterType } from './types';
import { useIsMobile } from '@/hooks/useMediaQuery';

export interface TemplateTableProps {
  templates: Template[];
  isLoading: boolean;
  statusFilter: StatusFilterType;
  // Manual draft detection
  manualDraftIds: Set<string>;
  manualDraftSendStateById?: Record<string, { canSend: boolean; reason?: string }>;
  // Selection state
  selectedManualDraftIds: Set<string>;
  selectedMetaTemplates: Set<string>;
  // Selection handlers
  onToggleManualDraft: (id: string) => void;
  onToggleMetaTemplate: (name: string) => void;
  // Draft actions
  submittingManualDraftId: string | null;
  deletingManualDraftId: string | null;
  submitManualDraft: (id: string) => void;
  deleteManualDraft: (id: string) => void;
  // Template actions
  onViewDetails: (template: Template) => void;
  onDeleteClick: (template: Template) => void;
  onCreateCampaign?: (template: Template) => void;
  onCloneTemplate?: (template: Template) => void;
  cloningTemplateName?: string | null;
  // Hover
  onHoverTemplate: (templateId: string | null) => void;
  onPrefetchPreview?: (template: Template) => void;
  // Header checkbox
  onToggleAllDrafts: () => void;
  onToggleAllMeta: () => void;
  isAllDraftsSelected: boolean;
  isAllMetaSelected: boolean;
  manualDraftCount: number;
  selectableMetaCount: number;
}

export const TemplateTable: React.FC<TemplateTableProps> = ({
  templates,
  isLoading,
  statusFilter,
  manualDraftIds,
  manualDraftSendStateById,
  selectedManualDraftIds,
  selectedMetaTemplates,
  onToggleManualDraft,
  onToggleMetaTemplate,
  submittingManualDraftId,
  deletingManualDraftId,
  submitManualDraft,
  deleteManualDraft,
  onViewDetails,
  onDeleteClick,
  onCreateCampaign,
  onCloneTemplate,
  cloningTemplateName,
  onHoverTemplate,
  onPrefetchPreview,
  onToggleAllDrafts,
  onToggleAllMeta,
  isAllDraftsSelected,
  isAllMetaSelected,
  manualDraftCount,
  selectableMetaCount,
}) => {
  const isMobile = useIsMobile();

  const isManualDraft = (t: Template) => manualDraftIds?.has(t.id);

  const canSendDraft = (t: Template) => {
    const state = manualDraftSendStateById?.[t.id];
    if (state) return state.canSend;
    return String(t.content || '').trim().length > 0;
  };

  const handleHeaderCheckbox = () => {
    if (statusFilter === 'DRAFT') {
      onToggleAllDrafts();
    } else {
      onToggleAllMeta();
    }
  };

  const isHeaderDisabled =
    statusFilter === 'DRAFT' ? manualDraftCount === 0 : selectableMetaCount === 0;

  const isHeaderChecked = statusFilter === 'DRAFT' ? isAllDraftsSelected : isAllMetaSelected;

  const hasItems = statusFilter === 'DRAFT' ? manualDraftCount > 0 : selectableMetaCount > 0;

  // Mobile: render cards instead of table
  if (isMobile) {
    return (
      <TemplateCardList
        templates={templates}
        isLoading={isLoading}
        manualDraftIds={manualDraftIds}
        manualDraftSendStateById={manualDraftSendStateById}
        selectedManualDraftIds={selectedManualDraftIds}
        selectedMetaTemplates={selectedMetaTemplates}
        onToggleManualDraft={onToggleManualDraft}
        onToggleMetaTemplate={onToggleMetaTemplate}
        submittingManualDraftId={submittingManualDraftId}
        deletingManualDraftId={deletingManualDraftId}
        submitManualDraft={submitManualDraft}
        deleteManualDraft={deleteManualDraft}
        onViewDetails={onViewDetails}
        onDeleteClick={onDeleteClick}
        onCreateCampaign={onCreateCampaign}
      />
    );
  }

  // Desktop: render table
  return (
    <Container variant="default" padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--ds-bg-surface)]/30 text-[var(--ds-text-muted)] uppercase tracking-widest text-[11px]">
            <tr>
              <th className="px-4 py-4 w-10">
                <button
                  onClick={handleHeaderCheckbox}
                  disabled={isHeaderDisabled}
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    isHeaderDisabled
                      ? 'border-[var(--ds-border-default)] opacity-40 cursor-not-allowed'
                      : isHeaderChecked
                        ? statusFilter === 'DRAFT'
                          ? 'bg-amber-500 border-amber-500'
                          : 'bg-primary-500 border-primary-500'
                        : 'border-[var(--ds-border-default)] hover:border-[var(--ds-border-strong)]'
                  }`}
                >
                  {isHeaderChecked && hasItems && (
                    <Check
                      className={`w-3 h-3 ${statusFilter === 'DRAFT' ? 'text-black' : 'text-[var(--ds-text-primary)]'}`}
                    />
                  )}
                </button>
              </th>
              <th className="px-4 py-4 font-medium w-44">Nome</th>
              <th className="px-2 py-4 font-medium w-20">Status</th>
              <th className="px-2 py-4 font-medium w-24">Categoria</th>
              <th className="px-3 py-4 font-medium">Conteudo</th>
              <th className="px-2 py-4 font-medium w-24">Atualizado</th>
              <th className="px-2 py-4 font-medium text-right w-32">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ds-border-default)]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-[var(--ds-text-secondary)]">
                  Carregando templates...
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center">
                  <div className="w-16 h-16 bg-[var(--ds-bg-elevated)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--ds-text-muted)]">
                    <FileText size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--ds-text-primary)] mb-1">Nenhum template encontrado</h3>
                  <p className="text-[var(--ds-text-muted)] text-sm">
                    Tente ajustar os filtros ou clique em sincronizar.
                  </p>
                </td>
              </tr>
            ) : (
              templates.map((template) => {
                const manual = isManualDraft(template);
                const isRowSelected = manual
                  ? selectedManualDraftIds.has(template.id)
                  : selectedMetaTemplates.has(template.name);

                return (
                  <TemplateTableRow
                    key={template.id}
                    template={template}
                    isManualDraft={manual}
                    isRowSelected={isRowSelected}
                    isSubmitting={submittingManualDraftId === template.id}
                    isDeletingDraft={deletingManualDraftId === template.id}
                    isCloning={cloningTemplateName === template.name}
                    canSend={canSendDraft(template)}
                    sendReason={manualDraftSendStateById?.[template.id]?.reason}
                    onToggleSelection={() =>
                      manual ? onToggleManualDraft(template.id) : onToggleMetaTemplate(template.name)
                    }
                    onViewDetails={() => onViewDetails(template)}
                    onDeleteClick={() => onDeleteClick(template)}
                    onSubmitDraft={() => submitManualDraft(template.id)}
                    onDeleteDraft={() => deleteManualDraft(template.id)}
                    onCreateCampaign={onCreateCampaign ? () => onCreateCampaign(template) : undefined}
                    onCloneTemplate={onCloneTemplate ? () => onCloneTemplate(template) : undefined}
                    onMouseEnter={() => onHoverTemplate(template.id)}
                    onMouseLeave={() => onHoverTemplate(null)}
                    onPrefetchPreview={onPrefetchPreview ? () => onPrefetchPreview(template) : undefined}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Container>
  );
};

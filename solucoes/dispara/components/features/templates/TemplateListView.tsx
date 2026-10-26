'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { Upload } from 'lucide-react';
import { Template } from '../../../types';

// Lazy load BulkGenerationModal (~50-80KB reduction - AI dependencies)
const BulkGenerationModal = dynamic(
  () => import('./BulkGenerationModal').then(m => ({ default: m.BulkGenerationModal })),
  { loading: () => null }
);
import {
  TemplateListViewProps,
  TemplateListHeader,
  TemplateFilters,
  SelectionActionBar,
  TemplateTable,
  TemplateHoverPreview,
  TemplateDetailsModal,
  DeleteConfirmModal,
  BulkDeleteModal,
  BulkDeleteDraftsModal,
} from './list';

export type { TemplateListViewProps } from './list';

export const TemplateListView: React.FC<TemplateListViewProps> = ({
  templates,
  isLoading,
  isSyncing,
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  onSync,
  statusCounts,
  manualDraftIds,
  manualDraftSendStateById,
  submitManualDraft,
  submittingManualDraftId,
  deleteManualDraft,
  deletingManualDraftId,
  selectedManualDraftIds,
  onToggleManualDraft,
  onSelectAllManualDrafts,
  onClearManualDraftSelection,
  // Bulk props
  isBulkModalOpen,
  setIsBulkModalOpen,
  bulkBusinessType,
  setBulkBusinessType,
  bulkCategories,
  bulkQuantity,
  setBulkQuantity,
  bulkLanguage,
  setBulkLanguage,
  generatedTemplates,
  selectedTemplates,
  isBulkGenerating,
  isCreatingInMeta,
  onGenerateBulk,
  onToggleCategory,
  onToggleTemplate,
  onSelectAllTemplates,
  onCopyTemplate,
  onExportSelected,
  onCloseBulkModal,
  universalUrl,
  setUniversalUrl,
  universalPhone,
  setUniversalPhone,
  // Details Modal props
  selectedTemplate,
  isDetailsModalOpen,
  templateDetails,
  isLoadingDetails,
  onViewDetails,
  onCloseDetails,
  refreshingPreviewNames,
  onPrefetchPreview,
  onRefreshPreview,
  // Delete Modal props
  isDeleteModalOpen,
  templateToDelete,
  isDeleting,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
  // Multi-select & Bulk Delete props
  selectedMetaTemplates,
  onToggleMetaTemplate,
  onSelectAllMetaTemplates,
  onClearSelection,
  isBulkDeleteModalOpen,
  isBulkDeleting,
  onBulkDeleteClick,
  onConfirmBulkDelete,
  onCancelBulkDelete,

  isBulkDeleteDraftsModalOpen,
  setIsBulkDeleteDraftsModalOpen,
  isBulkDeletingDrafts,
  onConfirmBulkDeleteDrafts,
  hideHeader = false,
  onCreateCampaign,
  onCloneTemplate,
  cloningTemplateName,
}) => {
  const [hoveredTemplateId, setHoveredTemplateId] = React.useState<string | null>(null);
  const previewVariables = ['Joao', '19:00', '01/12', 'R$ 99,90', '#12345'];

  // Computed values
  const isManualDraft = (t: Template) => manualDraftIds?.has(t.id);
  const selectableMetaTemplates = templates.filter((t) => !isManualDraft(t));
  const manualDraftTemplates = templates.filter((t) => isManualDraft(t));

  const hasSelection = selectedMetaTemplates.size > 0;
  const hasDraftSelection = selectedManualDraftIds.size > 0;

  const isAllDraftsSelected =
    manualDraftTemplates.length > 0 &&
    manualDraftTemplates.every((t) => selectedManualDraftIds.has(t.id));
  const isAllMetaSelected =
    selectableMetaTemplates.length > 0 &&
    selectableMetaTemplates.every((t) => selectedMetaTemplates.has(t.name));

  const hoveredTemplate = hoveredTemplateId
    ? templates.find((t) => t.id === hoveredTemplateId) || null
    : null;

  // Selection handlers
  const toggleAllVisibleDrafts = () => {
    if (manualDraftTemplates.length === 0) return;

    if (isAllDraftsSelected) {
      for (const t of manualDraftTemplates) {
        if (selectedManualDraftIds.has(t.id)) onToggleManualDraft(t.id);
      }
    } else {
      for (const t of manualDraftTemplates) {
        if (!selectedManualDraftIds.has(t.id)) onToggleManualDraft(t.id);
      }
    }
  };

  const toggleAllVisibleMeta = () => {
    if (selectableMetaTemplates.length === 0) return;

    if (isAllMetaSelected) {
      for (const t of selectableMetaTemplates) {
        if (selectedMetaTemplates.has(t.name)) onToggleMetaTemplate(t.name);
      }
    } else {
      for (const t of selectableMetaTemplates) {
        if (!selectedMetaTemplates.has(t.name)) onToggleMetaTemplate(t.name);
      }
    }
  };

  // Get selected drafts for bulk delete modal
  const selectedDraftsForDelete = manualDraftTemplates.filter((t) =>
    selectedManualDraftIds.has(t.id)
  );

  // Details modal handlers
  const handleDetailsDelete = () => {
    if (selectedTemplate) {
      onCloseDetails();
      onDeleteClick(selectedTemplate);
    }
  };

  const handleRefreshPreview = () => {
    if (selectedTemplate && onRefreshPreview) {
      onRefreshPreview(selectedTemplate);
    }
  };

  const isRefreshingPreview = Boolean(
    selectedTemplate && refreshingPreviewNames?.has(selectedTemplate.name)
  );

  return (
    <div className="space-y-8 pb-20 relative">
      {/* Header */}
      {!hideHeader && (
        <TemplateListHeader
          templateCount={templates.length}
          isSyncing={isSyncing}
          onSync={onSync}
          onOpenBulkModal={() => setIsBulkModalOpen(true)}
        />
      )}

      {/* Filters */}
      <TemplateFilters
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusCounts={statusCounts}
        showDraftControls={statusFilter === 'DRAFT' && manualDraftTemplates.length > 0}
        hasDraftSelection={hasDraftSelection}
        selectedDraftCount={selectedManualDraftIds.size}
        onOpenBulkDeleteDrafts={() => setIsBulkDeleteDraftsModalOpen(true)}
        onClearDraftSelection={onClearManualDraftSelection}
      />

      {/* Selection Action Bar */}
      <SelectionActionBar
        selectedCount={selectedMetaTemplates.size}
        onClearSelection={onClearSelection}
        onBulkDeleteClick={onBulkDeleteClick}
      />

      {/* Template Table */}
      <TemplateTable
        templates={templates}
        isLoading={isLoading}
        statusFilter={statusFilter}
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
        onCloneTemplate={onCloneTemplate}
        cloningTemplateName={cloningTemplateName}
        onHoverTemplate={setHoveredTemplateId}
        onPrefetchPreview={onPrefetchPreview}
        onToggleAllDrafts={toggleAllVisibleDrafts}
        onToggleAllMeta={toggleAllVisibleMeta}
        isAllDraftsSelected={isAllDraftsSelected}
        isAllMetaSelected={isAllMetaSelected}
        manualDraftCount={manualDraftTemplates.length}
        selectableMetaCount={selectableMetaTemplates.length}
      />

      {/* Hover Preview */}
      <TemplateHoverPreview template={hoveredTemplate} variables={previewVariables} />

      {/* Details Modal */}
      <TemplateDetailsModal
        isOpen={isDetailsModalOpen}
        template={selectedTemplate}
        details={templateDetails}
        isLoading={isLoadingDetails}
        isRefreshingPreview={isRefreshingPreview}
        onClose={onCloseDetails}
        onDelete={handleDetailsDelete}
        onRefreshPreview={onRefreshPreview ? handleRefreshPreview : undefined}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        template={templateToDelete}
        isDeleting={isDeleting}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />

      {/* Bulk Generation Modal */}
      <BulkGenerationModal
        isOpen={isBulkModalOpen}
        onClose={onCloseBulkModal}
        businessType={bulkBusinessType}
        setBusinessType={setBulkBusinessType}
        quantity={bulkQuantity}
        setQuantity={setBulkQuantity}
        language={bulkLanguage}
        setLanguage={setBulkLanguage}
        generatedTemplates={generatedTemplates}
        selectedTemplates={selectedTemplates}
        onGenerate={onGenerateBulk}
        onToggleTemplate={onToggleTemplate}
        onSelectAll={onSelectAllTemplates}
        onSubmit={onExportSelected}
        onCopyTemplate={onCopyTemplate}
        isGenerating={isBulkGenerating}
        isSubmitting={isCreatingInMeta}
        universalUrl={universalUrl}
        setUniversalUrl={setUniversalUrl}
        universalPhone={universalPhone}
        setUniversalPhone={setUniversalPhone}
        submitLabel="Criar na Meta"
        submitIcon={<Upload size={16} />}
      />

      {/* Bulk Delete Modal (Meta templates) */}
      <BulkDeleteModal
        isOpen={isBulkDeleteModalOpen}
        selectedNames={selectedMetaTemplates}
        isDeleting={isBulkDeleting}
        onConfirm={onConfirmBulkDelete}
        onCancel={onCancelBulkDelete}
      />

      {/* Bulk Delete Drafts Modal (Local drafts) */}
      <BulkDeleteDraftsModal
        isOpen={isBulkDeleteDraftsModalOpen}
        drafts={selectedDraftsForDelete}
        isDeleting={isBulkDeletingDrafts}
        onConfirm={onConfirmBulkDeleteDrafts}
        onCancel={() => setIsBulkDeleteDraftsModalOpen(false)}
      />
    </div>
  );
};

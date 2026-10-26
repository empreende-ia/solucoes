import { Template, TemplateStatus } from '../../../../types';
import { UtilityCategory, GeneratedTemplate } from '../../../../services/templateService';

export type StatusFilterType = 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'ALL';

export interface TemplateDetails {
  header?: string | null;
  footer?: string | null;
  buttons?: Array<{ type: string; text: string; url?: string }>;
  headerMediaPreviewUrl?: string | null;
  headerMediaPreviewExpiresAt?: string | null;
  qualityScore?: string | null;
  rejectedReason?: string | null;
}

export interface TemplateListViewProps {
  templates: Template[];
  isLoading: boolean;
  isSyncing: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  statusFilter: StatusFilterType;
  setStatusFilter: (status: StatusFilterType) => void;
  onSync: () => void;
  // Status counts for filter pills
  statusCounts?: {
    APPROVED: number;
    PENDING: number;
    REJECTED: number;
    DRAFT: number;
    ALL: number;
  };

  // Manual drafts (para acoes especificas de rascunho manual dentro da lista geral)
  manualDraftIds: Set<string>;
  manualDraftSendStateById?: Record<string, { canSend: boolean; reason?: string }>;
  submitManualDraft: (id: string) => void;
  submittingManualDraftId: string | null;
  deleteManualDraft: (id: string) => void;
  deletingManualDraftId: string | null;

  // Selecao (local) para rascunhos manuais
  selectedManualDraftIds: Set<string>;
  onToggleManualDraft: (id: string) => void;
  onSelectAllManualDrafts: () => void;
  onClearManualDraftSelection: () => void;

  // Bulk Utility Modal
  isBulkModalOpen: boolean;
  setIsBulkModalOpen: (open: boolean) => void;
  bulkBusinessType: string;
  setBulkBusinessType: (type: string) => void;
  bulkCategories: UtilityCategory[];
  bulkQuantity: number;
  setBulkQuantity: (qty: number) => void;
  bulkLanguage: 'pt_BR' | 'en_US' | 'es_ES';
  setBulkLanguage: (lang: 'pt_BR' | 'en_US' | 'es_ES') => void;
  generatedTemplates: GeneratedTemplate[];
  selectedTemplates: Set<string>;
  isBulkGenerating: boolean;
  isCreatingInMeta: boolean;
  onGenerateBulk: () => void;
  onToggleCategory: (category: UtilityCategory) => void;
  onToggleTemplate: (id: string) => void;
  onSelectAllTemplates: () => void;
  onCopyTemplate: (template: GeneratedTemplate) => void;
  onExportSelected: () => void;
  onCloseBulkModal: () => void;
  universalUrl: string;
  setUniversalUrl: (url: string) => void;
  universalPhone: string;
  setUniversalPhone: (phone: string) => void;

  // Details Modal
  selectedTemplate: Template | null;
  isDetailsModalOpen: boolean;
  templateDetails: TemplateDetails | null;
  isLoadingDetails: boolean;
  onViewDetails: (template: Template) => void;
  onCloseDetails: () => void;
  refreshingPreviewNames?: Set<string>;
  onPrefetchPreview?: (template: Template) => void;
  onRefreshPreview?: (template: Template) => void;

  // Delete Modal
  isDeleteModalOpen: boolean;
  templateToDelete: Template | null;
  isDeleting: boolean;
  onDeleteClick: (template: Template) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;

  // Create Campaign from template
  onCreateCampaign?: (template: Template) => void;

  // Clone template to draft
  onCloneTemplate?: (template: Template) => void;
  cloningTemplateName?: string | null;

  // Multi-select & Bulk Delete
  selectedMetaTemplates: Set<string>;
  onToggleMetaTemplate: (name: string) => void;
  onSelectAllMetaTemplates: () => void;
  onClearSelection: () => void;
  isBulkDeleteModalOpen: boolean;
  isBulkDeleting: boolean;
  onBulkDeleteClick: () => void;
  onConfirmBulkDelete: () => void;
  onCancelBulkDelete: () => void;

  // Bulk delete de rascunhos manuais (local)
  isBulkDeleteDraftsModalOpen: boolean;
  setIsBulkDeleteDraftsModalOpen: (open: boolean) => void;
  isBulkDeletingDrafts: boolean;
  onConfirmBulkDeleteDrafts: (ids: string[]) => void;

  /**
   * Quando o TemplateListView for renderizado dentro de uma pagina que ja tem header,
   * use isso para evitar header duplicado (ex.: /templates com tabs).
   */
  hideHeader?: boolean;
}

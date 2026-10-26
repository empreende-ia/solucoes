'use client'

import React from 'react'
import { KanbanSquare, Loader2, MoreVertical, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageDescription, PageTitle } from '@/components/ui/page'
import type { CrmController } from '@/hooks/useCrm'
import { KanbanBoard } from './KanbanBoard'
import { PipelineFormModal } from './PipelineFormModal'
import { ManageStagesModal } from './ManageStagesModal'
import { NewOpportunityModal } from './NewOpportunityModal'
import { EditOpportunityModal } from './EditOpportunityModal'

export interface CrmViewProps {
  controller: CrmController
}

/**
 * View principal do CRM: header (seletor de pipeline + ações) e kanban de oportunidades.
 * Componente de apresentação — toda a lógica vive no useCrmController.
 */
export function CrmView({ controller }: CrmViewProps) {
  const {
    pipelines,
    selectedPipeline,
    selectedPipelineId,
    columns,
    isLoadingPipelines,
    isLoadingOpportunities,
    setSelectedPipelineId,
  } = controller

  const newOpportunityStage =
    columns.find((c) => c.stage.id === controller.newOpportunityStageId)?.stage ?? null

  // --- Loading inicial ---
  if (isLoadingPipelines) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          <p className="text-sm text-[var(--ds-text-muted)]">Carregando CRM...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header da página */}
      <div className="shrink-0 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle>CRM</PageTitle>
          <PageDescription>
            Acompanhe suas oportunidades por etapa do funil
          </PageDescription>
        </div>

        <div className="flex items-center gap-3">
          {pipelines.length > 0 && (
            <>
              <Select
                value={selectedPipelineId ?? undefined}
                onValueChange={(value) => setSelectedPipelineId(value)}
              >
                <SelectTrigger className="w-56" aria-label="Selecionar pipeline">
                  <SelectValue placeholder="Selecione um pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Menu do pipeline atual */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Ações do pipeline">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => controller.setIsRenamePipelineOpen(true)}>
                    <Pencil />
                    Renomear pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => controller.setIsManageStagesOpen(true)}>
                    <SlidersHorizontal />
                    Gerenciar etapas
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => controller.setIsDeletePipelineOpen(true)}
                  >
                    <Trash2 />
                    Excluir pipeline
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          <Button variant="brand" onClick={() => controller.setIsNewPipelineOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Novo pipeline
          </Button>
        </div>
      </div>

      {/* Conteúdo: empty state ou kanban */}
      {pipelines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Container padding="xl" className="max-w-md text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mb-4">
              <KanbanSquare className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--ds-text-primary)]">
              Crie seu primeiro pipeline
            </h2>
            <p className="mt-2 text-sm text-[var(--ds-text-secondary)]">
              Organize suas oportunidades em etapas e acompanhe cada negociação do primeiro
              contato ao fechamento.
            </p>
            <Button
              variant="brand"
              className="mt-5"
              onClick={() => controller.setIsNewPipelineOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Novo pipeline
            </Button>
          </Container>
        </div>
      ) : isLoadingOpportunities ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      ) : (
        <KanbanBoard
          columns={columns}
          onMoveOpportunity={controller.onMoveOpportunity}
          onAddOpportunity={(stageId) => controller.setNewOpportunityStageId(stageId)}
          onChangeStatus={controller.onChangeStatus}
          onEditOpportunity={(opportunity) => controller.setEditingOpportunity(opportunity)}
          onDeleteOpportunity={(opportunity) => controller.setDeletingOpportunity(opportunity)}
        />
      )}

      {/* Modais */}
      <PipelineFormModal
        isOpen={controller.isNewPipelineOpen}
        mode="create"
        isSaving={controller.isCreatingPipeline}
        onSubmit={controller.onCreatePipeline}
        onClose={() => controller.setIsNewPipelineOpen(false)}
      />

      <PipelineFormModal
        isOpen={controller.isRenamePipelineOpen}
        mode="rename"
        initialName={selectedPipeline?.name ?? ''}
        isSaving={controller.isRenamingPipeline}
        onSubmit={controller.onRenamePipeline}
        onClose={() => controller.setIsRenamePipelineOpen(false)}
      />

      <ManageStagesModal
        isOpen={controller.isManageStagesOpen}
        pipelineName={selectedPipeline?.name ?? ''}
        stages={selectedPipeline?.stages ?? []}
        isAdding={controller.isAddingStage}
        isRenaming={controller.isRenamingStage}
        isDeleting={controller.isDeletingStage}
        onAddStage={controller.onAddStage}
        onRenameStage={controller.onRenameStage}
        onDeleteStage={controller.onDeleteStage}
        onClose={() => controller.setIsManageStagesOpen(false)}
      />

      <ConfirmDeleteModal
        isOpen={controller.isDeletePipelineOpen}
        title="Excluir pipeline"
        description="Todas as etapas e oportunidades deste pipeline serão excluídas. Esta ação não pode ser desfeita."
        itemName={selectedPipeline?.name}
        isDeleting={controller.isDeletingPipeline}
        onConfirm={controller.onDeletePipeline}
        onCancel={() => controller.setIsDeletePipelineOpen(false)}
        confirmText="Excluir pipeline"
        loadingText="Excluindo..."
      />

      <NewOpportunityModal
        isOpen={!!controller.newOpportunityStageId}
        stage={newOpportunityStage}
        isSaving={controller.isCreatingOpportunity}
        onSubmit={controller.onCreateOpportunity}
        onClose={() => controller.setNewOpportunityStageId(null)}
      />

      <EditOpportunityModal
        opportunity={controller.editingOpportunity}
        isSaving={controller.isSavingOpportunity}
        onSubmit={controller.onSaveEdit}
        onClose={() => controller.setEditingOpportunity(null)}
      />

      <ConfirmDeleteModal
        isOpen={!!controller.deletingOpportunity}
        title="Excluir oportunidade"
        itemName={controller.deletingOpportunity?.name}
        isDeleting={controller.isDeletingOpportunity}
        onConfirm={controller.onConfirmDeleteOpportunity}
        onCancel={() => controller.setDeletingOpportunity(null)}
        confirmText="Excluir"
        loadingText="Excluindo..."
      />
    </div>
  )
}

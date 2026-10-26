'use client'

import React, { useState } from 'react'
import { Check, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Modal, ModalHeader } from '@/components/ui/Modal'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { Input } from '@/components/ui/input'
import type { PipelineStage } from '@/services/crmService'

export interface ManageStagesModalProps {
  isOpen: boolean
  pipelineName: string
  stages: PipelineStage[]
  isAdding: boolean
  isRenaming: boolean
  isDeleting: boolean
  onAddStage: (name: string) => void
  onRenameStage: (stageId: string, name: string) => void
  onDeleteStage: (stageId: string) => void
  onClose: () => void
}

/**
 * Modal de gerenciamento de etapas do pipeline:
 * renomear inline, excluir (com aviso de cascata) e adicionar etapa.
 */
export function ManageStagesModal({
  isOpen,
  pipelineName,
  stages,
  isAdding,
  isRenaming,
  isDeleting,
  onAddStage,
  onRenameStage,
  onDeleteStage,
  onClose,
}: ManageStagesModalProps) {
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newStageName, setNewStageName] = useState('')
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null)

  const sortedStages = [...stages].sort((a, b) => a.position - b.position)

  const startEditing = (stage: PipelineStage) => {
    setEditingStageId(stage.id)
    setEditingName(stage.name)
  }

  const cancelEditing = () => {
    setEditingStageId(null)
    setEditingName('')
  }

  const confirmRename = () => {
    const trimmed = editingName.trim()
    if (editingStageId && trimmed) {
      onRenameStage(editingStageId, trimmed)
    }
    cancelEditing()
  }

  const handleAddStage = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newStageName.trim()
    if (!trimmed || isAdding) return
    onAddStage(trimmed)
    setNewStageName('')
  }

  const handleConfirmDelete = () => {
    if (stageToDelete) {
      onDeleteStage(stageToDelete.id)
      setStageToDelete(null)
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg" showCloseButton>
        <ModalHeader
          icon={<Layers size={24} className="text-primary-600 dark:text-primary-400" />}
          iconClassName="bg-primary-500/10"
          title="Gerenciar etapas"
          description={`Etapas do pipeline "${pipelineName}"`}
        />

        {/* Lista de etapas com renomear inline e excluir */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {sortedStages.map((stage, index) => (
            <div
              key={stage.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 px-3 py-2"
            >
              <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-[var(--ds-bg-hover)] text-xs font-medium text-[var(--ds-text-muted)]">
                {index + 1}
              </span>

              {editingStageId === stage.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        confirmRename()
                      }
                      if (e.key === 'Escape') cancelEditing()
                    }}
                    className="h-8 flex-1"
                    autoFocus
                    maxLength={80}
                  />
                  <button
                    onClick={confirmRename}
                    disabled={!editingName.trim() || isRenaming}
                    className="shrink-0 p-1.5 rounded-md text-primary-600 dark:text-primary-400 hover:bg-primary-500/10 transition-colors disabled:opacity-50"
                    aria-label="Confirmar renomeação"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="shrink-0 p-1.5 rounded-md text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] transition-colors"
                    aria-label="Cancelar renomeação"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-[var(--ds-text-primary)] truncate">
                    {stage.name}
                  </span>
                  <button
                    onClick={() => startEditing(stage)}
                    className="shrink-0 p-1.5 rounded-md text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] transition-colors"
                    aria-label={`Renomear etapa ${stage.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setStageToDelete(stage)}
                    disabled={sortedStages.length <= 1}
                    className="shrink-0 p-1.5 rounded-md text-[var(--ds-text-muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    aria-label={`Excluir etapa ${stage.name}`}
                    title={
                      sortedStages.length <= 1
                        ? 'O pipeline precisa ter ao menos uma etapa'
                        : 'Excluir etapa'
                    }
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}

          {sortedStages.length === 0 && (
            <p className="text-sm text-[var(--ds-text-muted)] text-center py-4">
              Nenhuma etapa neste pipeline. Adicione a primeira abaixo.
            </p>
          )}
        </div>

        {/* Adicionar etapa */}
        <form onSubmit={handleAddStage} className="mt-4 flex items-center gap-2">
          <Input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Nome da nova etapa"
            maxLength={80}
          />
          <button
            type="submit"
            disabled={!newStageName.trim() || isAdding}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Adicionar etapa
          </button>
        </form>
      </Modal>

      {/* Confirmação de exclusão de etapa (cascata) */}
      <ConfirmDeleteModal
        isOpen={!!stageToDelete}
        title="Excluir etapa"
        description="As oportunidades desta etapa serão apagadas em cascata. Esta ação não pode ser desfeita."
        itemName={stageToDelete?.name}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setStageToDelete(null)}
        confirmText="Excluir etapa"
        loadingText="Excluindo..."
      />
    </>
  )
}

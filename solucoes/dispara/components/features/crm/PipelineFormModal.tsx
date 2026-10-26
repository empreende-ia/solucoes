'use client'

import React, { useEffect, useState } from 'react'
import { KanbanSquare, Loader2, Pencil } from 'lucide-react'
import { Modal, ModalCancelButton, ModalFooter, ModalHeader } from '@/components/ui/Modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface PipelineFormModalProps {
  isOpen: boolean
  mode: 'create' | 'rename'
  /** Nome atual (modo rename) */
  initialName?: string
  isSaving: boolean
  onSubmit: (name: string) => void
  onClose: () => void
}

/** Etapas criadas por padrão quando o pipeline nasce sem etapas customizadas */
const DEFAULT_STAGES = ['Novo lead', 'Em conversa', 'Fechado']

/**
 * Modal de criação/renomeação de pipeline.
 * Na criação, o backend gera as etapas padrão automaticamente.
 */
export function PipelineFormModal({
  isOpen,
  mode,
  initialName = '',
  isSaving,
  onSubmit,
  onClose,
}: PipelineFormModalProps) {
  const [name, setName] = useState(initialName)

  // Ressincroniza o campo ao abrir (criação limpa, renomeação preenchida)
  useEffect(() => {
    if (isOpen) setName(mode === 'rename' ? initialName : '')
  }, [isOpen, mode, initialName])

  const trimmed = name.trim()
  const canSubmit = trimmed.length > 0 && !isSaving

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canSubmit) onSubmit(trimmed)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" showCloseButton>
      <ModalHeader
        icon={
          mode === 'create' ? (
            <KanbanSquare size={24} className="text-primary-600 dark:text-primary-400" />
          ) : (
            <Pencil size={24} className="text-primary-600 dark:text-primary-400" />
          )
        }
        iconClassName="bg-primary-500/10"
        title={mode === 'create' ? 'Novo pipeline' : 'Renomear pipeline'}
        description={
          mode === 'create'
            ? 'Organize suas oportunidades em um novo funil'
            : 'Altere o nome do pipeline atual'
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pipeline-name">Nome do pipeline</Label>
          <Input
            id="pipeline-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Vendas WhatsApp"
            autoFocus
            maxLength={80}
          />
        </div>

        {mode === 'create' && (
          <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)]/30 p-3">
            <p className="text-xs text-[var(--ds-text-secondary)]">
              O pipeline será criado com as etapas padrão:{' '}
              <span className="font-medium text-[var(--ds-text-primary)]">
                {DEFAULT_STAGES.join(' → ')}
              </span>
              . Você pode renomear ou adicionar etapas depois.
            </p>
          </div>
        )}

        <ModalFooter className="mt-2">
          <ModalCancelButton onClick={onClose} disabled={isSaving} />
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Salvando...
              </>
            ) : mode === 'create' ? (
              'Criar pipeline'
            ) : (
              'Salvar'
            )}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

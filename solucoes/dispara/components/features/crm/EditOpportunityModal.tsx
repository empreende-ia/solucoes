'use client'

import React, { useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Modal, ModalCancelButton, ModalFooter, ModalHeader } from '@/components/ui/Modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Opportunity } from '@/services/crmService'

export interface EditOpportunityModalProps {
  /** Oportunidade em edição (null = fechado) */
  opportunity: Opportunity | null
  isSaving: boolean
  onSubmit: (id: string, data: { name: string; value: number | null }) => void
  onClose: () => void
}

/** Modal de edição de oportunidade (nome e valor). */
export function EditOpportunityModal({
  opportunity,
  isSaving,
  onSubmit,
  onClose,
}: EditOpportunityModalProps) {
  const [name, setName] = useState('')
  const [valueInput, setValueInput] = useState('')

  // Preenche o formulário quando uma oportunidade é selecionada para edição
  useEffect(() => {
    if (opportunity) {
      setName(opportunity.name)
      setValueInput(opportunity.value !== null ? String(opportunity.value) : '')
    }
  }, [opportunity])

  const parsedValue = valueInput.trim() === '' ? null : Number(valueInput.replace(',', '.'))
  const isValueInvalid = parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)
  const canSubmit = !!opportunity && name.trim().length > 0 && !isValueInvalid && !isSaving

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !opportunity) return
    onSubmit(opportunity.id, { name: name.trim(), value: parsedValue })
  }

  return (
    <Modal isOpen={!!opportunity} onClose={onClose} maxWidth="md" showCloseButton>
      <ModalHeader
        icon={<Pencil size={24} className="text-primary-600 dark:text-primary-400" />}
        iconClassName="bg-primary-500/10"
        title="Editar oportunidade"
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-opportunity-name">Nome da oportunidade</Label>
          <Input
            id="edit-opportunity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da oportunidade"
            autoFocus
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-opportunity-value">Valor (R$, opcional)</Label>
          <Input
            id="edit-opportunity-value"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            placeholder="Ex.: 1500,00"
            aria-invalid={isValueInvalid}
          />
          {isValueInvalid && (
            <p className="text-xs text-red-600 dark:text-red-400">Informe um valor válido.</p>
          )}
        </div>

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
            ) : (
              'Salvar'
            )}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

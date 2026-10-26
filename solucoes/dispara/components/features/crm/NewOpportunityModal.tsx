'use client'

import React, { useEffect, useState } from 'react'
import { CircleUser, Loader2, Search, Target, X } from 'lucide-react'
import { Modal, ModalCancelButton, ModalFooter, ModalHeader } from '@/components/ui/Modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPhoneNumberDisplay } from '@/lib/phone-formatter'
import { useContactSearch, type NewOpportunityForm } from '@/hooks/useCrm'
import type { ContactSearchResult, PipelineStage } from '@/services/crmService'

export interface NewOpportunityModalProps {
  isOpen: boolean
  /** Etapa onde a oportunidade será criada */
  stage: PipelineStage | null
  isSaving: boolean
  onSubmit: (form: NewOpportunityForm) => void
  onClose: () => void
}

/**
 * Modal de criação de oportunidade:
 * busca de contato com debounce + nome (prefill = nome do contato) + valor opcional.
 */
export function NewOpportunityModal({
  isOpen,
  stage,
  isSaving,
  onSubmit,
  onClose,
}: NewOpportunityModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null)
  const [name, setName] = useState('')
  const [valueInput, setValueInput] = useState('')

  const { results, isSearching, hasSearched } = useContactSearch(searchTerm)

  // Limpa o formulário sempre que o modal abre
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('')
      setSelectedContact(null)
      setName('')
      setValueInput('')
    }
  }, [isOpen])

  const handleSelectContact = (contact: ContactSearchResult) => {
    setSelectedContact(contact)
    setSearchTerm('')
    // Prefill do nome da oportunidade com o nome do contato (sem sobrescrever digitação)
    if (!name.trim()) {
      setName(contact.name || formatPhoneNumberDisplay(contact.phone))
    }
  }

  const parsedValue = valueInput.trim() === '' ? null : Number(valueInput.replace(',', '.'))
  const isValueInvalid = parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)
  const canSubmit = !!stage && name.trim().length > 0 && !isValueInvalid && !isSaving

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !stage) return
    onSubmit({
      stageId: stage.id,
      name: name.trim(),
      contactId: selectedContact?.id ?? null,
      phone: selectedContact?.phone ?? null,
      value: parsedValue,
    })
  }

  const showResults = !selectedContact && searchTerm.trim().length >= 2

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md" showCloseButton>
      <ModalHeader
        icon={<Target size={24} className="text-primary-600 dark:text-primary-400" />}
        iconClassName="bg-primary-500/10"
        title="Nova oportunidade"
        description={stage ? `Será criada na etapa "${stage.name}"` : undefined}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Busca de contato */}
        <div className="space-y-2">
          <Label htmlFor="opportunity-contact">Contato (opcional)</Label>
          {selectedContact ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]/30 px-3 py-2">
              <CircleUser className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ds-text-primary)] truncate">
                  {selectedContact.name || 'Sem nome'}
                </p>
                <p className="text-xs text-[var(--ds-text-muted)]">
                  {formatPhoneNumberDisplay(selectedContact.phone)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="shrink-0 p-1 rounded-md text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] transition-colors"
                aria-label="Remover contato selecionado"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ds-text-muted)] pointer-events-none" />
              <Input
                id="opportunity-contact"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="pl-9"
                autoComplete="off"
              />

              {showResults && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] shadow-lg max-h-56 overflow-y-auto">
                  {isSearching ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--ds-text-muted)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Buscando contatos...
                    </div>
                  ) : results.length > 0 ? (
                    results.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => handleSelectContact(contact)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--ds-bg-hover)] transition-colors"
                      >
                        <CircleUser className="w-4 h-4 shrink-0 text-[var(--ds-text-muted)]" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-[var(--ds-text-primary)] truncate">
                            {contact.name || 'Sem nome'}
                          </span>
                          <span className="block text-xs text-[var(--ds-text-muted)]">
                            {formatPhoneNumberDisplay(contact.phone)}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : hasSearched ? (
                    <p className="px-3 py-3 text-sm text-[var(--ds-text-muted)]">
                      Nenhum contato encontrado.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nome da oportunidade */}
        <div className="space-y-2">
          <Label htmlFor="opportunity-name">Nome da oportunidade</Label>
          <Input
            id="opportunity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Proposta plano anual"
            maxLength={120}
          />
        </div>

        {/* Valor opcional */}
        <div className="space-y-2">
          <Label htmlFor="opportunity-value">Valor (R$, opcional)</Label>
          <Input
            id="opportunity-value"
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
                Criando...
              </>
            ) : (
              'Criar oportunidade'
            )}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

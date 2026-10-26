'use client'

import React from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { Modal, ModalHeader, ModalFooter, ModalCancelButton } from './Modal'

export interface ConfirmDeleteModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Modal title */
  title: string
  /** Description text (default: "Esta ação não pode ser desfeita") */
  description?: string
  /** Single item name to display */
  itemName?: string
  /** List of item names to delete (for bulk delete) */
  itemsToDelete?: string[]
  /** Custom content to show instead of itemName/itemsToDelete */
  children?: React.ReactNode
  /** Number of items being deleted (for button text) */
  count?: number
  /** Whether deletion is in progress */
  isDeleting?: boolean
  /** Callback when user confirms deletion */
  onConfirm: () => void
  /** Callback when user cancels */
  onCancel: () => void
  /** Button text (default: "Deletar" or "Deletar X" if count > 1) */
  confirmText?: string
  /** Loading button text (default: "Deletando...") */
  loadingText?: string
}

/**
 * Reusable delete confirmation modal.
 * Supports single item, bulk items, or custom content.
 *
 * @example
 * // Single item delete
 * <ConfirmDeleteModal
 *   isOpen={isOpen}
 *   title="Deletar Template"
 *   itemName={template.name}
 *   onConfirm={handleDelete}
 *   onCancel={() => setIsOpen(false)}
 * />
 *
 * @example
 * // Bulk delete
 * <ConfirmDeleteModal
 *   isOpen={isOpen}
 *   title="Deletar Templates"
 *   itemsToDelete={['Template 1', 'Template 2']}
 *   count={2}
 *   onConfirm={handleBulkDelete}
 *   onCancel={() => setIsOpen(false)}
 * />
 */
export function ConfirmDeleteModal({
  isOpen,
  title,
  description = 'Esta ação não pode ser desfeita',
  itemName,
  itemsToDelete,
  children,
  count = 1,
  isDeleting = false,
  onConfirm,
  onCancel,
  confirmText,
  loadingText = 'Deletando...',
}: ConfirmDeleteModalProps) {
  const buttonText = confirmText || (count > 1 ? `Deletar ${count}` : 'Confirmar Exclusão')

  return (
    <Modal isOpen={isOpen} onClose={onCancel} variant="warning" closeOnBackdropClick={!isDeleting}>
      <ModalHeader
        icon={<Trash2 size={24} className="text-amber-300" />}
        iconClassName="bg-amber-500/10"
        title={title}
        description={description}
      />

      {/* Content area */}
      <div className="bg-[var(--ds-bg-surface)]/30 rounded-lg p-4 mb-6 border border-[var(--ds-border-subtle)]">
        {children ? (
          children
        ) : itemsToDelete && itemsToDelete.length > 0 ? (
          <>
            <p className="text-sm text-[var(--ds-text-secondary)] mb-3">
              Você está prestes a deletar{' '}
              <strong className="text-amber-300">{itemsToDelete.length} item(s)</strong>:
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {itemsToDelete.map((item) => (
                <div
                  key={item}
                  className="text-xs text-[var(--ds-text-secondary)] font-mono bg-[var(--ds-bg-surface)]/30 px-2 py-1 rounded border border-[var(--ds-border-subtle)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </>
        ) : itemName ? (
          <>
            <p className="text-[var(--ds-text-secondary)] text-sm mb-2">
              Você está prestes a deletar:
            </p>
            <p className="text-[var(--ds-text-primary)] font-semibold">{itemName}</p>
          </>
        ) : (
          <p className="text-[var(--ds-text-secondary)] text-sm">
            Tem certeza que deseja continuar?
          </p>
        )}
      </div>

      <ModalFooter>
        <ModalCancelButton onClick={onCancel} disabled={isDeleting} />
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="flex-1 px-4 py-3 bg-amber-500/10 text-amber-200 border border-amber-500/30 rounded-lg font-semibold hover:bg-amber-500/15 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isDeleting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {loadingText}
            </>
          ) : (
            <>
              <Trash2 size={16} />
              {buttonText}
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>
  )
}

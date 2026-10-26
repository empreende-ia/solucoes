'use client'

import { useEffect, useMemo } from 'react'
import type { CreateLeadFormDTO, LeadForm } from '@/types'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { CreateFormDialog } from './views/CreateFormDialog'
import { EditFormDialog } from './views/EditFormDialog'
import { FormList } from './views/FormList'
import { slugify } from './views/utils'

export interface LeadFormsViewProps {
  forms: LeadForm[]
  tags: string[]
  isLoading: boolean
  error?: string

  publicBaseUrl: string

  isCreateOpen: boolean
  setIsCreateOpen: (open: boolean) => void
  createDraft: CreateLeadFormDTO
  setCreateDraft: (dto: CreateLeadFormDTO) => void
  onCreate: () => void
  isCreating: boolean
  createError?: string

  // edit
  isEditOpen: boolean
  editDraft: CreateLeadFormDTO
  setEditDraft: (dto: CreateLeadFormDTO) => void
  onEdit: (form: LeadForm) => void
  onCloseEdit: () => void
  onSaveEdit: () => void
  isUpdating: boolean
  updateError?: string

  onDelete: (id: string) => void
  isDeleting: boolean
  deleteError?: string

  // Optional: hide header when embedded in page with its own header
  hideHeader?: boolean
}

export function LeadFormsView(props: LeadFormsViewProps) {
  const {
    forms,
    tags,
    isLoading,
    error,
    publicBaseUrl,
    isCreateOpen,
    setIsCreateOpen,
    createDraft,
    setCreateDraft,
    onCreate,
    isCreating,
    createError,

    isEditOpen,
    editDraft,
    setEditDraft,
    onEdit,
    onCloseEdit,
    onSaveEdit,
    isUpdating,
    updateError,

    onDelete,
    isDeleting,
    deleteError,
    hideHeader = false,
  } = props

  const { copyToClipboard, isCopied } = useCopyToClipboard()

  // Auto-sugerir slug a partir do nome (se slug ainda estiver vazio)
  useEffect(() => {
    if (!createDraft.name) return
    if (createDraft.slug?.trim()) return
    setCreateDraft({ ...createDraft, slug: slugify(createDraft.name) })
  }, [createDraft.name, createDraft.slug, setCreateDraft])

  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.localeCompare(b)), [tags])

  return (
    <div className="space-y-6">
      {/* Header with Create Button - hidden when parent page provides header */}
      {!hideHeader && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Formularios</h1>
            <p className="text-sm text-slate-400">
              Crie um link publico (tipo Google Forms) para captar contatos automaticamente com uma tag.
            </p>
          </div>

          <CreateFormDialog
            isOpen={isCreateOpen}
            setIsOpen={setIsCreateOpen}
            draft={createDraft}
            setDraft={setCreateDraft}
            onCreate={onCreate}
            isCreating={isCreating}
            createError={createError}
            publicBaseUrl={publicBaseUrl}
            sortedTags={sortedTags}
          />
        </div>
      )}

      {/* Create Dialog - always rendered (controlled by isCreateOpen) */}
      {hideHeader && (
        <CreateFormDialog
          isOpen={isCreateOpen}
          setIsOpen={setIsCreateOpen}
          draft={createDraft}
          setDraft={setCreateDraft}
          onCreate={onCreate}
          isCreating={isCreating}
          createError={createError}
          publicBaseUrl={publicBaseUrl}
          sortedTags={sortedTags}
          hideTrigger
        />
      )}

      {/* Edit Dialog */}
      <EditFormDialog
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        draft={editDraft}
        setDraft={setEditDraft}
        onSave={onSaveEdit}
        isUpdating={isUpdating}
        updateError={updateError}
        publicBaseUrl={publicBaseUrl}
        sortedTags={sortedTags}
      />

      {/* Forms List */}
      <FormList
        forms={forms}
        publicBaseUrl={publicBaseUrl}
        isLoading={isLoading}
        error={error}
        deleteError={deleteError}
        isCopied={isCopied}
        isDeleting={isDeleting}
        onCopyLink={copyToClipboard}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}

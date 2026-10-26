'use client'

import { useLeadFormsController } from '@/hooks/useLeadForms'
import { LeadFormsView } from '@/components/features/lead-forms/LeadFormsView'
import type { FormsInitialData } from './actions'

interface FormsClientWrapperProps {
  initialData?: FormsInitialData
}

export function FormsClientWrapper({ initialData }: FormsClientWrapperProps) {
  const controller = useLeadFormsController({ initialData })

  // Não mostra loading se já temos initialData do servidor
  const showLoading = controller.isLoading && !initialData

  return (
    <LeadFormsView
      forms={controller.forms}
      tags={controller.tags}
      isLoading={showLoading}
      error={controller.error}
      publicBaseUrl={controller.publicBaseUrl}
      isCreateOpen={controller.isCreateOpen}
      setIsCreateOpen={controller.setIsCreateOpen}
      createDraft={controller.createDraft}
      setCreateDraft={controller.setCreateDraft}
      onCreate={controller.create}
      isCreating={controller.isCreating}
      createError={controller.createError}
      isEditOpen={controller.isEditOpen}
      editDraft={controller.editDraft}
      setEditDraft={controller.setEditDraft}
      onEdit={controller.openEdit}
      onCloseEdit={controller.closeEdit}
      onSaveEdit={controller.saveEdit}
      isUpdating={controller.isUpdating}
      updateError={controller.updateError}
      onDelete={controller.remove}
      isDeleting={controller.isDeleting}
      deleteError={controller.deleteError}
    />
  )
}

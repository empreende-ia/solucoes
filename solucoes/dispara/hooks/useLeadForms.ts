import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateLeadFormDTO, LeadForm, UpdateLeadFormDTO } from '@/types'
import { leadFormService } from '@/services/leadFormService'
import type { FormsInitialData } from '@/app/(dashboard)/forms/actions'

const fetchTags = async (): Promise<string[]> => {
  const resp = await fetch('/api/contacts/tags', { cache: 'no-store' })
  if (!resp.ok) return []
  return resp.json()
}

export const useLeadFormsQuery = (options?: { enabled?: boolean; initialData?: LeadForm[] }) => {
  return useQuery({
    queryKey: ['leadForms'],
    queryFn: leadFormService.getAll,
    initialData: options?.initialData,
    staleTime: 30 * 1000,
    enabled: options?.enabled ?? true,
  })
}

export const useLeadFormTagsQuery = (options?: { enabled?: boolean; initialData?: string[] }) => {
  return useQuery({
    queryKey: ['contactTags'],
    queryFn: fetchTags,
    initialData: options?.initialData,
    staleTime: 60 * 1000,
    enabled: options?.enabled ?? true,
  })
}

export const useLeadFormsController = (options?: { enabled?: boolean; initialData?: FormsInitialData }) => {
  const queryClient = useQueryClient()
  const enabled = options?.enabled ?? true

  const leadFormsQuery = useLeadFormsQuery({ enabled, initialData: options?.initialData?.forms })
  const tagsQuery = useLeadFormTagsQuery({ enabled, initialData: options?.initialData?.tags })

  const forms = leadFormsQuery.data ?? []
  const tags = tagsQuery.data ?? []

  // UI state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<CreateLeadFormDTO>({
    name: '',
    slug: '',
    tag: '',
    isActive: true,
    collectEmail: true,
    successMessage: 'Cadastro recebido! Obrigado.',
    fields: [],
  })

  // Edit UI state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CreateLeadFormDTO>({
    name: '',
    slug: '',
    tag: '',
    isActive: true,
    collectEmail: true,
    successMessage: 'Cadastro recebido! Obrigado.',
    fields: [],
  })

  const createMutation = useMutation({
    mutationFn: leadFormService.create,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leadForms'] })
      setIsCreateOpen(false)
      setCreateDraft({
        name: '',
        slug: '',
        tag: '',
        isActive: true,
        collectEmail: true,
        successMessage: 'Cadastro recebido! Obrigado.',
        fields: [],
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateLeadFormDTO }) => leadFormService.update(id, dto),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leadForms'] })

      // Se estiver editando via modal, fecha após salvar.
      setIsEditOpen(false)
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: leadFormService.delete,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leadForms'] })
    },
  })

  const publicBaseUrl = useMemo(() => {
    // Em produção, preferimos NEXT_PUBLIC_APP_URL.
    // Em dev, cai para location.origin.
    if (typeof window === 'undefined') return ''
    return (process.env.NEXT_PUBLIC_APP_URL?.trim() || window.location.origin).replace(/\/$/, '')
  }, [])

  return {
    // data
    forms,
    tags,
    isLoading: leadFormsQuery.isLoading,
    error: (leadFormsQuery.error as any)?.message as string | undefined,

    // create
    isCreateOpen,
    setIsCreateOpen,
    createDraft,
    setCreateDraft,
    create: () => createMutation.mutate(createDraft),
    isCreating: createMutation.isPending,
    createError: (createMutation.error as any)?.message as string | undefined,

    // edit
    isEditOpen,
    editDraft,
    setEditDraft,
    openEdit: (form: LeadForm) => {
      setEditingId(form.id)
      setEditDraft({
        name: form.name,
        slug: form.slug,
        tag: form.tag,
        isActive: form.isActive,
        collectEmail: form.collectEmail ?? true,
        successMessage: form.successMessage ?? null,
        fields: Array.isArray(form.fields) ? form.fields.map((f) => ({ ...f })) : [],
      })
      setIsEditOpen(true)
    },
    closeEdit: () => {
      setIsEditOpen(false)
      setEditingId(null)
    },
    saveEdit: () => {
      if (!editingId) return
      updateMutation.mutate({ id: editingId, dto: editDraft })
    },

    // update/delete
    update: (id: string, dto: UpdateLeadFormDTO) => updateMutation.mutate({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: (updateMutation.error as any)?.message as string | undefined,

    remove: (id: string) => deleteMutation.mutate(id),
    isDeleting: deleteMutation.isPending,
    deleteError: (deleteMutation.error as any)?.message as string | undefined,

    // urls
    publicBaseUrl,
  }
}

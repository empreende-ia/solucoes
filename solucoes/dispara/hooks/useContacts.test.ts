import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHookWithProviders, waitFor, act } from '@/tests/helpers/hook-test-utils'
import { buildContact } from '@/tests/helpers/factories'

// Mock Supabase Realtime
vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(),
  subscribeToTable: vi.fn(),
  activateChannel: vi.fn(),
  removeChannel: vi.fn(),
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

// Mock query-invalidation
vi.mock('@/lib/query-invalidation', () => ({
  invalidateContacts: vi.fn(),
}))

// Mock business logic
vi.mock('@/lib/business/contact', () => ({
  normalizeEmailForUpdate: (email?: string) => email || null,
  sanitizeCustomFieldsForUpdate: (fields?: Record<string, unknown>) => fields || {},
}))

// Mock contactService
const mockList = vi.fn()
const mockGetById = vi.fn()
const mockGetStats = vi.fn()
const mockGetTags = vi.fn()
const mockAdd = vi.fn()
const mockUpdate = vi.fn()
const mockDeleteContact = vi.fn()
const mockDeleteMany = vi.fn()
const mockImport = vi.fn()
const mockImportFromFile = vi.fn()
const mockValidatePhone = vi.fn()

vi.mock('@/services', () => ({
  contactService: {
    list: (...args: unknown[]) => mockList(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
    getStats: (...args: unknown[]) => mockGetStats(...args),
    getTags: (...args: unknown[]) => mockGetTags(...args),
    add: (...args: unknown[]) => mockAdd(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDeleteContact(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    import: (...args: unknown[]) => mockImport(...args),
    importFromFile: (...args: unknown[]) => mockImportFromFile(...args),
    validatePhone: (...args: unknown[]) => mockValidatePhone(...args),
  },
}))

// Mock customFieldService
const mockGetAllCustomFields = vi.fn()

vi.mock('@/services/customFieldService', () => ({
  customFieldService: {
    getAll: (...args: unknown[]) => mockGetAllCustomFields(...args),
  },
}))

// Mock contactListService (listas salvas)
const mockListsGetAll = vi.fn()
const mockListCreate = vi.fn()
const mockListUpdate = vi.fn()
const mockListDelete = vi.fn()

vi.mock('@/services/contactListService', () => ({
  contactListService: {
    getAll: (...args: unknown[]) => mockListsGetAll(...args),
    create: (...args: unknown[]) => mockListCreate(...args),
    update: (...args: unknown[]) => mockListUpdate(...args),
    delete: (...args: unknown[]) => mockListDelete(...args),
  },
}))

// Mock workflowEnrollmentService (adicionar ao workflow)
const mockListWorkflows = vi.fn()
const mockEnroll = vi.fn()

vi.mock('@/services/workflowEnrollmentService', () => ({
  workflowEnrollmentService: {
    listWorkflows: (...args: unknown[]) => mockListWorkflows(...args),
    enroll: (...args: unknown[]) => mockEnroll(...args),
  },
}))

import { useContactsController } from './useContacts'
import { ContactStatus } from '@/types'

// =============================================================================
// FIXTURES
// =============================================================================

const mockContacts = [
  buildContact({ name: 'João Silva' }),
  buildContact({ name: 'Maria Santos' }),
  buildContact({ name: 'Pedro Costa' }),
]

const mockContactStats = { total: 100, optIn: 80, optOut: 20 }
const mockTags = ['vip', 'newsletter', 'lead']
const mockCustomFields = [{ id: 'cf-1', name: 'empresa', type: 'text' }]

const mockListResult = { data: mockContacts, total: 3 }

const mockContactLists = [
  {
    id: 'list-1',
    name: 'VIPs',
    filters: { tags: ['vip', 'lead'], tagMatch: 'all' as const },
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
  },
]

// =============================================================================
// TESTES
// =============================================================================

describe('useContactsController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(mockListResult)
    mockGetStats.mockResolvedValue(mockContactStats)
    mockGetTags.mockResolvedValue(mockTags)
    mockGetAllCustomFields.mockResolvedValue(mockCustomFields)
    mockValidatePhone.mockReturnValue({ isValid: true })
    mockListsGetAll.mockResolvedValue(mockContactLists)
    mockListWorkflows.mockResolvedValue([])
  })

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  describe('carregamento de dados', () => {
    it('deve carregar contatos', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.contacts).toEqual(mockContacts)
      expect(result.current.totalFiltered).toBe(3)
    })

    it('deve carregar stats', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.stats).toEqual(mockContactStats)
      })
    })

    it('deve carregar tags', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.tags).toEqual(mockTags)
      })
    })

    it('deve carregar custom fields', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.customFields).toEqual(mockCustomFields)
      })
    })

    it('deve aceitar initialData', () => {
      const initial = {
        contacts: mockContacts,
        total: 3,
        stats: { total: 100, active: 80, optOut: 20 },
        tags: mockTags,
        customFields: mockCustomFields,
      }

      const { result } = renderHookWithProviders(
        () => useContactsController(initial)
      )

      expect(result.current.contacts).toEqual(mockContacts)
      expect(result.current.isLoading).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------

  describe('filtros', () => {
    it('deve ter valores padrão', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      expect(result.current.searchTerm).toBe('')
      expect(result.current.statusFilter).toBe('ALL')
      expect(result.current.tagFilter).toBe('ALL')
      expect(result.current.currentPage).toBe(1)
    })

    it('deve atualizar busca e resetar página', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setCurrentPage(3)
      })

      act(() => {
        result.current.setSearchTerm('João')
      })

      expect(result.current.searchTerm).toBe('João')
      expect(result.current.currentPage).toBe(1)
    })

    it('deve atualizar filtro de status e resetar página', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setStatusFilter(ContactStatus.OPT_IN)
      })

      expect(result.current.statusFilter).toBe(ContactStatus.OPT_IN)
      expect(result.current.currentPage).toBe(1)
    })

    it('deve atualizar filtro de tag e resetar página', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setTagFilter('vip')
      })

      expect(result.current.tagFilter).toBe('vip')
      expect(result.current.currentPage).toBe(1)
    })

    it('deve atualizar filtro multi-tag e resetar página', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setCurrentPage(3)
      })

      act(() => {
        result.current.setTagsFilter(['vip', 'lead'])
      })

      expect(result.current.tagsFilter).toEqual(['vip', 'lead'])
      expect(result.current.tagFilter).toBe('vip') // espelho legado
      expect(result.current.currentPage).toBe(1)
      expect(result.current.hasActiveFilters).toBe(true)
    })

    it('deve enviar tags + tagMatch para o service', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setTagsFilter(['vip', 'lead'])
      })
      act(() => {
        result.current.setTagMatch('all')
      })

      await waitFor(() => {
        const lastCall = mockList.mock.calls.at(-1)?.[0]
        expect(lastCall.tags).toEqual(['vip', 'lead'])
        expect(lastCall.tagMatch).toBe('all')
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Listas salvas (smart lists)
  // ---------------------------------------------------------------------------

  describe('listas salvas', () => {
    it('deve carregar listas salvas', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.contactLists).toEqual(mockContactLists)
      })
    })

    it('deve aplicar filtros ao selecionar lista', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.contactLists.length).toBe(1)
      })

      act(() => {
        result.current.onSelectList('list-1')
      })

      expect(result.current.selectedListId).toBe('list-1')
      expect(result.current.tagsFilter).toEqual(['vip', 'lead'])
      expect(result.current.tagMatch).toBe('all')
      expect(result.current.isListDirty).toBe(false)
    })

    it('deve marcar lista como editada quando filtros divergem', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.contactLists.length).toBe(1)
      })

      act(() => {
        result.current.onSelectList('list-1')
      })

      act(() => {
        result.current.setSearchTerm('João')
      })

      expect(result.current.isListDirty).toBe(true)
    })

    it('deve salvar lista com os filtros atuais', async () => {
      mockListCreate.mockResolvedValue({
        id: 'list-2',
        name: 'Nova',
        filters: { tags: ['vip'], tagMatch: 'any' },
        createdAt: '2026-07-09T00:00:00Z',
      })

      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setTagsFilter(['vip'])
      })

      await act(async () => {
        result.current.onSaveList('Nova')
      })

      await waitFor(() => {
        expect(mockListCreate).toHaveBeenCalledWith({
          name: 'Nova',
          filters: { tags: ['vip'], tagMatch: 'any' },
        })
      })
    })

    it('deve desmarcar lista selecionada ao excluir', async () => {
      mockListDelete.mockResolvedValue(undefined)

      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.contactLists.length).toBe(1)
      })

      act(() => {
        result.current.onSelectList('list-1')
      })

      await act(async () => {
        result.current.onDeleteList('list-1')
      })

      await waitFor(() => {
        expect(result.current.selectedListId).toBeNull()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Adicionar ao workflow
  // ---------------------------------------------------------------------------

  describe('adicionar ao workflow', () => {
    it('deve ignorar enroll sem seleção', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onEnrollInWorkflow('wf-1')
      })

      expect(mockEnroll).not.toHaveBeenCalled()
    })

    it('deve expor apenas workflows publicados', async () => {
      mockListWorkflows.mockResolvedValue([
        { id: 'wf-1', name: 'Publicado', status: 'published' },
        { id: 'wf-2', name: 'Rascunho', status: 'draft' },
      ])

      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setIsAddToWorkflowModalOpen(true)
      })

      await waitFor(() => {
        expect(result.current.publishedWorkflows).toEqual([
          { id: 'wf-1', name: 'Publicado', status: 'published' },
        ])
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  describe('paginação', () => {
    it('deve calcular totalPages', async () => {
      mockList.mockResolvedValue({ data: mockContacts, total: 25 })

      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 25 items / 10 per page = 3 pages
      expect(result.current.totalPages).toBe(3)
    })

    it('deve ter totalPages mínimo 1', async () => {
      mockList.mockResolvedValue({ data: [], total: 0 })

      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.totalPages).toBe(1)
    })

    it('deve expor itemsPerPage', () => {
      const { result } = renderHookWithProviders(() => useContactsController())
      expect(result.current.itemsPerPage).toBe(10)
    })
  })

  // ---------------------------------------------------------------------------
  // Modals
  // ---------------------------------------------------------------------------

  describe('modais', () => {
    it('deve iniciar com modais fechados', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      expect(result.current.isAddModalOpen).toBe(false)
      expect(result.current.isImportModalOpen).toBe(false)
      expect(result.current.isEditModalOpen).toBe(false)
      expect(result.current.isDeleteModalOpen).toBe(false)
    })

    it('deve abrir modal de adicionar', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setIsAddModalOpen(true)
      })

      expect(result.current.isAddModalOpen).toBe(true)
    })

    it('deve abrir modal de importação', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.setIsImportModalOpen(true)
      })

      expect(result.current.isImportModalOpen).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  describe('seleção', () => {
    it('deve iniciar sem seleção', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      expect(result.current.selectedIds.size).toBe(0)
      expect(result.current.isAllSelected).toBe(false)
      expect(result.current.isSomeSelected).toBe(false)
    })

    it('deve ter funções de seleção', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      expect(typeof result.current.toggleSelect).toBe('function')
      expect(typeof result.current.toggleSelectAll).toBe('function')
      expect(typeof result.current.clearSelection).toBe('function')
    })
  })

  // ---------------------------------------------------------------------------
  // Add Contact
  // ---------------------------------------------------------------------------

  describe('adicionar contato', () => {
    it('deve validar telefone antes de adicionar', async () => {
      mockValidatePhone.mockReturnValue({ isValid: false, error: 'Número inválido' })

      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onAddContact({
          name: 'Novo',
          phone: 'invalid',
          tags: '',
        })
      })

      expect(mockAdd).not.toHaveBeenCalled()
    })

    it('deve rejeitar contato sem telefone', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onAddContact({
          name: 'Novo',
          phone: '',
          tags: '',
        })
      })

      expect(mockAdd).not.toHaveBeenCalled()
    })

    it('deve adicionar contato válido', async () => {
      mockAdd.mockResolvedValue(buildContact({ name: 'Novo' }))
      mockValidatePhone.mockReturnValue({ isValid: true })

      const { result } = renderHookWithProviders(() => useContactsController())

      await act(async () => {
        result.current.onAddContact({
          name: 'Novo',
          phone: '+5511999999999',
          tags: 'vip,lead',
        })
      })

      await waitFor(() => {
        expect(mockAdd).toHaveBeenCalled()
      })

      const callArg = mockAdd.mock.calls[0][0]
      expect(callArg.name).toBe('Novo')
      expect(callArg.phone).toBe('+5511999999999')
      expect(callArg.tags).toEqual(['vip', 'lead'])
    })
  })

  // ---------------------------------------------------------------------------
  // Delete Contact
  // ---------------------------------------------------------------------------

  describe('excluir contato', () => {
    it('deve abrir modal de delete ao clicar', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onDeleteClick('contact-1')
      })

      expect(result.current.isDeleteModalOpen).toBe(true)
      expect(result.current.deleteTarget).toEqual({ type: 'single', id: 'contact-1' })
    })

    it('deve cancelar delete', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onDeleteClick('contact-1')
      })

      act(() => {
        result.current.onCancelDelete()
      })

      expect(result.current.isDeleteModalOpen).toBe(false)
      expect(result.current.deleteTarget).toBeNull()
    })

    it('deve confirmar delete single', async () => {
      mockDeleteContact.mockResolvedValue(undefined)

      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onDeleteClick('contact-1')
      })

      await act(async () => {
        result.current.onConfirmDelete()
      })

      expect(mockDeleteContact.mock.calls[0][0]).toBe('contact-1')
    })
  })

  // ---------------------------------------------------------------------------
  // Bulk Delete
  // ---------------------------------------------------------------------------

  describe('excluir em massa', () => {
    it('deve ignorar bulk delete sem seleção', () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      act(() => {
        result.current.onBulkDeleteClick()
      })

      expect(result.current.isDeleteModalOpen).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Return Shape
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('deve retornar todas as propriedades esperadas', async () => {
      const { result } = renderHookWithProviders(() => useContactsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Data
      expect(result.current).toHaveProperty('contacts')
      expect(result.current).toHaveProperty('stats')
      expect(result.current).toHaveProperty('tags')
      expect(result.current).toHaveProperty('customFields')

      // Filters
      expect(result.current).toHaveProperty('searchTerm')
      expect(result.current).toHaveProperty('statusFilter')
      expect(result.current).toHaveProperty('tagFilter')

      // Pagination
      expect(result.current).toHaveProperty('currentPage')
      expect(result.current).toHaveProperty('totalPages')
      expect(result.current).toHaveProperty('totalFiltered')

      // Selection
      expect(result.current).toHaveProperty('selectedIds')
      expect(result.current).toHaveProperty('toggleSelect')
      expect(result.current).toHaveProperty('toggleSelectAll')

      // Modals
      expect(result.current).toHaveProperty('isAddModalOpen')
      expect(result.current).toHaveProperty('isImportModalOpen')
      expect(result.current).toHaveProperty('isEditModalOpen')
      expect(result.current).toHaveProperty('isDeleteModalOpen')

      // Actions
      expect(result.current).toHaveProperty('onAddContact')
      expect(result.current).toHaveProperty('onEditContact')
      expect(result.current).toHaveProperty('onUpdateContact')
      expect(result.current).toHaveProperty('onDeleteClick')
      expect(result.current).toHaveProperty('onBulkDeleteClick')
      expect(result.current).toHaveProperty('onConfirmDelete')
      expect(result.current).toHaveProperty('onCancelDelete')
      expect(result.current).toHaveProperty('onImport')
      expect(result.current).toHaveProperty('onImportFile')

      // Loading
      expect(result.current).toHaveProperty('isImporting')
      expect(result.current).toHaveProperty('isDeleting')
    })
  })
})

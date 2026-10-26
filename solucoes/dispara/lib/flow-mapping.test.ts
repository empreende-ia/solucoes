import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { applyFlowMappingToContact } from './flow-mapping'

// Mock do Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

// Helper para criar mock do query builder do Supabase
function createMockQueryBuilder(options: {
  selectData?: unknown
  selectError?: Error | null
  updateData?: unknown
  updateError?: Error | null
} = {}) {
  const mockLimit = vi.fn()
  const mockEq = vi.fn()
  const mockSelect = vi.fn()
  const mockUpdate = vi.fn()

  // Chain: from().select().eq().limit()
  mockLimit.mockReturnValue({
    data: options.selectData ?? null,
    error: options.selectError ?? null,
  })

  mockEq.mockReturnValue({ limit: mockLimit })
  mockSelect.mockReturnValue({ eq: mockEq })

  // Chain: from().update().eq().select().limit()
  const updateMockLimit = vi.fn().mockReturnValue({
    data: options.updateData ?? null,
    error: options.updateError ?? null,
  })
  const updateMockSelect = vi.fn().mockReturnValue({ limit: updateMockLimit })
  const updateMockEq = vi.fn().mockReturnValue({ select: updateMockSelect })
  mockUpdate.mockReturnValue({ eq: updateMockEq })

  return {
    select: mockSelect,
    update: mockUpdate,
  }
}

describe('applyFlowMappingToContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validacao de entrada', () => {
    it('retorna updated: false quando responseJson nao e um objeto', async () => {
      const testCases = [
        null,
        undefined,
        'string',
        123,
        [],
        true,
      ]

      for (const responseJson of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson,
          mapping: { contact: { nameField: 'name' } },
        })

        expect(result).toEqual({ updated: false, mappedData: {} })
      }
    })

    it('retorna updated: false quando mapping nao e um objeto', async () => {
      const testCases = [
        null,
        undefined,
        'string',
        123,
        [],
        true,
      ]

      for (const mapping of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { name: 'John' },
          mapping,
        })

        expect(result).toEqual({ updated: false, mappedData: {} })
      }
    })
  })

  describe('mapeamento de campos de contato (name e email)', () => {
    it('extrai name quando nameField esta configurado e valor existe no response', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { nome_completo: 'Maria Silva' },
        mapping: { contact: { nameField: 'nome_completo' } },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.name).toBe('Maria Silva')
    })

    it('extrai email quando emailField esta configurado e valor existe no response', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { user_email: 'maria@example.com' },
        mapping: { contact: { emailField: 'user_email' } },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.email).toBe('maria@example.com')
    })

    it('extrai name e email simultaneamente', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: {
          full_name: 'Joao Santos',
          email_address: 'joao@test.com',
        },
        mapping: {
          contact: {
            nameField: 'full_name',
            emailField: 'email_address',
          },
        },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.name).toBe('Joao Santos')
      expect(result.mappedData.email).toBe('joao@test.com')
    })

    it('faz trim de espacos em valores de name e email', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: {
          name: '  Ana Costa  ',
          email: '  ana@test.com  ',
        },
        mapping: {
          contact: {
            nameField: 'name',
            emailField: 'email',
          },
        },
      })

      expect(result.mappedData.name).toBe('Ana Costa')
      expect(result.mappedData.email).toBe('ana@test.com')
    })

    it('ignora valores vazios ou apenas espacos para name e email', async () => {
      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: {
          name: '   ',
          email: '',
        },
        mapping: {
          contact: {
            nameField: 'name',
            emailField: 'email',
          },
        },
      })

      expect(result.updated).toBe(false)
      expect(result.mappedData).toEqual({})
    })

    it('ignora valores nao-string para name e email', async () => {
      const testCases = [
        { name: 123, email: true },
        { name: [], email: {} },
        { name: null, email: undefined },
      ]

      for (const responseJson of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson,
          mapping: {
            contact: {
              nameField: 'name',
              emailField: 'email',
            },
          },
        })

        expect(result.updated).toBe(false)
        expect(result.mappedData).toEqual({})
      }
    })
  })

  describe('mapeamento de customFields', () => {
    it('mapeia custom fields corretamente', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: {
          cpf_field: '123.456.789-00',
          data_nascimento: '1990-01-15',
        },
        mapping: {
          customFields: {
            cpf: 'cpf_field',
            birthdate: 'data_nascimento',
          },
        },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.custom_fields).toEqual({
        cpf: '123.456.789-00',
        birthdate: '1990-01-15',
      })
    })

    it('ignora custom fields quando flowField nao e string', async () => {
      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { some_field: 'value' },
        mapping: {
          customFields: {
            field1: 123,
            field2: null,
            field3: undefined,
            field4: {},
          },
        },
      })

      expect(result.updated).toBe(false)
      expect(result.mappedData).toEqual({})
    })

    it('ignora custom fields quando valor no response e undefined', async () => {
      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { existing_field: 'value' },
        mapping: {
          customFields: {
            myField: 'non_existing_field',
          },
        },
      })

      expect(result.updated).toBe(false)
      expect(result.mappedData).toEqual({})
    })

    it('aceita valores nao-string em custom fields (arrays, objetos, numeros)', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: {
          idade: 30,
          interesses: ['tech', 'music'],
          dados: { cidade: 'SP', estado: 'SP' },
          ativo: true,
          valor_nulo: null,
        },
        mapping: {
          customFields: {
            age: 'idade',
            interests: 'interesses',
            extra_data: 'dados',
            is_active: 'ativo',
            null_value: 'valor_nulo',
          },
        },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.custom_fields).toEqual({
        age: 30,
        interests: ['tech', 'music'],
        extra_data: { cidade: 'SP', estado: 'SP' },
        is_active: true,
        null_value: null,
      })
    })

    it('faz merge de custom_fields existentes com novos valores', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{
          id: 'contact-1',
          custom_fields: {
            existing_field: 'old_value',
            untouched_field: 'keep_this',
          }
        }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { new_data: 'new_value' },
        mapping: {
          customFields: {
            existing_field: 'new_data',
          },
        },
      })

      expect(result.updated).toBe(true)
      // O mappedData deve conter apenas os novos custom_fields mapeados
      expect(result.mappedData.custom_fields).toEqual({
        existing_field: 'new_value',
      })
    })
  })

  describe('integracao com Supabase', () => {
    it('retorna updated: false quando contato nao existe no banco', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { name: 'Test User' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(false)
    })

    it('retorna updated: false quando select retorna null', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: null,
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { name: 'Test User' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(false)
    })

    it('lanca erro quando select falha', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectError: new Error('Database connection failed'),
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      await expect(
        applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { name: 'Test User' },
          mapping: { contact: { nameField: 'name' } },
        })
      ).rejects.toThrow('Database connection failed')
    })

    it('lanca erro quando update falha', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateError: new Error('Update failed'),
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      await expect(
        applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { name: 'Test User' },
          mapping: { contact: { nameField: 'name' } },
        })
      ).rejects.toThrow('Update failed')
    })

    it('retorna updated: true quando update retorna dados como array', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { name: 'Test User' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(true)
    })

    it('retorna updated: false quando update retorna array vazio', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { name: 'Test User' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(false)
    })

    it('retorna updated: true quando update retorna objeto unico (nao array)', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: { id: 'contact-1' }, // objeto, nao array
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { name: 'Test User' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(true)
    })
  })

  describe('casos de borda do mapping.contact', () => {
    it('trata mapping.contact nao sendo objeto', async () => {
      const testCases = [
        { contact: null },
        { contact: 'string' },
        { contact: 123 },
        { contact: [] },
      ]

      for (const mapping of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { name: 'Test' },
          mapping,
        })

        expect(result.updated).toBe(false)
        expect(result.mappedData).toEqual({})
      }
    })

    it('trata nameField nao sendo string', async () => {
      const testCases = [
        { contact: { nameField: 123 } },
        { contact: { nameField: null } },
        { contact: { nameField: {} } },
        { contact: { nameField: [] } },
      ]

      for (const mapping of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { name: 'Test' },
          mapping,
        })

        expect(result.updated).toBe(false)
        expect(result.mappedData).toEqual({})
      }
    })

    it('trata emailField nao sendo string', async () => {
      const testCases = [
        { contact: { emailField: 123 } },
        { contact: { emailField: null } },
        { contact: { emailField: {} } },
        { contact: { emailField: [] } },
      ]

      for (const mapping of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { email: 'test@test.com' },
          mapping,
        })

        expect(result.updated).toBe(false)
        expect(result.mappedData).toEqual({})
      }
    })
  })

  describe('casos de borda do mapping.customFields', () => {
    it('trata mapping.customFields nao sendo objeto', async () => {
      const testCases = [
        { customFields: null },
        { customFields: 'string' },
        { customFields: 123 },
        { customFields: [] },
      ]

      for (const mapping of testCases) {
        const result = await applyFlowMappingToContact({
          normalizedPhone: '+5511999999999',
          flowId: 'flow-123',
          responseJson: { field: 'value' },
          mapping,
        })

        expect(result.updated).toBe(false)
        expect(result.mappedData).toEqual({})
      }
    })

    it('trata customFields vazio', async () => {
      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { field: 'value' },
        mapping: { customFields: {} },
      })

      expect(result.updated).toBe(false)
      expect(result.mappedData).toEqual({})
    })
  })

  describe('cenarios combinados', () => {
    it('mapeia name, email e custom fields simultaneamente', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: { old: 'value' } }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: {
          user_name: 'Carlos Mendes',
          user_email: 'carlos@example.com',
          user_phone: '+5511888888888',
          user_city: 'Rio de Janeiro',
        },
        mapping: {
          contact: {
            nameField: 'user_name',
            emailField: 'user_email',
          },
          customFields: {
            phone_secondary: 'user_phone',
            city: 'user_city',
          },
        },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData).toEqual({
        name: 'Carlos Mendes',
        email: 'carlos@example.com',
        custom_fields: {
          phone_secondary: '+5511888888888',
          city: 'Rio de Janeiro',
        },
      })
    })

    it('funciona apenas com custom fields quando contact nao esta configurado', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { score: 85 },
        mapping: {
          customFields: {
            user_score: 'score',
          },
        },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData).toEqual({
        custom_fields: {
          user_score: 85,
        },
      })
    })

    it('funciona apenas com contact quando customFields nao esta configurado', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { first_name: 'Ana' },
        mapping: {
          contact: {
            nameField: 'first_name',
          },
        },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData).toEqual({
        name: 'Ana',
      })
    })
  })

  describe('tratamento de flowId', () => {
    it('aceita flowId como null', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: null,
        responseJson: { name: 'Test' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(true)
    })

    it('aceita flowId como string', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: {} }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-abc-123',
        responseJson: { name: 'Test' },
        mapping: { contact: { nameField: 'name' } },
      })

      expect(result.updated).toBe(true)
    })
  })

  describe('tratamento de custom_fields existentes no banco', () => {
    it('trata custom_fields existentes como null', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: null }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { data: 'value' },
        mapping: { customFields: { field: 'data' } },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.custom_fields).toEqual({ field: 'value' })
    })

    it('trata custom_fields existentes como array (invalido)', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: ['invalid'] }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { data: 'value' },
        mapping: { customFields: { field: 'data' } },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.custom_fields).toEqual({ field: 'value' })
    })

    it('trata custom_fields existentes como string (invalido)', async () => {
      const mockBuilder = createMockQueryBuilder({
        selectData: [{ id: 'contact-1', custom_fields: 'invalid' }],
        updateData: [{ id: 'contact-1' }],
      })
      vi.mocked(supabase.from).mockReturnValue(mockBuilder as any)

      const result = await applyFlowMappingToContact({
        normalizedPhone: '+5511999999999',
        flowId: 'flow-123',
        responseJson: { data: 'value' },
        mapping: { customFields: { field: 'data' } },
      })

      expect(result.updated).toBe(true)
      expect(result.mappedData.custom_fields).toEqual({ field: 'value' })
    })
  })
})

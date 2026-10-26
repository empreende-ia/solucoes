import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  verifyApiKey,
  verifyAdminAccess,
  unauthorizedResponse,
  forbiddenResponse,
  generateApiKey,
} from './auth'

// Helper: cria um NextRequest fake com headers
function createFakeRequest(headers: Record<string, string> = {}, url = 'http://localhost:3000/api/test'): any {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    nextUrl: {
      pathname: new URL(url).pathname,
    },
  }
}

describe('auth', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    // Copia env original e configura chaves de teste
    process.env = {
      ...ORIGINAL_ENV,
      DISPARA_API_KEY: 'test-api-key-123',
      DISPARA_ADMIN_KEY: 'test-admin-key-456',
    }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  // ============================================================
  // verifyApiKey
  // ============================================================
  describe('verifyApiKey', () => {
    it('deve rejeitar requisicao sem header de autenticacao', async () => {
      const req = createFakeRequest({})
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Missing API key')
    })

    it('deve aceitar API key via Authorization Bearer', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-api-key-123',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('api')
    })

    it('deve aceitar API key via X-API-Key header', async () => {
      const req = createFakeRequest({
        'x-api-key': 'test-api-key-123',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('api')
    })

    it('deve aceitar admin key via Authorization Bearer', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-admin-key-456',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve aceitar admin key via X-API-Key header', async () => {
      const req = createFakeRequest({
        'x-api-key': 'test-admin-key-456',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve rejeitar chave invalida', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer chave-errada',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid API key')
    })

    it('deve rejeitar prefixo/extensão da chave (comparação exata em tempo constante)', async () => {
      for (const key of ['test-api-key-12', 'test-api-key-1234', 'TEST-API-KEY-123', ' test-api-key-123']) {
        const result = await verifyApiKey(createFakeRequest({ 'x-api-key': key }))
        expect(result.valid, key).toBe(false)
      }
    })

    it('deve rejeitar Authorization sem prefixo Bearer', async () => {
      const req = createFakeRequest({
        authorization: 'test-api-key-123',
      })
      const result = await verifyApiKey(req)

      // Sem "Bearer " o header nao e reconhecido, cai no "Missing API key"
      expect(result.valid).toBe(false)
    })

    it('deve priorizar admin key quando ambas conferem', async () => {
      // Se a mesma chave for configurada como admin E api, admin deve ter prioridade
      process.env.DISPARA_API_KEY = 'same-key'
      process.env.DISPARA_ADMIN_KEY = 'same-key'

      const req = createFakeRequest({
        authorization: 'Bearer same-key',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve rejeitar quando env vars nao estao configuradas', async () => {
      delete process.env.DISPARA_API_KEY
      delete process.env.DISPARA_ADMIN_KEY

      const req = createFakeRequest({
        authorization: 'Bearer qualquer-coisa',
      })
      const result = await verifyApiKey(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid API key')
    })

    it('deve preferir Authorization sobre X-API-Key quando ambos presentes', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-api-key-123',
        'x-api-key': 'chave-errada',
      })
      const result = await verifyApiKey(req)

      // Authorization Bearer e processado primeiro
      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('api')
    })
  })

  // ============================================================
  // verifyAdminAccess
  // ============================================================
  describe('verifyAdminAccess', () => {
    it('deve aceitar admin key', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-admin-key-456',
      })
      const result = await verifyAdminAccess(req)

      expect(result.valid).toBe(true)
      expect(result.keyType).toBe('admin')
    })

    it('deve rejeitar API key regular em endpoint admin', async () => {
      const req = createFakeRequest({
        authorization: 'Bearer test-api-key-123',
      })
      const result = await verifyAdminAccess(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Admin access required')
    })

    it('deve rejeitar requisicao sem autenticacao', async () => {
      const req = createFakeRequest({})
      const result = await verifyAdminAccess(req)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Missing API key')
    })
  })

  // ============================================================
  // unauthorizedResponse
  // ============================================================
  describe('unauthorizedResponse', () => {
    it('deve retornar status 401', () => {
      const response = unauthorizedResponse()
      expect(response.status).toBe(401)
    })

    it('deve incluir header WWW-Authenticate', () => {
      const response = unauthorizedResponse()
      expect(response.headers.get('WWW-Authenticate')).toContain('Bearer')
    })

    it('deve aceitar mensagem customizada', async () => {
      const response = unauthorizedResponse('Token expirado')
      const body = await response.json()
      expect(body.message).toBe('Token expirado')
    })
  })

  // ============================================================
  // forbiddenResponse
  // ============================================================
  describe('forbiddenResponse', () => {
    it('deve retornar status 403', () => {
      const response = forbiddenResponse()
      expect(response.status).toBe(403)
    })

    it('deve aceitar mensagem customizada', async () => {
      const response = forbiddenResponse('Acesso negado')
      const body = await response.json()
      expect(body.message).toBe('Acesso negado')
    })
  })

  // ============================================================
  // generateApiKey
  // ============================================================
  describe('generateApiKey', () => {
    it('deve gerar chave com prefixo dsp_', () => {
      const key = generateApiKey()
      expect(key.startsWith('dsp_')).toBe(true)
    })

    it('deve gerar chaves unicas', () => {
      const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()))
      expect(keys.size).toBe(20)
    })

    it('deve gerar chave com comprimento consistente', () => {
      const key = generateApiKey()
      // dsp_ (4) + 32 chars = 36 total
      expect(key.length).toBe(36)
    })
  })
})

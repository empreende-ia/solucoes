// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { createInMemorySupabase } from '@/tests/helpers/in-memory-supabase'

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: { get: vi.fn(), set: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(),
}))

import {
  META_APP_SECRET_VERIFIED_AT_SETTING,
  META_APP_SECRET_VERIFIED_HASH_SETTING,
  clearStoredMetaAppSecretVerification,
  getStoredMetaAppSecret,
  getStoredMetaAppSecretState,
  hashMetaAppSecret,
  markStoredMetaAppSecretVerified,
  validateMetaAppCredentials,
} from '@/lib/meta-app-credentials'
import { getSupabaseAdmin } from '@/lib/supabase'

const mockedGetSupabaseAdmin = vi.mocked(getSupabaseAdmin)

function makeClient(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from }, from, eq }
}

describe('getStoredMetaAppSecret', () => {
  beforeEach(() => {
    mockedGetSupabaseAdmin.mockReset()
  })

  it('lê settings.metaAppSecret (trim)', async () => {
    const { client, from, eq } = makeClient({ data: { value: '  s3cr3t  ' }, error: null })
    mockedGetSupabaseAdmin.mockReturnValue(client as never)

    await expect(getStoredMetaAppSecret()).resolves.toBe('s3cr3t')
    expect(from).toHaveBeenCalledWith('settings')
    expect(eq).toHaveBeenCalledWith('key', 'metaAppSecret')
  })

  it('null quando não há linha ou o valor está vazio', async () => {
    mockedGetSupabaseAdmin.mockReturnValue(makeClient({ data: null, error: null }).client as never)
    await expect(getStoredMetaAppSecret()).resolves.toBeNull()

    mockedGetSupabaseAdmin.mockReturnValue(makeClient({ data: { value: '   ' }, error: null }).client as never)
    await expect(getStoredMetaAppSecret()).resolves.toBeNull()
  })

  it('null quando o Supabase não está configurado', async () => {
    mockedGetSupabaseAdmin.mockReturnValue(null)
    await expect(getStoredMetaAppSecret()).resolves.toBeNull()
  })

  it('lança em erro de leitura (não confunde falha de banco com "não configurado")', async () => {
    mockedGetSupabaseAdmin.mockReturnValue(
      makeClient({ data: null, error: { message: 'connection refused' } }).client as never
    )
    await expect(getStoredMetaAppSecret()).rejects.toThrow('connection refused')
  })
})

describe('estado de verificação do App Secret', () => {
  beforeEach(() => {
    mockedGetSupabaseAdmin.mockReset()
  })

  it('lê secret + hash comprovado numa leitura só (vazio = null)', async () => {
    const db = createInMemorySupabase(
      {
        settings: [
          { key: 'metaAppSecret', value: '  s3cr3t ' },
          { key: META_APP_SECRET_VERIFIED_HASH_SETTING, value: '' },
          { key: 'outra', value: 'x' },
        ],
      },
      { settings: 'key' }
    )
    mockedGetSupabaseAdmin.mockReturnValue(db.client as never)

    await expect(getStoredMetaAppSecretState()).resolves.toEqual({
      secret: 's3cr3t',
      verifiedHash: null,
      verifiedAt: null,
    })
  })

  it('lança em erro de leitura', async () => {
    const db = createInMemorySupabase({}, { settings: 'key' })
    db.failNext('settings', 'connection refused')
    mockedGetSupabaseAdmin.mockReturnValue(db.client as never)
    await expect(getStoredMetaAppSecretState()).rejects.toThrow('connection refused')
  })

  it('marca e zera a verificação (sha256 do secret, nunca o secret)', async () => {
    const db = createInMemorySupabase({ settings: [{ key: 'metaAppSecret', value: 's3cr3t' }] }, { settings: 'key' })
    mockedGetSupabaseAdmin.mockReturnValue(db.client as never)

    const hash = hashMetaAppSecret('s3cr3t')
    expect(hash).toBe(createHash('sha256').update('s3cr3t').digest('hex'))
    await markStoredMetaAppSecretVerified(hash, new Date('2026-10-11T12:00:00Z'))
    await expect(getStoredMetaAppSecretState()).resolves.toEqual({
      secret: 's3cr3t',
      verifiedHash: hash,
      verifiedAt: '2026-10-11T12:00:00.000Z',
    })

    await clearStoredMetaAppSecretVerification()
    await expect(getStoredMetaAppSecretState()).resolves.toMatchObject({ verifiedHash: null, verifiedAt: null })
    expect(db.rows('settings').map((r) => r.key)).toEqual(
      expect.arrayContaining([META_APP_SECRET_VERIFIED_HASH_SETTING, META_APP_SECRET_VERIFIED_AT_SETTING])
    )
  })
})

describe('validateMetaAppCredentials (Graph mockada)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }

  it('par válido: manda o app token no header (nunca na URL)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: '123456' }))
    await expect(validateMetaAppCredentials('123456', 'app-secret')).resolves.toEqual({ status: 'valid' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://graph.facebook.com/v24.0/123456?fields=id')
    expect(String(url)).not.toContain('app-secret')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer 123456|app-secret' })
  })

  it('secret de outro App / Client Token: a Graph recusa → invalid', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { message: 'Invalid OAuth access token signature.', type: 'OAuthException', code: 190 } })
    )
    await expect(validateMetaAppCredentials('123456', 'client-token')).resolves.toMatchObject({
      status: 'invalid',
      graphCode: 190,
    })
  })

  it("placeholder colado junto ('***configured***x') também é recusado pela Graph", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { message: 'Error validating application.', type: 'OAuthException', code: 101 } })
    )
    await expect(validateMetaAppCredentials('123456', '***configured***x')).resolves.toMatchObject({ status: 'invalid' })
  })

  it('App ID não numérico é inválido sem chamar a Graph', async () => {
    await expect(validateMetaAppCredentials('meu-app', 'secret')).resolves.toMatchObject({ status: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Graph fora do ar, 5xx, rate limit ou erro transitório → unavailable (não bloqueia o save)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(validateMetaAppCredentials('123456', 's')).resolves.toMatchObject({ status: 'unavailable' })

    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: { message: 'down', code: 2 } }))
    await expect(validateMetaAppCredentials('123456', 's')).resolves.toMatchObject({ status: 'unavailable' })

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'limit', code: 4 } }))
    await expect(validateMetaAppCredentials('123456', 's')).resolves.toMatchObject({ status: 'unavailable' })

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: { message: 'x', code: 190, is_transient: true } }))
    await expect(validateMetaAppCredentials('123456', 's')).resolves.toMatchObject({ status: 'unavailable' })

    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(validateMetaAppCredentials('123456', 's')).resolves.toMatchObject({ status: 'unavailable' })
  })
})

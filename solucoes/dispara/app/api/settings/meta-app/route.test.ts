// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createInMemorySupabase, type InMemorySupabase } from '@/tests/helpers/in-memory-supabase'

/**
 * POST /api/settings/meta-app: o par App ID + App Secret é conferido na Graph antes
 * de gravar (Graph mockada), e trocar/apagar o secret zera a verificação de assinatura.
 */

const holder = vi.hoisted(() => ({ db: null as null | { client: { from: (t: string) => any } } }))

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => holder.db?.client ?? null),
  isSupabaseConfigured: vi.fn(() => true),
}))
vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(async (key: string) => {
      const { data } = await holder.db!.client.from('settings').select('value').eq('key', key).maybeSingle()
      return (data as { value?: string } | null)?.value ?? null
    }),
    set: vi.fn(async (key: string, value: string) => {
      await holder.db!.client.from('settings').upsert({ key, value }, { onConflict: 'key' })
    }),
  },
}))

import { DELETE, POST } from '@/app/api/settings/meta-app/route'
import {
  META_APP_SECRET_VERIFIED_AT_SETTING,
  META_APP_SECRET_VERIFIED_HASH_SETTING,
} from '@/lib/meta-app-credentials'
import {
  META_APP_SECRET_MISSING_ALERT_ID,
  evaluateMetaSignature,
  reportMetaSignatureFailure,
  resetMetaSignatureState,
} from '@/lib/meta-webhook-signature'

let db: InMemorySupabase
const fetchMock = vi.fn()

function sha256(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('hex')
}

function setting(key: string): string | undefined {
  return db.rows('settings').find((r) => r.key === key)?.value as string | undefined
}

function save(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new NextRequest('https://dispara.test/api/settings/meta-app', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  )
}

function graph(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  resetMetaSignatureState()
  db = createInMemorySupabase(
    {
      settings: [
        { key: 'metaAppSecret', value: 'secret-antigo' },
        { key: META_APP_SECRET_VERIFIED_HASH_SETTING, value: sha256('secret-antigo') },
        { key: META_APP_SECRET_VERIFIED_AT_SETTING, value: '2026-10-01T00:00:00.000Z' },
      ],
      account_alerts: [{ id: META_APP_SECRET_MISSING_ALERT_ID, type: 'meta_integration', dismissed: false }],
    },
    { settings: 'key' }
  )
  holder.db = db
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/settings/meta-app', () => {
  it('CENÁRIO DO ACHADO: secret que não confere, com OUTRO secret já salvo → 400 e NADA é gravado (sem par divergente)', async () => {
    fetchMock.mockResolvedValue(
      graph(400, { error: { message: 'Invalid OAuth access token signature.', type: 'OAuthException', code: 190 } })
    )

    const res = await save({ appId: '123456', appSecret: 'client-token-colado' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/App Secret não confere com o App ID/)
    expect(json.error).toMatch(/Nada foi salvo/)
    expect(json.code).toBe('invalid_app_secret')
    expect(json.appIdSaved).toBe(false)
    expect(JSON.stringify(json)).not.toContain('client-token-colado')

    expect(setting('metaAppSecret')).toBe('secret-antigo')
    expect(setting('metaAppId')).toBeUndefined()
    // A verificação do secret antigo continua intacta.
    expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe(sha256('secret-antigo'))
  })

  it('CENÁRIO DO ACHADO (onboarding): secret recusado sem secret salvo → o App ID é gravado mesmo assim (upload de mídia depende só dele)', async () => {
    db = createInMemorySupabase({ settings: [] }, { settings: 'key' })
    holder.db = db
    fetchMock.mockResolvedValue(
      graph(400, { error: { message: 'Invalid OAuth access token signature.', type: 'OAuthException', code: 190 } })
    )

    const res = await save({ appId: '123456', appSecret: 'client-token-colado' })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toMatchObject({ code: 'invalid_app_secret', appIdSaved: true })
    expect(json.error).toMatch(/App ID foi salvo/)
    expect(json.error).toMatch(/App Secret não confere/)
    expect(JSON.stringify(json)).not.toContain('client-token-colado')

    expect(setting('metaAppId')).toBe('123456')
    expect(setting('metaAppSecret')).toBeUndefined()
  })

  it('secret recusado para o MESMO App ID já salvo → mantém o par atual e informa que o App ID está salvo', async () => {
    db = createInMemorySupabase(
      {
        settings: [
          { key: 'metaAppId', value: '123456' },
          { key: 'metaAppSecret', value: 'secret-antigo' },
        ],
      },
      { settings: 'key' }
    )
    holder.db = db
    fetchMock.mockResolvedValue(graph(400, { error: { message: 'Error validating application.', code: 101 } }))

    const res = await save({ appId: '123456', appSecret: 'secret-com-typo' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'invalid_app_secret', appIdSaved: true })
    expect(setting('metaAppId')).toBe('123456')
    expect(setting('metaAppSecret')).toBe('secret-antigo')
  })

  it('App ID não numérico com secret → 400 invalid_app_id e nada gravado', async () => {
    db = createInMemorySupabase({ settings: [] }, { settings: 'key' })
    holder.db = db

    const res = await save({ appId: 'meu-app', appSecret: 'x' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'invalid_app_id', appIdSaved: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(setting('metaAppId')).toBeUndefined()
  })

  it('secret válido na Graph: grava, zera a verificação anterior e fica pending_verification', async () => {
    fetchMock.mockResolvedValue(graph(200, { id: '123456' }))

    const res = await save({ appId: '123456', appSecret: 'secret-novo' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: true,
      appSecretValidation: 'valid',
      signatureVerification: 'pending_verification',
      hasAppSecret: true,
    })
    expect(setting('metaAppSecret')).toBe('secret-novo')
    expect(setting('metaAppId')).toBe('123456')
    expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe('')
    expect(setting(META_APP_SECRET_VERIFIED_AT_SETTING)).toBe('')
    // O aviso "App Secret ausente" deixa de valer: a linha é apagada (não só dispensada).
    expect(db.rows('account_alerts').filter((a) => a.id === META_APP_SECRET_MISSING_ALERT_ID)).toEqual([])
  })

  it('CENÁRIO DO ACHADO: salvar o secret e depois removê-lo (DELETE) faz o aviso "App Secret ausente" voltar', async () => {
    vi.stubEnv('META_APP_SECRET', '')
    vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', '')
    fetchMock.mockResolvedValue(graph(200, { id: '123456' }))

    expect((await save({ appId: '123456', appSecret: 'secret-novo' })).status).toBe(200)
    expect((await DELETE()).status).toBe(200)

    // Webhook volta a aceitar sem assinatura → o aviso persistente precisa reaparecer.
    const evaluation = await evaluateMetaSignature('{}', null)
    expect(evaluation).toMatchObject({ mode: 'unsigned_allowed', reason: 'no_app_secret' })
    await reportMetaSignatureFailure({ evaluation, endpoint: 'webhook' })
    const active = db.rows('account_alerts').filter((a) => a.id === META_APP_SECRET_MISSING_ALERT_ID && a.dismissed === false)
    expect(active).toHaveLength(1)
  })

  it('reenviar o MESMO secret já comprovado (o form reenvia ao salvar) mantém a verificação', async () => {
    fetchMock.mockResolvedValue(graph(200, { id: '123456' }))
    const res = await save({ appId: '123456', appSecret: 'secret-antigo' })
    expect(res.status).toBe(200)
    expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe(sha256('secret-antigo'))
  })

  it('Graph fora do ar: grava assim mesmo, com aviso, em verificação (report_only)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const res = await save({ appId: '123456', appSecret: 'secret-novo' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, appSecretValidation: 'unavailable', signatureVerification: 'pending_verification' })
    expect(json.warning).toMatch(/Não foi possível validar/)
    expect(setting('metaAppSecret')).toBe('secret-novo')
    expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe('')
  })

  it('só App ID (sem secret): não chama a Graph nem mexe na verificação', async () => {
    const res = await save({ appId: '999' })
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(setting('metaAppId')).toBe('999')
    expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe(sha256('secret-antigo'))
  })

  it('appId ausente → 400', async () => {
    expect((await save({ appSecret: 'x' })).status).toBe(400)
  })
})

describe('DELETE /api/settings/meta-app', () => {
  it('apaga o secret e zera a verificação', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(setting('metaAppSecret')).toBe('')
    expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe('')
  })
})

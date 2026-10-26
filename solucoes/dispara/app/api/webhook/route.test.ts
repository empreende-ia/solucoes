// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

/**
 * /api/webhook (Meta): GET handshake fail-closed e POST com assinatura verificada
 * ANTES de qualquer processamento.
 */

const settings = vi.hoisted(() => new Map<string, string>())
const adminFrom = vi.hoisted(() => ({ fn: null as null | ((table: string) => unknown) }))

// Algumas dependências do pipeline importam 'server-only' (só existe no bundle do Next).
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(async (key: string) => settings.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      settings.set(key, value)
    }),
  },
}))
vi.mock('@/lib/supabase', () => {
  const client = {
    from: vi.fn((table: string) => {
      if (adminFrom.fn) return adminFrom.fn(table)
      throw new Error(`unexpected table access: ${table}`)
    }),
  }
  return {
    getSupabaseAdmin: vi.fn(() => client),
    supabase: { from: client.from, rpc: vi.fn() },
    isSupabaseConfigured: vi.fn(() => true),
  }
})
vi.mock('@/lib/meta-app-credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta-app-credentials')>()
  return {
    ...actual,
    getStoredMetaAppSecretState: vi.fn(async () => ({ secret: null, verifiedHash: null, verifiedAt: null })),
    markStoredMetaAppSecretVerified: vi.fn(async () => {}),
  }
})
vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(async () => null),
}))

import { GET, POST } from '@/app/api/webhook/route'
import { getStoredMetaAppSecretState, hashMetaAppSecret } from '@/lib/meta-app-credentials'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { resetMetaSignatureState } from '@/lib/meta-webhook-signature'
import { resetWebhookOriginState } from '@/lib/meta-webhook-origin'
import { createInMemorySupabase } from '@/tests/helpers/in-memory-supabase'

const APP_SECRET = 'webhook-app-secret'
const NON_WABA_BODY = JSON.stringify({ object: 'page', entry: [] })

/** Secret salvo pela UI (settings); `verified` = já comprovado por assinatura válida. */
function storeSecret(secret: string, verified = false) {
  vi.mocked(getStoredMetaAppSecretState).mockResolvedValue({
    secret,
    verifiedHash: verified ? hashMetaAppSecret(secret) : null,
    verifiedAt: verified ? '2026-10-01T00:00:00.000Z' : null,
  })
}

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

function verifyRequest(params: Record<string, string>): NextRequest {
  const url = new URL('https://dispara.test/api/webhook')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function postRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://dispara.test/api/webhook', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

beforeEach(() => {
  resetMetaSignatureState()
  resetWebhookOriginState()
  settings.clear()
  adminFrom.fn = null
  vi.mocked(getSupabaseAdmin).mockClear()
  vi.mocked(getStoredMetaAppSecretState).mockReset()
  vi.mocked(getStoredMetaAppSecretState).mockResolvedValue({ secret: null, verifiedHash: null, verifiedAt: null })
  vi.mocked(getWhatsAppCredentials).mockReset()
  vi.mocked(getWhatsAppCredentials).mockResolvedValue(null)
  vi.stubEnv('META_APP_SECRET', '')
  vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', '')
  vi.stubEnv('WEBHOOK_VERIFY_TOKEN', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/webhook (verify token)', () => {
  it('fail-closed sem verify token configurado: o sentinela nunca casa', async () => {
    for (const sentinel of ['token-not-found-readonly', 'error-retrieving-token', '']) {
      const res = await GET(
        verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': sentinel, 'hub.challenge': 'abc' })
      )
      expect(res.status).toBe(403)
    }
  })

  it('não gera token novo no handshake (readonly)', async () => {
    await GET(verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': 'abc' }))
    expect(settings.has('webhook_verify_token')).toBe(false)
  })

  it('token correto devolve o challenge', async () => {
    settings.set('webhook_verify_token', 'verify-123')
    const res = await GET(
      verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-123', 'hub.challenge': 'abc' })
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('abc')
  })

  it('token errado, ausente ou mode diferente → 403', async () => {
    settings.set('webhook_verify_token', 'verify-123')
    const wrong = await GET(verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-124' }))
    expect(wrong.status).toBe(403)
    const missing = await GET(verifyRequest({ 'hub.mode': 'subscribe' }))
    expect(missing.status).toBe(403)
    const mode = await GET(verifyRequest({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'verify-123' }))
    expect(mode.status).toBe(403)
  })

  it('aceita o token da env como fallback', async () => {
    vi.stubEnv('WEBHOOK_VERIFY_TOKEN', 'env-verify')
    const res = await GET(
      verifyRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'env-verify', 'hub.challenge': 'ok' })
    )
    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhook (assinatura)', () => {
  it('enforced (env): sem assinatura → 401 sem processar nada', async () => {
    vi.stubEnv('META_APP_SECRET', APP_SECRET)
    const tables: string[] = []
    adminFrom.fn = (table) => {
      tables.push(table)
      const limit = vi.fn().mockResolvedValue({ data: [], error: null })
      return {
        select: () => ({ like: () => ({ eq: () => ({ limit }) }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    const res = await POST(postRequest(JSON.stringify({ object: 'whatsapp_business_account', entry: [] })))
    expect(res.status).toBe(401)
    // Só o account_alert é tocado; nada do pipeline (settings, workflows, inbox...).
    expect(tables.every((t) => t === 'account_alerts')).toBe(true)
    expect(settings.size).toBe(0)
  })

  it('enforced (secret salvo pela UI e já comprovado): assinatura inválida → 401, sem alerta auth', async () => {
    storeSecret(APP_SECRET, true)
    const mem = createInMemorySupabase()
    adminFrom.fn = (table) => mem.client.from(table)

    const res = await POST(postRequest(NON_WABA_BODY, { 'x-hub-signature-256': sign(NON_WABA_BODY, 'outro') }))
    expect(res.status).toBe(401)
    // Uma rejeição isolada (forjável por qualquer um) não vira alerta.
    expect(mem.rows('account_alerts')).toEqual([])
  })

  it('CENÁRIO DO ACHADO: secret errado salvo em Configurações (nunca comprovado) NÃO derruba o inbound', async () => {
    // Antes: 401 para todo POST legítimo da Meta. Agora: report_only (aceita e registra).
    storeSecret('client-token-colado-no-lugar')
    const mem = createInMemorySupabase()
    adminFrom.fn = (table) => mem.client.from(table)

    const res = await POST(postRequest(NON_WABA_BODY, { 'x-hub-signature-256': sign(NON_WABA_BODY, 'secret-real-da-meta') }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored' })
  })

  it('secret de Configurações: a primeira assinatura válida passa a exigir assinatura', async () => {
    storeSecret(APP_SECRET)
    const mem = createInMemorySupabase()
    adminFrom.fn = (table) => mem.client.from(table)

    const ok = await POST(postRequest(NON_WABA_BODY, { 'x-hub-signature-256': sign(NON_WABA_BODY) }))
    expect(ok.status).toBe(200)
    const forged = await POST(postRequest(NON_WABA_BODY, { 'x-hub-signature-256': sign(NON_WABA_BODY, 'forjado') }))
    expect(forged.status).toBe(401)
  })

  it('enforced: assinatura válida segue para o pipeline', async () => {
    vi.stubEnv('META_APP_SECRET', APP_SECRET)
    const res = await POST(postRequest(NON_WABA_BODY, { 'X-Hub-Signature-256': sign(NON_WABA_BODY) }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored' })
  })

  it('unsigned_allowed (sem App Secret): aceita sem assinatura', async () => {
    const res = await POST(postRequest(NON_WABA_BODY))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored' })
  })

  it("META_WEBHOOK_REQUIRE_SIGNATURE='true' sem App Secret → 401", async () => {
    vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'true')
    adminFrom.fn = () => {
      const limit = vi.fn().mockResolvedValue({ data: [], error: null })
      return {
        select: () => ({ like: () => ({ eq: () => ({ limit }) }) }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
    }
    const res = await POST(postRequest(NON_WABA_BODY))
    expect(res.status).toBe(401)
  })

  it('falha ao ler o App Secret → 503 (Meta reentrega), sem processar', async () => {
    vi.mocked(getStoredMetaAppSecretState).mockRejectedValue(new Error('db down'))
    const res = await POST(postRequest(NON_WABA_BODY))
    expect(res.status).toBe(503)
    expect(vi.mocked(getSupabaseAdmin)).not.toHaveBeenCalled()
  })

  it('body vazio com assinatura válida → 400', async () => {
    vi.stubEnv('META_APP_SECRET', APP_SECRET)
    const res = await POST(postRequest('', { 'x-hub-signature-256': sign('') }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/webhook sem assinatura verificada (mitigações)', () => {
  const TEMPLATE_BODY = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'message_template_status_update',
            // Formato lido pelo handler: value.message_template_status_update
            value: {
              message_template_status_update: {
                event: 'REJECTED',
                message_template_id: 'tpl-meta-1',
                message_template_name: 'promo',
                reason: 'x',
              },
            },
          },
        ],
      },
    ],
  })

  function useMemDb() {
    const mem = createInMemorySupabase({
      templates: [{ id: 't1', name: 'promo', meta_id: 'tpl-meta-1', status: 'APPROVED' }],
    })
    adminFrom.fn = (table) => mem.client.from(table)
    return mem
  }

  it('CENÁRIO DO ACHADO: message_template_status_update forjado (unsigned_allowed) é ignorado', async () => {
    const mem = useMemDb()
    const res = await POST(postRequest(TEMPLATE_BODY))
    expect(res.status).toBe(200)
    expect(mem.accessed).not.toContain('templates')
    expect(mem.rows('templates')[0].status).toBe('APPROVED')
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/message_template_status_update ignorado/))
  })

  it('report_only com assinatura que não confere também ignora o status de template', async () => {
    storeSecret(APP_SECRET)
    const mem = useMemDb()
    const res = await POST(postRequest(TEMPLATE_BODY, { 'x-hub-signature-256': sign(TEMPLATE_BODY, 'forjado') }))
    expect(res.status).toBe(200)
    expect(mem.rows('templates')[0].status).toBe('APPROVED')
  })

  it('com assinatura verificada o status de template é aplicado', async () => {
    vi.stubEnv('META_APP_SECRET', APP_SECRET)
    const mem = useMemDb()
    const res = await POST(postRequest(TEMPLATE_BODY, { 'x-hub-signature-256': sign(TEMPLATE_BODY) }))
    expect(res.status).toBe(200)
    expect(mem.rows('templates')[0].status).toBe('REJECTED')
  })

  it('WABA/phone_number_id diferentes das credenciais: loga (mascarado) e processa mesmo assim', async () => {
    vi.mocked(getWhatsAppCredentials).mockResolvedValue({
      businessAccountId: '111111111',
      phoneNumberId: '222222222',
      accessToken: 'tok',
    })
    useMemDb()
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: '999999999', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '888888888' } } }] }],
    })

    const res = await POST(postRequest(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    const warnings = vi.mocked(console.warn).mock.calls.map((c) => String(c[0]))
    expect(warnings.some((w) => w.includes('entry.id') && w.includes('999…999') && w.includes('App Secret'))).toBe(true)
    expect(warnings.some((w) => w.includes('metadata.phone_number_id') && w.includes('888…888'))).toBe(true)
    expect(warnings.join('\n')).not.toContain('999999999')
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHmac,
  publicEncrypt,
  randomBytes,
} from 'node:crypto'
import { NextRequest } from 'next/server'

/**
 * POST /api/flows/endpoint — assinatura antes de decifrar e auto-regeneração das
 * chaves RSA só com assinatura verificada (antes: qualquer POST lixo regenerava
 * e re-registrava as chaves a cada 10 min).
 */

const store = vi.hoisted(() => new Map<string, string>())
const alertsDb = vi.hoisted(() => ({ client: null as null | { from: (t: string) => unknown } }))

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  },
}))
vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(async () => ({ accessToken: 'tok', phoneNumberId: '123' })),
}))
vi.mock('@/lib/meta-flows-api', () => ({
  metaSetEncryptionPublicKey: vi.fn(async () => ({ success: true })),
  metaGetEncryptionPublicKey: vi.fn(async () => ({ publicKey: null, signatureStatus: null })),
}))
vi.mock('@/lib/whatsapp/flow-endpoint-handlers', () => ({
  handleFlowAction: vi.fn(async () => ({ version: '3.0', screen: 'NEXT', data: { ok: true } })),
}))
vi.mock('@/lib/meta-app-credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta-app-credentials')>()
  return {
    ...actual,
    getStoredMetaAppSecretState: vi.fn(async () => ({ secret: null, verifiedHash: null, verifiedAt: null })),
    markStoredMetaAppSecretVerified: vi.fn(async () => {}),
  }
})
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => alertsDb.client),
}))

import { POST } from '@/app/api/flows/endpoint/route'
import { settingsDb } from '@/lib/supabase-db'
import { metaGetEncryptionPublicKey, metaSetEncryptionPublicKey } from '@/lib/meta-flows-api'
import { handleFlowAction } from '@/lib/whatsapp/flow-endpoint-handlers'
import { generateKeyPair } from '@/lib/whatsapp/flow-endpoint-crypto'
import {
  FLOW_KEYS_ALERT_ID_PREFIX,
  FLOW_LAST_KEY_REGEN_SETTING,
  FLOW_LAST_KEY_RESYNC_SETTING,
  FLOW_PRIVATE_KEY_SETTING,
  FLOW_PUBLIC_KEY_SETTING,
  getFlowDecryptFailureSummary,
  isSamePublicKey,
  resetFlowKeyAlertState,
} from '@/lib/whatsapp/flow-endpoint-keys'
import { getStoredMetaAppSecretState } from '@/lib/meta-app-credentials'
import { resetMetaSignatureState } from '@/lib/meta-webhook-signature'
import { createInMemorySupabase, type InMemorySupabase } from '@/tests/helpers/in-memory-supabase'

let mem: InMemorySupabase

function flowAlerts() {
  return mem.rows('account_alerts').filter((r) => String(r.id).startsWith(FLOW_KEYS_ALERT_ID_PREFIX))
}

/** Janela de re-sincronização reivindicada no banco (settings, via getSupabaseAdmin). */
function lastResyncSetting(): string | undefined {
  return mem.rows('settings').find((r) => r.key === FLOW_LAST_KEY_RESYNC_SETTING)?.value as string | undefined
}

const APP_SECRET = 'flows-app-secret'
let keys: { publicKey: string; privateKey: string }

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

function buildEnvelope(publicKey: string, payload: Record<string, unknown>) {
  const aesKey = randomBytes(16)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-128-gcm', aesKey, iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ])
  const encryptedAesKey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey
  )
  return {
    body: JSON.stringify({
      encrypted_flow_data: encrypted.toString('base64'),
      encrypted_aes_key: encryptedAesKey.toString('base64'),
      initial_vector: iv.toString('base64'),
    }),
    aesKey,
    iv,
  }
}

function decryptResponse(text: string, aesKey: Buffer, iv: Buffer): unknown {
  const buf = Buffer.from(text, 'base64')
  const flipped = Buffer.from(iv.map((b) => b ^ 0xff))
  const decipher = createDecipheriv('aes-128-gcm', aesKey, flipped)
  decipher.setAuthTag(buf.subarray(-16))
  const plain = Buffer.concat([decipher.update(buf.subarray(0, -16)), decipher.final()])
  return JSON.parse(plain.toString('utf8'))
}

/** Envelope com AES key aleatória: a decifração RSA-OAEP falha ("oaep decoding error"). */
function garbageBody(): string {
  // Primeiro byte 0: o inteiro fica abaixo do módulo (senão o OpenSSL falha com
  // "data too large for modulus", que não é erro OAEP e deixava o teste instável).
  const encryptedAesKey = randomBytes(256)
  encryptedAesKey[0] = 0
  return JSON.stringify({
    encrypted_flow_data: randomBytes(64).toString('base64'),
    encrypted_aes_key: encryptedAesKey.toString('base64'),
    initial_vector: randomBytes(16).toString('base64'),
  })
}

function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new NextRequest('https://dispara.test/api/flows/endpoint', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', ...headers },
    })
  )
}

function keyWrites(): string[] {
  return vi
    .mocked(settingsDb.set)
    .mock.calls.map(([key]) => key)
    .filter((key) => key === FLOW_PRIVATE_KEY_SETTING || key === FLOW_PUBLIC_KEY_SETTING)
}

beforeAll(() => {
  keys = generateKeyPair()
})

beforeEach(() => {
  resetMetaSignatureState()
  resetFlowKeyAlertState()
  mem = createInMemorySupabase()
  alertsDb.client = mem.client
  store.clear()
  store.set(FLOW_PRIVATE_KEY_SETTING, keys.privateKey)
  store.set(FLOW_PUBLIC_KEY_SETTING, keys.publicKey)
  vi.mocked(settingsDb.set).mockClear()
  vi.mocked(settingsDb.get).mockClear()
  vi.mocked(metaSetEncryptionPublicKey).mockClear()
  vi.mocked(metaSetEncryptionPublicKey).mockResolvedValue({ success: true })
  // Padrão: a Meta já tem a NOSSA chave pública registrada.
  vi.mocked(metaGetEncryptionPublicKey).mockReset()
  vi.mocked(metaGetEncryptionPublicKey).mockImplementation(async () => ({ publicKey: keys.publicKey }))
  vi.mocked(getStoredMetaAppSecretState).mockReset()
  vi.mocked(getStoredMetaAppSecretState).mockResolvedValue({ secret: null, verifiedHash: null, verifiedAt: null })
  vi.mocked(handleFlowAction).mockClear()
  vi.stubEnv('META_APP_SECRET', '')
  vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('modo unsigned_allowed (sem App Secret)', () => {
  it('lixo com erro OAEP → 421 e NUNCA regenera; a Meta já tem a nossa chave → nada a re-registrar nem alertar', async () => {
    const res = await post(garbageBody())
    expect(res.status).toBe(421)
    expect(keyWrites()).toEqual([])
    expect(metaSetEncryptionPublicKey).not.toHaveBeenCalled()
    expect(store.get(FLOW_PRIVATE_KEY_SETTING)).toBe(keys.privateKey)
    expect(flowAlerts()).toEqual([])
  })

  it('várias requests lixo seguidas: sem regenerar e no máximo 1 consulta à Graph por cooldown', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post(garbageBody())).status).toBe(421)
    }
    expect(keyWrites()).toEqual([])
    expect(metaSetEncryptionPublicKey).not.toHaveBeenCalled()
    expect(metaGetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(Number(lastResyncSetting())).toBeGreaterThan(0)
    // O cooldown da re-sincronização é separado: não empurra o da regeneração.
    expect(store.get(FLOW_LAST_KEY_REGEN_SETTING)).toBeUndefined()
    expect(flowAlerts()).toEqual([])
  })

  it('CENÁRIO DO ACHADO (concorrência): rajada simultânea de lixo → no máximo 1 GET e 1 SET na Graph', async () => {
    // Meta sem a nossa chave (pior caso: cada request que passasse faria GET + SET).
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: null })
    // Latência no banco, como em produção: abre a janela entre ler e gravar.
    const slow = () => new Promise((resolve) => setTimeout(resolve, 20))
    vi.mocked(settingsDb.get).mockImplementation(async (key: string) => {
      await slow()
      return store.get(key) ?? null
    })
    vi.mocked(settingsDb.set).mockImplementation(async (key: string, value: string) => {
      await slow()
      store.set(key, value)
    })

    const responses = await Promise.all(Array.from({ length: 30 }, () => post(garbageBody())))
    expect(responses.every((r) => r.status === 421)).toBe(true)
    expect(metaGetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(keyWrites()).toEqual([])

    // Segunda rajada, dentro do cooldown: nenhuma chamada nova.
    await Promise.all(Array.from({ length: 10 }, () => post(garbageBody())))
    expect(metaGetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
  })

  it('janela já reivindicada por OUTRA instância (no banco) → não chama a Graph', async () => {
    mem = createInMemorySupabase({ settings: [{ key: FLOW_LAST_KEY_RESYNC_SETTING, value: String(Date.now() - 1000) }] })
    alertsDb.client = mem.client

    expect((await post(garbageBody())).status).toBe(421)
    expect(metaGetEncryptionPublicKey).not.toHaveBeenCalled()
  })

  it('cooldown vencido no banco → uma nova re-sincronização reivindica a janela', async () => {
    mem = createInMemorySupabase({ settings: [{ key: FLOW_LAST_KEY_RESYNC_SETTING, value: String(Date.now() - 11 * 60_000) }] })
    alertsDb.client = mem.client

    expect((await post(garbageBody())).status).toBe(421)
    expect(metaGetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(Number(lastResyncSetting())).toBeGreaterThan(Date.now() - 60_000)
  })

  it('erro do banco ao reivindicar a janela → trata como cooldown (fail-closed), sem Graph', async () => {
    mem.failNext('settings', 'connection reset')

    expect((await post(garbageBody())).status).toBe(421)
    expect(metaGetEncryptionPublicKey).not.toHaveBeenCalled()
    expect(metaSetEncryptionPublicKey).not.toHaveBeenCalled()
  })

  it('CENÁRIO DO ACHADO: chave registrada na Meta diverge → re-registra a chave LOCAL (sem gerar par novo)', async () => {
    const other = generateKeyPair()
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: other.publicKey })

    const res = await post(garbageBody())
    expect(res.status).toBe(421)
    expect((await res.json()).hint).toMatch(/re-sincronizada/)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    const registered = vi.mocked(metaSetEncryptionPublicKey).mock.calls[0][0]
    expect(registered).toMatchObject({ accessToken: 'tok', phoneNumberId: '123' })
    expect(isSamePublicKey(registered.publicKey, keys.publicKey)).toBe(true)
    // Nada local muda.
    expect(keyWrites()).toEqual([])
    expect(store.get(FLOW_PRIVATE_KEY_SETTING)).toBe(keys.privateKey)
    expect(flowAlerts()).toEqual([])

    // Dentro do cooldown, lixo não provoca outra chamada à Graph.
    await post(garbageBody())
    expect(metaGetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
  })

  it('não deu para conferir a chave na Meta → account_alert deduplicado (meta_integration) com a ação', async () => {
    vi.mocked(metaGetEncryptionPublicKey).mockRejectedValue(new Error('Graph indisponível'))

    expect((await post(garbageBody())).status).toBe(421)
    const alerts = flowAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('meta_integration')
    expect(alerts[0].type).not.toBe('auth')
    const details = JSON.parse(String(alerts[0].details))
    expect(details).toMatchObject({ kind: 'flow_keys', keyStatus: 'unconfirmed', signatureVerified: false })
    expect(details.action).toMatch(/Re-sincronizar chave dos Flows/)
    expect(details.action).toMatch(/MiniApp Dinâmico/)
    expect(details.action).toMatch(/App Secret/)

    // Mais falhas: não duplica.
    await post(garbageBody())
    expect(flowAlerts()).toHaveLength(1)
  })

  it('CENÁRIO DO ACHADO: sem chave privada salva → 421 sem gerar chaves; lixo sem assinatura recorrente NÃO acende alerta', async () => {
    store.delete(FLOW_PRIVATE_KEY_SETTING)
    const res = await post(garbageBody())
    expect(res.status).toBe(421)
    expect(keyWrites()).toEqual([])
    expect(metaSetEncryptionPublicKey).not.toHaveBeenCalled()

    for (let i = 0; i < 5; i++) {
      expect((await post(garbageBody())).status).toBe(421)
    }
    // Antes: 3 POSTs anônimos criavam 'não há chave privada' (e voltava a cada hora).
    expect(flowAlerts()).toEqual([])
    expect(getFlowDecryptFailureSummary()).toMatchObject({ total: 6, verifiedTotal: 0 })
    expect(keyWrites()).toEqual([])
  })

  it('request válida continua funcionando (compat)', async () => {
    const { body, aesKey, iv } = buildEnvelope(keys.publicKey, { version: '3.0', action: 'ping' })
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(decryptResponse(await res.text(), aesKey, iv)).toEqual({ data: { status: 'active' } })
  })

  it('JSON inválido → 400', async () => {
    expect((await post('not-json')).status).toBe(400)
    expect((await post(JSON.stringify({ encrypted_flow_data: 'x' }))).status).toBe(400)
  })
})

describe('modo enforced (App Secret configurado)', () => {
  beforeEach(() => {
    vi.stubEnv('META_APP_SECRET', APP_SECRET)
  })

  it('sem assinatura → 432 antes de decifrar (nem lê a chave privada)', async () => {
    const res = await post(garbageBody())
    expect(res.status).toBe(432)
    expect(vi.mocked(settingsDb.get).mock.calls.map(([k]) => k)).not.toContain(FLOW_PRIVATE_KEY_SETTING)
    expect(keyWrites()).toEqual([])
  })

  it('assinatura inválida → 432', async () => {
    const body = garbageBody()
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'outro-secret') })
    expect(res.status).toBe(432)
    expect(handleFlowAction).not.toHaveBeenCalled()
  })

  it('assinatura verificada + request válida → 200 e chama o handler', async () => {
    const { body, aesKey, iv } = buildEnvelope(keys.publicKey, {
      version: '3.0',
      action: 'data_exchange',
      screen: 'START',
      data: {},
    })
    const res = await post(body, { 'x-hub-signature-256': sign(body) })
    expect(res.status).toBe(200)
    expect(handleFlowAction).toHaveBeenCalledTimes(1)
    expect(decryptResponse(await res.text(), aesKey, iv)).toMatchObject({ screen: 'NEXT' })
  })

  it('assinatura verificada + erro OAEP → regenera e re-registra (uma vez, depois cooldown)', async () => {
    const first = garbageBody()
    const res1 = await post(first, { 'x-hub-signature-256': sign(first) })
    expect(res1.status).toBe(421)
    expect(keyWrites().sort()).toEqual([FLOW_PRIVATE_KEY_SETTING, FLOW_PUBLIC_KEY_SETTING].sort())
    expect(store.get(FLOW_LAST_KEY_REGEN_SETTING)).toBeTruthy()
    expect(store.get(FLOW_PRIVATE_KEY_SETTING)).not.toBe(keys.privateKey)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)

    const second = garbageBody()
    const res2 = await post(second, { 'x-hub-signature-256': sign(second) })
    expect(res2.status).toBe(421)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
  })

  it('assinatura verificada + sem chave privada → gera e registra', async () => {
    store.delete(FLOW_PRIVATE_KEY_SETTING)
    const body = garbageBody()
    const res = await post(body, { 'x-hub-signature-256': sign(body) })
    expect(res.status).toBe(421)
    expect(store.get(FLOW_PRIVATE_KEY_SETTING)).toBeTruthy()
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
  })
})

describe("META_WEBHOOK_REQUIRE_SIGNATURE='true' sem App Secret", () => {
  it('rejeita com 432', async () => {
    vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'true')
    const { body } = buildEnvelope(keys.publicKey, { version: '3.0', action: 'ping' })
    expect((await post(body)).status).toBe(432)
  })
})

describe("secret de Configurações ainda não comprovado ('report_only')", () => {
  beforeEach(() => {
    vi.mocked(getStoredMetaAppSecretState).mockResolvedValue({
      secret: 'client-token-colado-no-lugar',
      verifiedHash: null,
      verifiedAt: null,
    })
  })

  it('CENÁRIO DO ACHADO: data exchange da Meta com secret errado salvo NÃO leva 432', async () => {
    const { body, aesKey, iv } = buildEnvelope(keys.publicKey, {
      version: '3.0',
      action: 'data_exchange',
      screen: 'START',
      data: {},
    })
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'secret-real-da-meta') })
    expect(res.status).toBe(200)
    expect(handleFlowAction).toHaveBeenCalledTimes(1)
    expect(decryptResponse(await res.text(), aesKey, iv)).toMatchObject({ screen: 'NEXT' })
  })

  it('assinatura que não confere não autoriza regenerar chaves (só re-sincroniza)', async () => {
    const body = garbageBody()
    const res = await post(body, { 'x-hub-signature-256': sign(body, 'secret-real-da-meta') })
    expect(res.status).toBe(421)
    expect(keyWrites()).toEqual([])
  })
})

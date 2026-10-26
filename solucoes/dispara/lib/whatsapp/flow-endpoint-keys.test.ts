// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createPublicKey } from 'node:crypto'
import { createInMemorySupabase, type InMemorySupabase } from '@/tests/helpers/in-memory-supabase'

const store = vi.hoisted(() => new Map<string, string>())
const holder = vi.hoisted(() => ({ client: null as null | { from: (t: string) => unknown } }))

vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  },
}))
vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(),
}))
vi.mock('@/lib/meta-flows-api', () => ({
  metaSetEncryptionPublicKey: vi.fn(),
  metaGetEncryptionPublicKey: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => holder.client),
}))

import {
  FLOW_KEYS_ALERT_ID_PREFIX,
  FLOW_KEY_REGEN_COOLDOWN_MS,
  FLOW_KEY_RESYNC_COOLDOWN_MS,
  FLOW_LAST_KEY_RESYNC_SETTING,
  FLOW_PRIVATE_KEY_SETTING,
  claimFlowKeyResync,
  decideFlowKeyRecovery,
  derivePublicKeyPem,
  dismissFlowKeyAlerts,
  getFlowDecryptFailureSummary,
  inspectFlowPublicKey,
  isOaepDecryptError,
  isSamePublicKey,
  reportFlowDecryptFailure,
  resetFlowKeyAlertState,
  resyncFlowPublicKeyIfDue,
  syncFlowPublicKeyWithMeta,
} from '@/lib/whatsapp/flow-endpoint-keys'
import { generateKeyPair } from '@/lib/whatsapp/flow-endpoint-crypto'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { metaGetEncryptionPublicKey, metaSetEncryptionPublicKey } from '@/lib/meta-flows-api'

const NOW = 1_800_000_000_000

let keys: { publicKey: string; privateKey: string }
let other: { publicKey: string; privateKey: string }
let db: InMemorySupabase

beforeAll(() => {
  keys = generateKeyPair()
  other = generateKeyPair()
})

beforeEach(() => {
  store.clear()
  store.set(FLOW_PRIVATE_KEY_SETTING, keys.privateKey)
  resetFlowKeyAlertState()
  db = createInMemorySupabase()
  holder.client = db.client
  vi.mocked(getWhatsAppCredentials).mockReset()
  vi.mocked(getWhatsAppCredentials).mockResolvedValue({ accessToken: 'tok', phoneNumberId: '123', businessAccountId: 'w' })
  vi.mocked(metaGetEncryptionPublicKey).mockReset()
  vi.mocked(metaSetEncryptionPublicKey).mockReset()
  vi.mocked(metaSetEncryptionPublicKey).mockResolvedValue({ success: true })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('decideFlowKeyRecovery', () => {
  it('nunca gera/regenera sem assinatura verificada (anti-DoS)', () => {
    expect(decideFlowKeyRecovery({ signatureVerified: false, trigger: 'missing_key', lastRegenAt: 0, now: NOW })).toBe('unverified')
    // OAEP sem assinatura: só re-sincroniza a chave LOCAL existente, nunca 'regenerate'.
    expect(decideFlowKeyRecovery({ signatureVerified: false, trigger: 'oaep_error', lastRegenAt: 0, now: NOW })).toBe('resync')
  })

  it('re-sincronização sem assinatura tem cooldown próprio (não usa o da regeneração)', () => {
    const recent = NOW - FLOW_KEY_RESYNC_COOLDOWN_MS + 1000
    expect(
      decideFlowKeyRecovery({ signatureVerified: false, trigger: 'oaep_error', lastRegenAt: 0, lastResyncAt: recent, now: NOW })
    ).toBe('cooldown')
    expect(
      decideFlowKeyRecovery({ signatureVerified: false, trigger: 'oaep_error', lastRegenAt: NOW, lastResyncAt: 0, now: NOW })
    ).toBe('resync')
  })

  it('regenera com assinatura verificada fora do cooldown', () => {
    expect(decideFlowKeyRecovery({ signatureVerified: true, trigger: 'oaep_error', lastRegenAt: 0, now: NOW })).toBe('regenerate')
    expect(decideFlowKeyRecovery({ signatureVerified: true, trigger: 'missing_key', lastRegenAt: 0, now: NOW })).toBe('regenerate')
  })

  it('respeita o cooldown de 10 min', () => {
    const recent = NOW - FLOW_KEY_REGEN_COOLDOWN_MS + 1000
    expect(decideFlowKeyRecovery({ signatureVerified: true, trigger: 'oaep_error', lastRegenAt: recent, now: NOW })).toBe('cooldown')
    const old = NOW - FLOW_KEY_REGEN_COOLDOWN_MS - 1
    expect(decideFlowKeyRecovery({ signatureVerified: true, trigger: 'oaep_error', lastRegenAt: old, now: NOW })).toBe('regenerate')
  })

  it('erro que não é de chave nunca regenera', () => {
    expect(decideFlowKeyRecovery({ signatureVerified: true, trigger: 'other_error', lastRegenAt: 0, now: NOW })).toBe('not_applicable')
    expect(decideFlowKeyRecovery({ signatureVerified: false, trigger: 'other_error', lastRegenAt: 0, now: NOW })).toBe('not_applicable')
  })

  it('lastRegenAt inválido conta como nunca regenerado', () => {
    expect(decideFlowKeyRecovery({ signatureVerified: true, trigger: 'oaep_error', lastRegenAt: Number.NaN, now: NOW })).toBe('regenerate')
  })
})

describe('isOaepDecryptError', () => {
  it('detecta erro OAEP do OpenSSL', () => {
    expect(isOaepDecryptError(new Error('error:02000079:rsa routines::oaep decoding error'))).toBe(true)
    expect(isOaepDecryptError('OAEP failure')).toBe(true)
    expect(isOaepDecryptError(new Error('Unsupported state or unable to authenticate data'))).toBe(false)
  })
})

describe('comparação de chave pública', () => {
  it('compara o material da chave, não o texto (CRLF, espaços, PKCS#1 x SPKI)', () => {
    const crlf = `  ${keys.publicKey.replace(/\n/g, '\r\n')}  `
    expect(isSamePublicKey(crlf, keys.publicKey)).toBe(true)
    const pkcs1 = createPublicKey(keys.publicKey).export({ type: 'pkcs1', format: 'pem' }).toString()
    expect(isSamePublicKey(pkcs1, keys.publicKey)).toBe(true)
    expect(isSamePublicKey(other.publicKey, keys.publicKey)).toBe(false)
    expect(isSamePublicKey(null, keys.publicKey)).toBe(false)
  })

  it('a pública derivada da privada é a que decifra', () => {
    expect(isSamePublicKey(derivePublicKeyPem(keys.privateKey), keys.publicKey)).toBe(true)
  })
})

describe('syncFlowPublicKeyWithMeta / inspectFlowPublicKey', () => {
  it('Meta já tem a nossa chave → in_sync, sem SET', async () => {
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: keys.publicKey })
    await expect(syncFlowPublicKeyWithMeta()).resolves.toEqual({ status: 'in_sync' })
    expect(metaSetEncryptionPublicKey).not.toHaveBeenCalled()
  })

  it('Meta com outra chave (ou nenhuma) → registra a chave LOCAL derivada da privada', async () => {
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: other.publicKey })
    await expect(inspectFlowPublicKey()).resolves.toEqual({ status: 'mismatch', metaHasKey: true })
    await expect(syncFlowPublicKeyWithMeta()).resolves.toEqual({ status: 'resynced' })
    const call = vi.mocked(metaSetEncryptionPublicKey).mock.calls[0][0]
    expect(isSamePublicKey(call.publicKey, keys.publicKey)).toBe(true)
    // Nunca mexe nas chaves locais.
    expect(store.get(FLOW_PRIVATE_KEY_SETTING)).toBe(keys.privateKey)

    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: null })
    await expect(inspectFlowPublicKey()).resolves.toEqual({ status: 'mismatch', metaHasKey: false })
  })

  it('sem chave local, chave inválida ou sem credenciais: não chama a Graph', async () => {
    store.delete(FLOW_PRIVATE_KEY_SETTING)
    await expect(syncFlowPublicKeyWithMeta()).resolves.toEqual({ status: 'missing_local_key' })
    await expect(syncFlowPublicKeyWithMeta({ privateKey: 'lixo' })).resolves.toEqual({ status: 'invalid_local_key' })

    store.set(FLOW_PRIVATE_KEY_SETTING, keys.privateKey)
    vi.mocked(getWhatsAppCredentials).mockResolvedValue(null)
    await expect(syncFlowPublicKeyWithMeta()).resolves.toEqual({ status: 'no_credentials' })
    expect(metaGetEncryptionPublicKey).not.toHaveBeenCalled()
  })

  it('erro da Graph (GET ou SET) → failed, sem lançar', async () => {
    vi.mocked(metaGetEncryptionPublicKey).mockRejectedValueOnce(new Error('down'))
    await expect(syncFlowPublicKeyWithMeta()).resolves.toEqual({ status: 'failed', error: 'down' })

    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: other.publicKey })
    vi.mocked(metaSetEncryptionPublicKey).mockRejectedValueOnce(new Error('sem permissão'))
    await expect(syncFlowPublicKeyWithMeta()).resolves.toEqual({ status: 'failed', error: 'sem permissão' })
  })

  it('Graph pendurada não segura a resposta do endpoint (timeout)', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(metaGetEncryptionPublicKey).mockReturnValue(new Promise(() => {}))
      const pending = syncFlowPublicKeyWithMeta()
      await vi.advanceTimersByTimeAsync(5000)
      await expect(pending).resolves.toMatchObject({ status: 'failed', error: expect.stringMatching(/timeout/) })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('claimFlowKeyResync / resyncFlowPublicKeyIfDue (cooldown atômico)', () => {
  function resyncSetting(): string | undefined {
    return db.rows('settings').find((r) => r.key === FLOW_LAST_KEY_RESYNC_SETTING)?.value as string | undefined
  }

  it('CENÁRIO DO ACHADO: claims concorrentes (várias instâncias) → só UM ganha a janela', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => claimFlowKeyResync(NOW)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(resyncSetting()).toBe(String(NOW))

    // Com a linha já existente e o cooldown vencido: de novo, só um.
    const later = NOW + FLOW_KEY_RESYNC_COOLDOWN_MS
    const again = await Promise.all(Array.from({ length: 20 }, () => claimFlowKeyResync(later)))
    expect(again.filter(Boolean)).toHaveLength(1)
    expect(resyncSetting()).toBe(String(later))
  })

  it('dentro do cooldown não reivindica; vencido, reivindica', async () => {
    db = createInMemorySupabase({ settings: [{ key: FLOW_LAST_KEY_RESYNC_SETTING, value: String(NOW) }] })
    holder.client = db.client
    await expect(claimFlowKeyResync(NOW + FLOW_KEY_RESYNC_COOLDOWN_MS - 1)).resolves.toBe(false)
    await expect(claimFlowKeyResync(NOW + FLOW_KEY_RESYNC_COOLDOWN_MS)).resolves.toBe(true)
  })

  it('valor vazio/legado conta como nunca re-sincronizado', async () => {
    db = createInMemorySupabase({ settings: [{ key: FLOW_LAST_KEY_RESYNC_SETTING, value: '' }] })
    holder.client = db.client
    await expect(claimFlowKeyResync(NOW)).resolves.toBe(true)
  })

  it('erro do banco ou Supabase ausente → false (fail-closed, nunca libera a Graph)', async () => {
    db.failNext('settings', 'connection reset')
    await expect(claimFlowKeyResync(NOW)).resolves.toBe(false)
    holder.client = null
    await expect(claimFlowKeyResync(NOW)).resolves.toBe(false)
  })

  it('single-flight por instância: chamadas concorrentes → uma inspeção na Graph', async () => {
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: other.publicKey })
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => resyncFlowPublicKeyIfDue({ privateKey: keys.privateKey, now: NOW }))
    )
    expect(attempts.filter((a) => a.claimed)).toEqual([{ claimed: true, result: { status: 'resynced' } }])
    expect(metaGetEncryptionPublicKey).toHaveBeenCalledTimes(1)
    expect(metaSetEncryptionPublicKey).toHaveBeenCalledTimes(1)
  })
})

describe('reportFlowDecryptFailure', () => {
  function flowAlerts() {
    return db.rows('account_alerts').filter((r) => String(r.id).startsWith(FLOW_KEYS_ALERT_ID_PREFIX))
  }

  it('falha com a chave em dia na Meta (lixo/forja) só entra na estatística', async () => {
    for (let i = 0; i < 10; i++) {
      await reportFlowDecryptFailure({ trigger: 'oaep_error', keyStatus: 'in_sync', signatureVerified: false, now: NOW + i })
    }
    expect(flowAlerts()).toEqual([])
    expect(getFlowDecryptFailureSummary(NOW + 10)).toMatchObject({ total: 10, byKeyStatus: { in_sync: 10 } })
  })

  it('chave não confirmada na Meta → alerta meta_integration deduplicado', async () => {
    await reportFlowDecryptFailure({ trigger: 'oaep_error', keyStatus: 'unconfirmed', signatureVerified: false, now: NOW })
    await reportFlowDecryptFailure({ trigger: 'oaep_error', keyStatus: 'unconfirmed', signatureVerified: false, now: NOW + 1 })
    const alerts = flowAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ type: 'meta_integration', code: null })
  })

  it('chave ausente com assinatura verificada só alerta quando recorrente', async () => {
    await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: true, now: NOW })
    await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: true, now: NOW + 1 })
    expect(flowAlerts()).toEqual([])
    await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: true, now: NOW + 2 })
    expect(flowAlerts()).toHaveLength(1)
    // Com assinatura verificada não sugere configurar o App Secret.
    expect(JSON.parse(String(flowAlerts()[0].details)).action).not.toMatch(/App Secret/)
  })

  it('CENÁRIO DO ACHADO: chave ausente em requests SEM assinatura verificada nunca alerta (só estatística)', async () => {
    for (let i = 0; i < 10; i++) {
      await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: false, now: NOW + i })
    }
    expect(flowAlerts()).toEqual([])
    expect(getFlowDecryptFailureSummary(NOW + 10)).toMatchObject({
      total: 10,
      verifiedTotal: 0,
      byKeyStatus: { missing_key: 10 },
    })

    // Lixo anônimo também não ajuda a bater o limite das verificadas.
    await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: true, now: NOW + 11 })
    expect(flowAlerts()).toEqual([])
    expect(getFlowDecryptFailureSummary(NOW + 12).verifiedTotal).toBe(1)
  })

  it('dismissFlowKeyAlerts dispensa os avisos ativos', async () => {
    await reportFlowDecryptFailure({ trigger: 'oaep_error', keyStatus: 'unconfirmed', signatureVerified: false, now: NOW })
    expect(flowAlerts()).toHaveLength(1)
    expect(flowAlerts()[0].dismissed).toBe(false)
    await dismissFlowKeyAlerts()
    expect(flowAlerts()[0].dismissed).toBe(true)
    expect(getFlowDecryptFailureSummary(NOW).byKeyStatus.unconfirmed).toBeUndefined()
  })
})

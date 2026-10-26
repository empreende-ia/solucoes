// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * /api/meta/diagnostics expõe o estado da assinatura do webhook
 * ('enforced' / 'report_only' + pending_verification|verified / 'unsigned_allowed')
 * com falhas recentes, e o estado da chave do endpoint de Flows.
 */

const store = vi.hoisted(() => new Map<string, string>())

vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(async () => null),
}))
vi.mock('@/lib/verify-token', () => ({
  getVerifyToken: vi.fn(async () => 'verify-token-123'),
}))
vi.mock('@/lib/supabase', async () => {
  const { createMockQueryBuilder } = await import('@/tests/helpers/supabase-mock')
  return {
    supabase: { from: vi.fn(() => createMockQueryBuilder({ data: [] })) },
    getSupabaseAdmin: vi.fn(() => null),
  }
})
vi.mock('@/lib/supabase-db', () => ({
  settingsDb: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
  },
}))
vi.mock('@/lib/meta-flows-api', () => ({
  metaGetEncryptionPublicKey: vi.fn(async () => ({ publicKey: null })),
  metaSetEncryptionPublicKey: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/meta-app-credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta-app-credentials')>()
  return {
    ...actual,
    getMetaAppCredentials: vi.fn(async () => null),
    getStoredMetaAppSecretState: vi.fn(async () => ({ secret: null, verifiedHash: null, verifiedAt: null })),
    markStoredMetaAppSecretVerified: vi.fn(async () => {}),
  }
})

import { GET } from '@/app/api/meta/diagnostics/route'
import { getStoredMetaAppSecretState, hashMetaAppSecret } from '@/lib/meta-app-credentials'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { metaGetEncryptionPublicKey } from '@/lib/meta-flows-api'
import { evaluateMetaSignature, reportMetaSignatureFailure, resetMetaSignatureState } from '@/lib/meta-webhook-signature'
import { generateKeyPair } from '@/lib/whatsapp/flow-endpoint-crypto'
import {
  FLOW_PRIVATE_KEY_SETTING,
  reportFlowDecryptFailure,
  resetFlowKeyAlertState,
} from '@/lib/whatsapp/flow-endpoint-keys'

type Check = {
  id: string
  status: string
  message: string
  actions?: Array<{ href?: string; kind?: string; endpoint?: string }>
}

async function diagnostics() {
  const res = await GET()
  return (await res.json()) as {
    checks: Check[]
    webhook: {
      signature: {
        mode: string
        verification: string
        secretSource: string | null
        recommendedAction: string | null
        recentFailures: { total: number }
      }
    }
  }
}

function storeSecret(secret: string, verified = false) {
  vi.mocked(getStoredMetaAppSecretState).mockResolvedValue({
    secret,
    verifiedHash: verified ? hashMetaAppSecret(secret) : null,
    verifiedAt: verified ? '2026-10-01T00:00:00.000Z' : null,
  })
}

beforeEach(() => {
  resetMetaSignatureState()
  resetFlowKeyAlertState()
  store.clear()
  vi.mocked(getStoredMetaAppSecretState).mockReset()
  vi.mocked(getStoredMetaAppSecretState).mockResolvedValue({ secret: null, verifiedHash: null, verifiedAt: null })
  vi.mocked(getWhatsAppCredentials).mockReset()
  vi.mocked(getWhatsAppCredentials).mockResolvedValue(null)
  vi.stubEnv('META_APP_SECRET', '')
  vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('diagnóstico da assinatura do webhook', () => {
  it('sem App Secret → unsigned_allowed (warn) dizendo que o App Secret fecha o buraco', async () => {
    const data = await diagnostics()
    const check = data.checks.find((c) => c.id === 'webhook_signature')
    expect(check?.status).toBe('warn')
    expect(check?.message).toMatch(/unsigned_allowed/)
    expect(check?.message).toMatch(/fecha esse buraco/)
    expect(check?.actions?.[0]?.href).toBe('/settings')
    expect(data.webhook.signature.mode).toBe('unsigned_allowed')
    expect(data.webhook.signature.verification).toBe('unsigned_allowed')
    expect(data.webhook.signature.recommendedAction).toMatch(/App Secret/)
  })

  it('App Secret salvo pela UI ainda não comprovado → report_only / pending_verification (warn)', async () => {
    storeSecret('s3cr3t')
    const data = await diagnostics()
    const check = data.checks.find((c) => c.id === 'webhook_signature')
    expect(check?.status).toBe('warn')
    expect(check?.message).toMatch(/pending_verification/)
    expect(data.webhook.signature).toMatchObject({
      mode: 'report_only',
      verification: 'pending_verification',
      secretSource: 'settings',
    })
    expect(JSON.stringify(data)).not.toContain('s3cr3t')
  })

  it('CENÁRIO DO ACHADO: secret errado salvo aparece no diagnóstico com as falhas recentes', async () => {
    storeSecret('client-token-colado')
    const evaluation = await evaluateMetaSignature('{}', `sha256=${'a'.repeat(64)}`)
    await reportMetaSignatureFailure({ evaluation, endpoint: 'webhook' })

    const data = await diagnostics()
    const check = data.checks.find((c) => c.id === 'webhook_signature')
    expect(check?.message).toMatch(/assinatura que não confere/)
    expect(check?.message).toMatch(/1 com assinatura que não confere/)
    expect(data.webhook.signature.recentFailures.total).toBe(1)
  })

  it('App Secret comprovado → enforced / verified (pass)', async () => {
    storeSecret('s3cr3t', true)
    const data = await diagnostics()
    const check = data.checks.find((c) => c.id === 'webhook_signature')
    expect(check?.status).toBe('pass')
    expect(check?.message).toMatch(/verified/)
    expect(data.webhook.signature).toMatchObject({ mode: 'enforced', verification: 'verified', secretSource: 'settings' })
  })

  it('exige assinatura sem App Secret → fail', async () => {
    vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'true')
    const data = await diagnostics()
    expect(data.checks.find((c) => c.id === 'webhook_signature')?.status).toBe('fail')
  })
})

describe('diagnóstico da chave do endpoint de Flows', () => {
  beforeEach(() => {
    vi.mocked(getWhatsAppCredentials).mockResolvedValue({
      accessToken: 'tok',
      phoneNumberId: '123',
      businessAccountId: '456',
    })
    // Demais checks da Graph: respostas vazias (não interessam aqui).
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  })

  it('chave registrada na Meta diverge da local → warn com ação de re-sincronizar', async () => {
    const local = generateKeyPair()
    const other = generateKeyPair()
    store.set(FLOW_PRIVATE_KEY_SETTING, local.privateKey)
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: other.publicKey })

    const data = await diagnostics()
    const check = data.checks.find((c) => c.id === 'flow_endpoint_keys')
    expect(check?.status).toBe('warn')
    expect(check?.message).toMatch(/NÃO é a do endpoint/)
    expect(check?.actions?.[0]).toMatchObject({ kind: 'api', endpoint: '/api/flows/endpoint/keys/sync' })
  })

  it('chave em dia → pass', async () => {
    const local = generateKeyPair()
    store.set(FLOW_PRIVATE_KEY_SETTING, local.privateKey)
    vi.mocked(metaGetEncryptionPublicKey).mockResolvedValue({ publicKey: local.publicKey })

    const data = await diagnostics()
    expect(data.checks.find((c) => c.id === 'flow_endpoint_keys')?.status).toBe('pass')
  })

  it('sem chave privada → info com ação de gerar chaves', async () => {
    const data = await diagnostics()
    const check = data.checks.find((c) => c.id === 'flow_endpoint_keys')
    expect(check?.status).toBe('info')
    expect(check?.actions?.[0]).toMatchObject({ kind: 'api', endpoint: '/api/flows/endpoint/keys' })
  })

  it('CENÁRIO DO ACHADO: sem chave + falhas só de requests NÃO verificadas → warn (possível ruído), não fail', async () => {
    for (let i = 0; i < 3; i++) {
      await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: false })
    }
    const check = (await diagnostics()).checks.find((c) => c.id === 'flow_endpoint_keys')
    expect(check?.status).toBe('warn')
    expect(check?.message).toMatch(/3 falha\(s\)/)
    expect(check?.message).toMatch(/Nenhuma delas tinha assinatura verificada/)
  })

  it('sem chave + falha de request com assinatura verificada (a Meta está chamando) → fail', async () => {
    await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: false })
    await reportFlowDecryptFailure({ trigger: 'missing_key', keyStatus: 'missing_key', signatureVerified: true })
    const check = (await diagnostics()).checks.find((c) => c.id === 'flow_endpoint_keys')
    expect(check?.status).toBe('fail')
    expect(check?.message).not.toMatch(/Nenhuma delas/)
  })
})

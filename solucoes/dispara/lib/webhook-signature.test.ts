// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import { createInMemorySupabase, type InMemorySupabase } from '@/tests/helpers/in-memory-supabase'

/**
 * Testa o módulo REAL de verificação de assinatura da Meta
 * (lib/meta-webhook-signature.ts), usado por /api/webhook e /api/flows/endpoint,
 * com o settings/account_alerts num Supabase em memória.
 *
 * Referência: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: vi.fn(() => null),
}))
vi.mock('@/lib/supabase-db', () => ({
  settingsDb: { get: vi.fn(), set: vi.fn() },
}))

import {
  verifyMetaSignature,
  evaluateMetaSignature,
  getMetaAppSecret,
  getMetaSignatureStatus,
  getMetaSignatureFailureSummary,
  reportMetaSignatureFailure,
  clearMetaAppSecretCache,
  resetMetaSignatureState,
  META_SIGNATURE_HEADER,
  META_SIGNATURE_ALERT_ID_PREFIX,
  META_APP_SECRET_MISSING_ALERT_ID,
  META_SIGNATURE_LAST_VALID_AT_SETTING,
  type MetaSignatureEvaluation,
} from '@/lib/meta-webhook-signature'
import {
  META_APP_SECRET_SETTING,
  META_APP_SECRET_VERIFIED_AT_SETTING,
  META_APP_SECRET_VERIFIED_HASH_SETTING,
} from '@/lib/meta-app-credentials'
import { META_INTEGRATION_ALERT_TYPE } from '@/lib/meta-integration-alerts'
import { getSupabaseAdmin } from '@/lib/supabase'

const mockedGetSupabaseAdmin = vi.mocked(getSupabaseAdmin)

const ENV_SECRET = 'env-meta-app-secret-123'
const SETTINGS_SECRET = 'settings-meta-app-secret-456'
const REAL_META_SECRET = 'o-secret-que-a-meta-usa-de-verdade'
const BODY = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: '123', changes: [] }],
})

let db: InMemorySupabase

function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function useDb(settings: Record<string, string> = {}, alerts: Array<Record<string, unknown>> = []) {
  db = createInMemorySupabase(
    {
      settings: Object.entries(settings).map(([key, value]) => ({ key, value })),
      account_alerts: alerts,
    },
    { settings: 'key' }
  )
  mockedGetSupabaseAdmin.mockReturnValue(db.client as never)
}

function setting(key: string): string | undefined {
  return db.rows('settings').find((r) => r.key === key)?.value as string | undefined
}

function signatureAlerts() {
  return db.rows('account_alerts').filter((r) => String(r.id).startsWith('alert_meta_'))
}

beforeEach(() => {
  resetMetaSignatureState()
  mockedGetSupabaseAdmin.mockReset()
  useDb()
  vi.stubEnv('META_APP_SECRET', '')
  vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('verifyMetaSignature', () => {
  it('aceita assinatura HMAC-SHA256 correta', () => {
    expect(verifyMetaSignature(BODY, sign(ENV_SECRET, BODY), ENV_SECRET)).toBe(true)
  })

  it('aceita body vazio e unicode quando a assinatura confere', () => {
    expect(verifyMetaSignature('', sign(ENV_SECRET, ''), ENV_SECRET)).toBe(true)
    const unicode = JSON.stringify({ message: 'Olá, como você está? 🇧🇷' })
    expect(verifyMetaSignature(unicode, sign(ENV_SECRET, unicode), ENV_SECRET)).toBe(true)
  })

  it('aceita hex maiúsculo e espaços nas pontas do header', () => {
    const sig = sign(ENV_SECRET, BODY)
    expect(verifyMetaSignature(BODY, `  sha256=${sig.slice(7).toUpperCase()}  `, ENV_SECRET)).toBe(true)
  })

  it('rejeita assinatura incorreta', () => {
    expect(verifyMetaSignature(BODY, `sha256=${'0'.repeat(64)}`, ENV_SECRET)).toBe(false)
  })

  it('rejeita quando o body foi alterado', () => {
    expect(verifyMetaSignature(`${BODY} `, sign(ENV_SECRET, BODY), ENV_SECRET)).toBe(false)
  })

  it('rejeita quando o secret é diferente', () => {
    expect(verifyMetaSignature(BODY, sign('outro-secret', BODY), ENV_SECRET)).toBe(false)
  })

  it('rejeita header ausente ou vazio', () => {
    expect(verifyMetaSignature(BODY, null, ENV_SECRET)).toBe(false)
    expect(verifyMetaSignature(BODY, '', ENV_SECRET)).toBe(false)
  })

  it('rejeita header malformado (sem prefixo, curto, não-hex, algoritmo errado)', () => {
    const hex = sign(ENV_SECRET, BODY).slice('sha256='.length)
    expect(verifyMetaSignature(BODY, hex, ENV_SECRET)).toBe(false)
    expect(verifyMetaSignature(BODY, 'sha256=abc', ENV_SECRET)).toBe(false)
    expect(verifyMetaSignature(BODY, `sha256=${'z'.repeat(64)}`, ENV_SECRET)).toBe(false)
    expect(verifyMetaSignature(BODY, `sha1=${hex}`, ENV_SECRET)).toBe(false)
    expect(verifyMetaSignature(BODY, `sha256=${hex}00`, ENV_SECRET)).toBe(false)
  })

  it('rejeita quando o secret está vazio (nunca "verifica" contra secret vazio)', () => {
    expect(verifyMetaSignature(BODY, sign('', BODY), '')).toBe(false)
  })
})

describe('getMetaAppSecret', () => {
  it('env META_APP_SECRET tem precedência sobre settings (nem consulta o banco)', async () => {
    vi.stubEnv('META_APP_SECRET', `  ${ENV_SECRET}  `)
    useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })

    await expect(getMetaAppSecret()).resolves.toEqual({
      secret: ENV_SECRET,
      source: 'env',
      verified: false,
      verifiedAt: null,
    })
    expect(db.accessed).toEqual([])
  })

  it('usa o secret salvo pela UI quando não há env (ainda não comprovado)', async () => {
    useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
    await expect(getMetaAppSecret()).resolves.toEqual({
      secret: SETTINGS_SECRET,
      source: 'settings',
      verified: false,
      verifiedAt: null,
    })
  })

  it('secret comprovado: o hash gravado confere com o secret atual', async () => {
    useDb({
      [META_APP_SECRET_SETTING]: SETTINGS_SECRET,
      [META_APP_SECRET_VERIFIED_HASH_SETTING]: sha256(SETTINGS_SECRET),
      [META_APP_SECRET_VERIFIED_AT_SETTING]: '2026-10-01T00:00:00.000Z',
    })
    await expect(getMetaAppSecret()).resolves.toMatchObject({
      verified: true,
      verifiedAt: '2026-10-01T00:00:00.000Z',
    })
  })

  it('hash comprovado de OUTRO secret (secret trocado) não vale', async () => {
    useDb({
      [META_APP_SECRET_SETTING]: SETTINGS_SECRET,
      [META_APP_SECRET_VERIFIED_HASH_SETTING]: sha256('secret-antigo'),
      [META_APP_SECRET_VERIFIED_AT_SETTING]: '2026-10-01T00:00:00.000Z',
    })
    await expect(getMetaAppSecret()).resolves.toMatchObject({ verified: false, verifiedAt: null })
  })

  it('retorna source null quando nada está configurado', async () => {
    await expect(getMetaAppSecret()).resolves.toEqual({ secret: null, source: null, verified: false, verifiedAt: null })
  })

  it('retorna source null quando o Supabase não está configurado', async () => {
    mockedGetSupabaseAdmin.mockReturnValue(null)
    await expect(getMetaAppSecret()).resolves.toMatchObject({ secret: null, source: null })
  })

  it('cacheia a leitura das settings por 60s', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
    useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })

    await getMetaAppSecret()
    await getMetaAppSecret()
    expect(db.accessed.filter((t) => t === 'settings')).toHaveLength(1)

    vi.setSystemTime(new Date('2026-10-11T12:01:01Z'))
    await getMetaAppSecret()
    expect(db.accessed.filter((t) => t === 'settings')).toHaveLength(2)
  })

  it('clearMetaAppSecretCache força nova leitura (secret salvo/removido pela UI)', async () => {
    await expect(getMetaAppSecret()).resolves.toMatchObject({ secret: null, source: null })
    useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
    clearMetaAppSecretCache()
    await expect(getMetaAppSecret()).resolves.toMatchObject({ secret: SETTINGS_SECRET, source: 'settings' })
  })

  it('em falha de leitura reaproveita o último valor conhecido (mesmo expirado)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
    useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
    await getMetaAppSecret()

    vi.setSystemTime(new Date('2026-10-11T12:05:00Z'))
    db.failNext('settings', 'db down')
    await expect(getMetaAppSecret()).resolves.toMatchObject({ secret: SETTINGS_SECRET, source: 'settings' })
  })

  it('lança quando a leitura falha e não há valor anterior', async () => {
    db.failNext('settings', 'db down')
    await expect(getMetaAppSecret()).rejects.toThrow('db down')
  })
})

describe('evaluateMetaSignature', () => {
  describe('modo enforced (App Secret na env)', () => {
    beforeEach(() => {
      vi.stubEnv('META_APP_SECRET', ENV_SECRET)
    })

    it('aceita assinatura válida', async () => {
      await expect(evaluateMetaSignature(BODY, sign(ENV_SECRET, BODY))).resolves.toEqual({
        ok: true,
        mode: 'enforced',
        verified: true,
      })
    })

    it('rejeita assinatura inválida', async () => {
      await expect(evaluateMetaSignature(BODY, sign('outro', BODY))).resolves.toEqual({
        ok: false,
        mode: 'enforced',
        verified: false,
        reason: 'invalid_signature',
      })
    })

    it('rejeita assinatura ausente (fail-closed)', async () => {
      await expect(evaluateMetaSignature(BODY, null)).resolves.toEqual({
        ok: false,
        mode: 'enforced',
        verified: false,
        reason: 'missing_signature',
      })
      await expect(evaluateMetaSignature(BODY, '   ')).resolves.toMatchObject({ ok: false, reason: 'missing_signature' })
    })

    it('rejeita header malformado', async () => {
      await expect(evaluateMetaSignature(BODY, 'sha256=xyz')).resolves.toEqual({
        ok: false,
        mode: 'enforced',
        verified: false,
        reason: 'malformed_signature',
      })
    })

    it('precedência env > settings: assinatura feita com o secret das settings é rejeitada quando há env', async () => {
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
      await expect(evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))).resolves.toMatchObject({
        ok: false,
        reason: 'invalid_signature',
      })
      await expect(evaluateMetaSignature(BODY, sign(ENV_SECRET, BODY))).resolves.toMatchObject({ ok: true })
    })

    it('registra a última assinatura válida (com throttle) para o diagnóstico', async () => {
      await evaluateMetaSignature(BODY, sign(ENV_SECRET, BODY))
      expect(setting(META_SIGNATURE_LAST_VALID_AT_SETTING)).toBeTruthy()
    })
  })

  describe("secret de Configurações ainda não comprovado → 'report_only'", () => {
    it('CENÁRIO DO ACHADO: secret errado salvo (ex.: Client Token) NÃO derruba o inbound da Meta', async () => {
      // Antes: modo 'enforced' direto → todo POST real da Meta levava 401/432.
      useDb({ [META_APP_SECRET_SETTING]: 'client-token-colado-no-lugar' })
      const realMetaRequest = sign(REAL_META_SECRET, BODY)

      await expect(evaluateMetaSignature(BODY, realMetaRequest)).resolves.toEqual({
        ok: true,
        mode: 'report_only',
        verified: false,
        reason: 'invalid_signature',
      })
      // Nunca promove sem uma assinatura válida.
      expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBeUndefined()
    })

    it('header ausente/malformado também é aceito (mesmo comportamento de antes do hardening)', async () => {
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
      await expect(evaluateMetaSignature(BODY, null)).resolves.toMatchObject({
        ok: true,
        mode: 'report_only',
        verified: false,
        reason: 'missing_signature',
      })
      await expect(evaluateMetaSignature(BODY, 'sha256=xyz')).resolves.toMatchObject({
        ok: true,
        reason: 'malformed_signature',
      })
    })

    it('primeira assinatura válida grava o hash comprovado e passa a exigir assinatura', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })

      await expect(evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))).resolves.toEqual({
        ok: true,
        mode: 'enforced',
        verified: true,
      })
      expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe(sha256(SETTINGS_SECRET))
      expect(setting(META_APP_SECRET_VERIFIED_AT_SETTING)).toBe('2026-10-11T12:00:00.000Z')
      // O hash não é o secret.
      expect(JSON.stringify(db.rows('settings').filter((r) => r.key !== META_APP_SECRET_SETTING))).not.toContain(
        SETTINGS_SECRET
      )

      await expect(evaluateMetaSignature(BODY, sign('forjado', BODY))).resolves.toEqual({
        ok: false,
        mode: 'enforced',
        verified: false,
        reason: 'invalid_signature',
      })
      await expect(evaluateMetaSignature(BODY, null)).resolves.toMatchObject({ ok: false, reason: 'missing_signature' })
    })

    it('a verificação persistida vale para outras instâncias (estado em memória zerado)', async () => {
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
      await evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))

      resetMetaSignatureState()
      await expect(evaluateMetaSignature(BODY, sign('forjado', BODY))).resolves.toMatchObject({
        ok: false,
        mode: 'enforced',
      })
    })

    it('trocar o secret pela UI volta para report_only (hash comprovado é de outro secret)', async () => {
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
      await evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))

      const verifiedHash = setting(META_APP_SECRET_VERIFIED_HASH_SETTING) as string
      useDb({
        [META_APP_SECRET_SETTING]: 'secret-novo',
        [META_APP_SECRET_VERIFIED_HASH_SETTING]: verifiedHash,
      })
      clearMetaAppSecretCache()

      await expect(evaluateMetaSignature(BODY, sign(REAL_META_SECRET, BODY))).resolves.toMatchObject({
        ok: true,
        mode: 'report_only',
      })
    })

    it('falha ao gravar a verificação: esta instância já exige assinatura e tenta gravar de novo depois', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
      await getMetaAppSecret() // aquece o cache antes de a escrita falhar
      db.failNext('settings', 'write failed')

      await expect(evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))).resolves.toMatchObject({ verified: true })
      expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBeUndefined()
      await expect(evaluateMetaSignature(BODY, sign('forjado', BODY))).resolves.toMatchObject({
        ok: false,
        mode: 'enforced',
      })

      vi.setSystemTime(new Date('2026-10-11T12:02:00Z'))
      await evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))
      expect(setting(META_APP_SECRET_VERIFIED_HASH_SETTING)).toBe(sha256(SETTINGS_SECRET))
    })

    it("META_WEBHOOK_REQUIRE_SIGNATURE='true' exige desde o início, mesmo sem comprovação", async () => {
      vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'true')
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
      await expect(evaluateMetaSignature(BODY, sign(REAL_META_SECRET, BODY))).resolves.toMatchObject({
        ok: false,
        mode: 'enforced',
        reason: 'invalid_signature',
      })
      await expect(evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))).resolves.toEqual({
        ok: true,
        mode: 'enforced',
        verified: true,
      })
    })

    it('a promoção dispensa os alertas de "secret não confirmado" ativos', async () => {
      useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET }, [
        { id: `${META_SIGNATURE_ALERT_ID_PREFIX}1`, type: META_INTEGRATION_ALERT_TYPE, dismissed: false },
        { id: 'alert_131031_1', type: 'auth', dismissed: false },
      ])
      await evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))
      const alerts = db.rows('account_alerts')
      expect(alerts.find((a) => a.id === `${META_SIGNATURE_ALERT_ID_PREFIX}1`)?.dismissed).toBe(true)
      // Alerta auth real da Meta não é tocado.
      expect(alerts.find((a) => a.id === 'alert_131031_1')?.dismissed).toBe(false)
    })
  })

  describe('sem App Secret', () => {
    it('aceita sem assinatura em modo unsigned_allowed', async () => {
      await expect(evaluateMetaSignature(BODY, null)).resolves.toEqual({
        ok: true,
        mode: 'unsigned_allowed',
        verified: false,
        reason: 'no_app_secret',
      })
    })

    it('ignora qualquer header (não há o que verificar)', async () => {
      await expect(evaluateMetaSignature(BODY, 'sha256=lixo')).resolves.toMatchObject({
        ok: true,
        mode: 'unsigned_allowed',
        verified: false,
      })
    })

    it('loga o warning uma vez por janela, não a cada request', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
      const warn = vi.mocked(console.warn)
      warn.mockClear()

      await evaluateMetaSignature(BODY, null)
      await evaluateMetaSignature(BODY, null)
      await evaluateMetaSignature(BODY, null)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0][0])).toMatch(/fecha o buraco/)

      vi.setSystemTime(new Date('2026-10-11T12:16:00Z'))
      await evaluateMetaSignature(BODY, null)
      expect(warn).toHaveBeenCalledTimes(2)
    })

    it("META_WEBHOOK_REQUIRE_SIGNATURE='true' rejeita (fail-closed total)", async () => {
      vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'true')
      await expect(evaluateMetaSignature(BODY, sign('qualquer', BODY))).resolves.toEqual({
        ok: false,
        mode: 'enforced',
        verified: false,
        reason: 'app_secret_required',
      })
    })

    it("META_WEBHOOK_REQUIRE_SIGNATURE diferente de 'true' mantém unsigned_allowed", async () => {
      vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'false')
      await expect(evaluateMetaSignature(BODY, null)).resolves.toMatchObject({ ok: true, mode: 'unsigned_allowed' })
      vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', '1')
      await expect(evaluateMetaSignature(BODY, null)).resolves.toMatchObject({ ok: true, mode: 'unsigned_allowed' })
    })
  })

  it('falha ao ler o App Secret → rejeita (nunca abre por erro de banco)', async () => {
    db.failNext('settings', 'db down')
    await expect(evaluateMetaSignature(BODY, null)).resolves.toEqual({
      ok: false,
      mode: 'enforced',
      verified: false,
      reason: 'secret_unavailable',
    })
  })

  it('expõe o nome do header em minúsculas (Headers.get é case-insensitive)', () => {
    expect(META_SIGNATURE_HEADER).toBe('x-hub-signature-256')
  })
})

describe('getMetaSignatureStatus', () => {
  it('enforced via env (verificação não se aplica)', async () => {
    vi.stubEnv('META_APP_SECRET', ENV_SECRET)
    await expect(getMetaSignatureStatus()).resolves.toMatchObject({
      mode: 'enforced',
      verification: 'not_applicable',
      secretSource: 'env',
      rejectsAll: false,
      recommendedAction: null,
    })
  })

  it('secret de Configurações não comprovado → report_only / pending_verification', async () => {
    useDb({ [META_APP_SECRET_SETTING]: SETTINGS_SECRET })
    const status = await getMetaSignatureStatus()
    expect(status).toMatchObject({
      mode: 'report_only',
      verification: 'pending_verification',
      secretSource: 'settings',
      verifiedAt: null,
    })
    expect(status.recommendedAction).toMatch(/ainda não foi confirmado/)
  })

  it('secret de Configurações comprovado → enforced / verified', async () => {
    useDb({
      [META_APP_SECRET_SETTING]: SETTINGS_SECRET,
      [META_APP_SECRET_VERIFIED_HASH_SETTING]: sha256(SETTINGS_SECRET),
      [META_APP_SECRET_VERIFIED_AT_SETTING]: '2026-10-01T00:00:00.000Z',
    })
    await expect(getMetaSignatureStatus()).resolves.toMatchObject({
      mode: 'enforced',
      verification: 'verified',
      verifiedAt: '2026-10-01T00:00:00.000Z',
      recommendedAction: null,
    })
  })

  it('unsigned_allowed com ação recomendada dizendo que o App Secret fecha o buraco', async () => {
    const status = await getMetaSignatureStatus()
    expect(status).toMatchObject({
      mode: 'unsigned_allowed',
      verification: 'unsigned_allowed',
      secretSource: null,
      rejectsAll: false,
    })
    expect(status.recommendedAction).toMatch(/App Secret/)
    expect(status.recommendedAction).toMatch(/fecha esse buraco/)
  })

  it('exige assinatura sem secret → rejectsAll', async () => {
    vi.stubEnv('META_WEBHOOK_REQUIRE_SIGNATURE', 'true')
    await expect(getMetaSignatureStatus()).resolves.toMatchObject({
      mode: 'enforced',
      requireSignature: true,
      rejectsAll: true,
    })
  })

  it('erro de leitura vira status com error (sem lançar)', async () => {
    const failing = createInMemorySupabase({}, { settings: 'key' })
    mockedGetSupabaseAdmin.mockReturnValue({
      from: (table: string) => {
        if (table === 'settings') failing.failNext('settings', 'db down')
        return failing.client.from(table)
      },
    } as never)
    await expect(getMetaSignatureStatus()).resolves.toMatchObject({ mode: 'enforced', error: expect.stringMatching(/db down/) })
  })

  it('mostra falhas recentes, última assinatura válida e alertas recentes', async () => {
    vi.stubEnv('META_APP_SECRET', ENV_SECRET)
    useDb({}, [
      {
        id: `${META_SIGNATURE_ALERT_ID_PREFIX}9`,
        type: META_INTEGRATION_ALERT_TYPE,
        message: 'x',
        details: JSON.stringify({ kind: 'enforced_rejections', count: 5 }),
        dismissed: true,
        created_at: '2026-10-11T10:00:00.000Z',
      },
    ])
    const ok = await evaluateMetaSignature(BODY, sign(ENV_SECRET, BODY))
    expect(ok.verified).toBe(true)
    for (const header of [null, 'sha256=xyz', sign('forjado', BODY)]) {
      const evaluation = await evaluateMetaSignature(BODY, header)
      await reportMetaSignatureFailure({ evaluation, endpoint: 'webhook' })
    }

    const status = await getMetaSignatureStatus()
    expect(status.lastValidSignatureAt).toBeTruthy()
    expect(status.recentFailures).toMatchObject({
      scope: 'instance',
      total: 3,
      byReason: { missing_signature: 1, malformed_signature: 1, invalid_signature: 1 },
      lastReason: 'invalid_signature',
      lastEndpoint: 'webhook',
    })
    expect(status.recentAlerts).toHaveLength(1)
    expect(status.recentAlerts[0]).toMatchObject({ dismissed: true, details: { kind: 'enforced_rejections' } })
  })
})

describe('reportMetaSignatureFailure', () => {
  const enforced = (reason: MetaSignatureEvaluation['reason']): MetaSignatureEvaluation => ({
    ok: false,
    mode: 'enforced',
    verified: false,
    reason,
  })
  const reportOnly: MetaSignatureEvaluation = {
    ok: true,
    mode: 'report_only',
    verified: false,
    reason: 'invalid_signature',
  }

  it('CENÁRIO DO ACHADO: curl anônimo sem header/malformado NÃO gera alerta (só estatística)', async () => {
    vi.stubEnv('META_APP_SECRET', ENV_SECRET)
    for (let i = 0; i < 10; i++) {
      await reportMetaSignatureFailure({ evaluation: enforced('missing_signature'), endpoint: 'webhook' })
      await reportMetaSignatureFailure({ evaluation: enforced('malformed_signature'), endpoint: 'flows_endpoint' })
    }
    expect(db.rows('account_alerts')).toEqual([])
    expect(getMetaSignatureFailureSummary().total).toBe(20)
  })

  it("enforced: rejeições repetidas sem assinatura válida → alerta 'meta_integration' (nunca 'auth')", async () => {
    for (let i = 0; i < 4; i++) {
      await reportMetaSignatureFailure({ evaluation: enforced('invalid_signature'), endpoint: 'webhook' })
    }
    expect(signatureAlerts()).toHaveLength(0)

    await reportMetaSignatureFailure({ evaluation: enforced('invalid_signature'), endpoint: 'webhook' })
    const alerts = signatureAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].id).toMatch(/^alert_meta_signature_\d+$/)
    expect(alerts[0].type).toBe(META_INTEGRATION_ALERT_TYPE)
    expect(alerts[0].type).not.toBe('auth')
    expect(alerts[0].code).toBeNull()
    expect(JSON.parse(String(alerts[0].details))).toMatchObject({
      kind: 'enforced_rejections',
      reason: 'invalid_signature',
      endpoint: 'webhook',
      count: 5,
    })
    // Texto neutro: não manda trocar um secret que pode estar certo.
    expect(String(alerts[0].message)).toMatch(/sem nenhuma assinatura válida/)
    expect(JSON.parse(String(alerts[0].details)).action).toMatch(/nada precisa ser feito/)
  })

  it('enforced: com assinatura válida recente nesta instância, rejeições não alertam (forja, não configuração)', async () => {
    vi.stubEnv('META_APP_SECRET', ENV_SECRET)
    await evaluateMetaSignature(BODY, sign(ENV_SECRET, BODY))
    for (let i = 0; i < 10; i++) {
      await reportMetaSignatureFailure({ evaluation: enforced('invalid_signature'), endpoint: 'webhook' })
    }
    expect(signatureAlerts()).toHaveLength(0)
  })

  it('enforced: com assinatura válida recente em OUTRA instância (persistida), não alerta', async () => {
    useDb({ [META_SIGNATURE_LAST_VALID_AT_SETTING]: new Date().toISOString() })
    for (let i = 0; i < 5; i++) {
      await reportMetaSignatureFailure({ evaluation: enforced('invalid_signature'), endpoint: 'webhook' })
    }
    expect(signatureAlerts()).toHaveLength(0)
  })

  it("report_only: assinatura que nunca confere → alerta 'secret ainda não confirmado'", async () => {
    await reportMetaSignatureFailure({ evaluation: reportOnly, endpoint: 'webhook' })
    expect(signatureAlerts()).toHaveLength(0)
    await reportMetaSignatureFailure({ evaluation: reportOnly, endpoint: 'flows_endpoint' })

    const alerts = signatureAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe(META_INTEGRATION_ALERT_TYPE)
    expect(String(alerts[0].message)).toMatch(/ainda não foi confirmado/)
    expect(String(alerts[0].message)).toMatch(/NÃO está ativa/)
    expect(JSON.parse(String(alerts[0].details))).toMatchObject({ kind: 'secret_unconfirmed', mode: 'report_only' })
  })

  it('app_secret_required alerta na hora (depende só da configuração)', async () => {
    await reportMetaSignatureFailure({ evaluation: enforced('app_secret_required'), endpoint: 'webhook' })
    expect(signatureAlerts()).toHaveLength(1)
    expect(JSON.parse(String(signatureAlerts()[0].details))).toMatchObject({ kind: 'rejects_all' })
  })

  it('rate limit por instância: segunda falha logo em seguida não grava de novo', async () => {
    await reportMetaSignatureFailure({ evaluation: enforced('app_secret_required'), endpoint: 'webhook' })
    expect(db.rows('account_alerts')).toHaveLength(1)
    useDb() // banco limpo: só o throttle local impede
    await reportMetaSignatureFailure({ evaluation: enforced('app_secret_required'), endpoint: 'webhook' })
    expect(db.rows('account_alerts')).toHaveLength(0)
  })

  it('não cria se já existe alerta de assinatura ativo', async () => {
    useDb({}, [{ id: `${META_SIGNATURE_ALERT_ID_PREFIX}1`, type: META_INTEGRATION_ALERT_TYPE, dismissed: false }])
    await reportMetaSignatureFailure({ evaluation: enforced('app_secret_required'), endpoint: 'flows_endpoint' })
    expect(signatureAlerts()).toHaveLength(1)
  })

  it('unsigned_allowed: aviso único de App Secret ausente; dispensado, não volta', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
    const unsigned: MetaSignatureEvaluation = { ok: true, mode: 'unsigned_allowed', verified: false, reason: 'no_app_secret' }

    await reportMetaSignatureFailure({ evaluation: unsigned, endpoint: 'webhook' })
    let alerts = db.rows('account_alerts')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ id: META_APP_SECRET_MISSING_ALERT_ID, type: META_INTEGRATION_ALERT_TYPE })
    expect(JSON.parse(String(alerts[0].details)).action).toMatch(/fecha esse buraco/)

    // Dono dispensa; horas depois chega outra request sem assinatura.
    await (db.client.from('account_alerts') as { update: (p: object) => { eq: (c: string, v: string) => Promise<unknown> } })
      .update({ dismissed: true })
      .eq('id', META_APP_SECRET_MISSING_ALERT_ID)
    vi.setSystemTime(new Date('2026-10-11T18:00:00Z'))
    await reportMetaSignatureFailure({ evaluation: unsigned, endpoint: 'webhook' })
    alerts = db.rows('account_alerts')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].dismissed).toBe(true)
  })

  it('CENÁRIO DO ACHADO: aviso de App Secret ausente apagado pela 1ª assinatura válida volta se o secret for removido depois', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
    const unsigned: MetaSignatureEvaluation = { ok: true, mode: 'unsigned_allowed', verified: false, reason: 'no_app_secret' }

    // 1) Sem secret: o aviso aparece.
    await reportMetaSignatureFailure({ evaluation: unsigned, endpoint: 'webhook' })
    expect(db.rows('account_alerts').filter((a) => a.id === META_APP_SECRET_MISSING_ALERT_ID)).toHaveLength(1)

    // 2) Dono salva o secret e a Meta manda a 1ª assinatura válida: o sistema resolve
    //    o aviso APAGANDO a linha (antes: dismissed=true, id ocupado para sempre).
    await (db.client.from('settings') as { upsert: (r: object, o: object) => Promise<unknown> }).upsert(
      { key: META_APP_SECRET_SETTING, value: SETTINGS_SECRET },
      { onConflict: 'key' }
    )
    clearMetaAppSecretCache()
    await expect(evaluateMetaSignature(BODY, sign(SETTINGS_SECRET, BODY))).resolves.toMatchObject({ verified: true })
    expect(db.rows('account_alerts').filter((a) => a.id === META_APP_SECRET_MISSING_ALERT_ID)).toEqual([])

    // 3) Depois o dono remove o secret ("Desconectar"): volta a unsigned_allowed e o aviso VOLTA.
    await (db.client.from('settings') as { update: (p: object) => { eq: (c: string, v: string) => Promise<unknown> } })
      .update({ value: '' })
      .eq('key', META_APP_SECRET_SETTING)
    clearMetaAppSecretCache()
    vi.setSystemTime(new Date('2026-10-11T18:00:00Z'))
    const evaluation = await evaluateMetaSignature(BODY, null)
    expect(evaluation).toMatchObject({ mode: 'unsigned_allowed', reason: 'no_app_secret' })
    await reportMetaSignatureFailure({ evaluation, endpoint: 'webhook' })
    const active = db.rows('account_alerts').filter((a) => a.id === META_APP_SECRET_MISSING_ALERT_ID && a.dismissed === false)
    expect(active).toHaveLength(1)
  })

  it('não registra em sucesso nem em falha de leitura do secret', async () => {
    await reportMetaSignatureFailure({ evaluation: { ok: true, mode: 'enforced', verified: true }, endpoint: 'webhook' })
    await reportMetaSignatureFailure({ evaluation: enforced('secret_unavailable'), endpoint: 'webhook' })
    expect(db.accessed).toEqual([])
    expect(getMetaSignatureFailureSummary().total).toBe(0)
  })

  it('é best-effort: erro do banco não propaga', async () => {
    mockedGetSupabaseAdmin.mockReturnValue({
      from: () => {
        throw new Error('boom')
      },
    } as never)

    await expect(
      reportMetaSignatureFailure({ evaluation: enforced('app_secret_required'), endpoint: 'webhook' })
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

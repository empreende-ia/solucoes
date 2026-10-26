// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/flows/endpoint/keys/sync (sessão do dono): re-registra a chave LOCAL
 * existente quando a da Meta diverge. Ação do Diagnóstico da Meta.
 */

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getSupabaseAdmin: vi.fn(() => null),
}))
vi.mock('@/lib/whatsapp/flow-endpoint-keys', () => ({
  syncFlowPublicKeyWithMeta: vi.fn(),
  dismissFlowKeyAlerts: vi.fn(async () => {}),
}))

import { POST } from '@/app/api/flows/endpoint/keys/sync/route'
import { dismissFlowKeyAlerts, syncFlowPublicKeyWithMeta } from '@/lib/whatsapp/flow-endpoint-keys'
import { resolveApiPolicy } from '@/lib/route-policy'

beforeEach(() => {
  vi.mocked(syncFlowPublicKeyWithMeta).mockReset()
  vi.mocked(dismissFlowKeyAlerts).mockClear()
})

describe('POST /api/flows/endpoint/keys/sync', () => {
  it('exige sessão do dono (não é rota pública como /api/flows/endpoint)', () => {
    expect(resolveApiPolicy('/api/flows/endpoint/keys/sync', 'POST')).toBe('session')
  })

  it('re-sincronizou → 200 e dispensa os avisos de chave', async () => {
    vi.mocked(syncFlowPublicKeyWithMeta).mockResolvedValue({ status: 'resynced' })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, status: 'resynced' })
    expect(dismissFlowKeyAlerts).toHaveBeenCalledTimes(1)
  })

  it('já em dia → 200', async () => {
    vi.mocked(syncFlowPublicKeyWithMeta).mockResolvedValue({ status: 'in_sync' })
    expect((await POST()).status).toBe(200)
  })

  it('sem chave local → 400 apontando para gerar as chaves', async () => {
    vi.mocked(syncFlowPublicKeyWithMeta).mockResolvedValue({ status: 'missing_local_key' })
    const res = await POST()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Gere as chaves/)
    expect(dismissFlowKeyAlerts).not.toHaveBeenCalled()
  })

  it('Graph falhou → 502 com o erro', async () => {
    vi.mocked(syncFlowPublicKeyWithMeta).mockResolvedValue({ status: 'failed', error: 'sem permissão' })
    const res = await POST()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/sem permissão/)
  })
})

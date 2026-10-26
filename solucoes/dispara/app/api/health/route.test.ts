// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  configured: true,
  dbError: null as null | { message: string },
}))

const mocks = vi.hoisted(() => ({
  getWhatsAppCredentials: vi.fn(),
  fetchWithTimeout: vi.fn(),
  settingsGet: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => state.configured,
  supabase: {
    from: () => ({
      select: () => ({
        limit: async () => (state.dbError ? { data: null, error: state.dbError } : { data: [], error: null }),
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
        or: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/whatsapp-credentials', () => ({ getWhatsAppCredentials: mocks.getWhatsAppCredentials }))
vi.mock('@/lib/server-http', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
  safeJson: async (res: Response) => res.json(),
}))
vi.mock('@/lib/supabase-db', () => ({ settingsDb: { get: mocks.settingsGet } }))

async function loadRoute() {
  vi.resetModules()
  return import('./route')
}

function request(principal?: string): Request {
  const headers: Record<string, string> = {}
  if (principal) headers['x-dispara-principal'] = principal
  return new Request('https://app.example.com/api/health', { headers })
}

describe('GET /api/health', () => {
  beforeEach(() => {
    state.configured = true
    state.dbError = null
    mocks.getWhatsAppCredentials.mockReset()
    mocks.getWhatsAppCredentials.mockResolvedValue({ phoneNumberId: '123', accessToken: 'tok' })
    mocks.fetchWithTimeout.mockReset()
    mocks.fetchWithTimeout.mockResolvedValue(
      new Response(JSON.stringify({ display_phone_number: '+55 11 99999-9999' }), { status: 200 })
    )
    mocks.settingsGet.mockReset()
    mocks.settingsGet.mockResolvedValue('verify-token')
  })

  it('anônimo recebe só o mínimo (sem Graph API, telefone, URLs nem mensagens de erro)', async () => {
    const { GET } = await loadRoute()
    const res = await GET(request())
    const body = await res.json()

    expect(body.scope).toBe('public')
    expect(body.services.database).toEqual({ status: 'ok', provider: 'supabase' })
    expect(body.overall).toBe('healthy')
    expect(body.vercel).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('99999')
    expect(mocks.getWhatsAppCredentials).not.toHaveBeenCalled()
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled()
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('banco fora: payload público ainda sinaliza database.status=error (overlay do DashboardShell)', async () => {
    state.dbError = { message: 'connect ECONNREFUSED db.abcd.supabase.co:5432' }
    const { GET } = await loadRoute()
    const body = await (await GET(request())).json()

    expect(body.services.database.status).toBe('error')
    expect(body.overall).toBe('unhealthy')
    expect(JSON.stringify(body)).not.toContain('supabase.co')
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
  })

  it('principal public explícito também recebe o payload mínimo', async () => {
    const { GET } = await loadRoute()
    const body = await (await GET(request('public'))).json()
    expect(body.scope).toBe('public')
  })

  it('payload público é cacheado (não vira amplificador anônimo)', async () => {
    const { GET } = await loadRoute()
    await GET(request())
    state.dbError = { message: 'down' }
    const body = await (await GET(request())).json()
    expect(body.services.database.status).toBe('ok')
  })

  it.each(['session', 'api_key', 'admin_key'])('dono (%s) recebe o payload completo', async (principal) => {
    const { GET } = await loadRoute()
    const body = await (await GET(request(principal))).json()

    expect(body.scope).toBe('full')
    expect(body.services.whatsapp.status).toBe('ok')
    expect(body.services.whatsapp.phoneNumber).toBe('+55 11 99999-9999')
    expect(mocks.fetchWithTimeout).toHaveBeenCalledTimes(1)
  })
})

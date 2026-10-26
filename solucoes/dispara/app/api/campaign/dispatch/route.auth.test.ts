// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getByName: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
  getSupabaseAdmin: () => null,
  isSupabaseConfigured: () => true,
}))
vi.mock('@/lib/supabase-db', () => ({ templateDb: { getByName: mocks.getByName }, settingsDb: { get: vi.fn() } }))
vi.mock('@/lib/whatsapp-credentials', () => ({ getWhatsAppCredentials: vi.fn() }))
vi.mock('@/lib/whatsapp-adaptive-throttle', () => ({ getAdaptiveThrottleConfigWithSource: vi.fn() }))
vi.mock('@/lib/phone-suppressions', () => ({ getActiveSuppressionsByPhone: vi.fn() }))

import { POST } from './route'

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://app.example.com/api/campaign/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ campaignId: 'camp-1', templateName: 'promo' }),
  })
}

describe('POST /api/campaign/dispatch — autenticação', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    // Campanha inexistente: se a auth passar, a rota responde 404 sem ir adiante.
    mocks.from.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'not found' } }) }) }),
    })
    mocks.getByName.mockReset()
    mocks.getByName.mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['sem nada', {}],
    ['header upstash-signature (bypass antigo)', { 'upstash-signature': 'qualquer-coisa' }],
    ['cookie com "dispara_session=" (bypass antigo)', { cookie: 'foo=dispara_session=x' }],
    ['cookie dispara_session sem principal do proxy', { cookie: 'dispara_session=forjado' }],
    ['principal public', { 'x-dispara-principal': 'public' }],
  ])('%s → 401 sem tocar no banco', async (_label, headers) => {
    const res = await POST(request(headers as Record<string, string>))
    expect(res.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('atendente → 403', async () => {
    const res = await POST(
      request({
        'x-dispara-principal': 'attendant',
        'x-dispara-attendant-id': 'a1',
        'x-dispara-attendant-perms': '{"canView":true,"canReply":true,"canHandoff":true}',
      })
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each(['session', 'api_key', 'admin_key', 'cron'])('principal %s passa da auth', async (principal) => {
    const res = await POST(request({ 'x-dispara-principal': principal }))
    expect(res.status).toBe(404)
    expect(mocks.from).toHaveBeenCalled()
  })
})

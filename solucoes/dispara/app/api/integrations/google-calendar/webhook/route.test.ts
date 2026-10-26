// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Webhook do Google Calendar (events.watch) e callback OAuth.
 * O webhook agora é público no proxy → a rota precisa validar canal + token.
 */

vi.mock('@/lib/google-calendar', () => ({
  getCalendarChannel: vi.fn(),
  markCalendarNotification: vi.fn(async () => {}),
  exchangeCodeForTokens: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt' })),
  fetchGoogleAccountEmail: vi.fn(async () => 'dono@empresa.test'),
  saveTokens: vi.fn(async () => {}),
  buildDefaultCalendarConfig: vi.fn(async () => ({ calendarId: 'primary' })),
  saveCalendarConfig: vi.fn(async () => {}),
  ensureCalendarChannel: vi.fn(async () => ({})),
}))
vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: vi.fn(() => true),
}))

import { GET, POST } from '@/app/api/integrations/google-calendar/webhook/route'
import { GET as CALLBACK } from '@/app/api/integrations/google-calendar/callback/route'
import {
  exchangeCodeForTokens,
  getCalendarChannel,
  markCalendarNotification,
  type GoogleCalendarChannel,
} from '@/lib/google-calendar'
import { isSupabaseConfigured } from '@/lib/supabase'

const CHANNEL: GoogleCalendarChannel = {
  id: 'gc_channel_abc',
  resourceId: 'resource-xyz',
  token: 'channel-token-secret',
  calendarId: 'primary',
  createdAt: '2026-10-01T00:00:00.000Z',
}

function notify(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://dispara.test/api/integrations/google-calendar/webhook', {
    method: 'POST',
    headers,
  })
}

const VALID_HEADERS = {
  'x-goog-channel-id': CHANNEL.id,
  'x-goog-channel-token': CHANNEL.token,
  'x-goog-resource-id': CHANNEL.resourceId,
  'x-goog-resource-state': 'exists',
}

beforeEach(() => {
  vi.mocked(getCalendarChannel).mockReset()
  vi.mocked(getCalendarChannel).mockResolvedValue(CHANNEL)
  vi.mocked(markCalendarNotification).mockClear()
  vi.mocked(exchangeCodeForTokens).mockClear()
  vi.mocked(isSupabaseConfigured).mockReturnValue(true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/integrations/google-calendar/webhook', () => {
  it('canal + token + resource corretos → 200 e registra a notificação', async () => {
    const res = await POST(notify(VALID_HEADERS))
    expect(res.status).toBe(200)
    expect(markCalendarNotification).toHaveBeenCalledWith({ resourceState: 'exists' })
  })

  it('sem canal configurado → 404', async () => {
    vi.mocked(getCalendarChannel).mockResolvedValue(null)
    const res = await POST(notify(VALID_HEADERS))
    expect(res.status).toBe(404)
    expect(markCalendarNotification).not.toHaveBeenCalled()
  })

  it('canal salvo sem token → 404 (nunca casa com header vazio)', async () => {
    vi.mocked(getCalendarChannel).mockResolvedValue({ ...CHANNEL, token: '' })
    const res = await POST(notify({ ...VALID_HEADERS, 'x-goog-channel-token': '' }))
    expect(res.status).toBe(404)
    expect(markCalendarNotification).not.toHaveBeenCalled()
  })

  it('Supabase não configurado → 404', async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false)
    const res = await POST(notify(VALID_HEADERS))
    expect(res.status).toBe(404)
  })

  it('token errado ou ausente → 403', async () => {
    const wrong = await POST(notify({ ...VALID_HEADERS, 'x-goog-channel-token': 'chute' }))
    expect(wrong.status).toBe(403)
    const { ['x-goog-channel-token']: _omit, ...withoutToken } = VALID_HEADERS
    const missing = await POST(notify(withoutToken))
    expect(missing.status).toBe(403)
    expect(markCalendarNotification).not.toHaveBeenCalled()
  })

  it('token certo mas channel id errado ou ausente → 403', async () => {
    const wrong = await POST(notify({ ...VALID_HEADERS, 'x-goog-channel-id': 'gc_channel_outro' }))
    expect(wrong.status).toBe(403)
    const { ['x-goog-channel-id']: _omit, ...withoutId } = VALID_HEADERS
    const missing = await POST(notify(withoutId))
    expect(missing.status).toBe(403)
    expect(markCalendarNotification).not.toHaveBeenCalled()
  })

  it('resource id diferente do salvo → 403', async () => {
    const res = await POST(notify({ ...VALID_HEADERS, 'x-goog-resource-id': 'outro-recurso' }))
    expect(res.status).toBe(403)
    expect(markCalendarNotification).not.toHaveBeenCalled()
  })

  it('GET responde 200 sem efeito colateral', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(getCalendarChannel).not.toHaveBeenCalled()
    expect(markCalendarNotification).not.toHaveBeenCalled()
  })
})

describe('GET /api/integrations/google-calendar/callback (state OAuth)', () => {
  function callback(state: string | null, cookieState: string | null): NextRequest {
    const url = new URL('https://dispara.test/api/integrations/google-calendar/callback')
    url.searchParams.set('code', 'auth-code')
    if (state !== null) url.searchParams.set('state', state)
    const headers: Record<string, string> = {}
    if (cookieState !== null) headers.cookie = `gc_oauth_state=${cookieState}; gc_oauth_return=/settings`
    return new NextRequest(url, { headers })
  }

  it('state diferente do cookie → 400 sem trocar o code', async () => {
    const res = await CALLBACK(callback('state-a', 'state-b'))
    expect(res.status).toBe(400)
    expect(exchangeCodeForTokens).not.toHaveBeenCalled()
  })

  it('state ou cookie ausente → 400', async () => {
    expect((await CALLBACK(callback(null, 'state-a'))).status).toBe(400)
    expect((await CALLBACK(callback('state-a', null))).status).toBe(400)
    expect(exchangeCodeForTokens).not.toHaveBeenCalled()
  })

  it('state igual ao cookie → conclui e redireciona', async () => {
    const res = await CALLBACK(callback('state-ok', 'state-ok'))
    expect(res.status).toBe(307)
    expect(exchangeCodeForTokens).toHaveBeenCalledWith('auth-code')
    expect(res.headers.get('location')).toBe('https://dispara.test/settings')
  })
})

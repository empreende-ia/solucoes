// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { requireSessionOrApiKey } from './request-auth'
import { timingSafeEqualString } from './safe-compare'

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.com/api/contacts', { headers })
}

describe('requireSessionOrApiKey (principal do proxy)', () => {
  it.each(['session', 'api_key', 'admin_key'])('aceita o dono (%s)', async (principal) => {
    expect(await requireSessionOrApiKey(request({ 'x-dispara-principal': principal }))).toBeNull()
  })

  it('sem principal (proxy não rodou) → 401, mesmo com cookie ou API key crus', async () => {
    for (const headers of [{}, { cookie: 'dispara_session=qualquer' }, { authorization: 'Bearer qualquer' }]) {
      const res = await requireSessionOrApiKey(request(headers))
      expect(res?.status).toBe(401)
    }
  })

  it('public → 401; cron e atendente → 403', async () => {
    expect((await requireSessionOrApiKey(request({ 'x-dispara-principal': 'public' })))?.status).toBe(401)
    expect((await requireSessionOrApiKey(request({ 'x-dispara-principal': 'cron' })))?.status).toBe(403)
    const attendant = await requireSessionOrApiKey(
      request({
        'x-dispara-principal': 'attendant',
        'x-dispara-attendant-id': 'a1',
        'x-dispara-attendant-perms': '{"canView":true}',
      })
    )
    expect(attendant?.status).toBe(403)
  })

  it('valor de principal desconhecido → 401', async () => {
    expect((await requireSessionOrApiKey(request({ 'x-dispara-principal': 'root' })))?.status).toBe(401)
  })
})

describe('timingSafeEqualString', () => {
  it('compara exatamente', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true)
    expect(timingSafeEqualString('abc', 'abd')).toBe(false)
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualString('ação', 'ação')).toBe(true)
  })

  it('vazio/ausente nunca casa', () => {
    expect(timingSafeEqualString('', '')).toBe(false)
    expect(timingSafeEqualString('abc', undefined)).toBe(false)
    expect(timingSafeEqualString(null, 'abc')).toBe(false)
  })
})

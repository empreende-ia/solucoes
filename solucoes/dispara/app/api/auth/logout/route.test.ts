// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ logoutUser: vi.fn(), validateSession: vi.fn() }))

vi.mock('@/lib/user-auth', () => ({
  logoutUser: mocks.logoutUser,
  validateSession: mocks.validateSession,
}))

import { POST } from './route'
import { classifyRequestOrigin } from '@/app/api/auth/logout/request-origin'

const APP_URL = 'https://dispara.example/api/auth/logout'

function logoutRequest(headers: Record<string, string> = {}, url: string = APP_URL): NextRequest {
  return new NextRequest(url, { method: 'POST', headers })
}

/** fetch do dashboard (lib/logout-client.ts): o browser marca como same-origin. */
const DASHBOARD_FETCH = { 'sec-fetch-site': 'same-origin', origin: 'https://dispara.example' }

function expectAttendantCookieCleared(res: Response) {
  const setCookie = res.headers.get('set-cookie') || ''
  expect(setCookie).toMatch(/dispara_attendant=;/)
  expect(setCookie).toMatch(/Max-Age=0/)
  expect(setCookie).toMatch(/Path=\//)
  expect(setCookie).toMatch(/HttpOnly/i)
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    mocks.logoutUser.mockReset()
    mocks.logoutUser.mockResolvedValue(undefined)
    mocks.validateSession.mockReset()
    mocks.validateSession.mockResolvedValue(false)
  })

  it('logout do dashboard (same-origin): revoga a sessão e também apaga o cookie de atendente', async () => {
    const res = await POST(logoutRequest(DASHBOARD_FETCH))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(mocks.logoutUser).toHaveBeenCalledTimes(1)

    // Antes: só a sessão do dono saía; /atendimento continuava aberto para a próxima pessoa.
    expectAttendantCookieCleared(res)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  // Cenário do achado: página de terceiro faz form POST auto-submetido (top-level) para
  // /api/auth/logout. Antes a rota respondia `Set-Cookie: dispara_attendant=; Max-Age=0`
  // e o atendente perdia a sessão da PWA até receber um novo link ?token=.
  it('form POST cross-site: 403 sem Set-Cookie e sem tocar na sessão do dono', async () => {
    const res = await POST(
      logoutRequest({
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      })
    )

    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(mocks.logoutUser).not.toHaveBeenCalled()
  })

  it('subdomínio vizinho (same-site) também não apaga cookies', async () => {
    const res = await POST(logoutRequest({ 'sec-fetch-site': 'same-site', origin: 'https://blog.dispara.example' }))
    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(mocks.logoutUser).not.toHaveBeenCalled()
  })

  it('browser sem Sec-Fetch-Site: decide pelo Origin', async () => {
    const same = await POST(logoutRequest({ origin: 'https://dispara.example' }))
    expect(same.status).toBe(200)
    expectAttendantCookieCleared(same)

    const evil = await POST(logoutRequest({ origin: 'https://evil.example' }))
    expect(evil.status).toBe(403)
    expect(evil.headers.get('set-cookie')).toBeNull()

    // Referrer-Policy: no-referrer / iframe sandbox → "Origin: null"
    const opaque = await POST(logoutRequest({ origin: 'null' }))
    expect(opaque.status).toBe(403)
    expect(opaque.headers.get('set-cookie')).toBeNull()

    expect(mocks.logoutUser).toHaveBeenCalledTimes(1)
  })

  it('atrás de proxy reverso: aceita o Origin do host repassado', async () => {
    const res = await POST(
      logoutRequest(
        { origin: 'https://app.cliente.com.br', 'x-forwarded-host': 'app.cliente.com.br', 'x-forwarded-proto': 'https' },
        'http://localhost:3000/api/auth/logout'
      )
    )
    expect(res.status).toBe(200)
    expectAttendantCookieCleared(res)
  })

  it('sem Sec-Fetch-Site nem Origin: só encerra com a sessão do dono confirmada', async () => {
    const anonymous = await POST(logoutRequest())
    expect(anonymous.status).toBe(200)
    expect(anonymous.headers.get('set-cookie')).toBeNull()
    expect(mocks.logoutUser).not.toHaveBeenCalled()

    mocks.validateSession.mockResolvedValue(true)
    const owner = await POST(logoutRequest())
    expect(owner.status).toBe(200)
    expect(mocks.logoutUser).toHaveBeenCalledTimes(1)
    expectAttendantCookieCleared(owner)
  })

  it('erro no logout → 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.logoutUser.mockRejectedValue(new Error('boom'))
    const res = await POST(logoutRequest(DASHBOARD_FETCH))
    expect(res.status).toBe(500)
  })
})

describe('classifyRequestOrigin', () => {
  it('Sec-Fetch-Site manda mesmo quando o Origin parece da casa', () => {
    expect(classifyRequestOrigin(logoutRequest({ 'sec-fetch-site': 'cross-site', origin: 'https://dispara.example' }))).toBe(
      'cross-origin'
    )
    expect(classifyRequestOrigin(logoutRequest({ 'sec-fetch-site': 'none' }))).toBe('cross-origin')
    expect(classifyRequestOrigin(logoutRequest({ 'sec-fetch-site': 'same-origin' }))).toBe('same-origin')
  })

  it('compara o Origin sem diferenciar maiúsculas e usa só o primeiro host repassado', () => {
    expect(classifyRequestOrigin(logoutRequest({ origin: 'HTTPS://Dispara.Example' }))).toBe('same-origin')
    expect(
      classifyRequestOrigin(
        logoutRequest(
          { origin: 'https://app.cliente.com.br', 'x-forwarded-host': 'app.cliente.com.br, interno.local', 'x-forwarded-proto': 'https,http' },
          'http://localhost:3000/api/auth/logout'
        )
      )
    ).toBe('same-origin')
    expect(classifyRequestOrigin(logoutRequest({ origin: 'http://dispara.example' }))).toBe('cross-origin')
    expect(classifyRequestOrigin(logoutRequest())).toBe('unknown')
  })

  it('proxy que termina TLS sem X-Forwarded-Proto: Origin https do mesmo host confere; outro host não', () => {
    const internalUrl = 'http://10.0.0.5:3000/api/auth/logout'
    expect(classifyRequestOrigin(logoutRequest({ origin: 'https://app.cliente.com.br', host: 'app.cliente.com.br' }, internalUrl))).toBe(
      'same-origin'
    )
    expect(classifyRequestOrigin(logoutRequest({ origin: 'https://evil.example', host: 'app.cliente.com.br' }, internalUrl))).toBe(
      'cross-origin'
    )
  })
})

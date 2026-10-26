import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AUTH_REQUIRED_HEADER,
  buildLoginPath,
  ensureSameOriginPath,
  installUnauthorizedRedirect,
  sanitizeRedirectPath,
  shouldRedirectToLogin,
  __resetUnauthorizedRedirectForTests,
} from './auth-redirect'

describe('sanitizeRedirectPath', () => {
  it('aceita caminhos relativos do app', () => {
    expect(sanitizeRedirectPath('/')).toBe('/')
    expect(sanitizeRedirectPath('/campaigns')).toBe('/campaigns')
    expect(sanitizeRedirectPath('/campaigns/1?tab=x#y')).toBe('/campaigns/1?tab=x#y')
    expect(sanitizeRedirectPath('/api/campaigns/1/report.csv')).toBe('/api/campaigns/1/report.csv')
  })

  it('bloqueia open redirect', () => {
    for (const evil of [
      'https://evil.example',
      '//evil.example',
      '//evil.example/login',
      '/\\evil.example',
      '/\\/evil.example',
      '\\\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      'javascript:alert(1)',
      'evil.example',
      '',
      '   ',
    ]) {
      expect(sanitizeRedirectPath(evil), JSON.stringify(evil)).toBe('/')
    }
    expect(sanitizeRedirectPath(null)).toBe('/')
    expect(sanitizeRedirectPath(undefined)).toBe('/')
  })

  it('bloqueia dot-segments que viram //host depois de normalizados', () => {
    for (const evil of [
      '/..//evil.com',
      '/.//evil.com',
      '/%2e%2e//evil.com',
      '/%2E%2E//evil.com',
      '/a/..//evil.com',
      '/..%2f/evil.com',
      '/..%2F/evil.com',
      '/.%2e//evil.com',
      '/..%5c/evil.com',
      '/%2e%2e%2f%2fevil.com',
      '/..%252f/evil.com',
      '/..//evil.com?x=1#y',
    ]) {
      // Antes: '/..//evil.com' saía como '//evil.com' (https://evil.com/ no router.push).
      expect(sanitizeRedirectPath(evil), JSON.stringify(evil)).toBe('/')
    }
  })

  it('a saída nunca resolve para outro origin', () => {
    const base = 'https://app.example.com'
    for (const input of ['/..//evil.com', '/a/../b', '/campaigns/./1', '/%2e%2e/x', '/x?next=//evil.com']) {
      const out = sanitizeRedirectPath(input)
      expect(new URL(out, base).origin, input).toBe(base)
    }
    // dot-segments inofensivos continuam funcionando (normalizados)
    expect(sanitizeRedirectPath('/a/../campaigns')).toBe('/campaigns')
    expect(sanitizeRedirectPath('/contacts?q=%2F%2Fx')).toBe('/contacts?q=%2F%2Fx')
    expect(sanitizeRedirectPath('/contacts/Jo%C3%A3o')).toBe('/contacts/Jo%C3%A3o')
  })

  it('não redireciona de volta para o /login (loop)', () => {
    expect(sanitizeRedirectPath('/login')).toBe('/')
    expect(sanitizeRedirectPath('/login?redirect=/x')).toBe('/')
    expect(sanitizeRedirectPath('/logins')).toBe('/logins')
  })

  it('usa o fallback informado', () => {
    expect(sanitizeRedirectPath('//evil', '/inbox')).toBe('/inbox')
  })
})

describe('ensureSameOriginPath', () => {
  const origin = 'https://app.example.com'

  it('mantém caminhos do próprio app', () => {
    expect(ensureSameOriginPath('/campaigns?x=1', origin)).toBe('/campaigns?x=1')
    expect(ensureSameOriginPath('/', origin)).toBe('/')
  })

  it('troca pelo fallback tudo que sairia do origin', () => {
    for (const evil of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '']) {
      expect(ensureSameOriginPath(evil, origin), JSON.stringify(evil)).toBe('/')
    }
    expect(ensureSameOriginPath('//evil.com', origin, '/inbox')).toBe('/inbox')
  })
})

describe('buildLoginPath', () => {
  it('monta /login?redirect= com o caminho sanitizado', () => {
    expect(buildLoginPath('/campaigns?x=1')).toBe('/login?redirect=%2Fcampaigns%3Fx%3D1')
    expect(buildLoginPath('/')).toBe('/login')
    expect(buildLoginPath('//evil.example')).toBe('/login')
  })
})

describe('shouldRedirectToLogin', () => {
  const location = { href: 'https://app.example.com/campaigns', origin: 'https://app.example.com', pathname: '/campaigns' }

  it('401 do proxy numa API do próprio app → redireciona', () => {
    expect(shouldRedirectToLogin({ requestUrl: '/api/campaigns', status: 401, authRequiredHeader: '1', location })).toBe(true)
    expect(
      shouldRedirectToLogin({ requestUrl: 'https://app.example.com/api/contacts', status: 401, authRequiredHeader: '1', location })
    ).toBe(true)
  })

  it('401 de rota (sem o header do proxy) NÃO redireciona (ex.: credenciais WhatsApp ausentes)', () => {
    expect(shouldRedirectToLogin({ requestUrl: '/api/account/limits', status: 401, authRequiredHeader: null, location })).toBe(false)
  })

  it('ignora /api/auth/*, outros status, outras origens e não-API', () => {
    expect(shouldRedirectToLogin({ requestUrl: '/api/auth/login', status: 401, authRequiredHeader: '1', location })).toBe(false)
    expect(shouldRedirectToLogin({ requestUrl: '/api/campaigns', status: 403, authRequiredHeader: '1', location })).toBe(false)
    expect(shouldRedirectToLogin({ requestUrl: '/api/campaigns', status: 503, authRequiredHeader: '1', location })).toBe(false)
    expect(
      shouldRedirectToLogin({ requestUrl: 'https://graph.facebook.com/api/x', status: 401, authRequiredHeader: '1', location })
    ).toBe(false)
    expect(shouldRedirectToLogin({ requestUrl: '/apiary', status: 401, authRequiredHeader: '1', location })).toBe(false)
  })

  it('não age na PWA /atendimento, em páginas públicas nem no wizard', () => {
    for (const pathname of ['/atendimento', '/atendimento/conversa/1', '/login', '/f/form', '/install']) {
      const loc = { href: `https://app.example.com${pathname}`, origin: 'https://app.example.com', pathname }
      expect(
        shouldRedirectToLogin({ requestUrl: '/api/attendant/conversations', status: 401, authRequiredHeader: '1', location: loc }),
        pathname
      ).toBe(false)
    }
  })
})

describe('installUnauthorizedRedirect', () => {
  const originalFetch = window.fetch
  let assign: ReturnType<typeof vi.fn>

  beforeEach(() => {
    __resetUnauthorizedRedirectForTests()
    assign = vi.fn()
    window.history.replaceState({}, '', '/campaigns?status=x')
  })

  afterEach(() => {
    window.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function stubFetch(status: number, headers: Record<string, string> = {}) {
    const stub = vi.fn(async () => new Response(null, { status, headers }))
    window.fetch = stub as unknown as typeof window.fetch
    return stub
  }

  it('redireciona UMA vez para /login?redirect=<página atual> em 401 do proxy', async () => {
    stubFetch(401, { [AUTH_REQUIRED_HEADER]: '1' })
    installUnauthorizedRedirect(assign)

    const res = await window.fetch('/api/campaigns')
    expect(res.status).toBe(401) // a resposta original segue para quem chamou
    await window.fetch('/api/contacts')
    await window.fetch(new Request(`${window.location.origin}/api/templates`))

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/login?redirect=%2Fcampaigns%3Fstatus%3Dx')
  })

  it('ignora 401 sem o header do proxy', async () => {
    stubFetch(401)
    installUnauthorizedRedirect(assign)
    await window.fetch('/api/account/limits')
    expect(assign).not.toHaveBeenCalled()
  })

  it('não age na PWA de atendente', async () => {
    window.history.replaceState({}, '', '/atendimento')
    stubFetch(401, { [AUTH_REQUIRED_HEADER]: '1' })
    installUnauthorizedRedirect(assign)
    await window.fetch('/api/attendant/conversations')
    expect(assign).not.toHaveBeenCalled()
  })

  it('instalar duas vezes não empilha interceptadores', async () => {
    const stub = stubFetch(200)
    installUnauthorizedRedirect(assign)
    installUnauthorizedRedirect(assign)
    await window.fetch('/api/campaigns')
    expect(stub).toHaveBeenCalledTimes(1)
  })
})

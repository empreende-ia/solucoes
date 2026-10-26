// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

vi.mock('@/lib/user-auth', () => ({
  SESSION_COOKIE_NAME: 'dispara_session',
  isValidSessionToken: vi.fn(),
}))

vi.mock('@/lib/attendant-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/attendant-auth')>()
  return { ...actual, resolveAttendantTokenDetailed: vi.fn() }
})

import { proxy, config } from './proxy'
import { isValidSessionToken } from '@/lib/user-auth'
import { resolveAttendantTokenDetailed } from '@/lib/attendant-auth'

const mockedSession = vi.mocked(isValidSessionToken)
const mockedAttendant = vi.mocked(resolveAttendantTokenDetailed)

const ENV_KEYS = ['MASTER_PASSWORD', 'DISPARA_API_KEY', 'DISPARA_ADMIN_KEY', 'CRON_SECRET'] as const
const BASE = 'https://app.example.com'
const VALID_COOKIE = 'dispara_session=good-token'
const FORGED_COOKIE = 'dispara_session=x'

function req(
  path: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(`${BASE}${path}`, { method: opts.method ?? 'GET', headers: opts.headers ?? {} })
}

/** Lista de headers que o proxy repassa para a rota (NextResponse.next({ request: { headers } })). */
function forwardedHeaderNames(res: Response): string[] {
  return (res.headers.get('x-middleware-override-headers') || '').split(',').filter(Boolean)
}

function forwarded(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`)
}

function principalOf(res: Response): string | null {
  return forwarded(res, 'x-dispara-principal')
}

function isPassThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1'
}

describe('proxy', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.MASTER_PASSWORD = 'master-secret'
    process.env.DISPARA_API_KEY = 'api-key-123'
    process.env.DISPARA_ADMIN_KEY = 'admin-key-456'
    process.env.CRON_SECRET = 'cron-secret-789'

    mockedSession.mockReset()
    mockedSession.mockImplementation(async (token: string) => (token === 'good-token' ? 'valid' : 'invalid'))
    mockedAttendant.mockReset()
    mockedAttendant.mockResolvedValue({ status: 'invalid' })
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  // ==========================================================================
  // matcher
  // ==========================================================================
  describe('matcher', () => {
    it('API com extensão passa pelo proxy (não é mais tratada como estático)', () => {
      expect(unstable_doesMiddlewareMatch({ config, url: '/api/x/5511999.png' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/api/campaigns/abc/report.csv' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/api/flows/submissions/report.csv' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/api/campaigns' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/api' })).toBe(true)
    })

    it('páginas passam pelo proxy, estáticos não', () => {
      expect(unstable_doesMiddlewareMatch({ config, url: '/' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/campaigns' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/manifest.webmanifest' })).toBe(true)
      expect(unstable_doesMiddlewareMatch({ config, url: '/_next/static/chunks/app.js' })).toBe(false)
      expect(unstable_doesMiddlewareMatch({ config, url: '/icons/icon-192.png' })).toBe(false)
      expect(unstable_doesMiddlewareMatch({ config, url: '/sw.js' })).toBe(false)
      expect(unstable_doesMiddlewareMatch({ config, url: '/favicon.ico' })).toBe(false)
    })
  })

  // ==========================================================================
  // Headers de principal
  // ==========================================================================
  describe('headers x-dispara-*', () => {
    it('remove headers forjados pelo cliente e grava o principal resolvido', async () => {
      const res = await proxy(
        req('/api/campaigns', {
          headers: {
            cookie: VALID_COOKIE,
            'x-dispara-principal': 'admin_key',
            'x-dispara-attendant-id': 'evil',
            'x-dispara-attendant-perms': '{"canView":true,"canReply":true,"canHandoff":true}',
            'x-dispara-extra': '1',
          },
        })
      )
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('session')
      const names = forwardedHeaderNames(res)
      expect(names).toContain('x-dispara-principal')
      expect(names).not.toContain('x-dispara-attendant-id')
      expect(names).not.toContain('x-dispara-attendant-perms')
      expect(names).not.toContain('x-dispara-extra')
      expect(forwarded(res, 'x-dispara-attendant-id')).toBeNull()
    })

    it('rota public_route_auth recebe principal public mesmo com header forjado', async () => {
      const res = await proxy(
        req('/api/webhook', { method: 'POST', headers: { 'x-dispara-principal': 'session' } })
      )
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('public')
      expect(mockedSession).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Política session (default)
  // ==========================================================================
  describe('rotas session (default)', () => {
    it('sem credencial → 401 JSON marcado para o client', async () => {
      const res = await proxy(req('/api/campaigns'))
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('Unauthorized')
      expect(res.headers.get('www-authenticate')).toContain('Bearer')
      expect(res.headers.get('x-auth-required')).toBe('1')
    })

    it('cookie forjado → 401 (presença do cookie não autentica)', async () => {
      const res = await proxy(req('/api/settings/credentials', { headers: { cookie: FORGED_COOKIE } }))
      expect(res.status).toBe(401)
      expect(mockedSession).toHaveBeenCalledWith('x')
      const body = await res.json()
      expect(body.message).toMatch(/Sessão inválida/)
    })

    it('cookie válido → passa com principal session', async () => {
      const res = await proxy(req('/api/campaigns', { headers: { cookie: VALID_COOKIE } }))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('session')
    })

    it('API key válida (Bearer e X-API-Key) → api_key, sem consultar sessão', async () => {
      const bearer = await proxy(req('/api/contacts', { headers: { authorization: 'Bearer api-key-123' } }))
      expect(principalOf(bearer)).toBe('api_key')
      const header = await proxy(req('/api/contacts', { headers: { 'x-api-key': 'api-key-123' } }))
      expect(principalOf(header)).toBe('api_key')
      expect(mockedSession).not.toHaveBeenCalled()
    })

    it('admin key → admin_key', async () => {
      const res = await proxy(req('/api/contacts', { headers: { authorization: 'Bearer admin-key-456' } }))
      expect(principalOf(res)).toBe('admin_key')
    })

    it('API key inválida → 401 Invalid API key', async () => {
      const res = await proxy(req('/api/contacts', { headers: { authorization: 'Bearer nope' } }))
      expect(res.status).toBe(401)
      expect((await res.json()).message).toBe('Invalid API key')
    })

    it('session store indisponível com cookie → 503 (não 401)', async () => {
      mockedSession.mockResolvedValue('unavailable')
      const res = await proxy(req('/api/campaigns', { headers: { cookie: VALID_COOKIE } }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body).toMatchObject({ error: 'Service Unavailable', reason: 'session_store_unavailable' })
    })

    it('banco fora + UUID legado (unverified) → 401 que leva ao login, sem apagar o cookie', async () => {
      mockedSession.mockResolvedValue('unverified')
      const res = await proxy(req('/api/campaigns', { headers: { cookie: 'dispara_session=00000000-0000-4000-8000-000000000000' } }))
      expect(res.status).toBe(401)
      expect(res.headers.get('x-auth-required')).toBe('1')
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('caminho com extensão em /api é protegido', async () => {
      const res = await proxy(req('/api/campaigns/abc/report.csv'))
      expect(res.status).toBe(401)
    })

    it('navegação top-level (download CSV) sem sessão → redirect para /login?redirect=', async () => {
      const res = await proxy(
        req('/api/campaigns/abc/report.csv?x=1', { headers: { 'sec-fetch-mode': 'navigate', cookie: FORGED_COOKIE } })
      )
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('redirect')).toBe('/api/campaigns/abc/report.csv?x=1')
      // cookie inválido é apagado
      expect(res.headers.get('set-cookie')).toMatch(/dispara_session=; Path=\/;/)
    })

    it('atendente NÃO é aceito em rota session', async () => {
      mockedAttendant.mockResolvedValue({
        status: 'valid',
        principal: { id: 'a1', name: 'Ana', permissions: { canView: true, canReply: true, canHandoff: true } },
      })
      const res = await proxy(req('/api/campaigns', { headers: { cookie: 'dispara_attendant=tok-1234567890abcdef' } }))
      expect(res.status).toBe(401)
      expect(mockedAttendant).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // CRON_SECRET
  // ==========================================================================
  describe('CRON_SECRET', () => {
    it('vale em rota cron', async () => {
      const res = await proxy(req('/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer cron-secret-789' } }))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('cron')
    })

    it('NÃO vale fora de rota cron (fim do bypass global) → 403', async () => {
      const settings = await proxy(req('/api/settings/credentials', { headers: { authorization: 'Bearer cron-secret-789' } }))
      expect(settings.status).toBe(403)
      const admin = await proxy(req('/api/vercel/redeploy', { method: 'POST', headers: { authorization: 'Bearer cron-secret-789' } }))
      expect(admin.status).toBe(403)
    })

    it('rota cron sem credencial → 401; com sessão do dono → 403', async () => {
      const anon = await proxy(req('/api/campaign/workflow', { method: 'POST' }))
      expect(anon.status).toBe(401)
      const owner = await proxy(req('/api/campaign/workflow', { method: 'POST', headers: { cookie: VALID_COOKIE } }))
      expect(owner.status).toBe(403)
    })

    it('Bearer DISPARA_ADMIN_KEY vira cron nas rotas cron (fallback do reinvokeSelf)', async () => {
      const res = await proxy(
        req('/api/builder/workflow/wf-1/execute', { method: 'POST', headers: { authorization: 'Bearer admin-key-456' } })
      )
      expect(principalOf(res)).toBe('cron')
    })

    it('session_or_cron (/api/campaign/dispatch): aceita cron e dono', async () => {
      const cron = await proxy(req('/api/campaign/dispatch', { method: 'POST', headers: { authorization: 'Bearer cron-secret-789' } }))
      expect(principalOf(cron)).toBe('cron')
      const owner = await proxy(req('/api/campaign/dispatch', { method: 'POST', headers: { cookie: VALID_COOKIE } }))
      expect(principalOf(owner)).toBe('session')
      const anon = await proxy(req('/api/campaign/dispatch', { method: 'POST', headers: { 'upstash-signature': 'anything' } }))
      expect(anon.status).toBe(401)
      const forged = await proxy(req('/api/campaign/dispatch', { method: 'POST', headers: { cookie: 'foo=dispara_session=bar' } }))
      expect(forged.status).toBe(401)
    })

    it('header x-vercel-cron é ignorado', async () => {
      const res = await proxy(req('/api/cron/tick', { method: 'POST', headers: { 'x-vercel-cron': '1' } }))
      expect(res.status).toBe(401)
    })

    it('CRON_SECRET ausente no env não autentica Bearer vazio', async () => {
      delete process.env.CRON_SECRET
      const res = await proxy(req('/api/cron/tick', { method: 'POST', headers: { authorization: 'Bearer ' } }))
      expect(res.status).toBe(401)
    })
  })

  // ==========================================================================
  // public / admin / attendant / installer
  // ==========================================================================
  describe('demais políticas', () => {
    it('public: /api/health passa sem credencial com principal public', async () => {
      const res = await proxy(req('/api/health'))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('public')
    })

    it('public: /api/health com sessão válida → principal session', async () => {
      const res = await proxy(req('/api/health', { headers: { cookie: VALID_COOKIE } }))
      expect(principalOf(res)).toBe('session')
    })

    it('public: cookie forjado não derruba a rota pública (principal public)', async () => {
      const res = await proxy(req('/api/auth/status', { headers: { cookie: FORGED_COOKIE } }))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('public')
    })

    it('public é por método: POST /api/health exige sessão', async () => {
      const res = await proxy(req('/api/health', { method: 'POST' }))
      expect(res.status).toBe(401)
    })

    it('HEAD usa a política do GET', async () => {
      const res = await proxy(req('/api/health', { method: 'HEAD' }))
      expect(isPassThrough(res)).toBe(true)
    })

    it('/api/system e /api/flows/send não são mais públicas', async () => {
      expect((await proxy(req('/api/system'))).status).toBe(401)
      expect((await proxy(req('/api/flows/send', { method: 'POST' }))).status).toBe(401)
      expect((await proxy(req('/api/attendants'))).status).toBe(401)
      expect((await proxy(req('/api/inbox/chat', { method: 'POST' }))).status).toBe(401)
      expect((await proxy(req('/api/mem0/memories/5511999999999'))).status).toBe(401)
    })

    it('admin: sessão e admin key passam; API key comum → 403', async () => {
      const session = await proxy(req('/api/vercel/info', { headers: { cookie: VALID_COOKIE } }))
      expect(principalOf(session)).toBe('session')
      const admin = await proxy(req('/api/vercel/info', { headers: { 'x-api-key': 'admin-key-456' } }))
      expect(principalOf(admin)).toBe('admin_key')
      const api = await proxy(req('/api/vercel/info', { headers: { 'x-api-key': 'api-key-123' } }))
      expect(api.status).toBe(403)
      const debug = await proxy(req('/api/debug/supabase-tables', { headers: { 'x-api-key': 'api-key-123' } }))
      expect(debug.status).toBe(403)
    })

    it('attendant_or_session: atendente com token válido passa com permissões', async () => {
      mockedAttendant.mockResolvedValue({
        status: 'valid',
        principal: { id: 'att-1', name: 'Ana', permissions: { canView: true, canReply: false, canHandoff: false } },
      })
      const res = await proxy(
        req('/api/inbox/conversations/c1/messages', { headers: { cookie: 'dispara_attendant=tok-1234567890abcdef' } })
      )
      expect(principalOf(res)).toBe('attendant')
      expect(forwarded(res, 'x-dispara-attendant-id')).toBe('att-1')
      expect(JSON.parse(forwarded(res, 'x-dispara-attendant-perms')!)).toEqual({ canView: true, canReply: false, canHandoff: false })
      expect(mockedAttendant).toHaveBeenCalledWith('tok-1234567890abcdef')
    })

    it('attendant_or_session: token de atendente inválido → 401', async () => {
      const res = await proxy(req('/api/attendant/conversations', { headers: { 'x-attendant-token': 'tok-invalid-000000000' } }))
      expect(res.status).toBe(401)
    })

    it('attendant_or_session: dono passa como session', async () => {
      const res = await proxy(req('/api/attendant/conversations', { headers: { cookie: VALID_COOKIE } }))
      expect(principalOf(res)).toBe('session')
    })

    it('attendant_or_session: banco fora ao validar o atendente → 503 com Retry-After (não 401)', async () => {
      mockedAttendant.mockResolvedValue({ status: 'unavailable' })
      const res = await proxy(
        req('/api/attendant/conversations', { headers: { cookie: 'dispara_attendant=tok-1234567890abcdef' } })
      )
      // Antes: 401 + x-auth-required → a PWA parava o polling e mostrava "Acesso Negado".
      expect(res.status).toBe(503)
      expect(res.headers.get('retry-after')).toBe('5')
      expect(res.headers.get('x-auth-required')).toBeNull()
      expect((await res.json()).reason).toBe('attendant_store_unavailable')
    })

    it('attendant_or_session: atendente aceito com cookie de sessão inválido → apaga o cookie de sessão', async () => {
      mockedAttendant.mockResolvedValue({
        status: 'valid',
        principal: { id: 'att-1', name: 'Ana', permissions: { canView: true, canReply: true, canHandoff: false } },
      })
      const res = await proxy(
        req('/api/inbox/conversations/c1', {
          headers: { cookie: 'dispara_session=revogado; dispara_attendant=tok-1234567890abcdef' },
        })
      )
      expect(principalOf(res)).toBe('attendant')
      expect(res.headers.get('set-cookie')).toMatch(/dispara_session=; Path=\/;/)
    })

    it('PATCH/DELETE de conversa com sessão expirada e cookie de atendente → 401 que leva ao /login', async () => {
      mockedAttendant.mockResolvedValue({
        status: 'valid',
        principal: { id: 'att-1', name: 'Ana', permissions: { canView: true, canReply: true, canHandoff: true } },
      })
      for (const method of ['PATCH', 'DELETE']) {
        const res = await proxy(
          req('/api/inbox/conversations/c1', {
            method,
            headers: { cookie: 'dispara_session=revogado; dispara_attendant=tok-1234567890abcdef' },
          })
        )
        // Antes: o atendente era aceito e a rota devolvia 403 sem x-auth-required.
        expect(res.status, method).toBe(401)
        expect(res.headers.get('x-auth-required'), method).toBe('1')
      }
      expect(mockedAttendant).not.toHaveBeenCalled()
    })

    it('installer aberto antes da instalação (sem MASTER_PASSWORD)', async () => {
      delete process.env.MASTER_PASSWORD
      const res = await proxy(req('/api/installer/bootstrap', { method: 'POST' }))
      expect(isPassThrough(res)).toBe(true)
    })

    it('installer depois da instalação: anônimo 401, sessão/admin passam, API key 403', async () => {
      expect((await proxy(req('/api/installer/provision', { method: 'POST' }))).status).toBe(401)
      expect((await proxy(req('/api/installer/provision', { method: 'POST', headers: { cookie: FORGED_COOKIE } }))).status).toBe(401)
      expect(principalOf(await proxy(req('/api/installer/provision', { method: 'POST', headers: { cookie: VALID_COOKIE } })))).toBe('session')
      expect(principalOf(await proxy(req('/api/installer/provision', { method: 'POST', headers: { authorization: 'Bearer admin-key-456' } })))).toBe('admin_key')
      expect((await proxy(req('/api/installer/provision', { method: 'POST', headers: { authorization: 'Bearer api-key-123' } }))).status).toBe(403)
    })

    it('installer em modo degradado: banco fora + cookie assinado → passa', async () => {
      mockedSession.mockResolvedValue('unavailable')
      const res = await proxy(req('/api/installer/supabase/project-status', { method: 'POST', headers: { cookie: VALID_COOKIE } }))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('public')
    })

    it('installer: banco fora + UUID legado (não verificável) → 401, sem apagar o cookie', async () => {
      mockedSession.mockResolvedValue('unverified')
      const res = await proxy(
        req('/api/installer/supabase/project-status', {
          method: 'POST',
          headers: { cookie: 'dispara_session=00000000-0000-4000-8000-000000000000' },
        })
      )
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })
  })

  // ==========================================================================
  // OPTIONS / CORS
  // ==========================================================================
  describe('OPTIONS', () => {
    it('não reflete Origin de terceiros nem manda credentials', async () => {
      const res = await proxy(req('/api/campaigns', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }))
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
      expect(res.headers.get('access-control-allow-credentials')).toBeNull()
    })

    it('mesma origem recebe CORS com credentials', async () => {
      const res = await proxy(req('/api/campaigns', { method: 'OPTIONS', headers: { origin: BASE } }))
      expect(res.status).toBe(204)
      expect(res.headers.get('access-control-allow-origin')).toBe(BASE)
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    })

    it('formulário público: Allow-Origin * sem credentials', async () => {
      for (const path of ['/api/public/lead-forms/meu-form', '/api/public/lead-forms/meu-form/submit']) {
        const res = await proxy(req(path, { method: 'OPTIONS', headers: { origin: 'https://site-do-cliente.com' } }))
        expect(res.status).toBe(204)
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
        expect(res.headers.get('access-control-allow-credentials')).toBeNull()
      }
    })
  })

  // ==========================================================================
  // Páginas
  // ==========================================================================
  describe('páginas', () => {
    it('sem MASTER_PASSWORD redireciona para /install (exceto o próprio wizard)', async () => {
      delete process.env.MASTER_PASSWORD
      const res = await proxy(req('/campaigns'))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/install')
      const wizard = await proxy(req('/install'))
      expect(isPassThrough(wizard)).toBe(true)
    })

    it('página pública passa sem sessão; /f não casa /flows nem /forms', async () => {
      expect(isPassThrough(await proxy(req('/login')))).toBe(true)
      expect(isPassThrough(await proxy(req('/f/meu-form')))).toBe(true)
      expect(isPassThrough(await proxy(req('/atendimento')))).toBe(true)
      expect(isPassThrough(await proxy(req('/manifest.webmanifest')))).toBe(true)
      expect((await proxy(req('/flows'))).status).toBe(307)
      expect((await proxy(req('/forms'))).status).toBe(307)
    })

    it('cookie forjado → apaga o cookie e redireciona para /login?redirect=', async () => {
      const res = await proxy(req('/campaigns?status=x', { headers: { cookie: FORGED_COOKIE } }))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('redirect')).toBe('/campaigns?status=x')
      expect(res.headers.get('set-cookie')).toMatch(/dispara_session=; Path=\/;/)
    })

    it('sem cookie → redirect sem Set-Cookie', async () => {
      const res = await proxy(req('/contacts'))
      expect(res.status).toBe(307)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('cookie válido → passa com principal session', async () => {
      const res = await proxy(req('/campaigns', { headers: { cookie: VALID_COOKIE } }))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('session')
    })

    it('banco fora com cookie → deixa a página abrir (overlay de banco fora)', async () => {
      mockedSession.mockResolvedValue('unavailable')
      const res = await proxy(req('/campaigns', { headers: { cookie: VALID_COOKIE } }))
      expect(isPassThrough(res)).toBe(true)
      expect(principalOf(res)).toBe('public')
    })

    it('banco fora + UUID forjado/legado → login SEM abrir a página e sem apagar o cookie', async () => {
      // Cenário do achado: qualquer UUID abria /inbox em modo degradado.
      mockedSession.mockResolvedValue('unverified')
      for (const path of ['/inbox', '/contacts', '/', '/install']) {
        const res = await proxy(req(path, { headers: { cookie: 'dispara_session=00000000-0000-4000-8000-000000000000' } }))
        expect(res.status, path).toBe(307)
        expect(new URL(res.headers.get('location')!).pathname, path).toBe('/login')
        expect(res.headers.get('set-cookie'), path).toBeNull()
      }
    })

    it('banco fora: Server Action (POST em página) NÃO passa no modo degradado', async () => {
      mockedSession.mockResolvedValue('unavailable')
      const res = await proxy(
        req('/forms', { method: 'POST', headers: { cookie: VALID_COOKIE, 'next-action': 'abc123' } })
      )
      expect(res.status).toBe(503)
    })

    it('Server Action em página protegida sem sessão → redirect para login', async () => {
      const res = await proxy(req('/forms', { method: 'POST', headers: { cookie: FORGED_COOKIE, 'next-action': 'abc123' } }))
      expect(res.status).toBe(307)
    })

    it('/install depois da instalação exige sessão (reason=installer_locked)', async () => {
      const res = await proxy(req('/install'))
      expect(res.status).toBe(307)
      const location = new URL(res.headers.get('location')!)
      expect(location.pathname).toBe('/login')
      expect(location.searchParams.get('reason')).toBe('installer_locked')
      expect(location.searchParams.get('redirect')).toBe('/install')
      expect(isPassThrough(await proxy(req('/install', { headers: { cookie: VALID_COOKIE } })))).toBe(true)
    })

    it('/install em modo degradado (banco fora + cookie) → passa', async () => {
      mockedSession.mockResolvedValue('unavailable')
      expect(isPassThrough(await proxy(req('/install', { headers: { cookie: VALID_COOKIE } })))).toBe(true)
    })
  })
})

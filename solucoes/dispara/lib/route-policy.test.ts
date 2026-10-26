// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { fileURLToPath } from 'url'
import {
  API_ROUTE_POLICIES,
  DEFAULT_API_POLICY,
  isPublicPage,
  matchPattern,
  matchSegmentPrefix,
  resolveApiPolicy,
  type RoutePolicy,
} from './route-policy'

// ---------------------------------------------------------------------------
// Inventário das rotas reais (app/api/**/route.ts)
// ---------------------------------------------------------------------------

const API_DIR = fileURLToPath(new URL('../app/api', import.meta.url))
const ROUTE_FILE_RE = /^route\.(ts|tsx|js|mjs)$/
const METHOD_RE = /export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g

interface ApiRoute {
  path: string
  methods: string[]
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (ROUTE_FILE_RE.test(entry.name)) out.push(full)
  }
  return out
}

function loadApiRoutes(): ApiRoute[] {
  return walk(API_DIR).map((file) => {
    const segments = relative(API_DIR, file).split(sep).slice(0, -1)
    // Route groups "(grupo)" não entram na URL.
    const urlSegments = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    const path = ['/api', ...urlSegments].join('/')
    const source = readFileSync(file, 'utf8')
    const methods = Array.from(new Set(Array.from(source.matchAll(METHOD_RE), (m) => m[1]))).sort()
    return { path, methods }
  })
}

const OPEN_POLICIES: readonly RoutePolicy[] = ['public', 'public_route_auth']

/**
 * SNAPSHOT EXPLÍCITO: toda rota que o proxy deixa passar SEM credencial do dono.
 * Se este teste quebrou porque você criou/alterou uma rota, confirme que ela
 * REALMENTE precisa ser pública e atualize lib/route-policy.ts E este snapshot.
 */
const EXPECTED_OPEN_ROUTES: Record<string, RoutePolicy> = {
  '/api/attendants/validate': 'public_route_auth',
  '/api/auth/login': 'public',
  '/api/auth/logout': 'public',
  '/api/auth/status': 'public',
  '/api/brand': 'public',
  '/api/flows/endpoint': 'public_route_auth',
  '/api/health': 'public',
  '/api/integrations/google-calendar/webhook': 'public_route_auth',
  '/api/public/lead-forms/[slug]': 'public',
  '/api/public/lead-forms/[slug]/submit': 'public_route_auth',
  '/api/webhook': 'public_route_auth',
}

describe('route-policy', () => {
  // ==========================================================================
  // Engine de casamento
  // ==========================================================================
  describe('matchPattern', () => {
    it('casa caminho exato, nunca por prefixo solto', () => {
      expect(matchPattern('/api/webhook', '/api/webhook')).toBe(true)
      expect(matchPattern('/api/webhook', '/api/webhook/')).toBe(true)
      expect(matchPattern('/api/webhook', '/api/webhook/info')).toBe(false)
      expect(matchPattern('/api/webhook', '/api/webhooks')).toBe(false)
      expect(matchPattern('/api/flows', '/api/flows/send')).toBe(false)
      expect(matchPattern('/api/attendant/conversations', '/api/attendants')).toBe(false)
    })

    it('[param] casa exatamente um segmento', () => {
      expect(matchPattern('/api/public/lead-forms/[slug]', '/api/public/lead-forms/abc')).toBe(true)
      expect(matchPattern('/api/public/lead-forms/[slug]', '/api/public/lead-forms')).toBe(false)
      expect(matchPattern('/api/public/lead-forms/[slug]', '/api/public/lead-forms/abc/submit')).toBe(false)
      expect(matchPattern('/api/inbox/conversations/[id]/messages', '/api/inbox/conversations/c1/messages')).toBe(true)
      expect(matchPattern('/api/inbox/conversations/[id]/messages', '/api/inbox/conversations/c1/handoff')).toBe(false)
    })

    it('[...param] exige ao menos um segmento', () => {
      expect(matchPattern('/api/debug/[...path]', '/api/debug/ai-logs')).toBe(true)
      expect(matchPattern('/api/debug/[...path]', '/api/debug/campaigns/1/audit')).toBe(true)
      expect(matchPattern('/api/debug/[...path]', '/api/debug')).toBe(false)
    })

    it('matchSegmentPrefix casa por segmento', () => {
      expect(matchSegmentPrefix('/f', '/f')).toBe(true)
      expect(matchSegmentPrefix('/f', '/f/abc')).toBe(true)
      expect(matchSegmentPrefix('/f', '/flows')).toBe(false)
      expect(matchSegmentPrefix('/f', '/forms')).toBe(false)
    })

    it('isPublicPage não vaza para páginas do dashboard', () => {
      expect(isPublicPage('/login')).toBe(true)
      expect(isPublicPage('/atendimento/conversa/1')).toBe(true)
      expect(isPublicPage('/flows')).toBe(false)
      expect(isPublicPage('/forms')).toBe(false)
      expect(isPublicPage('/install')).toBe(false)
      expect(isPublicPage('/')).toBe(false)
    })
  })

  describe('resolveApiPolicy', () => {
    it('respeita o método da regra', () => {
      expect(resolveApiPolicy('/api/health', 'GET')).toBe('public')
      expect(resolveApiPolicy('/api/health', 'POST')).toBe(DEFAULT_API_POLICY)
      expect(resolveApiPolicy('/api/templates', 'GET')).toBe('attendant_or_session')
      expect(resolveApiPolicy('/api/templates', 'POST')).toBe('session')
      expect(resolveApiPolicy('/api/campaign/dispatch', 'POST')).toBe('session_or_cron')
    })

    it('conversa do inbox: atendente só no GET; PATCH/DELETE exigem o dono no proxy', () => {
      expect(resolveApiPolicy('/api/inbox/conversations/c1', 'GET')).toBe('attendant_or_session')
      expect(resolveApiPolicy('/api/inbox/conversations/c1', 'PATCH')).toBe('session')
      expect(resolveApiPolicy('/api/inbox/conversations/c1', 'DELETE')).toBe('session')
    })

    it('rotas antes expostas por prefixo agora exigem sessão', () => {
      for (const path of [
        '/api/flows/send',
        '/api/flows/endpoint/keys',
        '/api/attendants',
        '/api/inbox/chat',
        '/api/mem0/memories/5511999999999',
        '/api/system',
        '/api/webhook/info',
        '/api/inbox/conversations',
      ]) {
        expect(resolveApiPolicy(path, 'GET'), path).toBe('session')
        expect(resolveApiPolicy(path, 'POST'), path).toBe('session')
      }
    })
  })

  // ==========================================================================
  // Inventário do disco
  // ==========================================================================
  describe('inventário de app/api', () => {
    const routes = loadApiRoutes()

    it('encontra as rotas e os métodos exportados de cada uma', () => {
      expect(routes.length).toBeGreaterThan(150)
      const withoutMethods = routes.filter((r) => r.methods.length === 0).map((r) => r.path)
      // Se falhar: o parser de métodos não entendeu o export; ajuste METHOD_RE.
      expect(withoutMethods).toEqual([])
    })

    it('o conjunto de rotas abertas (public/public_route_auth) é EXATAMENTE o snapshot', () => {
      const open: Record<string, RoutePolicy> = {}
      for (const route of routes) {
        for (const method of route.methods) {
          const policy = resolveApiPolicy(route.path, method)
          if (OPEN_POLICIES.includes(policy)) open[route.path] = policy
        }
      }
      const sorted = Object.fromEntries(Object.entries(open).sort(([a], [b]) => a.localeCompare(b)))
      expect(sorted).toEqual(EXPECTED_OPEN_ROUTES)
    })

    it('nenhuma regra da tabela é órfã (todo padrão casa com uma rota real)', () => {
      const orphan = API_ROUTE_POLICIES.filter(
        (rule) => !routes.some((route) => matchPattern(rule.pattern, route.path))
      ).map((rule) => rule.pattern)
      expect(orphan).toEqual([])
    })

    it('/api/auth/setup não existe mais', () => {
      expect(routes.some((r) => r.path === '/api/auth/setup')).toBe(false)
    })
  })
})

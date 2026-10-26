/**
 * Política de autenticação por rota — fonte única de verdade usada pelo proxy.ts.
 *
 * Regras de casamento:
 * - Padrões são caminhos EXATOS com segmentos dinâmicos `[param]` (1 segmento) e
 *   `[...param]` (1+ segmentos). Nada de prefixo solto: '/api/flows' NÃO casa
 *   '/api/flows/send' (era a origem do bypass por prefixo).
 * - `methods` restringe a regra a métodos HTTP específicos; sem `methods`, vale para todos.
 * - A primeira regra que casar vence; o que não casar cai no DEFAULT_API_POLICY.
 *
 * Políticas:
 * - public              → sem credencial (health, brand, login...).
 * - public_route_auth   → chamador externo (Meta, Google, formulário público, webhook
 *                         de workflow); o proxy deixa passar e a ROTA verifica
 *                         assinatura/token próprio.
 * - cron                → só Bearer CRON_SECRET (ou DISPARA_ADMIN_KEY).
 * - session_or_cron     → dono (sessão/API key) ou CRON_SECRET.
 * - attendant_or_session→ dono ou atendente com token válido (a rota checa a permissão).
 * - admin               → só DISPARA_ADMIN_KEY.
 * - installer           → wizard de instalação: aberto só enquanto o setup não terminou.
 * - session             → (default) dono: cookie de sessão VÁLIDO ou API key.
 */

export type RoutePolicy =
  | 'public'
  | 'public_route_auth'
  | 'cron'
  | 'session_or_cron'
  | 'attendant_or_session'
  | 'admin'
  | 'installer'
  | 'session'

export interface RoutePolicyRule {
  pattern: string
  policy: RoutePolicy
  methods?: readonly string[]
  /** Por que essa rota não é `session` (obrigatório para documentar a exceção). */
  reason: string
}

export const DEFAULT_API_POLICY: RoutePolicy = 'session'

// Derivada do inventário de chamadores reais de cada rota (inventário de 2026-10-11).
// Toda rota que NÃO está aqui exige sessão válida ou API key (DEFAULT_API_POLICY).
export const API_ROUTE_POLICIES: readonly RoutePolicyRule[] = [
  // --- public -------------------------------------------------------------
  { pattern: '/api/auth/login', policy: 'public', methods: ['POST'], reason: 'Login do dashboard' },
  { pattern: '/api/auth/logout', policy: 'public', methods: ['POST'], reason: 'Logout precisa funcionar com sessão expirada' },
  { pattern: '/api/auth/status', policy: 'public', methods: ['GET'], reason: 'Login/debug-auth decidem entre login, wizard e dashboard' },
  { pattern: '/api/brand', policy: 'public', methods: ['GET'], reason: 'Nome/logo/cor — já saem no HTML SSR e no manifest' },
  { pattern: '/api/health', policy: 'public', methods: ['GET'], reason: 'Detecta banco fora do ar (onboarding overlay); payload completo só para o dono' },
  { pattern: '/api/public/lead-forms/[slug]', policy: 'public', methods: ['GET'], reason: 'Formulário público /f/[slug] (embed)' },

  // --- public_route_auth (chamador externo; a rota verifica) ---------------
  { pattern: '/api/webhook', policy: 'public_route_auth', methods: ['GET', 'POST'], reason: 'Meta: GET verify_token, POST X-Hub-Signature-256' },
  { pattern: '/api/flows/endpoint', policy: 'public_route_auth', methods: ['GET', 'POST'], reason: 'Meta WhatsApp Flows data exchange (assinatura + RSA/AES)' },
  { pattern: '/api/integrations/google-calendar/webhook', policy: 'public_route_auth', methods: ['GET', 'POST'], reason: 'Google push: X-Goog-Channel-Token' },
  { pattern: '/api/public/lead-forms/[slug]/submit', policy: 'public_route_auth', methods: ['POST'], reason: 'Formulário público: slug ativo + honeypot' },
  { pattern: '/api/attendants/validate', policy: 'public_route_auth', reason: 'Entrada da PWA de atendente: valida token e emite/restaura/limpa o cookie' },

  // --- cron (pg_cron / auto-reinvocação com Bearer CRON_SECRET|ADMIN_KEY) --
  { pattern: '/api/cron/tick', policy: 'cron', reason: 'pg_cron → pg_net a cada minuto' },
  { pattern: '/api/campaign/workflow', policy: 'cron', methods: ['POST'], reason: 'Drenador do disparo (reinvokeSelf + sweeper)' },
  { pattern: '/api/builder/workflow/[workflowId]/execute', policy: 'cron', methods: ['POST'], reason: 'reinvokeSelf a partir do webhook da Meta' },
  { pattern: '/api/builder/workflow/[workflowId]/resume', policy: 'cron', methods: ['POST'], reason: 'reinvokeSelf a partir do webhook da Meta' },
  { pattern: '/api/ai/respond', policy: 'cron', methods: ['POST'], reason: 'reinvokeSelf a partir do webhook da Meta (IA do inbox)' },

  // --- session_or_cron ----------------------------------------------------
  { pattern: '/api/campaign/dispatch', policy: 'session_or_cron', methods: ['POST'], reason: 'Dashboard (disparo imediato) e pg_cron (agendadas)' },

  // --- attendant_or_session (a rota exige a permissão do atendente) --------
  { pattern: '/api/attendant/conversations', policy: 'attendant_or_session', methods: ['GET'], reason: 'Lista da PWA (canView)' },
  { pattern: '/api/inbox/conversations/[id]', policy: 'attendant_or_session', methods: ['GET'], reason: 'GET canView na PWA; PATCH/DELETE caem no default session (só dono)' },
  { pattern: '/api/inbox/conversations/[id]/messages', policy: 'attendant_or_session', methods: ['GET', 'POST'], reason: 'GET canView, POST canReply' },
  { pattern: '/api/inbox/conversations/[id]/takeover', policy: 'attendant_or_session', methods: ['POST'], reason: 'PWA: assumir conversa (canReply)' },
  { pattern: '/api/inbox/conversations/[id]/return-to-bot', policy: 'attendant_or_session', methods: ['POST'], reason: 'PWA: devolver à IA (canReply + canHandoff)' },
  { pattern: '/api/templates', policy: 'attendant_or_session', methods: ['GET'], reason: 'PWA lê templates locais (?source=local, canView); POST segue só dono' },
  { pattern: '/api/push/subscribe', policy: 'attendant_or_session', methods: ['POST'], reason: 'Push da PWA/dashboard (canView)' },
  { pattern: '/api/push/unsubscribe', policy: 'attendant_or_session', methods: ['POST'], reason: 'Push da PWA/dashboard (canView)' },

  // --- admin (DISPARA_ADMIN_KEY ou sessão do dono) -------------------------
  { pattern: '/api/vercel/info', policy: 'admin', reason: 'Expõe dados da conta Vercel' },
  { pattern: '/api/vercel/redeploy', policy: 'admin', reason: 'Dispara redeploy' },
  { pattern: '/api/push/send', policy: 'admin', reason: 'Envio manual de push' },
  { pattern: '/api/webhook/reconcile-status-events', policy: 'admin', reason: 'Manutenção manual de status' },
  { pattern: '/api/templates/preview/backfill', policy: 'admin', reason: 'Manutenção manual de previews' },
  { pattern: '/api/debug/[...path]', policy: 'admin', reason: 'Rotas de diagnóstico' },

  // --- installer ------------------------------------------------------------
  { pattern: '/api/installer/[...path]', policy: 'installer', reason: 'Wizard: aberto até a instalação; depois sessão/admin' },
] as const

/** Páginas que não exigem sessão (casamento por segmento, nunca por prefixo solto). */
export const PUBLIC_PAGE_PATTERNS: readonly string[] = [
  '/login',
  '/f',                    // formulário público /f/[slug]
  '/atendimento',          // PWA de atendente (dados protegidos pelas APIs)
  '/docs',                 // Swagger UI da API pública
  '/debug-auth',
  '/manifest.webmanifest', // buscado pelo browser sem credenciais
] as const

/** Página do wizard: aberta até a instalação; depois exige sessão (ver proxy). */
export const INSTALLER_PAGE_PREFIX = '/install'

// ---------------------------------------------------------------------------
// Engine de casamento
// ---------------------------------------------------------------------------

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

/** Casa `pathname` contra um padrão com `[param]` / `[...param]`. */
export function matchPattern(pattern: string, pathname: string): boolean {
  const p = splitPath(pattern)
  const s = splitPath(pathname)

  for (let i = 0; i < p.length; i++) {
    const seg = p[i]
    if (seg.startsWith('[...') && seg.endsWith(']')) {
      // catch-all: precisa de pelo menos 1 segmento restante e é sempre o último
      return s.length > i
    }
    if (i >= s.length) return false
    if (seg.startsWith('[') && seg.endsWith(']')) continue
    if (seg !== s[i]) return false
  }

  return p.length === s.length
}

/** Casa por segmento: '/f' casa '/f' e '/f/abc', mas NÃO '/flows' nem '/forms'. */
export function matchSegmentPrefix(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
}

export function resolveApiPolicy(pathname: string, method: string): RoutePolicy {
  const upper = method.toUpperCase()
  for (const rule of API_ROUTE_POLICIES) {
    if (rule.methods && !rule.methods.includes(upper)) continue
    if (matchPattern(rule.pattern, pathname)) return rule.policy
  }
  return DEFAULT_API_POLICY
}

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PATTERNS.some((prefix) => matchSegmentPrefix(prefix, pathname))
}

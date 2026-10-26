import { NextRequest, NextResponse } from 'next/server'
import { forbiddenResponse, unauthorizedResponse, verifyApiKey } from '@/lib/auth'
import { AUTH_REQUIRED_HEADER, buildLoginPath } from '@/lib/auth-redirect'
import { readAttendantToken, resolveAttendantTokenDetailed } from '@/lib/attendant-auth'
import {
    applyPrincipalHeaders,
    stripPrincipalHeaders,
    type Principal,
    type PrincipalKind,
} from '@/lib/principal'
import {
    INSTALLER_PAGE_PREFIX,
    isPublicPage,
    matchPattern,
    matchSegmentPrefix,
    resolveApiPolicy,
    type RoutePolicy,
} from '@/lib/route-policy'
import { timingSafeEqualString } from '@/lib/safe-compare'
import { isValidSessionToken, SESSION_COOKIE_NAME, type SessionTokenValidity } from '@/lib/user-auth'

/**
 * Proxy (Next 16) — barreira de autenticação de TODAS as rotas.
 *
 * - APIs: a política de cada rota vem de lib/route-policy.ts (casamento exato por
 *   segmento; o default é `session`). O proxy resolve QUEM chama e repassa o
 *   principal para a rota via headers `x-dispara-*` (lib/principal.ts), sempre
 *   removendo os que vierem do cliente.
 * - Sessão: o cookie dispara_session é VALIDADO (isValidSessionToken, lista
 *   cacheada por ~15s). A mera presença do cookie não autentica nada.
 * - Banco fora: só cookie ASSINADO por este servidor ('unavailable') abre o modo
 *   degradado (503 nas APIs, página sem dados); UUID puro ('unverified') conta como
 *   sem sessão, sem apagar o cookie. Atendente com banco fora também recebe 503.
 * - CRON_SECRET só vale nas rotas com política `cron`/`session_or_cron`.
 * - Páginas: públicas (PUBLIC_PAGE_PATTERNS) passam; o resto exige sessão válida.
 */

export const config = {
    matcher: [
        // APIs: SEMPRE passam pelo proxy, inclusive caminhos com extensão
        // (ex.: /api/x/5511999.png, /api/campaigns/[id]/report.csv).
        '/api/:path*',
        // Páginas: tudo menos estáticos e internals do Next
        // Includes: .json (manifest.json), .js (sw.js), common images/audio, and Next.js internals
        '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|m4a|yaml|yml)$).*)',
    ],
}

// Formulário público embutível: CORS aberto, SEM credenciais.
const PUBLIC_CORS_PATTERNS = [
    '/api/public/lead-forms/[slug]',
    '/api/public/lead-forms/[slug]/submit',
] as const

type ProtectedPolicy = Exclude<RoutePolicy, 'public' | 'public_route_auth' | 'installer'>

// Quem cada política aceita (o detalhe fino — permissão do atendente, PATCH só do
// dono etc. — continua sendo checado na rota).
const POLICY_ALLOWED: Record<ProtectedPolicy, readonly PrincipalKind[]> = {
    cron: ['cron'],
    session_or_cron: ['session', 'api_key', 'admin_key', 'cron'],
    attendant_or_session: ['session', 'api_key', 'admin_key', 'attendant'],
    admin: ['session', 'admin_key'],
    session: ['session', 'api_key', 'admin_key'],
}

const PUBLIC_PRINCIPAL: Principal = { kind: 'public' }

type SessionState = SessionTokenValidity | 'absent'

interface KeyCredentials {
    /** API key via Bearer/X-API-Key: válida (admin/api), 'invalid' se veio e não confere, null se não veio. */
    key: 'admin_key' | 'api_key' | 'invalid' | null
    /** Bearer == CRON_SECRET */
    cronSecret: boolean
    /** Bearer == DISPARA_ADMIN_KEY (aceito como cron: fallback do reinvokeSelf sem CRON_SECRET) */
    adminBearer: boolean
}

type UnavailableReason = 'session_store_unavailable' | 'attendant_store_unavailable'

type Decision =
    /** clearSessionCookie: cookie de sessão inválido junto de outra credencial aceita (ex.: atendente). */
    | { type: 'allow'; principal: Principal; clearSessionCookie?: boolean }
    | { type: 'unauthorized'; message: string; clearSessionCookie: boolean }
    | { type: 'forbidden'; message: string }
    | { type: 'unavailable'; reason: UnavailableReason }

// =============================================================================
// Credenciais
// =============================================================================

function readBearer(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization')
    return authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

async function readKeyCredentials(request: NextRequest): Promise<KeyCredentials> {
    const bearer = readBearer(request)
    // Sem curto-circuito: as duas comparações sempre rodam (tempo constante).
    const cronSecret = bearer ? timingSafeEqualString(bearer, process.env.CRON_SECRET) : false
    const adminBearer = bearer ? timingSafeEqualString(bearer, process.env.DISPARA_ADMIN_KEY) : false

    let key: KeyCredentials['key'] = null
    if (request.headers.get('authorization') || request.headers.get('x-api-key')) {
        const result = await verifyApiKey(request)
        key = result.valid ? (result.keyType === 'admin' ? 'admin_key' : 'api_key') : 'invalid'
    }
    return { key, cronSecret, adminBearer }
}

/** Valida o cookie de sessão no máximo uma vez por request. */
function sessionResolver(request: NextRequest): () => Promise<SessionState> {
    let memo: Promise<SessionState> | null = null
    return () => {
        if (!memo) {
            const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
            memo = token ? isValidSessionToken(token) : Promise.resolve<SessionState>('absent')
        }
        return memo
    }
}

// =============================================================================
// Respostas
// =============================================================================

function nextWithPrincipal(request: NextRequest, principal: Principal): NextResponse {
    const headers = new Headers(request.headers)
    stripPrincipalHeaders(headers)
    applyPrincipalHeaders(headers, principal)
    return NextResponse.next({ request: { headers } })
}

function sessionStoreUnavailableResponse(reason: UnavailableReason = 'session_store_unavailable'): NextResponse {
    return NextResponse.json(
        {
            error: 'Service Unavailable',
            reason,
            message: 'Não foi possível validar a sessão: banco de dados indisponível. Tente novamente em instantes.',
        },
        { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } }
    )
}

function loginRedirect(request: NextRequest, opts: { clearSessionCookie: boolean; reason?: string }): NextResponse {
    const { pathname, search } = request.nextUrl
    const loginUrl = new URL(buildLoginPath(`${pathname}${search}`), request.url)
    if (opts.reason) loginUrl.searchParams.set('reason', opts.reason)
    const response = NextResponse.redirect(loginUrl)
    if (opts.clearSessionCookie) response.cookies.delete(SESSION_COOKIE_NAME)
    return response
}

function isTopLevelNavigation(request: NextRequest): boolean {
    const method = request.method.toUpperCase()
    return (method === 'GET' || method === 'HEAD') && request.headers.get('sec-fetch-mode') === 'navigate'
}

function denyApi(request: NextRequest, decision: Exclude<Decision, { type: 'allow' }>): NextResponse {
    if (decision.type === 'forbidden') return forbiddenResponse(decision.message)
    if (decision.type === 'unavailable') return sessionStoreUnavailableResponse(decision.reason)

    // Download de CSV, OAuth connect/callback etc. abertos direto no browser:
    // manda para o login em vez de mostrar JSON cru.
    if (isTopLevelNavigation(request)) {
        return loginRedirect(request, { clearSessionCookie: decision.clearSessionCookie })
    }
    const response = unauthorizedResponse(decision.message)
    // Marca o 401 como "sem sessão" para o tratamento global do client (lib/auth-redirect.ts).
    response.headers.set(AUTH_REQUIRED_HEADER, '1')
    return response
}

// =============================================================================
// CORS (preflight)
// =============================================================================

function requestOrigins(request: NextRequest): string[] {
    const origins = [request.nextUrl.origin]
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
    if (host) {
        const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(/:$/, '')
        origins.push(`${proto}://${host}`)
    }
    return origins
}

function handlePreflight(request: NextRequest, pathname: string): NextResponse {
    const origin = request.headers.get('origin')
    const reqHeaders = request.headers.get('access-control-request-headers')

    // Formulário público (/f/[slug] embutido em sites de terceiros): qualquer origem,
    // mas SEM credenciais.
    if (PUBLIC_CORS_PATTERNS.some((pattern) => matchPattern(pattern, pathname))) {
        return new NextResponse(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        })
    }

    // Resto: CORS só para a própria origem. Antes refletia QUALQUER Origin com
    // Allow-Credentials:true.
    if (origin && requestOrigins(request).includes(origin)) {
        return new NextResponse(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
                'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '86400',
                'Vary': 'Origin, Access-Control-Request-Headers',
            },
        })
    }

    // Alguns scripts (ex.: Vercel feedback/toolbar) disparam OPTIONS mesmo em páginas.
    // Deixar isso cair no roteamento padrão pode virar 400 e poluir o console.
    return new NextResponse(null, { status: 204, headers: { 'Vary': 'Origin' } })
}

// =============================================================================
// Decisão por política (APIs)
// =============================================================================

/** Principal "barato" para rotas públicas: dono se houver credencial válida, senão public. */
async function resolveOptionalOwner(
    request: NextRequest,
    keys: KeyCredentials,
    getSession: () => Promise<SessionState>
): Promise<Principal> {
    if (keys.key === 'admin_key' || keys.key === 'api_key') return { kind: keys.key }
    if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
        if ((await getSession()) === 'valid') return { kind: 'session' }
    }
    return PUBLIC_PRINCIPAL
}

function unauthorizedDecision(keys: KeyCredentials, session: SessionState, fallbackMessage: string): Decision {
    const message =
        keys.key === 'invalid'
            ? 'Invalid API key'
            : session === 'invalid'
                ? 'Sessão inválida ou expirada. Faça login novamente.'
                : session === 'unverified'
                    ? 'Não foi possível validar a sessão agora (banco indisponível). Faça login novamente.'
                    : fallbackMessage
    // 'unverified' (UUID legado com banco fora) NÃO apaga o cookie: pode voltar a valer.
    return { type: 'unauthorized', message, clearSessionCookie: session === 'invalid' }
}

async function decideProtected(
    request: NextRequest,
    policy: ProtectedPolicy,
    keys: KeyCredentials,
    getSession: () => Promise<SessionState>
): Promise<Decision> {
    const allowed = POLICY_ALLOWED[policy]
    const allows = (kind: PrincipalKind) => allowed.includes(kind)
    let forbidden: string | null = null

    // 1) Cron: Bearer CRON_SECRET — só onde a política aceita cron (fim do bypass global).
    if (keys.cronSecret) {
        if (allows('cron')) return { type: 'allow', principal: { kind: 'cron' } }
        forbidden = 'CRON_SECRET só é aceito em rotas de cron'
    }
    // Bearer DISPARA_ADMIN_KEY vira `cron` onde a admin key não é aceita como dono
    // (reinvokeSelf cai nela quando CRON_SECRET não existe).
    if (keys.adminBearer && allows('cron') && !allows('admin_key')) {
        return { type: 'allow', principal: { kind: 'cron' } }
    }

    // 2) API keys (sem banco).
    if (keys.key === 'admin_key' || keys.key === 'api_key') {
        if (allows(keys.key)) return { type: 'allow', principal: { kind: keys.key } }
        forbidden ??= 'Credencial sem permissão para esta rota'
    }

    // 3) Sessão do dashboard (cookie VALIDADO).
    const session = await getSession()
    if (session === 'valid') {
        if (allows('session')) return { type: 'allow', principal: { kind: 'session' } }
        forbidden ??= 'Sessão do dashboard não é aceita nesta rota'
    }

    // 4) Atendente (só nas rotas attendant_or_session).
    let attendantUnavailable = false
    if (allows('attendant')) {
        const attendant = await resolveAttendantTokenDetailed(readAttendantToken(request))
        if (attendant.status === 'valid') {
            return {
                type: 'allow',
                principal: { kind: 'attendant', attendant: attendant.principal },
                // Mesmo navegador com sessão do dono expirada/revogada: apaga o cookie
                // inválido (a próxima chamada do dashboard cai no /login).
                clearSessionCookie: session === 'invalid',
            }
        }
        // Banco fora NÃO é "token inválido": 503 (a PWA continua tentando), nunca 401.
        attendantUnavailable = attendant.status === 'unavailable'
    }

    if (forbidden) return { type: 'forbidden', message: forbidden }
    if (session === 'unavailable') return { type: 'unavailable', reason: 'session_store_unavailable' }
    if (attendantUnavailable) return { type: 'unavailable', reason: 'attendant_store_unavailable' }
    return unauthorizedDecision(keys, session, 'Autenticação necessária: faça login ou envie Authorization: Bearer <api_key>')
}

async function decideInstaller(
    request: NextRequest,
    keys: KeyCredentials,
    getSession: () => Promise<SessionState>
): Promise<Decision> {
    // Antes da instalação (sem MASTER_PASSWORD) o wizard é aberto.
    if (!process.env.MASTER_PASSWORD) {
        return { type: 'allow', principal: await resolveOptionalOwner(request, keys, getSession) }
    }

    if (keys.key === 'admin_key') return { type: 'allow', principal: { kind: 'admin_key' } }

    const session = await getSession()
    if (session === 'valid') return { type: 'allow', principal: { kind: 'session' } }

    // Modo degradado de recuperação: Supabase (free) pausado → o dono com cookie cai no
    // wizard para religar o projeto. Seguro porque TODAS as rotas do installer só operam
    // com credenciais de terceiros enviadas no body (token Vercel / PAT Supabase /
    // dbUrl) — nenhuma usa as credenciais deste deploy. Só vale para cookie ASSINADO
    // ('unavailable'); UUID puro com banco fora ('unverified') não passa.
    if (session === 'unavailable') return { type: 'allow', principal: PUBLIC_PRINCIPAL }

    if (keys.key === 'api_key' || keys.cronSecret) {
        return { type: 'forbidden', message: 'Installer exige sessão do dono ou DISPARA_ADMIN_KEY' }
    }
    return unauthorizedDecision(
        keys,
        session,
        'Installer API bloqueada após instalação. Faça login ou use DISPARA_ADMIN_KEY.'
    )
}

async function handleApi(request: NextRequest, pathname: string): Promise<NextResponse> {
    const method = request.method.toUpperCase()
    // HEAD executa o handler de GET: usa a mesma política.
    const policy = resolveApiPolicy(pathname, method === 'HEAD' ? 'GET' : method)

    // Chamador externo (Meta, Google, formulário público): a ROTA verifica
    // assinatura/token. O proxy não consulta banco e não confia em nada do cliente.
    if (policy === 'public_route_auth') return nextWithPrincipal(request, PUBLIC_PRINCIPAL)

    const keys = await readKeyCredentials(request)
    const getSession = sessionResolver(request)

    if (policy === 'public') {
        return nextWithPrincipal(request, await resolveOptionalOwner(request, keys, getSession))
    }

    const decision =
        policy === 'installer'
            ? await decideInstaller(request, keys, getSession)
            : await decideProtected(request, policy, keys, getSession)

    if (decision.type === 'allow') {
        const response = nextWithPrincipal(request, decision.principal)
        if (decision.clearSessionCookie) response.cookies.delete(SESSION_COOKIE_NAME)
        return response
    }
    return denyApi(request, decision)
}

// =============================================================================
// Páginas
// =============================================================================

async function handlePage(request: NextRequest, pathname: string): Promise<NextResponse> {
    const isInstallerPage = matchSegmentPrefix(INSTALLER_PAGE_PREFIX, pathname)

    // BOOTSTRAP CHECK - sem MASTER_PASSWORD a instância não foi instalada: só o wizard abre.
    if (!process.env.MASTER_PASSWORD) {
        if (isInstallerPage) return nextWithPrincipal(request, PUBLIC_PRINCIPAL)
        return NextResponse.redirect(new URL('/install', request.url))
    }

    // Páginas públicas (casamento por segmento: '/f' não casa '/flows' nem '/forms').
    if (!isInstallerPage && isPublicPage(pathname)) {
        return nextWithPrincipal(request, PUBLIC_PRINCIPAL)
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const session: SessionState = token ? await isValidSessionToken(token) : 'absent'

    if (session === 'valid') return nextWithPrincipal(request, { kind: 'session' })

    // Banco fora com cookie ASSINADO: deixa a página ABRIR em modo degradado
    // (o dashboard mostra o overlay de banco fora; /install deixa religar o Supabase).
    // O principal é public: os loaders RSC/Server Actions do dashboard não carregam
    // dados sem principal de dono (lib/server-principal.ts).
    // Só leitura (GET/HEAD): POST em página é Server Action e não roda sem sessão
    // validada. As APIs continuam protegidas (503).
    if (session === 'unavailable') {
        const method = request.method.toUpperCase()
        if (method === 'GET' || method === 'HEAD') return nextWithPrincipal(request, PUBLIC_PRINCIPAL)
        return sessionStoreUnavailableResponse()
    }

    // 'unverified' (UUID legado com banco fora) vai para o login SEM apagar o cookie.
    return loginRedirect(request, {
        clearSessionCookie: session === 'invalid',
        reason: isInstallerPage ? 'installer_locked' : undefined,
    })
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    // Preflight CORS (páginas e APIs).
    if (request.method === 'OPTIONS') {
        return handlePreflight(request, pathname)
    }

    if (matchSegmentPrefix('/api', pathname)) {
        return handleApi(request, pathname)
    }

    return handlePage(request, pathname)
}

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { applyPrincipalHeaders, type Principal } from '@/lib/principal'
import type { AttendantPermissions } from '@/types'

/**
 * Enforcement no servidor das rotas compartilhadas entre o dashboard e a PWA de
 * atendente. O principal chega pelos headers x-dispara-* gravados pelo proxy
 * (aqui montados com applyPrincipalHeaders, como o proxy faz).
 */

type QueryResult = { data: unknown; error: unknown }

const mocks = vi.hoisted(() => {
  const state: { result: QueryResult } = { result: { data: null, error: null } }

  // Query builder encadeável do supabase-js: qualquer método devolve o builder;
  // await/single/maybeSingle resolvem com state.result.
  const createBuilder = () => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'limit', 'in', 'or', 'upsert']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.single = vi.fn(() => Promise.resolve(state.result))
    builder.maybeSingle = vi.fn(() => Promise.resolve(state.result))
    builder.then = (
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(state.result).then(onFulfilled, onRejected)
    return builder
  }

  const from = vi.fn(() => createBuilder())

  return {
    state,
    from,
    getConversation: vi.fn(),
    patchConversation: vi.fn(),
    deleteConversation: vi.fn(),
    listMessages: vi.fn(),
    sendMessage: vi.fn(),
    templateGetAll: vi.fn(),
    getWhatsAppCredentials: vi.fn(),
    clearAttendantAuthCache: vi.fn(),
  }
})

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
  supabase: { from: mocks.from },
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ from: mocks.from }),
}))

vi.mock('@/lib/inbox/inbox-service', () => ({
  getConversation: mocks.getConversation,
  patchConversation: mocks.patchConversation,
  deleteConversation: mocks.deleteConversation,
  listMessages: mocks.listMessages,
  sendMessage: mocks.sendMessage,
}))

vi.mock('@/lib/supabase-db', () => ({
  templateDb: { getAll: mocks.templateGetAll },
}))

vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: mocks.getWhatsAppCredentials,
}))

vi.mock('@/lib/attendant-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/attendant-auth')>()
  return { ...actual, clearAttendantAuthCache: mocks.clearAttendantAuthCache }
})

import * as attendantConversationsRoute from '@/app/api/attendant/conversations/route'
import * as conversationRoute from '@/app/api/inbox/conversations/[id]/route'
import * as messagesRoute from '@/app/api/inbox/conversations/[id]/messages/route'
import * as takeoverRoute from '@/app/api/inbox/conversations/[id]/takeover/route'
import * as returnToBotRoute from '@/app/api/inbox/conversations/[id]/return-to-bot/route'
import * as templatesRoute from '@/app/api/templates/route'
import * as pushSubscribeRoute from '@/app/api/push/subscribe/route'
import * as pushUnsubscribeRoute from '@/app/api/push/unsubscribe/route'
import * as attendantsRoute from '@/app/api/attendants/route'
import * as attendantByIdRoute from '@/app/api/attendants/[id]/route'

// =============================================================================
// HELPERS
// =============================================================================

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'

function attendant(perms: Partial<AttendantPermissions> = {}): Principal {
  return {
    kind: 'attendant',
    attendant: {
      id: 'att-1',
      name: 'Ana',
      permissions: { canView: false, canReply: false, canHandoff: false, ...perms },
    },
  }
}

const SESSION: Principal = { kind: 'session' }
const API_KEY: Principal = { kind: 'api_key' }
const CRON: Principal = { kind: 'cron' }
const ALL_PERMS = { canView: true, canReply: true, canHandoff: true }

function makeRequest(
  path: string,
  options: { method?: string; principal?: Principal; body?: unknown } = {}
): NextRequest {
  const { method = 'GET', principal, body } = options
  const headers = new Headers({ 'content-type': 'application/json' })
  if (principal) applyPrincipalHeaders(headers, principal)
  return new NextRequest(new URL(path, 'http://localhost'), {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}

const idCtx = () => ctx({ id: CONVERSATION_ID })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.result = { data: [], error: null }
  mocks.getConversation.mockResolvedValue({ id: CONVERSATION_ID })
  mocks.patchConversation.mockResolvedValue({ id: CONVERSATION_ID, status: 'closed' })
  mocks.deleteConversation.mockResolvedValue(undefined)
  mocks.listMessages.mockResolvedValue({ messages: [], hasMore: false })
  mocks.sendMessage.mockResolvedValue({ id: 'msg-1' })
  mocks.templateGetAll.mockResolvedValue([])
  mocks.getWhatsAppCredentials.mockResolvedValue(null)
})

// =============================================================================
// GET /api/attendant/conversations — canView
// =============================================================================

describe('GET /api/attendant/conversations', () => {
  const call = (principal?: Principal) =>
    attendantConversationsRoute.GET(makeRequest('/api/attendant/conversations?status=open', { principal }))

  it('sem principal (proxy não rodou): 401 sem tocar no banco', async () => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('atendente sem canView: 403', async () => {
    const res = await call(attendant({ canReply: true, canHandoff: true }))
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('atendente com canView: 200', async () => {
    const res = await call(attendant({ canView: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ conversations: [], counts: { total: 0 } })
  })

  it('dono (sessão): 200', async () => {
    const res = await call(SESSION)
    expect(res.status).toBe(200)
  })

  it('cron não é atendente nem dono: 403', async () => {
    const res = await call(CRON)
    expect(res.status).toBe(403)
  })
})

// =============================================================================
// /api/inbox/conversations/[id] — GET canView; PATCH/DELETE só dono
// =============================================================================

describe('/api/inbox/conversations/[id]', () => {
  const path = `/api/inbox/conversations/${CONVERSATION_ID}`

  it('GET: atendente com canView lê a conversa', async () => {
    const res = await conversationRoute.GET(makeRequest(path, { principal: attendant({ canView: true }) }), idCtx())
    expect(res.status).toBe(200)
    expect(mocks.getConversation).toHaveBeenCalledWith(CONVERSATION_ID)
  })

  it('GET: atendente sem canView recebe 403', async () => {
    const res = await conversationRoute.GET(makeRequest(path, { principal: attendant({ canReply: true }) }), idCtx())
    expect(res.status).toBe(403)
    expect(mocks.getConversation).not.toHaveBeenCalled()
  })

  it('GET: sem principal recebe 401', async () => {
    const res = await conversationRoute.GET(makeRequest(path), idCtx())
    expect(res.status).toBe(401)
  })

  it('PATCH: atendente (mesmo com todas as permissões) recebe 403', async () => {
    const res = await conversationRoute.PATCH(
      makeRequest(path, { method: 'PATCH', principal: attendant(ALL_PERMS), body: { status: 'closed' } }),
      idCtx()
    )
    expect(res.status).toBe(403)
    expect(mocks.patchConversation).not.toHaveBeenCalled()
  })

  it('PATCH: dono altera a conversa', async () => {
    const res = await conversationRoute.PATCH(
      makeRequest(path, { method: 'PATCH', principal: SESSION, body: { status: 'closed' } }),
      idCtx()
    )
    expect(res.status).toBe(200)
    expect(mocks.patchConversation).toHaveBeenCalledWith(CONVERSATION_ID, { status: 'closed' })
  })

  it('DELETE: atendente recebe 403', async () => {
    const res = await conversationRoute.DELETE(
      makeRequest(path, { method: 'DELETE', principal: attendant(ALL_PERMS) }),
      idCtx()
    )
    expect(res.status).toBe(403)
    expect(mocks.deleteConversation).not.toHaveBeenCalled()
  })

  it('DELETE: dono via API key apaga', async () => {
    const res = await conversationRoute.DELETE(makeRequest(path, { method: 'DELETE', principal: API_KEY }), idCtx())
    expect(res.status).toBe(200)
    expect(mocks.deleteConversation).toHaveBeenCalledWith(CONVERSATION_ID)
  })
})

// =============================================================================
// /api/inbox/conversations/[id]/messages — GET canView; POST canReply (só texto)
// =============================================================================

describe('/api/inbox/conversations/[id]/messages', () => {
  const path = `/api/inbox/conversations/${CONVERSATION_ID}/messages`
  const post = (principal: Principal | undefined, body: unknown) =>
    messagesRoute.POST(makeRequest(path, { method: 'POST', principal, body }), idCtx())

  it('GET: atendente com canView lista mensagens', async () => {
    const res = await messagesRoute.GET(makeRequest(`${path}?limit=100`, { principal: attendant({ canView: true }) }), idCtx())
    expect(res.status).toBe(200)
    expect(mocks.listMessages).toHaveBeenCalledWith(CONVERSATION_ID, { before: undefined, limit: 100 })
  })

  it('GET: atendente sem canView recebe 403', async () => {
    const res = await messagesRoute.GET(makeRequest(path, { principal: attendant() }), idCtx())
    expect(res.status).toBe(403)
    expect(mocks.listMessages).not.toHaveBeenCalled()
  })

  it('POST: atendente com canReply envia texto', async () => {
    const res = await post(attendant({ canView: true, canReply: true }), { content: 'Olá!', message_type: 'text' })
    expect(res.status).toBe(201)
    expect(mocks.sendMessage).toHaveBeenCalledWith(CONVERSATION_ID, 'Olá!', 'text', undefined, undefined)
  })

  it('POST: atendente só com canView recebe 403', async () => {
    const res = await post(attendant({ canView: true }), { content: 'Olá!', message_type: 'text' })
    expect(res.status).toBe(403)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('POST: atendente não pode enviar template (pago)', async () => {
    const res = await post(attendant(ALL_PERMS), {
      content: 'promo',
      message_type: 'template',
      template_name: 'promo_black_friday',
    })
    expect(res.status).toBe(403)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('POST: atendente não pode contrabandear template_name em mensagem de texto', async () => {
    const res = await post(attendant(ALL_PERMS), {
      content: 'oi',
      message_type: 'text',
      template_name: 'promo_black_friday',
    })
    expect(res.status).toBe(403)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('POST: dono pode enviar template', async () => {
    const res = await post(SESSION, { content: 'promo', message_type: 'template', template_name: 'promo_black_friday' })
    expect(res.status).toBe(201)
    expect(mocks.sendMessage).toHaveBeenCalledWith(CONVERSATION_ID, 'promo', 'template', 'promo_black_friday', undefined)
  })

  it('POST: sem principal recebe 401', async () => {
    const res = await post(undefined, { content: 'Olá!' })
    expect(res.status).toBe(401)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })
})

// =============================================================================
// takeover (canReply) e return-to-bot (canReply + canHandoff)
// =============================================================================

describe('POST /api/inbox/conversations/[id]/takeover', () => {
  const call = (principal?: Principal) =>
    takeoverRoute.POST(
      makeRequest(`/api/inbox/conversations/${CONVERSATION_ID}/takeover`, { method: 'POST', principal }),
      idCtx()
    )

  it('atendente com canReply assume a conversa', async () => {
    mocks.state.result = { data: { id: CONVERSATION_ID, mode: 'human' }, error: null }
    const res = await call(attendant({ canView: true, canReply: true }))
    expect(res.status).toBe(200)
    expect(mocks.from).toHaveBeenCalledWith('inbox_conversations')
  })

  it('atendente sem canReply recebe 403', async () => {
    const res = await call(attendant({ canView: true, canHandoff: true }))
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('sem principal recebe 401', async () => {
    const res = await call()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/inbox/conversations/[id]/return-to-bot', () => {
  const call = (principal?: Principal) =>
    returnToBotRoute.POST(
      makeRequest(`/api/inbox/conversations/${CONVERSATION_ID}/return-to-bot`, { method: 'POST', principal }),
      idCtx()
    )

  it('atendente com canReply e canHandoff devolve para a IA', async () => {
    mocks.state.result = { data: { id: CONVERSATION_ID, mode: 'bot' }, error: null }
    const res = await call(attendant({ canReply: true, canHandoff: true }))
    expect(res.status).toBe(200)
    expect(mocks.from).toHaveBeenCalledWith('inbox_conversations')
  })

  it('atendente só com canReply recebe 403', async () => {
    const res = await call(attendant({ canView: true, canReply: true }))
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('atendente só com canHandoff recebe 403', async () => {
    const res = await call(attendant({ canView: true, canHandoff: true }))
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('dono devolve para a IA', async () => {
    mocks.state.result = { data: { id: CONVERSATION_ID, mode: 'bot' }, error: null }
    const res = await call(SESSION)
    expect(res.status).toBe(200)
  })
})

// =============================================================================
// /api/templates — atendente só GET ?source=local com canView; POST só dono
// =============================================================================

describe('/api/templates', () => {
  it('GET ?source=local: atendente com canView lê a cópia local', async () => {
    const res = await templatesRoute.GET(makeRequest('/api/templates?source=local', { principal: attendant({ canView: true }) }))
    expect(res.status).toBe(200)
    expect(mocks.templateGetAll).toHaveBeenCalled()
  })

  it('GET ?source=local: atendente sem canView recebe 403', async () => {
    const res = await templatesRoute.GET(makeRequest('/api/templates?source=local', { principal: attendant({ canReply: true }) }))
    expect(res.status).toBe(403)
    expect(mocks.templateGetAll).not.toHaveBeenCalled()
  })

  it('GET sem source=local (sincroniza com a Meta e apaga linhas locais): atendente recebe 403', async () => {
    const res = await templatesRoute.GET(makeRequest('/api/templates', { principal: attendant(ALL_PERMS) }))
    expect(res.status).toBe(403)
    expect(mocks.getWhatsAppCredentials).not.toHaveBeenCalled()
  })

  it('GET sem source=local: dono segue para a sincronização', async () => {
    const res = await templatesRoute.GET(makeRequest('/api/templates', { principal: SESSION }))
    // Credenciais não configuradas no mock → a rota responde o erro de credenciais, não de auth
    expect(mocks.getWhatsAppCredentials).toHaveBeenCalled()
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Credenciais') })
  })

  it('GET sem principal: 401', async () => {
    const res = await templatesRoute.GET(makeRequest('/api/templates?source=local'))
    expect(res.status).toBe(401)
  })

  it('POST: atendente recebe 403', async () => {
    const res = await templatesRoute.POST(makeRequest('/api/templates', { method: 'POST', principal: attendant(ALL_PERMS), body: {} }))
    expect(res.status).toBe(403)
    expect(mocks.getWhatsAppCredentials).not.toHaveBeenCalled()
  })

  it('POST: dono segue para a busca de credenciais', async () => {
    await templatesRoute.POST(makeRequest('/api/templates', { method: 'POST', principal: SESSION, body: {} }))
    expect(mocks.getWhatsAppCredentials).toHaveBeenCalled()
  })
})

// =============================================================================
// /api/push/subscribe|unsubscribe — dono ou atendente com canView
// =============================================================================

describe('/api/push/subscribe e /api/push/unsubscribe', () => {
  const subscription = { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } }

  it('subscribe: atendente com canView registra', async () => {
    mocks.state.result = { data: null, error: null }
    const res = await pushSubscribeRoute.POST(
      makeRequest('/api/push/subscribe', { method: 'POST', principal: attendant({ canView: true }), body: subscription })
    )
    expect(res.status).toBe(200)
    expect(mocks.from).toHaveBeenCalledWith('push_subscriptions')
  })

  it('subscribe: atendente sem canView recebe 403', async () => {
    const res = await pushSubscribeRoute.POST(
      makeRequest('/api/push/subscribe', { method: 'POST', principal: attendant(), body: subscription })
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('subscribe: sem principal recebe 401', async () => {
    const res = await pushSubscribeRoute.POST(makeRequest('/api/push/subscribe', { method: 'POST', body: subscription }))
    expect(res.status).toBe(401)
  })

  it('unsubscribe: dono remove', async () => {
    mocks.state.result = { data: null, error: null }
    const res = await pushUnsubscribeRoute.POST(
      makeRequest('/api/push/unsubscribe', { method: 'POST', principal: SESSION, body: { endpoint: subscription.endpoint } })
    )
    expect(res.status).toBe(200)
  })

  it('unsubscribe: atendente sem canView recebe 403', async () => {
    const res = await pushUnsubscribeRoute.POST(
      makeRequest('/api/push/unsubscribe', { method: 'POST', principal: attendant(), body: { endpoint: subscription.endpoint } })
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

// =============================================================================
// /api/attendants (CRUD de tokens) — só dono; mutações limpam o cache de auth
// =============================================================================

describe('/api/attendants (CRUD de tokens)', () => {
  const byId = () => ctx({ id: 'att-1' })

  it('GET: atendente não lista tokens (403)', async () => {
    const res = await attendantsRoute.GET(makeRequest('/api/attendants', { principal: attendant(ALL_PERMS) }))
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('GET: sem principal recebe 401', async () => {
    const res = await attendantsRoute.GET(makeRequest('/api/attendants'))
    expect(res.status).toBe(401)
  })

  it('GET: dono lista', async () => {
    mocks.state.result = { data: [], error: null }
    const res = await attendantsRoute.GET(makeRequest('/api/attendants', { principal: SESSION }))
    expect(res.status).toBe(200)
  })

  it('POST: atendente não cria token (403)', async () => {
    const res = await attendantsRoute.POST(
      makeRequest('/api/attendants', { method: 'POST', principal: attendant(ALL_PERMS), body: { name: 'Hacker' } })
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('POST: dono cria token e limpa o cache de auth', async () => {
    mocks.state.result = { data: { id: 'att-2', name: 'Bia' }, error: null }
    const res = await attendantsRoute.POST(
      makeRequest('/api/attendants', { method: 'POST', principal: SESSION, body: { name: 'Bia' } })
    )
    expect(res.status).toBe(201)
    expect(mocks.clearAttendantAuthCache).toHaveBeenCalled()
  })

  it('GET [id]: atendente recebe 403', async () => {
    const res = await attendantByIdRoute.GET(makeRequest('/api/attendants/att-1', { principal: attendant(ALL_PERMS) }), byId())
    expect(res.status).toBe(403)
  })

  it('PATCH [id]: atendente não altera as próprias permissões (403)', async () => {
    const res = await attendantByIdRoute.PATCH(
      makeRequest('/api/attendants/att-1', {
        method: 'PATCH',
        principal: attendant({ canView: true }),
        body: { permissions: ALL_PERMS },
      }),
      byId()
    )
    expect(res.status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.clearAttendantAuthCache).not.toHaveBeenCalled()
  })

  it('PATCH [id]: dono revoga e o cache de auth é limpo na hora', async () => {
    mocks.state.result = { data: { id: 'att-1', is_active: false }, error: null }
    const res = await attendantByIdRoute.PATCH(
      makeRequest('/api/attendants/att-1', { method: 'PATCH', principal: SESSION, body: { is_active: false } }),
      byId()
    )
    expect(res.status).toBe(200)
    expect(mocks.clearAttendantAuthCache).toHaveBeenCalled()
  })

  it('DELETE [id]: atendente recebe 403', async () => {
    const res = await attendantByIdRoute.DELETE(
      makeRequest('/api/attendants/att-1', { method: 'DELETE', principal: attendant(ALL_PERMS) }),
      byId()
    )
    expect(res.status).toBe(403)
    expect(mocks.clearAttendantAuthCache).not.toHaveBeenCalled()
  })

  it('DELETE [id]: dono remove e o cache de auth é limpo', async () => {
    mocks.state.result = { data: null, error: null }
    const res = await attendantByIdRoute.DELETE(
      makeRequest('/api/attendants/att-1', { method: 'DELETE', principal: SESSION }),
      byId()
    )
    expect(res.status).toBe(200)
    expect(mocks.clearAttendantAuthCache).toHaveBeenCalled()
  })
})

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import vm from 'vm'

/**
 * public/sw.js: o HTML/RSC das páginas do dashboard (renderizado no servidor com dados
 * de contatos/conversas) NUNCA pode ir para o Cache Storage — senão continua sendo
 * servido depois do logout num computador compartilhado.
 */

const SW_SOURCE = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8')
const ORIGIN = 'https://app.example.com'

type FakeRequest = { url: string; method: string; mode: string; headers: Headers }
type Listener = (event: Record<string, unknown>) => void

class FakeCache {
  entries = new Map<string, Response>()
  put = vi.fn(async (request: FakeRequest | string, response: Response) => {
    this.entries.set(typeof request === 'string' ? request : request.url, response)
  })
  match = vi.fn(async (request: FakeRequest | string) => this.entries.get(typeof request === 'string' ? request : request.url))
  addAll = vi.fn(async (_urls: string[]) => {})
}

function loadServiceWorker(fetchImpl: (request: FakeRequest) => Promise<Response>) {
  const stores = new Map<string, FakeCache>()
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache())
      return stores.get(name)!
    }),
    keys: vi.fn(async () => Array.from(stores.keys())),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (request: FakeRequest) => {
      for (const store of stores.values()) {
        const hit = await store.match(request)
        if (hit) return hit
      }
      return undefined
    }),
  }
  const listeners = new Map<string, Listener>()
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    registration: { showNotification: vi.fn() },
  }
  const context = vm.createContext({
    self,
    caches,
    fetch: vi.fn(fetchImpl),
    Response,
    Headers,
    URL,
    Promise,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    clients: { matchAll: vi.fn(async () => []) },
  })
  vm.runInContext(SW_SOURCE, context)
  return { listeners, stores, caches, fetch: context.fetch as ReturnType<typeof vi.fn> }
}

function request(path: string, opts: { mode?: string; headers?: Record<string, string> } = {}): FakeRequest {
  return { url: `${ORIGIN}${path}`, method: 'GET', mode: opts.mode ?? 'cors', headers: new Headers(opts.headers ?? {}) }
}

/** Dispara um fetch event; devolve a resposta do SW ou null quando ele não interceptou. */
async function dispatchFetch(sw: ReturnType<typeof loadServiceWorker>, req: FakeRequest): Promise<Response | null> {
  let responded: Promise<Response> | null = null
  sw.listeners.get('fetch')!({ request: req, respondWith: (p: Promise<Response>) => (responded = p) })
  if (!responded) return null
  const res = await responded
  // deixa terminar os cache.put em background (stale-while-revalidate)
  await new Promise((resolve) => setTimeout(resolve, 0))
  return res
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function cachedUrls(sw: ReturnType<typeof loadServiceWorker>): string[] {
  return Array.from(sw.stores.values()).flatMap((store) => Array.from(store.entries.keys()))
}

describe('public/sw.js', () => {
  let sw: ReturnType<typeof loadServiceWorker>

  beforeEach(() => {
    sw = loadServiceWorker(async (req) =>
      req.url.includes('_rsc') ? new Response('rsc', { headers: { 'content-type': 'text/x-component' } }) : html(`page ${req.url}`)
    )
  })

  it('navegação de página do dashboard: só rede, nada vai para o cache', async () => {
    for (const path of ['/inbox', '/contacts', '/', '/campaigns?status=x']) {
      const res = await dispatchFetch(sw, request(path, { mode: 'navigate', headers: { accept: 'text/html' } }))
      expect(await res!.text(), path).toBe(`page ${ORIGIN}${path}`)
    }
    // Antes: stale-while-revalidate gravava o HTML com PII no dispara-v2-dynamic.
    expect(cachedUrls(sw)).toEqual([])
  })

  it('RSC do dashboard não passa pelo SW', async () => {
    expect(await dispatchFetch(sw, request('/inbox?_rsc=abc12', { headers: { rsc: '1' } }))).toBeNull()
    expect(cachedUrls(sw)).toEqual([])
  })

  it('HTML de página não pública nunca é gravado, mesmo vindo de um fetch comum', async () => {
    await dispatchFetch(sw, request('/inbox', { headers: { accept: '*/*' } }))
    expect(cachedUrls(sw)).toEqual([])
  })

  it('páginas públicas (shell da PWA) continuam com cache', async () => {
    await dispatchFetch(sw, request('/atendimento', { mode: 'navigate', headers: { accept: 'text/html' } }))
    await dispatchFetch(sw, request('/login', { mode: 'navigate', headers: { accept: 'text/html' } }))
    expect(cachedUrls(sw)).toEqual(expect.arrayContaining([`${ORIGIN}/atendimento`, `${ORIGIN}/login`]))
  })

  it('offline no dashboard: página genérica sem dados', async () => {
    const offline = loadServiceWorker(async () => {
      throw new TypeError('Failed to fetch')
    })
    const res = await dispatchFetch(offline, request('/inbox', { mode: 'navigate', headers: { accept: 'text/html' } }))
    expect(res!.status).toBe(503)
    expect(await res!.text()).toContain('Sem conexão')
  })

  it("pre-cache não inclui o dashboard ('/')", async () => {
    let installing: Promise<unknown> | null = null
    sw.listeners.get('install')!({ waitUntil: (p: Promise<unknown>) => (installing = p) })
    await installing
    const staticCache = Array.from(sw.stores.entries()).find(([name]) => name.endsWith('-static'))![1]
    const precached = staticCache.addAll.mock.calls[0][0] as string[]
    expect(precached).not.toContain('/')
    expect(precached).toContain('/atendimento')
  })

  it('ativação apaga os caches das versões anteriores (v2 tinha HTML do dashboard)', async () => {
    await sw.caches.open('dispara-v2-dynamic')
    await sw.caches.open('dispara-v2-static')
    let activating: Promise<unknown> | null = null
    sw.listeners.get('activate')!({ waitUntil: (p: Promise<unknown>) => (activating = p) })
    await activating
    expect(Array.from(sw.stores.keys()).some((name) => name.startsWith('dispara-v2'))).toBe(false)
  })

  it('CLEAR_CACHE apaga todos os caches', async () => {
    await sw.caches.open('dispara-v3-dynamic')
    let clearing: Promise<unknown> | null = null
    sw.listeners.get('message')!({ data: { type: 'CLEAR_CACHE' }, waitUntil: (p: Promise<unknown>) => (clearing = p) })
    await clearing
    expect(sw.stores.size).toBe(0)
  })
})

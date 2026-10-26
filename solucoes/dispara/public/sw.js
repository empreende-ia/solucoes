/**
 * Dispara Service Worker
 *
 * Estratégias de cache:
 * - Cache-first: assets estáticos (JS, CSS, fontes, imagens)
 * - /api/*: NUNCA passa pelo SW nem pelo cache (dados autenticados/PII)
 * - Stale-while-revalidate: SÓ páginas públicas (shell da PWA /atendimento, /login)
 * - Páginas do dashboard (HTML e RSC): só rede, nunca cache — o HTML vem do servidor
 *   com dados (contatos, conversas) e não pode sobreviver ao logout. Offline mostra
 *   uma página genérica, sem dados.
 */

// v3: descarta os caches das versões anteriores (a v2 guardava HTML/RSC do dashboard).
const CACHE_VERSION = 'dispara-v3'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`

// Assets para pre-cache (shell do app). Sem '/': o dashboard tem dados do dono e o
// pre-cache roda com os cookies da sessão.
const PRECACHE_ASSETS = [
  '/atendimento',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// Páginas cujo HTML/RSC pode ir para o cache (casamento por segmento). Só shells
// públicos, renderizados sem dados do dono.
const CACHEABLE_PAGE_PREFIXES = ['/atendimento', '/login']

// Padrões para cache estático
const STATIC_PATTERNS = [
  /\/_next\/static\//,           // Next.js static assets
  /\.(?:js|css|woff2?|ttf|eot)$/, // Scripts, styles, fonts
  /\/icons\//,                    // App icons
]

// Padrões para ignorar (não cachear)
const IGNORE_PATTERNS = [
  /\/api\//,                      // API routes
  /\/_next\/webpack-hmr/,         // HMR (dev only)
  /chrome-extension/,             // Browser extensions
  /\.(?:mp3|wav|ogg|m4a|aac)$/,   // Audio files (evita corrupção pelo cache)
]

// =============================================================================
// INSTALL - Pre-cache shell assets
// =============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell')
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => {
        console.log('[SW] Install complete, skipping waiting')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('[SW] Pre-cache failed:', error)
      })
  )
})

// =============================================================================
// ACTIVATE - Clean old caches
// =============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...')

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('dispara-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name)
              return caches.delete(name)
            })
        )
      })
      .then(() => {
        console.log('[SW] Claiming clients')
        return self.clients.claim()
      })
  )
})

// =============================================================================
// FETCH - Handle requests with appropriate strategy
// =============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API: nunca intercepta nem cacheia (respostas autenticadas, PII, CSVs).
  // Checagem explícita e ANTES de tudo — não depende do IGNORE_PATTERNS.
  if (isApiRequest(url)) {
    return
  }

  // Ignorar requests que não devem ser cacheados
  if (shouldIgnore(url)) {
    return
  }

  // Static assets: Cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // HTML pages: Stale-while-revalidate só nas públicas; dashboard só rede.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      isCacheablePage(url) ? staleWhileRevalidate(request, DYNAMIC_CACHE) : networkOnlyPage(request)
    )
    return
  }

  // RSC (navegação client-side do App Router) de página não pública: só rede, sem
  // passar pelo SW — o payload traz os mesmos dados do HTML.
  if (isRscRequest(request, url) && !isCacheablePage(url)) {
    return
  }

  // Default: Network-first
  event.respondWith(networkFirst(request, DYNAMIC_CACHE))
})

// =============================================================================
// PUSH - Handle push notifications
// =============================================================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push received')

  let data = {
    title: 'Dispara',
    body: 'Nova mensagem recebida',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'dispara-notification',
    data: { url: '/atendimento' }
  }

  try {
    if (event.data) {
      const payload = event.data.json()
      data = { ...data, ...payload }
    }
  } catch (error) {
    console.error('[SW] Error parsing push data:', error)
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'dismiss', title: 'Dispensar' }
      ]
    })
  )
})

// =============================================================================
// NOTIFICATION CLICK - Handle notification interactions
// =============================================================================

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action)

  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  const url = event.notification.data?.url || '/atendimento'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se já existe uma janela aberta, foca nela
        for (const client of clientList) {
          if (client.url.includes('/atendimento') && 'focus' in client) {
            return client.focus()
          }
        }
        // Se não, abre uma nova
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      })
  )
})

// =============================================================================
// CACHE STRATEGIES
// =============================================================================

/**
 * Cache-first: Retorna do cache, fallback para network
 * Ideal para assets estáticos que raramente mudam
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(request)
    // Só cacheia GET ok, fora de /api e sem redirect (Cache API não suporta HEAD/POST)
    if (isCacheable(request, response)) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    console.error('[SW] Cache-first fetch failed:', error)
    return new Response('Offline', { status: 503 })
  }
}

/**
 * Network-first: Tenta network, fallback para cache
 * Ideal para dados que precisam estar atualizados
 * Nota: Cache API só suporta GET, então ignoramos HEAD/POST
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    // Só cacheia GET ok, fora de /api e sem redirect (Cache API não suporta HEAD/POST)
    if (isCacheable(request, response)) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

/**
 * Stale-while-revalidate: Retorna cache imediatamente, atualiza em background
 * Ideal para páginas HTML - rápido mas sempre atualizado
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((response) => {
      // Só cacheia GET ok, fora de /api e sem redirect (Cache API não suporta HEAD/POST)
      if (isCacheable(request, response)) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  // fetchPromise resolve null quando a rede falha: sem cache, cai no 503.
  return cached || (await fetchPromise) || new Response('Offline', { status: 503 })
}

/**
 * Network-only para páginas do dashboard: nunca lê nem grava cache. Offline devolve
 * uma página genérica (sem dados).
 */
async function networkOnlyPage(request) {
  try {
    return await fetch(request)
  } catch (error) {
    return new Response(OFFLINE_PAGE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
}

const OFFLINE_PAGE_HTML = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sem conexão</title></head>
<body style="font-family: system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
<main style="text-align: center; padding: 24px;">
<h1 style="font-size: 20px; margin: 0 0 8px;">Sem conexão</h1>
<p style="margin: 0; color: #a3a3a3;">Verifique sua internet e tente novamente.</p>
</main>
</body>
</html>`

// =============================================================================
// HELPERS
// =============================================================================

function shouldIgnore(url) {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(url.href))
}

function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

/**
 * Nunca grava no cache respostas de /api/*, redirects (ex.: 307 para /login) nem
 * HTML/RSC de página não pública (dados do dono), venha de onde vier a request.
 */
function isCacheable(request, response) {
  if (!response || !response.ok || request.method !== 'GET') return false
  if (response.redirected) return false
  const url = new URL(request.url)
  if (isApiRequest(url)) return false
  const contentType = response.headers.get('content-type') || ''
  if ((contentType.includes('text/html') || contentType.includes('text/x-component')) && !isCacheablePage(url)) {
    return false
  }
  return true
}

function isStaticAsset(url) {
  return STATIC_PATTERNS.some((pattern) => pattern.test(url.href))
}

/** Só páginas públicas do PRÓPRIO origin podem ir para o cache. */
function isCacheablePage(url) {
  if (url.origin !== self.location.origin) return false
  return CACHEABLE_PAGE_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + '/')
  )
}

/** Request de payload RSC do App Router (header RSC ou ?_rsc=). */
function isRscRequest(request, url) {
  return request.headers.get('rsc') === '1' || url.searchParams.has('_rsc')
}

// =============================================================================
// MESSAGE HANDLER - Communication with main thread
// =============================================================================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data)

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(names.map((name) => caches.delete(name)))
      )
    )
  }
})

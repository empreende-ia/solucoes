import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearServiceWorkerCaches, logoutAndRedirect } from './logout-client'

/** Cache Storage falso com algumas entradas do SW e uma de outro app. */
function installFakeCaches(names: string[]) {
  const store = new Set(names)
  const fake = {
    keys: vi.fn(async () => Array.from(store)),
    delete: vi.fn(async (name: string) => store.delete(name)),
  }
  Object.defineProperty(window, 'caches', { configurable: true, value: fake })
  return { fake, store }
}

describe('logout-client', () => {
  const originalFetch = window.fetch
  const order: string[] = []

  beforeEach(() => {
    order.length = 0
    window.fetch = vi.fn(async () => {
      order.push('fetch')
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }) as unknown as typeof window.fetch
  })

  afterEach(() => {
    window.fetch = originalFetch
    delete (window as { caches?: unknown }).caches
    vi.restoreAllMocks()
  })

  it('apaga só os caches do SW (dispara-*)', async () => {
    const { store } = installFakeCaches(['dispara-v2-dynamic', 'dispara-v3-static', 'outro-app'])
    await clearServiceWorkerCaches()
    expect(Array.from(store)).toEqual(['outro-app'])
  })

  it('sem Cache API não quebra', async () => {
    await expect(clearServiceWorkerCaches()).resolves.toBeUndefined()
  })

  it('logout: POST no servidor, limpa o cache do SW e navega com reload completo para /login', async () => {
    // Cenário do achado: o HTML de /inbox ficava no Cache Storage depois do logout.
    const { fake, store } = installFakeCaches(['dispara-v2-dynamic', 'dispara-v2-static'])
    fake.delete.mockImplementation(async (name: string) => {
      order.push(`delete:${name}`)
      return store.delete(name)
    })
    const navigate = vi.fn((url: string) => order.push(`navigate:${url}`))

    await logoutAndRedirect(navigate)

    expect(window.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
    expect(store.size).toBe(0)
    expect(navigate).toHaveBeenCalledWith('/login')
    // navega só depois de limpar
    expect(order.at(-1)).toBe('navigate:/login')
    expect(order.indexOf('fetch')).toBe(0)
  })

  it('falha de rede no logout ainda limpa o cache e sai para /login', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof window.fetch
    const { store } = installFakeCaches(['dispara-v2-dynamic'])
    const navigate = vi.fn()

    await logoutAndRedirect(navigate)
    expect(store.size).toBe(0)
    expect(navigate).toHaveBeenCalledWith('/login')
  })
})

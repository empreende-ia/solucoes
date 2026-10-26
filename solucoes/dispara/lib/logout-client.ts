/**
 * Logout do dashboard no browser.
 *
 * Além de revogar a sessão no servidor (POST /api/auth/logout), apaga o Cache Storage
 * do service worker (public/sw.js): versões antigas do SW guardavam o HTML/RSC das
 * páginas do dashboard (com dados de contatos/conversas) e continuariam servindo isso
 * depois do logout num computador compartilhado. Termina com navegação completa
 * (location.replace), que também descarta o Router Cache do Next e o React Query.
 *
 * Só roda no browser; não importe no servidor.
 */

/** Prefixo de todos os caches criados pelo public/sw.js. */
export const SW_CACHE_PREFIX = 'dispara-'

/** Apaga os caches do SW (direto pela página) e avisa o SW ativo. Nunca lança. */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof window === 'undefined') return

  // A API `caches` existe no window: não depende de o SW estar ativo nem do
  // postMessage (que não espera a limpeza terminar).
  try {
    if ('caches' in window) {
      const names = await window.caches.keys()
      await Promise.all(names.filter((name) => name.startsWith(SW_CACHE_PREFIX)).map((name) => window.caches.delete(name)))
    }
  } catch (error) {
    console.warn('[logout] Falha ao limpar o cache do service worker:', error)
  }

  // Reforço: o SW apaga o que uma request em andamento tenha acabado de gravar.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' })
  } catch {
    // SW ausente/indisponível: nada a fazer.
  }
}

/**
 * Faz o logout completo e leva para /login. A navegação acontece mesmo se a
 * chamada ao servidor falhar (o cookie pode já ter sido apagado).
 */
export async function logoutAndRedirect(
  navigate: (url: string) => void = (url) => window.location.replace(url)
): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' })
  } catch (error) {
    console.error('Logout error:', error)
  }
  await clearServiceWorkerCaches()
  navigate('/login')
}

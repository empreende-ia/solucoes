/**
 * Server HTTP helpers
 *
 * Objetivo: evitar travas e "quebras do nada" em rotas de API por fetch sem timeout.
 * Use APENAS em server (API routes, server components).
 */

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number
}

export async function fetchWithTimeout(input: RequestInfo | URL, init?: FetchWithTimeoutOptions): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 4000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Se o caller já passou signal, não dá pra combinar signals nativamente.
    // Nesse caso, respeitamos o signal do caller e ainda aplicamos timeout via race.
    if (init?.signal) {
      const res = await Promise.race([
        fetch(input, init),
        new Promise<Response>((_resolve, reject) =>
          setTimeout(() => reject(new DOMException('Timeout', 'AbortError')), timeoutMs)
        ),
      ])
      return res
    }

    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function safeJson<T = any>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function safeText(res: Response): Promise<string | null> {
  try {
    return await res.text()
  } catch {
    return null
  }
}

export function isAbortError(err: unknown): boolean {
  if (!err) return false
  const name = (err as any)?.name
  return name === 'AbortError'
}

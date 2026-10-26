import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface DebounceOptions {
  /**
   * Tempo máximo (ms) que uma rajada contínua pode adiar a chamada. Sem ele, chamadas
   * com intervalo menor que `ms` adiam a execução para sempre (ex.: flood de eventos
   * realtime). Com ele, `fn` roda no máximo a cada `maxWait` ms enquanto a rajada durar.
   */
  maxWait?: number
}

/**
 * Creates a debounced version of a function
 *
 * @param fn - Function to debounce
 * @param ms - Delay in milliseconds
 * @param options - `maxWait` garante uma execução periódica sob rajada contínua
 * @returns Debounced function with cancel/flush methods
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number,
  options: DebounceOptions = {}
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let burstStartedAt: number | null = null
  let hasPending = false
  let pendingArgs = [] as unknown as Parameters<T>
  const maxWait = options.maxWait !== undefined ? Math.max(options.maxWait, ms) : undefined

  const reset = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    burstStartedAt = null
    hasPending = false
  }

  const invoke = () => {
    const shouldCall = hasPending
    const args = pendingArgs
    // Zera antes de chamar: `fn` pode chamar o debounced de novo (nova rajada).
    reset()
    if (shouldCall) fn(...args)
  }

  const debounced = ((...args: Parameters<T>) => {
    hasPending = true
    pendingArgs = args
    const now = Date.now()
    if (burstStartedAt === null) burstStartedAt = now
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    const wait = maxWait === undefined ? ms : Math.max(0, Math.min(ms, maxWait - (now - burstStartedAt)))
    timeoutId = setTimeout(invoke, wait)
  }) as T & { cancel: () => void; flush: () => void }

  debounced.cancel = reset

  debounced.flush = () => {
    if (timeoutId) invoke()
  }

  return debounced
}


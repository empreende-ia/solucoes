import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn, debounce } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('deduplicates conflicting tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('merges tailwind variants correctly', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles empty inputs', () => {
    expect(cn()).toBe('')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })
})

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls function after specified delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('passes arguments to the original function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('a', 'b')
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledWith('a', 'b')
  })

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced()
    vi.advanceTimersByTime(150)
    debounced()
    vi.advanceTimersByTime(150)

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('uses arguments from the last call', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    debounced('second')
    debounced('third')
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('third')
  })

  it('cancel prevents the function from being called', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced()
    vi.advanceTimersByTime(100)
    debounced.cancel()
    vi.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel is safe to call when no timer is pending', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced.cancel()
    expect(fn).not.toHaveBeenCalled()
  })

  it('can be called again after cancel', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    debounced.cancel()

    debounced()
    vi.advanceTimersByTime(100)

    expect(fn).toHaveBeenCalledOnce()
  })

  /** Chama `debounced` a cada `intervalMs` durante `totalMs` (flood de eventos realtime). */
  function flood(debounced: (n: number) => void, intervalMs: number, totalMs: number) {
    for (let elapsed = 0; elapsed < totalMs; elapsed += intervalMs) {
      debounced(elapsed)
      vi.advanceTimersByTime(intervalMs)
    }
  }

  it('sem maxWait, uma rajada contínua adia a chamada indefinidamente (o problema)', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    flood(debounced, 100, 5000)
    expect(fn).not.toHaveBeenCalled()
  })

  it('com maxWait, garante um flush periódico mesmo sob rajada contínua', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200, { maxWait: 1000 })

    flood(debounced, 100, 5000)
    // 1 execução por segundo de rajada, com os argumentos mais recentes
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(fn.mock.calls.length).toBeLessThanOrEqual(5)
    expect(fn).toHaveBeenNthCalledWith(1, 900)

    // Fim da rajada: o trailing ainda sai (sem chamadas perdidas)
    const before = fn.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(fn.mock.calls.length).toBeLessThanOrEqual(before + 1)
    expect(fn).toHaveBeenLastCalledWith(4900)
  })

  it('com maxWait, uma chamada isolada continua esperando só `ms`', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200, { maxWait: 1000 })

    debounced()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('maxWait menor que ms vale como ms', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200, { maxWait: 50 })

    debounced()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('flush executa na hora o que estiver pendente', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced.flush()
    expect(fn).not.toHaveBeenCalled()

    debounced('x')
    debounced.flush()
    expect(fn).toHaveBeenCalledWith('x')

    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('fn pode reagendar o próprio debounce (nova rajada)', () => {
    let rescheduled = false
    const fn = vi.fn(() => {
      if (!rescheduled) {
        rescheduled = true
        debounced()
      }
    })
    const debounced = debounce(fn, 100, { maxWait: 300 })

    debounced()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

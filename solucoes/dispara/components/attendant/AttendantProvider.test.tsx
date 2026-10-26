import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendantProvider, useAttendant } from '@/components/attendant/AttendantProvider'

/**
 * AttendantProvider: com ?token valida via POST (servidor grava o cookie);
 * sem ?token restaura a sessão via GET (cookie httpOnly, invisível ao JS).
 * 503/5xx/rede = transitório: "reconectando" com backoff, nunca "Acesso Negado".
 */

const ATTENDANT = {
  id: 'att-1',
  name: 'Ana',
  permissions: { canView: true, canReply: true, canHandoff: false },
}

type FetchCall = [input: string, init?: RequestInit]

function jsonResponse(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => data,
  } as unknown as Response
}

const UNAVAILABLE_BODY = { valid: false, error: 'Banco de dados indisponível', reason: 'attendant_store_unavailable' }

function Probe() {
  const ctx = useAttendant()
  return (
    <div>
      <span data-testid="ready">{String(ctx.isReady)}</span>
      <span data-testid="validating">{String(ctx.isValidating)}</span>
      <span data-testid="auth">{String(ctx.isAuthenticated)}</span>
      <span data-testid="reconnecting">{String(ctx.isReconnecting)}</span>
      <span data-testid="name">{ctx.attendant?.name ?? ''}</span>
      <span data-testid="error">{ctx.error ?? ''}</span>
      <span data-testid="canReply">{String(ctx.canReply)}</span>
      <span data-testid="canHandoff">{String(ctx.canHandoff)}</span>
      <button type="button" onClick={() => void ctx.logout()}>
        sair
      </button>
      <button type="button" onClick={() => ctx.retryNow()}>
        tentar agora
      </button>
    </div>
  )
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()

function calls(): FetchCall[] {
  return fetchMock.mock.calls as FetchCall[]
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Resolve as promessas pendentes e avança os timers fake dentro do act. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function text(testId: string): string | null {
  return screen.getByTestId(testId).textContent
}

describe('AttendantProvider', () => {
  it('sem ?token: restaura a sessão pelo cookie (GET)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { valid: true, attendant: ATTENDANT }))

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = calls()[0]
    expect(url).toBe('/api/attendants/validate')
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
    expect(screen.getByTestId('ready').textContent).toBe('true')
    expect(screen.getByTestId('validating').textContent).toBe('false')
    expect(screen.getByTestId('name').textContent).toBe('Ana')
    expect(screen.getByTestId('canReply').textContent).toBe('true')
    expect(screen.getByTestId('canHandoff').textContent).toBe('false')
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('sem ?token e sem cookie válido: não autentica e mostra o erro do servidor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { valid: false, error: 'Sessão de atendente não encontrada.' })
    )

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )

    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('false')
    expect(screen.getByTestId('error').textContent).toBe('Sessão de atendente não encontrada.')
  })

  it('com ?token: valida via POST (o servidor grava o cookie)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { valid: true, attendant: ATTENDANT }))

    render(
      <AttendantProvider token="abc123">
        <Probe />
      </AttendantProvider>
    )

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = calls()[0]
    expect(url).toBe('/api/attendants/validate')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ token: 'abc123' })
    expect(screen.getByTestId('name').textContent).toBe('Ana')
  })

  it('navegação interna sem ?token depois do login: não revalida (segue pelo cookie)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { valid: true, attendant: ATTENDANT }))

    const { rerender } = render(
      <AttendantProvider token="abc123">
        <Probe />
      </AttendantProvider>
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    rerender(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('auth').textContent).toBe('true')
  })

  it('voltar para o link com ?token já autenticado: revalida sem voltar para o loading', async () => {
    const upgraded = { ...ATTENDANT, permissions: { ...ATTENDANT.permissions, canHandoff: true } }
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: upgraded }))

    const { rerender } = render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    rerender(
      <AttendantProvider token="abc123">
        <Probe />
      </AttendantProvider>
    )

    expect(screen.getByTestId('validating').textContent).toBe('false')
    await waitFor(() => expect(screen.getByTestId('canHandoff').textContent).toBe('true'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(calls()[1][1]?.method).toBe('POST')
    expect(screen.getByTestId('auth').textContent).toBe('true')
  })

  it('com ?token inválido: não autentica e mantém a mensagem do servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { valid: false, error: 'Token inválido ou expirado' }))

    render(
      <AttendantProvider token="bad-token-bad-token">
        <Probe />
      </AttendantProvider>
    )

    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('false')
    expect(screen.getByTestId('error').textContent).toBe('Token inválido ou expirado')
  })

  // Cenário do achado da revisão: reload da PWA com o banco oscilando. Antes da
  // correção o 503 caía em setError e a página mostrava "Acesso Negado".
  it('GET com 503 (banco indisponível): fica reconectando, sem erro, e autentica quando o servidor volta', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, UNAVAILABLE_BODY, { 'Retry-After': '5' }))
      .mockResolvedValueOnce(jsonResponse(503, UNAVAILABLE_BODY, { 'Retry-After': '5' }))
      .mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await advance(0)

    expect(text('ready')).toBe('true')
    expect(text('validating')).toBe('false')
    expect(text('reconnecting')).toBe('true')
    expect(text('auth')).toBe('false')
    expect(text('error')).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Respeita o Retry-After (5s): nada antes disso
    await advance(4_900)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(100)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // A nova tentativa não volta para o loading
    expect(text('validating')).toBe('false')
    expect(text('reconnecting')).toBe('true')

    await advance(5_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(calls().every(([, init]) => init?.method === 'GET')).toBe(true)
    expect(text('auth')).toBe('true')
    expect(text('reconnecting')).toBe('false')
    expect(text('error')).toBe('')
    expect(text('name')).toBe('Ana')
  })

  it('falha de rede: não mostra erro de acesso, reconecta com backoff exponencial', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await advance(0)

    expect(text('reconnecting')).toBe('true')
    expect(text('auth')).toBe('false')
    expect(text('error')).toBe('')

    await advance(1_000) // 1a nova tentativa: 1s
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(1_999) // 2a: 2s
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(text('auth')).toBe('true')
    expect(text('reconnecting')).toBe('false')
    warn.mockRestore()
  })

  it('POST com ?token e 502: reconecta e repete o POST (não diz "token inválido")', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, {}))
      .mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))

    render(
      <AttendantProvider token="abc123">
        <Probe />
      </AttendantProvider>
    )
    await advance(0)

    expect(text('reconnecting')).toBe('true')
    expect(text('error')).toBe('')

    await advance(1_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(calls()[1][1]?.method).toBe('POST')
    expect(JSON.parse(String(calls()[1][1]?.body))).toEqual({ token: 'abc123' })
    expect(text('auth')).toBe('true')
  })

  it('reconectando e o servidor responde 401: aí sim é acesso negado (para de tentar)', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, UNAVAILABLE_BODY))
      .mockResolvedValueOnce(jsonResponse(401, { valid: false, error: 'Token inválido ou expirado' }))

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await advance(0)
    expect(text('reconnecting')).toBe('true')

    await advance(1_000)
    expect(text('reconnecting')).toBe('false')
    expect(text('auth')).toBe('false')
    expect(text('error')).toBe('Token inválido ou expirado')

    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('"Tentar agora" antecipa a reconexão sem esperar o backoff', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, UNAVAILABLE_BODY, { 'Retry-After': '30' }))
      .mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await advance(0)
    expect(text('reconnecting')).toBe('true')

    await act(async () => {
      screen.getByRole('button', { name: 'tentar agora' }).click()
    })
    await advance(0)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text('auth')).toBe('true')

    // O timer do backoff anterior foi cancelado: não há 3a chamada
    await advance(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a rede voltou (evento online): tenta de novo na hora', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await advance(0)
    expect(text('reconnecting')).toBe('true')

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await advance(0)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text('auth')).toBe('true')
    warn.mockRestore()
  })

  it('logout: apaga o cookie (DELETE) e zera a sessão', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true, attendant: ATTENDANT }))
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }))

    render(
      <AttendantProvider token={null}>
        <Probe />
      </AttendantProvider>
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      screen.getByRole('button', { name: 'sair' }).click()
    })

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'))
    const [url, init] = calls()[1]
    expect(url).toBe('/api/attendants/validate')
    expect(init?.method).toBe('DELETE')
    expect(screen.getByTestId('name').textContent).toBe('')
    expect(screen.getByTestId('canReply').textContent).toBe('false')
  })
})

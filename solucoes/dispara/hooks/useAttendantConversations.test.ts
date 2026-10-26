import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AttendantApiError,
  attendantPollingInterval,
  isAttendantAuthError,
  isAttendantTransientError,
  shouldRetryAttendantQuery,
  useAttendantConversations,
  useStickyQueryError,
} from '@/hooks/useAttendantConversations'
import { computeReconnectDelay, isTransientHttpStatus } from '@/components/attendant/attendant-reconnect'

describe('isAttendantAuthError', () => {
  it('reconhece 401 e 403 da API do atendimento (sessão caiu / sem permissão)', () => {
    expect(isAttendantAuthError(new AttendantApiError('x', 401))).toBe(true)
    expect(isAttendantAuthError(new AttendantApiError('x', 403))).toBe(true)
  })

  it('não trata outros erros como erro de auth (continua o polling/retry)', () => {
    expect(isAttendantAuthError(new AttendantApiError('x', 500))).toBe(false)
    expect(isAttendantAuthError(new AttendantApiError('x', 503))).toBe(false)
    expect(isAttendantAuthError(new AttendantApiError('x', 404))).toBe(false)
    expect(isAttendantAuthError(new Error('x'))).toBe(false)
    expect(isAttendantAuthError(null)).toBe(false)
  })

  it('preserva o status no erro', () => {
    const error = new AttendantApiError('Falha ao carregar conversas', 401)
    expect(error.status).toBe(401)
    expect(error.message).toBe('Falha ao carregar conversas')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('isAttendantTransientError', () => {
  it('503 (banco indisponível), outros 5xx, 408/429 e falha de rede são transitórios', () => {
    expect(isAttendantTransientError(new AttendantApiError('x', 503))).toBe(true)
    expect(isAttendantTransientError(new AttendantApiError('x', 500))).toBe(true)
    expect(isAttendantTransientError(new AttendantApiError('x', 502))).toBe(true)
    expect(isAttendantTransientError(new AttendantApiError('x', 408))).toBe(true)
    expect(isAttendantTransientError(new AttendantApiError('x', 429))).toBe(true)
    expect(isAttendantTransientError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('401/403/404 e erros genéricos não são transitórios', () => {
    expect(isAttendantTransientError(new AttendantApiError('x', 401))).toBe(false)
    expect(isAttendantTransientError(new AttendantApiError('x', 403))).toBe(false)
    expect(isAttendantTransientError(new AttendantApiError('x', 404))).toBe(false)
    expect(isAttendantTransientError(new Error('x'))).toBe(false)
    expect(isAttendantTransientError(null)).toBe(false)
  })
})

describe('polling/retry das queries da PWA', () => {
  it('503 mantém o polling e o retry; 401/403 param', () => {
    expect(attendantPollingInterval(new AttendantApiError('x', 503), 10_000)).toBe(10_000)
    expect(attendantPollingInterval(new TypeError('Failed to fetch'), 10_000)).toBe(10_000)
    expect(attendantPollingInterval(null, 10_000)).toBe(10_000)
    expect(attendantPollingInterval(new AttendantApiError('x', 401), 10_000)).toBe(false)
    expect(attendantPollingInterval(new AttendantApiError('x', 403), 10_000)).toBe(false)

    expect(shouldRetryAttendantQuery(0, new AttendantApiError('x', 503))).toBe(true)
    expect(shouldRetryAttendantQuery(3, new AttendantApiError('x', 503))).toBe(false)
    expect(shouldRetryAttendantQuery(0, new AttendantApiError('x', 401))).toBe(false)
  })
})

describe('attendant-reconnect', () => {
  it('isTransientHttpStatus: 5xx, 408 e 429', () => {
    expect([500, 502, 503, 504, 408, 429].every(isTransientHttpStatus)).toBe(true)
    expect([200, 400, 401, 403, 404].some(isTransientHttpStatus)).toBe(false)
  })

  it('computeReconnectDelay: backoff exponencial com teto de 30s e piso no Retry-After', () => {
    expect(computeReconnectDelay(0)).toBe(1_000)
    expect(computeReconnectDelay(1)).toBe(2_000)
    expect(computeReconnectDelay(2)).toBe(4_000)
    expect(computeReconnectDelay(10)).toBe(30_000)
    expect(computeReconnectDelay(0, '5')).toBe(5_000)
    expect(computeReconnectDelay(4, '5')).toBe(16_000)
    expect(computeReconnectDelay(0, '120')).toBe(30_000)
    expect(computeReconnectDelay(0, 'Wed, 21 Oct 2026 07:28:00 GMT')).toBe(1_000)
  })
})

// =============================================================================
// Hook: o polling sobrevive a um 503 do proxy (banco oscilando)
// =============================================================================

describe('useAttendantConversations (polling)', () => {
  const fetchMock = vi.fn<(input: string) => Promise<Response>>()
  const OK_BODY = {
    conversations: [
      {
        id: 'c1',
        contactName: 'Maria',
        contactPhone: '+5511999999999',
        status: 'human_active',
        lastMessage: 'Oi',
        lastMessageAt: '2026-10-11T00:00:00.000Z',
        unreadCount: 0,
      },
    ],
    counts: { total: 1, urgent: 0, ai: 0, human: 1, resolved: 0 },
  }

  function response(status: number, body: unknown = {}): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
  }

  function createClient() {
    // retryDelay mínimo para o teste não esperar o backoff padrão do react-query
    return new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })
  }

  function wrapper(client: QueryClient = createClient()) {
    return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Cenário do achado da revisão: o proxy responde 503 enquanto o banco oscila.
  // O polling não pode parar nem virar "sessão expirada".
  it('503 é transitório: marca reconectando, segue o polling e recupera quando o banco volta', async () => {
    let healthy = false
    fetchMock.mockImplementation(async () => (healthy ? response(200, OK_BODY) : response(503)))

    const { result } = renderHook(() => useAttendantConversations({ refetchInterval: 20 }), {
      wrapper: wrapper(),
    })

    // Asserções no mesmo waitFor: nada roda entre a checagem do erro e a do estado
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(AttendantApiError)
      expect(isAttendantAuthError(result.current.error)).toBe(false)
      expect(result.current.isReconnecting).toBe(true)
    })
    const callsWhileDown = fetchMock.mock.calls.length
    // 1 tentativa + 3 retries
    expect(callsWhileDown).toBeGreaterThanOrEqual(4)

    healthy = true
    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1)
      expect(result.current.isReconnecting).toBe(false)
      expect(result.current.error).toBeNull()
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhileDown)
  })

  // Cenário do achado: banco fora desde o primeiro carregamento (nada em cache). Toda
  // nova rodada do polling volta a query para 'pending' com error=null no react-query
  // v5; antes a faixa "reconectando" sumia e a lista voltava para o skeleton.
  it('sem dados em cache, a nova rodada do polling mantém "reconectando" e não volta ao skeleton', async () => {
    const client = createClient()
    let releaseRound: (res: Response) => void = () => {}
    fetchMock.mockImplementation(async () => response(503))

    const { result } = renderHook(
      () => ({
        list: useAttendantConversations({ refetchInterval: 60_000 }),
        fetching: useIsFetching({ queryKey: ['attendant-conversations'] }),
      }),
      { wrapper: wrapper(client) }
    )

    // Primeira rodada (1 + 3 retries) terminou em 503
    await waitFor(() => {
      expect(result.current.fetching).toBe(0)
      expect(result.current.list.isReconnecting).toBe(true)
    })

    // Próxima rodada fica em andamento até liberarmos a resposta
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          releaseRound = resolve
        })
    )
    act(() => {
      void result.current.list.refetch()
    })
    await waitFor(() => expect(result.current.fetching).toBe(1))

    // O react-query zerou o erro no cache (era isso que apagava a faixa)...
    const [query] = client.getQueryCache().findAll({ queryKey: ['attendant-conversations'] })
    expect(query.state).toMatchObject({ status: 'pending', error: null, fetchStatus: 'fetching' })
    // ...mas o hook continua em "reconectando", sem skeleton
    expect(result.current.list.isReconnecting).toBe(true)
    expect(result.current.list.isLoading).toBe(false)
    expect(isAttendantTransientError(result.current.list.error)).toBe(true)

    // O banco voltou: a rodada termina com sucesso e o estado limpa
    act(() => releaseRound(response(200, OK_BODY)))
    await waitFor(() => {
      expect(result.current.list.conversations).toHaveLength(1)
      expect(result.current.list.isReconnecting).toBe(false)
      expect(result.current.list.error).toBeNull()
    })
  })

  it('401 para o polling (sessão encerrada) e não faz retry', async () => {
    fetchMock.mockResolvedValue(response(401))

    const { result } = renderHook(() => useAttendantConversations({ refetchInterval: 20 }), {
      wrapper: wrapper(),
    })

    await waitFor(() => {
      expect(isAttendantAuthError(result.current.error)).toBe(true)
      expect(result.current.isReconnecting).toBe(false)
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('useStickyQueryError', () => {
  type Props = { error: AttendantApiError | null; isSuccess: boolean }

  it('mantém o último erro enquanto a query volta a pending sem dados; limpa no sucesso', () => {
    const unavailable = new AttendantApiError('x', 503)
    const revoked = new AttendantApiError('y', 401)
    const { result, rerender } = renderHook(({ error, isSuccess }: Props) => useStickyQueryError(error, isSuccess), {
      initialProps: { error: null, isSuccess: false } as Props,
    })
    expect(result.current).toBeNull()

    rerender({ error: unavailable, isSuccess: false })
    expect(result.current).toBe(unavailable)

    // Nova rodada: o react-query zera o erro (status 'pending')
    rerender({ error: null, isSuccess: false })
    expect(result.current).toBe(unavailable)

    // Um erro novo substitui o anterior
    rerender({ error: revoked, isSuccess: false })
    expect(result.current).toBe(revoked)
    rerender({ error: null, isSuccess: false })
    expect(result.current).toBe(revoked)

    // Sucesso limpa, e uma rodada seguinte sem erro não ressuscita o antigo
    rerender({ error: null, isSuccess: true })
    expect(result.current).toBeNull()
    rerender({ error: null, isSuccess: false })
    expect(result.current).toBeNull()
  })

  it('trocar de chave (busca/filtro) descarta o erro guardado da chave anterior', () => {
    type KeyedProps = Props & { resetKey: string }
    const unavailable = new AttendantApiError('x', 503)
    const { result, rerender } = renderHook(
      ({ error, isSuccess, resetKey }: KeyedProps) => useStickyQueryError(error, isSuccess, resetKey),
      { initialProps: { error: unavailable, isSuccess: false, resetKey: 'A' } as KeyedProps }
    )
    expect(result.current).toBe(unavailable)

    // Mesma chave, nova rodada pending: mantém o erro
    rerender({ error: null, isSuccess: false, resetKey: 'A' })
    expect(result.current).toBe(unavailable)

    // Nova chave ainda carregando: sem erro herdado (skeleton, não faixa de reconexão)
    rerender({ error: null, isSuccess: false, resetKey: 'B' })
    expect(result.current).toBeNull()

    // Voltar para A também não ressuscita o erro antigo
    rerender({ error: null, isSuccess: false, resetKey: 'A' })
    expect(result.current).toBeNull()
  })
})

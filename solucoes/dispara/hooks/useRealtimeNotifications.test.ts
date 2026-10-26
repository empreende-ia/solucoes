import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { RealtimePayload } from '@/types'

const tableCallbacks: Array<{ table: string; cb: (payload: RealtimePayload) => void }> = []

vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(() => ({})),
  subscribeToTable: vi.fn((_channel: unknown, table: string, _event: string, cb: (p: RealtimePayload) => void) => {
    tableCallbacks.push({ table, cb })
  }),
  activateChannel: vi.fn(() => Promise.resolve()),
  removeChannel: vi.fn(),
}))

const getById = vi.fn()
// lookupById derivado do mock: undefined → 404; rejeição → erro transitório.
vi.mock('@/services/campaignService', () => ({
  campaignService: {
    getById: (id: string) => getById(id),
    lookupById: async (id: string) => {
      try {
        const campaign = await getById(id)
        return campaign ? { status: 'found', campaign } : { status: 'not_found' }
      } catch {
        return { status: 'error' }
      }
    },
  },
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

import {
  __resetCampaignConfirmationsForTests,
  CAMPAIGN_CONFIRM_BUDGET,
  CAMPAIGN_CONFIRM_BUDGET_WINDOW_MS,
  CAMPAIGN_CONFIRM_NOT_FOUND_TTL_MS,
  CAMPAIGN_CONFIRM_QUEUE_MAX,
  CAMPAIGN_CONFIRM_RECHECK_MS,
  confirmCampaignStatus,
  getActiveCampaignIds,
  getCampaignFinalTransition,
  useRealtimeNotifications,
} from '@/hooks/useRealtimeNotifications'

function campaignUpdate(
  next: Record<string, unknown> | null,
  prev: Record<string, unknown> | null
): RealtimePayload {
  return {
    schema: 'public',
    table: 'campaigns',
    commit_timestamp: '',
    eventType: 'UPDATE',
    new: next,
    old: prev,
    errors: null,
  }
}

function emit(payload: RealtimePayload) {
  for (const { table, cb } of tableCallbacks) {
    if (table === payload.table) cb(payload)
  }
}

/** Monta o hook com um QueryClient (opcionalmente com campanhas já no cache autenticado). */
function renderNotifications(cachedCampaigns: Array<{ id: string; status: string; name?: string }> = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  if (cachedCampaigns.length) {
    queryClient.setQueryData(['campaigns', { page: 1, search: '', status: 'All' }], {
      data: cachedCampaigns,
      total: cachedCampaigns.length,
      limit: 20,
      offset: 0,
    })
  }
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  const utils = renderHook(() => useRealtimeNotifications({ enabled: true }), { wrapper })
  return { ...utils, queryClient }
}

const flush = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  tableCallbacks.length = 0
  getById.mockReset()
  Object.values(toastMock).forEach((fn) => fn.mockReset())
  __resetCampaignConfirmationsForTests()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  __resetCampaignConfirmationsForTests()
})

describe('getCampaignFinalTransition', () => {
  it('detecta transição para Concluído e Falhou', () => {
    expect(
      getCampaignFinalTransition(campaignUpdate({ id: 'c1', status: 'Concluído' }, { id: 'c1', status: 'Enviando' }))
    ).toEqual({ id: 'c1', status: 'Concluído' })
    expect(
      getCampaignFinalTransition(campaignUpdate({ id: 'c1', status: 'Falhou' }, { id: 'c1', status: 'Enviando' }))
    ).toEqual({ id: 'c1', status: 'Falhou' })
  })

  it('detecta conclusão por completed_at preenchido', () => {
    expect(
      getCampaignFinalTransition(
        campaignUpdate(
          { id: 'c1', status: 'Concluído', completed_at: '2026-10-11T10:00:00Z' },
          { id: 'c1', status: 'Concluído', completed_at: null }
        )
      )
    ).toEqual({ id: 'c1', status: 'Concluído' })
  })

  it('não trata update de contadores depois da conclusão como transição', () => {
    expect(
      getCampaignFinalTransition(
        campaignUpdate(
          { id: 'c1', status: 'Concluído', delivered: 10, completed_at: '2026-10-11T10:00:00Z' },
          { id: 'c1', status: 'Concluído', delivered: 9, completed_at: '2026-10-11T10:00:00Z' }
        )
      )
    ).toBeNull()
  })

  it('ignora INSERT, status não final e payload sem id', () => {
    expect(
      getCampaignFinalTransition({ ...campaignUpdate({ id: 'c1', status: 'Concluído' }, null), eventType: 'INSERT' })
    ).toBeNull()
    expect(getCampaignFinalTransition(campaignUpdate({ id: 'c1', status: 'Enviando' }, null))).toBeNull()
    expect(getCampaignFinalTransition(campaignUpdate({ status: 'Concluído' }, null))).toBeNull()
  })
})

describe('getActiveCampaignIds (cache autenticado)', () => {
  it('lê listas, detalhe e recentes; só status que ainda podem terminar', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['campaigns', { page: 1 }], {
      data: [
        { id: 'sending', status: 'Enviando' },
        { id: 'done', status: 'Concluído' },
        { id: 'draft', status: 'Rascunho' },
      ],
      total: 3,
    })
    queryClient.setQueryData(['recentCampaigns'], [{ id: 'scheduled', status: 'Agendado' }])
    queryClient.setQueryData(['campaign', 'paused'], { id: 'paused', status: 'Pausado' })
    // Chave de detalhe que não bate com o id do dado não conta
    queryClient.setQueryData(['campaign', 'x', 'messages'], { id: 'other', status: 'Enviando' })

    expect(Array.from(getActiveCampaignIds(queryClient)).sort()).toEqual(['paused', 'scheduled', 'sending'])
  })
})

describe('useRealtimeNotifications (payload sem PII)', () => {
  it('busca o nome pela API autenticada e mostra o toast', async () => {
    getById.mockResolvedValue({ id: 'c1', name: 'Black Friday', status: 'Concluído' })
    renderNotifications()

    emit(campaignUpdate({ id: 'c1', status: 'Concluído' }, { id: 'c1', status: 'Enviando' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1))
    expect(getById).toHaveBeenCalledWith('c1')
    expect(toastMock.success).toHaveBeenCalledWith('Campanha "Black Friday" concluída!', { id: 'campaign:c1:Concluído' })
  })

  it('evento forjado (API não confirma o status) não gera toast', async () => {
    getById.mockResolvedValue({ id: 'c1', name: 'Black Friday', status: 'Enviando' })
    renderNotifications()

    emit(campaignUpdate({ id: 'c1', status: 'Falhou' }, { id: 'c1', status: 'Enviando' }))

    await waitFor(() => expect(getById).toHaveBeenCalledTimes(1))
    await flush()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('não busca nada para updates que não são transição e deduplica o toast', async () => {
    getById.mockResolvedValue({ id: 'c1', name: 'X', status: 'Concluído' })
    renderNotifications()

    emit(campaignUpdate({ id: 'c1', status: 'Enviando', sent: 5 }, { id: 'c1', status: 'Enviando', sent: 4 }))
    expect(getById).not.toHaveBeenCalled()

    const done = campaignUpdate({ id: 'c1', status: 'Concluído' }, { id: 'c1', status: 'Enviando' })
    emit(done)
    emit(done)

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1))
    expect(getById).toHaveBeenCalledTimes(1)

    // Já notificada: nem consulta a API
    emit(done)
    await flush()
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(getById).toHaveBeenCalledTimes(1)
  })

  it('evento forjado repetido para um id inexistente (404) busca a API uma vez só (cache negativo)', async () => {
    getById.mockResolvedValue(undefined)
    renderNotifications()

    const forged = campaignUpdate({ id: 'c_forged', status: 'Concluído' }, null)
    emit(forged)
    await waitFor(() => expect(getById).toHaveBeenCalledTimes(1))
    for (let i = 0; i < 50; i++) {
      emit(forged)
      await new Promise((r) => setTimeout(r, 0))
    }
    await flush()

    expect(getById).toHaveBeenCalledTimes(1)
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('flood com ids aleatórios fica limitado ao orçamento de buscas por janela', async () => {
    getById.mockResolvedValue(undefined)
    renderNotifications()

    for (let i = 0; i < 100; i++) {
      emit(campaignUpdate({ id: `c_random_${i}`, status: i % 2 ? 'Concluído' : 'Falhou' }, null))
    }
    await flush()

    expect(getById).toHaveBeenCalledTimes(CAMPAIGN_CONFIRM_BUDGET)
  })

  it('cache envenenado: evento forjado de uma campanha real não suprime a conclusão de verdade 30s depois', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    getById.mockResolvedValue({ id: 'c1', name: 'Black Friday', status: 'Enviando' })
    renderNotifications()

    // atacante: "Concluído" forjado enquanto a campanha ainda envia
    emit(campaignUpdate({ id: 'c1', status: 'Concluído' }, { id: 'c1', status: 'Enviando' }))
    await waitFor(() => expect(getById).toHaveBeenCalledTimes(1))
    await flush()
    expect(toastMock.success).not.toHaveBeenCalled()

    // a campanha conclui de verdade 30s depois (antes do antigo TTL de 60s)
    now.mockReturnValue(1_030_000)
    getById.mockResolvedValue({ id: 'c1', name: 'Black Friday', status: 'Concluído' })
    emit(campaignUpdate({ id: 'c1', status: 'Concluído' }, { id: 'c1', status: 'Enviando' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1))
    expect(getById).toHaveBeenCalledTimes(2)
  })

  it('orçamento esgotado por ids aleatórios não suprime a conclusão de uma campanha conhecida', async () => {
    getById.mockImplementation(async (id: string) =>
      id === 'c_real' ? { id: 'c_real', name: 'Natal', status: 'Concluído' } : undefined
    )
    renderNotifications([{ id: 'c_real', status: 'Enviando' }])

    for (let i = 0; i < CAMPAIGN_CONFIRM_BUDGET; i++) {
      emit(campaignUpdate({ id: `fake_${i}`, status: 'Concluído' }, { id: `fake_${i}`, status: 'Enviando' }))
    }
    await waitFor(() => expect(getById).toHaveBeenCalledTimes(CAMPAIGN_CONFIRM_BUDGET))

    emit(campaignUpdate({ id: 'c_real', status: 'Concluído' }, { id: 'c_real', status: 'Enviando' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1))
    expect(toastMock.success).toHaveBeenCalledWith('Campanha "Natal" concluída!', { id: 'campaign:c_real:Concluído' })
  })

  it('sinal genérico do hub (excesso da janela) confere as campanhas em andamento do cache', async () => {
    getById.mockResolvedValue({ id: 'c_real', name: 'Natal', status: 'Falhou' })
    renderNotifications([
      { id: 'c_real', status: 'Enviando' },
      { id: 'c_old', status: 'Concluído' },
    ])

    // a transição virou { new: null, old: null } no hub (teto de linhas por janela)
    emit(campaignUpdate(null, null))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1))
    expect(toastMock.error).toHaveBeenCalledWith('Campanha "Natal" falhou', { id: 'campaign:c_real:Falhou' })
    // Só as em andamento: a concluída não é consultada
    expect(getById).toHaveBeenCalledTimes(1)
    expect(getById).toHaveBeenCalledWith('c_real')
  })

  it('sinal genérico sem campanha em andamento no cache não consulta a API', async () => {
    renderNotifications([{ id: 'c_old', status: 'Concluído' }])

    emit(campaignUpdate(null, null))
    await flush()
    expect(getById).not.toHaveBeenCalled()
  })
})

describe('confirmCampaignStatus', () => {
  it('evento que chega com uma busca em voo não usa a resposta velha: busca de novo após o intervalo', async () => {
    vi.useFakeTimers()
    let resolveFirst: (value: unknown) => void = () => {}
    getById.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))

    // forjado dispara a busca; a conclusão real acontece com ela em voo
    const forged = confirmCampaignStatus('c1', 'Concluído')
    const real = confirmCampaignStatus('c1', 'Concluído')
    expect(getById).toHaveBeenCalledTimes(1)

    resolveFirst({ id: 'c1', name: 'X', status: 'Enviando' })
    await expect(forged).resolves.toBeNull()

    getById.mockResolvedValue({ id: 'c1', name: 'X', status: 'Concluído' })
    await vi.advanceTimersByTimeAsync(CAMPAIGN_CONFIRM_RECHECK_MS)
    await expect(real).resolves.toMatchObject({ id: 'c1', status: 'Concluído' })
    expect(getById).toHaveBeenCalledTimes(2)
  })

  it('eventos dentro do intervalo mínimo viram UMA busca adiada por id (não N, nem descarte)', async () => {
    vi.useFakeTimers()
    getById.mockResolvedValue({ id: 'c1', name: 'X', status: 'Enviando' })
    await expect(confirmCampaignStatus('c1', 'Concluído')).resolves.toBeNull()

    getById.mockResolvedValue({ id: 'c1', name: 'X', status: 'Concluído' })
    const waiting = Array.from({ length: 10 }, () => confirmCampaignStatus('c1', ['Concluído', 'Falhou']))
    await vi.advanceTimersByTimeAsync(CAMPAIGN_CONFIRM_RECHECK_MS)

    const results = await Promise.all(waiting)
    expect(results.every((campaign) => campaign?.status === 'Concluído')).toBe(true)
    expect(getById).toHaveBeenCalledTimes(2)
  })

  it('cache negativo só para id desconhecido inexistente, e expira depois do TTL', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    getById.mockResolvedValue(undefined)

    await expect(confirmCampaignStatus('ghost', 'Concluído')).resolves.toBeNull()
    await expect(confirmCampaignStatus('ghost', 'Concluído')).resolves.toBeNull()
    expect(getById).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_000_000 + CAMPAIGN_CONFIRM_NOT_FOUND_TTL_MS + 1)
    getById.mockResolvedValue({ id: 'ghost', name: 'X', status: 'Concluído' })
    await expect(confirmCampaignStatus('ghost', 'Concluído')).resolves.toMatchObject({ status: 'Concluído' })
    expect(getById).toHaveBeenCalledTimes(2)
  })

  it('erro transitório da API (5xx/rede) não entra em cache negativo nem suprime o toast legítimo', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(3_000_000)
    getById.mockRejectedValue(new Error('503'))
    await expect(confirmCampaignStatus('real', 'Concluído')).resolves.toBeNull()

    // Passado só o intervalo mínimo entre buscas (bem antes do TTL do cache negativo)
    now.mockReturnValue(3_000_000 + CAMPAIGN_CONFIRM_RECHECK_MS + 1)
    expect(CAMPAIGN_CONFIRM_RECHECK_MS + 1).toBeLessThan(CAMPAIGN_CONFIRM_NOT_FOUND_TTL_MS)
    getById.mockResolvedValue({ id: 'real', name: 'X', status: 'Concluído' })
    await expect(confirmCampaignStatus('real', 'Concluído')).resolves.toMatchObject({ status: 'Concluído' })
    expect(getById).toHaveBeenCalledTimes(2)
  })

  it('campanha que existe com outro status não entra em cache negativo', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000)
    getById.mockResolvedValue({ id: 'c1', name: 'X', status: 'Enviando' })
    await expect(confirmCampaignStatus('c1', 'Concluído')).resolves.toBeNull()

    // 30s depois (passado o intervalo mínimo entre buscas do id)
    now.mockReturnValue(2_000_000 + 30_000)
    expect(30_000).toBeGreaterThanOrEqual(CAMPAIGN_CONFIRM_RECHECK_MS)
    getById.mockResolvedValue({ id: 'c1', name: 'X', status: 'Concluído' })
    await expect(confirmCampaignStatus('c1', 'Concluído')).resolves.toMatchObject({ status: 'Concluído' })
  })

  it('orçamento esgotado: id desconhecido espera na fila e é confirmado na janela seguinte', async () => {
    vi.useFakeTimers()
    getById.mockResolvedValue(undefined)
    for (let i = 0; i < CAMPAIGN_CONFIRM_BUDGET; i++) {
      await confirmCampaignStatus(`c_${i}`, 'Concluído')
    }
    expect(getById).toHaveBeenCalledTimes(CAMPAIGN_CONFIRM_BUDGET)

    getById.mockResolvedValue({ id: 'c_real', name: 'Real', status: 'Concluído' })
    const queued = confirmCampaignStatus('c_real', 'Concluído')
    await vi.advanceTimersByTimeAsync(0)
    expect(getById).toHaveBeenCalledTimes(CAMPAIGN_CONFIRM_BUDGET)

    await vi.advanceTimersByTimeAsync(CAMPAIGN_CONFIRM_BUDGET_WINDOW_MS)
    await expect(queued).resolves.toMatchObject({ name: 'Real' })
  })

  it('id conhecido (cache autenticado) não gasta nem espera orçamento', async () => {
    getById.mockResolvedValue(undefined)
    for (let i = 0; i < CAMPAIGN_CONFIRM_BUDGET; i++) {
      await confirmCampaignStatus(`c_${i}`, 'Concluído')
    }
    getById.mockResolvedValue({ id: 'c_known', name: 'K', status: 'Concluído' })
    await expect(confirmCampaignStatus('c_known', 'Concluído', { known: true })).resolves.toMatchObject({ name: 'K' })
  })

  it('fila limitada: flood de ids desconhecidos não cresce sem limite', async () => {
    vi.useFakeTimers()
    getById.mockResolvedValue(undefined)

    const results = Array.from({ length: 100 }, (_, i) => confirmCampaignStatus(`flood_${i}`, 'Concluído'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getById).toHaveBeenCalledTimes(CAMPAIGN_CONFIRM_BUDGET)

    // o que não coube no orçamento nem na fila é descartado na hora
    const settled = await Promise.race([
      Promise.all(results.slice(CAMPAIGN_CONFIRM_BUDGET + CAMPAIGN_CONFIRM_QUEUE_MAX)),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 1)),
    ])
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled).toEqual(Array(100 - CAMPAIGN_CONFIRM_BUDGET - CAMPAIGN_CONFIRM_QUEUE_MAX).fill(null))

    // a fila anda no ritmo do orçamento
    await vi.advanceTimersByTimeAsync(CAMPAIGN_CONFIRM_BUDGET_WINDOW_MS)
    expect(getById).toHaveBeenCalledTimes(CAMPAIGN_CONFIRM_BUDGET * 2)
  })
})

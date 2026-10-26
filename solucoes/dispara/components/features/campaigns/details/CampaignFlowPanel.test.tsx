import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DbChangeEvent } from '@/lib/realtime-db-change'
import type { Campaign } from '@/types'

type Listener = (event: DbChangeEvent) => void
const subscriptions: Array<{ listener: Listener; options: unknown }> = []
const statusCallbacks: Array<(status: string) => void> = []
const unsubscribe = vi.fn()

vi.mock('@/lib/supabase-realtime', () => ({
  subscribeToDbChanges: vi.fn((listener: Listener, options: unknown) => {
    subscriptions.push({ listener, options })
    return unsubscribe
  }),
  onDbChangesStatus: vi.fn((cb: (status: string) => void) => {
    statusCallbacks.push(cb)
    return vi.fn()
  }),
}))

vi.mock('@/components/ui/PrefetchLink', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

import { CampaignFlowPanel } from '@/components/features/campaigns/details/CampaignFlowPanel'

function makeCampaign(overrides: Partial<Campaign>): Campaign {
  return {
    id: 'c_1',
    name: 'Campanha',
    recipients: 10,
    submissionsCount: 2,
    flowId: 'fl_1',
    flowName: 'Cadastro',
    ...overrides,
  } as Campaign
}

function renderPanel(campaign: Campaign) {
  const queryClient = new QueryClient()
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  const wrap = (c: Campaign) => (
    <QueryClientProvider client={queryClient}>
      <CampaignFlowPanel campaign={c} />
    </QueryClientProvider>
  )
  const utils = render(wrap(campaign))
  return { ...utils, invalidateSpy, rerenderWith: (c: Campaign) => utils.rerender(wrap(c)) }
}

function submissionEvent(id: string): DbChangeEvent {
  return {
    table: 'flow_submissions',
    eventType: 'INSERT',
    new: { id, campaign_id: 'c_1' },
    old: null,
    commit_timestamp: null,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  subscriptions.length = 0
  statusCallbacks.length = 0
  unsubscribe.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CampaignFlowPanel realtime', () => {
  it('assina INSERT de flow_submissions da campanha via broadcast', () => {
    renderPanel(makeCampaign({}))

    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0].options).toEqual({
      table: 'flow_submissions',
      event: 'INSERT',
      filter: 'campaign_id=eq.c_1',
    })
    expect(screen.getByText('2')).toBeTruthy()

    act(() => statusCallbacks[0]('SUBSCRIBED'))
    expect(screen.getByText('Ao vivo')).toBeTruthy()
  })

  it('evento (forjável no canal público) NÃO soma no contador: só invalida a campanha', () => {
    const { invalidateSpy } = renderPanel(makeCampaign({}))

    act(() => {
      subscriptions[0].listener(submissionEvent('fs_forged'))
    })
    // contador e taxa continuam os da API
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.queryByText('3')).toBeNull()
    expect(screen.getByText('20.0%')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['campaign', 'c_1'] })
  })

  it('rajada de eventos vira um único refetch da campanha', () => {
    const { invalidateSpy } = renderPanel(makeCampaign({}))

    act(() => {
      for (let i = 0; i < 200; i++) subscriptions[0].listener(submissionEvent(`fs_${i}`))
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(screen.getByText('2')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it('o contador acompanha o valor vindo da API (prop) depois do refetch', () => {
    const { rerenderWith } = renderPanel(makeCampaign({}))
    rerenderWith(makeCampaign({ submissionsCount: 3 }))
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('30.0%')).toBeTruthy()
  })

  it('campanha sem Flow não renderiza nem assina (hooks antes do return)', () => {
    const { container } = renderPanel(makeCampaign({ flowId: undefined }))
    expect(container.innerHTML).toBe('')
    expect(subscriptions).toHaveLength(0)
  })

  it('cancela a assinatura ao desmontar', () => {
    const { unmount } = renderPanel(makeCampaign({}))
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

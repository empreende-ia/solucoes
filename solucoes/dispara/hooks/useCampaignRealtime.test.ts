import { beforeEach, describe, expect, it, vi } from 'vitest'

const subscribeToTable = vi.hoisted(() => vi.fn())
const subscribeToBroadcast = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn((name: string) => ({ name })),
  subscribeToTable,
  subscribeToBroadcast,
  activateChannel: vi.fn(() => Promise.resolve()),
  removeChannel: vi.fn(),
}))

import { renderHookWithProviders, waitFor } from '@/tests/helpers/hook-test-utils'
import { useCampaignRealtime } from '@/hooks/useCampaignRealtime'
import { CampaignStatus } from '@/types'

beforeEach(() => {
  subscribeToTable.mockClear()
  subscribeToBroadcast.mockClear()
})

describe('useCampaignRealtime', () => {
  it('escuta só campaigns (filtrado pelo id) + broadcast de progresso; nada de campaign_contacts', async () => {
    const { result } = renderHookWithProviders(() =>
      useCampaignRealtime({ campaignId: 'c_1', status: CampaignStatus.SENDING, recipients: 50 })
    )

    const tables = subscribeToTable.mock.calls.map((call) => call[1])
    expect(tables).toEqual(['campaigns'])
    expect(subscribeToTable.mock.calls[0][2]).toBe('UPDATE')
    expect(subscribeToTable.mock.calls[0][4]).toBe('id=eq.c_1')

    const broadcastEvents = subscribeToBroadcast.mock.calls.map((call) => call[1])
    expect(broadcastEvents).toEqual(['campaign_progress', 'campaign_phase'])

    await waitFor(() => expect(result.current.isConnected).toBe(true))
  })
})

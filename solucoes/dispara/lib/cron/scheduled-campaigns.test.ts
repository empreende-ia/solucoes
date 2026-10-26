// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

const db = vi.hoisted(() => ({
  due: [] as Array<{ id: string; template_name: string }>,
}))

vi.mock('@/lib/supabase', () => {
  const selectChain = {
    eq: () => selectChain,
    lte: () => selectChain,
    order: () => selectChain,
    limit: async () => ({ data: db.due, error: null }),
  }
  const updateChain = (id: { value?: string } = {}) => {
    const chain = {
      eq: (col: string, value: string) => {
        if (col === 'id') id.value = value
        return chain
      },
      select: () => chain,
      maybeSingle: async () => ({ data: { id: id.value }, error: null }),
    }
    return chain
  }
  return {
    supabase: {
      from: () => ({
        select: () => selectChain,
        update: () => updateChain(),
      }),
    },
  }
})

import { drainScheduledCampaigns } from './scheduled-campaigns'

describe('drainScheduledCampaigns', () => {
  const saved = {
    cron: process.env.CRON_SECRET,
    admin: process.env.DISPARA_ADMIN_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  }
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret-123'
    process.env.DISPARA_ADMIN_KEY = 'admin-key-456'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
    db.due = [{ id: 'camp-1', template_name: 'promo' }]
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{}', { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const [key, env] of [
      ['CRON_SECRET', saved.cron],
      ['DISPARA_ADMIN_KEY', saved.admin],
      ['NEXT_PUBLIC_APP_URL', saved.appUrl],
    ] as const) {
      if (env === undefined) delete process.env[key]
      else process.env[key] = env
    }
  })

  it('chama /api/campaign/dispatch COM Authorization Bearer CRON_SECRET', async () => {
    const result = await drainScheduledCampaigns()

    expect(result).toEqual({ due: 1, dispatched: 1, errors: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://app.example.com/api/campaign/dispatch')
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer cron-secret-123',
    })
    expect(JSON.parse(init.body)).toMatchObject({ campaignId: 'camp-1', templateName: 'promo', trigger: 'manual' })
  })

  it('sem CRON_SECRET usa DISPARA_ADMIN_KEY (mesmo fallback do reinvokeSelf)', async () => {
    delete process.env.CRON_SECRET
    await drainScheduledCampaigns()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-key-456')
  })

  it('conta erro quando o dispatch não responde ok', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    const result = await drainScheduledCampaigns()
    expect(result).toEqual({ due: 1, dispatched: 0, errors: 1 })
  })
})

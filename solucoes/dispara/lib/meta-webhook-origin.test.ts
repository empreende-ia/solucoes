// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/whatsapp-credentials', () => ({
  getWhatsAppCredentials: vi.fn(),
}))

import {
  findWebhookOriginMismatches,
  logWebhookOriginMismatches,
  resetWebhookOriginState,
} from '@/lib/meta-webhook-origin'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

const EXPECTED = { businessAccountId: '1111111', phoneNumberId: '2222222' }

function payload(entryId: unknown, phoneIds: unknown[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: entryId,
        changes: phoneIds.map((id) => ({ field: 'messages', value: { metadata: { phone_number_id: id } } })),
      },
    ],
  }
}

beforeEach(() => {
  resetWebhookOriginState()
  vi.mocked(getWhatsAppCredentials).mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('findWebhookOriginMismatches', () => {
  it('payload do WABA/número configurado não diverge', () => {
    expect(findWebhookOriginMismatches(payload('1111111', ['2222222']), EXPECTED)).toEqual([])
  })

  it('aponta WABA e phone_number_id diferentes (sem repetir)', () => {
    expect(findWebhookOriginMismatches(payload('9999999', ['8888888', '8888888', '2222222']), EXPECTED)).toEqual([
      { field: 'entry.id', received: '9999999', expected: '1111111' },
      { field: 'metadata.phone_number_id', received: '8888888', expected: '2222222' },
    ])
  })

  it('IDs numéricos são comparados como texto; ausentes não contam como divergência', () => {
    expect(findWebhookOriginMismatches(payload(1111111, [2222222]), EXPECTED)).toEqual([])
    expect(findWebhookOriginMismatches(payload(undefined, [undefined]), EXPECTED)).toEqual([])
  })

  it('sem credenciais configuradas ou payload estranho: nada a comparar', () => {
    expect(findWebhookOriginMismatches(payload('x', ['y']), {})).toEqual([])
    expect(findWebhookOriginMismatches(null, EXPECTED)).toEqual([])
    expect(findWebhookOriginMismatches({ entry: 'x' }, EXPECTED)).toEqual([])
  })
})

describe('logWebhookOriginMismatches', () => {
  it('loga com rate limit por ID e cacheia as credenciais', async () => {
    vi.mocked(getWhatsAppCredentials).mockResolvedValue({ ...EXPECTED, accessToken: 't' })
    const body = payload('9999999', ['2222222'])

    await expect(logWebhookOriginMismatches(body, { verified: false, mode: 'unsigned_allowed' })).resolves.toHaveLength(1)
    await logWebhookOriginMismatches(body, { verified: false, mode: 'unsigned_allowed' })
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(getWhatsAppCredentials).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toMatch(/configure o App Secret/)
  })

  it('nunca lança (falha ao ler credenciais)', async () => {
    vi.mocked(getWhatsAppCredentials).mockRejectedValue(new Error('db down'))
    await expect(logWebhookOriginMismatches(payload('9', ['8']), { verified: true, mode: 'enforced' })).resolves.toEqual([])
  })
})

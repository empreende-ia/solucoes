import { describe, expect, it } from 'vitest'
import { isMessagesSubscribed, normalizeSubscribedFields } from '@/lib/meta-webhook-subscription'

describe('meta-webhook-subscription helpers', () => {
  it('normalizeSubscribedFields deve deduplicar e juntar campos de múltiplos apps', () => {
    const fields = normalizeSubscribedFields([
      { id: '1', subscribed_fields: ['messages', 'message_template_status_update'] },
      { id: '2', subscribed_fields: ['messages'] },
      { id: '3', subscribed_fields: [] },
    ])

    expect(fields).toContain('messages')
    expect(fields).toContain('message_template_status_update')
    // dedupe
    expect(fields.filter((f) => f === 'messages').length).toBe(1)
  })

  it('isMessagesSubscribed deve retornar true quando houver messages em qualquer app', () => {
    expect(isMessagesSubscribed([{ subscribed_fields: ['messages'] }])).toBe(true)
    expect(isMessagesSubscribed([{ subscribed_fields: ['foo'] }])).toBe(false)
    expect(isMessagesSubscribed([])).toBe(false)
  })
})

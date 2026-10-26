import { describe, expect, it } from 'vitest'
import { computeCampaignUiCounters } from './campaign-ui-counters'

describe('computeCampaignUiCounters', () => {
  it('prefere o maior valor entre campaign e live (não regredir)', () => {
    const counters = computeCampaignUiCounters({
      campaign: { sent: 173, delivered: 165, read: 13, failed: 0 },
      live: { sent: 173, delivered: 50, read: 36, failed: 0 },
    })

    expect(counters.sent).toBe(173)
    // read deve refletir o maior observado
    expect(counters.read).toBe(36)
    // deliveredTotal não pode cair para 50 (e deve ser >= read)
    expect(counters.deliveredTotal).toBe(165)
    expect(counters.deliveredTotal).toBeGreaterThanOrEqual(counters.read)
    // delivered (não lidas) = deliveredTotal - read
    expect(counters.delivered).toBe(165 - 36)
  })

  it('garante progressão no total: deliveredTotal >= read', () => {
    const counters = computeCampaignUiCounters({
      campaign: { delivered: 10, read: 12 },
      live: null,
    })

    expect(counters.read).toBe(12)
    expect(counters.deliveredTotal).toBeGreaterThanOrEqual(counters.read)
    expect(counters.deliveredTotal).toBe(12)
    expect(counters.delivered).toBe(0)
  })

  it('usa live quando live é maior que campaign', () => {
    const counters = computeCampaignUiCounters({
      campaign: { sent: 10, delivered: 5, read: 1, failed: 0 },
      live: { sent: 12, delivered: 6, read: 2, failed: 1 },
    })

    expect(counters.sent).toBe(12)
    expect(counters.deliveredTotal).toBe(6)
    expect(counters.delivered).toBe(6 - 2)
    expect(counters.read).toBe(2)
    expect(counters.failed).toBe(1)
  })
})

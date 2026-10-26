/**
 * Campaign Merging Logic
 *
 * Pure functions for monotonic merging of campaign and message data.
 * Ensures counters never decrease due to out-of-order updates from
 * broadcast events arriving before database sync.
 *
 * @module lib/business/campaign/merging
 */

import type { Campaign, CampaignStats } from '@/types/campaign.types'
import { CampaignStatus } from '@/types/campaign.types'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Response structure from campaign messages endpoint.
 * Contains messages array and stats.
 */
export interface CampaignMessagesResponse {
  messages: unknown[]
  stats?: CampaignStats
  pagination?: {
    total: number
    limit: number
    offset: number
  }
}

// =============================================================================
// CAMPAIGN COUNTER MERGING
// =============================================================================

/**
 * Detects if a campaign was reset (e.g., returned to draft status).
 * A reset campaign has draft status with no start timestamp and all counters at zero.
 *
 * @param campaign - The campaign to check
 * @returns True if the campaign appears to have been reset
 *
 * @example
 * ```ts
 * const campaign = { status: CampaignStatus.DRAFT, sent: 0, failed: 0, skipped: 0 }
 * isCampaignReset(campaign) // true
 * ```
 */
export function isCampaignReset(campaign: Campaign): boolean {
  return (
    campaign.status === CampaignStatus.DRAFT &&
    !campaign.startedAt &&
    Number(campaign.sent || 0) === 0 &&
    Number(campaign.failed || 0) === 0 &&
    Number(campaign.skipped || 0) === 0
  )
}

/**
 * Merge campaign counters keeping values monotonically increasing.
 * Prevents partial server updates from decreasing counters due to
 * out-of-order broadcast/database updates.
 *
 * When a campaign is reset (back to draft), accepts the fresh values
 * to avoid keeping stale counter values.
 *
 * @param oldCampaign - Previous campaign state (may be undefined)
 * @param freshCampaign - New campaign data from server (may be undefined)
 * @returns Merged campaign with monotonically increasing counters, or undefined
 *
 * @example
 * ```ts
 * const old = { sent: 10, failed: 2, ... }
 * const fresh = { sent: 8, failed: 3, ... } // sent decreased due to race
 * const merged = mergeCampaignCountersMonotonic(old, fresh)
 * // merged.sent === 10, merged.failed === 3
 * ```
 */
export function mergeCampaignCountersMonotonic(
  oldCampaign: Campaign | undefined,
  freshCampaign: Campaign | undefined
): Campaign | undefined {
  if (!freshCampaign) return oldCampaign
  if (!oldCampaign) return freshCampaign

  // Accept explicit reset (e.g., campaign returned to DRAFT)
  // to avoid keeping stale counter values
  if (isCampaignReset(freshCampaign)) {
    return freshCampaign
  }

  const merged: Campaign = { ...freshCampaign }
  merged.sent = Math.max(Number(oldCampaign.sent || 0), Number(freshCampaign.sent || 0))
  merged.failed = Math.max(Number(oldCampaign.failed || 0), Number(freshCampaign.failed || 0))
  merged.skipped = Math.max(Number(oldCampaign.skipped || 0), Number(freshCampaign.skipped || 0))
  merged.delivered = Math.max(Number(oldCampaign.delivered || 0), Number(freshCampaign.delivered || 0))
  merged.read = Math.max(Number(oldCampaign.read || 0), Number(freshCampaign.read || 0))
  merged.recipients = Math.max(Number(oldCampaign.recipients || 0), Number(freshCampaign.recipients || 0))

  return merged
}

// =============================================================================
// MESSAGE STATS MERGING
// =============================================================================

/**
 * Merge message stats keeping counts monotonically increasing.
 * Used for campaign messages response that includes stats object.
 *
 * Pending count is recalculated as: total - (sent + failed + skipped)
 * to maintain consistency.
 *
 * @param oldData - Previous messages response (may be undefined)
 * @param freshData - New messages response from server (may be undefined)
 * @returns Merged response with monotonically increasing stats
 *
 * @example
 * ```ts
 * const old = { stats: { sent: 100, failed: 5, total: 200 }, messages: [...] }
 * const fresh = { stats: { sent: 95, failed: 6, total: 200 }, messages: [...] }
 * const merged = mergeMessageStatsMonotonic(old, fresh)
 * // merged.stats.sent === 100, merged.stats.failed === 6
 * ```
 */
export function mergeMessageStatsMonotonic<T extends CampaignMessagesResponse>(
  oldData: T | undefined,
  freshData: T | undefined
): T | undefined {
  if (!freshData || typeof freshData !== 'object') return oldData
  if (!oldData || typeof oldData !== 'object') return freshData
  if (!freshData.stats || !oldData.stats) return freshData

  const oldStats = oldData.stats
  const freshStats = freshData.stats

  const sent = Math.max(Number(oldStats.sent || 0), Number(freshStats.sent || 0))
  const failed = Math.max(Number(oldStats.failed || 0), Number(freshStats.failed || 0))
  const skipped = Math.max(Number(oldStats.skipped || 0), Number(freshStats.skipped || 0))
  const delivered = Math.max(Number(oldStats.delivered || 0), Number(freshStats.delivered || 0))
  const read = Math.max(Number(oldStats.read || 0), Number(freshStats.read || 0))
  const total = Math.max(Number(oldStats.total || 0), Number(freshStats.total || 0))

  // Recalculate pending to maintain consistency
  const pending = Math.max(0, total - (sent + failed + skipped))

  return {
    ...freshData,
    stats: {
      ...freshStats,
      total,
      pending,
      sent,
      delivered,
      read,
      skipped,
      failed,
    },
  }
}

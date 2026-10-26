/**
 * Event Sourcing for Campaign Statistics
 *
 * Tracks campaign events (sent, delivered, read, failed) for accurate stats
 * Ported from NossoFlow with improvements
 */

import { logger } from './logger';
import { CampaignStatus, MessageStatus } from '../types';

// ============================================================================
// Types
// ============================================================================

export type EventType =
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'campaign.created'
  | 'campaign.started'
  | 'campaign.paused'
  | 'campaign.resumed'
  | 'campaign.completed'
  | 'campaign.failed';

export interface CampaignEvent {
  id: string;
  timestamp: number;
  campaignId: string;
  type: EventType;
  data?: Record<string, unknown>;
}

export interface CampaignStats {
  campaignId: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  lastUpdated: number;
}

export interface FunnelStage {
  name: string;
  count: number;
  percentage: number;
}

// ============================================================================
// Event Store
// ============================================================================

const STORAGE_KEY = 'dispara_campaign_events';
const MAX_EVENTS = 10000; // Keep last 10k events

/**
 * Get all events from storage
 */
function getEvents(): CampaignEvent[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save events to storage
 */
function saveEvents(events: CampaignEvent[]): void {
  if (typeof window === 'undefined') return;
  
  // Keep only last MAX_EVENTS
  const trimmed = events.slice(-MAX_EVENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Event Recording
// ============================================================================

/**
 * Record a new event
 */
export function recordEvent(
  campaignId: string,
  type: EventType,
  data?: Record<string, unknown>
): CampaignEvent {
  const event: CampaignEvent = {
    id: generateEventId(),
    timestamp: Date.now(),
    campaignId,
    type,
    data,
  };

  const events = getEvents();
  events.push(event);
  saveEvents(events);

  logger.debug('Event recorded', {
    eventId: event.id,
    campaignId,
    type,
  });

  return event;
}

/**
 * Record message sent event
 */
export function recordMessageSent(
  campaignId: string,
  messageId: string,
  phone: string
): void {
  recordEvent(campaignId, 'message.sent', { messageId, phone });
}

/**
 * Record message delivered event
 */
export function recordMessageDelivered(
  campaignId: string,
  messageId: string,
  phone: string
): void {
  recordEvent(campaignId, 'message.delivered', { messageId, phone });
}

/**
 * Record message read event
 */
export function recordMessageRead(
  campaignId: string,
  messageId: string,
  phone: string
): void {
  recordEvent(campaignId, 'message.read', { messageId, phone });
}

/**
 * Record message failed event
 */
export function recordMessageFailed(
  campaignId: string,
  messageId: string,
  phone: string,
  error: string
): void {
  recordEvent(campaignId, 'message.failed', { messageId, phone, error });
}

/**
 * Record campaign lifecycle event
 */
export function recordCampaignEvent(
  campaignId: string,
  type: 'created' | 'started' | 'paused' | 'resumed' | 'completed' | 'failed'
): void {
  recordEvent(campaignId, `campaign.${type}` as EventType);
}

// ============================================================================
// Stats Computation (Current State from Events)
// ============================================================================

/**
 * Compute current stats for a campaign from events
 */
export function computeCampaignStats(campaignId: string): CampaignStats {
  const events = getEvents().filter(e => e.campaignId === campaignId);

  // Count unique phones per status (last status wins)
  const phoneStatus = new Map<string, 'sent' | 'delivered' | 'read' | 'failed'>();

  events.forEach(event => {
    const phone = event.data?.phone as string | undefined;
    if (!phone) return;

    switch (event.type) {
      case 'message.sent':
        phoneStatus.set(phone, 'sent');
        break;
      case 'message.delivered':
        // Only upgrade from sent
        if (phoneStatus.get(phone) === 'sent') {
          phoneStatus.set(phone, 'delivered');
        }
        break;
      case 'message.read':
        // Upgrade from sent or delivered
        const current = phoneStatus.get(phone);
        if (current === 'sent' || current === 'delivered') {
          phoneStatus.set(phone, 'read');
        }
        break;
      case 'message.failed':
        // Failed overwrites everything (message couldn't be sent)
        phoneStatus.set(phone, 'failed');
        break;
    }
  });

  // Count by status
  let sent = 0;
  let delivered = 0;
  let read = 0;
  let failed = 0;

  phoneStatus.forEach(status => {
    switch (status) {
      case 'sent':
        sent++;
        break;
      case 'delivered':
        delivered++;
        break;
      case 'read':
        read++;
        break;
      case 'failed':
        failed++;
        break;
    }
  });

  return {
    campaignId,
    sent,
    delivered,
    read,
    failed,
    pending: 0, // Would come from campaign recipients - processed
    lastUpdated: events.length > 0 ? events[events.length - 1].timestamp : Date.now(),
  };
}

/**
 * Compute funnel for a campaign
 */
export function computeCampaignFunnel(campaignId: string, totalRecipients: number): FunnelStage[] {
  const stats = computeCampaignStats(campaignId);

  // Calculate totals for funnel
  const processed = stats.sent + stats.delivered + stats.read + stats.failed;
  const pending = Math.max(0, totalRecipients - processed);

  // Funnel stages
  // Note: delivered and read are subsets of sent (cumulative)
  const totalSent = stats.sent + stats.delivered + stats.read;
  const totalDelivered = stats.delivered + stats.read;
  const totalRead = stats.read;

  const funnel: FunnelStage[] = [
    {
      name: 'Total',
      count: totalRecipients,
      percentage: 100,
    },
    {
      name: 'Enviados',
      count: totalSent,
      percentage: totalRecipients > 0 ? (totalSent / totalRecipients) * 100 : 0,
    },
    {
      name: 'Entregues',
      count: totalDelivered,
      percentage: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
    },
    {
      name: 'Lidos',
      count: totalRead,
      percentage: totalDelivered > 0 ? (totalRead / totalDelivered) * 100 : 0,
    },
  ];

  if (stats.failed > 0) {
    funnel.push({
      name: 'Falhas',
      count: stats.failed,
      percentage: (stats.failed / totalRecipients) * 100,
    });
  }

  if (pending > 0) {
    funnel.push({
      name: 'Pendentes',
      count: pending,
      percentage: (pending / totalRecipients) * 100,
    });
  }

  return funnel;
}

// ============================================================================
// Aggregated Stats
// ============================================================================

/**
 * Get stats for all campaigns
 */
export function getAllCampaignStats(): Map<string, CampaignStats> {
  const events = getEvents();
  const campaignIds = new Set(events.map(e => e.campaignId));
  const statsMap = new Map<string, CampaignStats>();

  campaignIds.forEach(id => {
    statsMap.set(id, computeCampaignStats(id));
  });

  return statsMap;
}

/**
 * Get dashboard-level stats
 */
export function getDashboardStats(): {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  deliveryRate: number;
  readRate: number;
} {
  const allStats = getAllCampaignStats();

  let totalSent = 0;
  let totalDelivered = 0;
  let totalRead = 0;
  let totalFailed = 0;

  allStats.forEach(stats => {
    totalSent += stats.sent + stats.delivered + stats.read;
    totalDelivered += stats.delivered + stats.read;
    totalRead += stats.read;
    totalFailed += stats.failed;
  });

  return {
    totalSent,
    totalDelivered,
    totalRead,
    totalFailed,
    deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
    readRate: totalDelivered > 0 ? (totalRead / totalDelivered) * 100 : 0,
  };
}

/**
 * Get events for a specific time range
 */
export function getEventsInRange(
  startTime: number,
  endTime: number,
  campaignId?: string
): CampaignEvent[] {
  let events = getEvents();

  if (campaignId) {
    events = events.filter(e => e.campaignId === campaignId);
  }

  return events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
}

/**
 * Get hourly breakdown for last 24 hours
 */
export function getHourlyBreakdown(campaignId?: string): {
  hour: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}[] {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const events = getEventsInRange(oneDayAgo, now, campaignId);

  // Initialize hourly buckets
  const hourly: Map<number, { sent: number; delivered: number; read: number; failed: number }> = new Map();
  for (let i = 0; i < 24; i++) {
    hourly.set(i, { sent: 0, delivered: 0, read: 0, failed: 0 });
  }

  // Count events per hour
  events.forEach(event => {
    const hour = new Date(event.timestamp).getHours();
    const bucket = hourly.get(hour)!;

    switch (event.type) {
      case 'message.sent':
        bucket.sent++;
        break;
      case 'message.delivered':
        bucket.delivered++;
        break;
      case 'message.read':
        bucket.read++;
        break;
      case 'message.failed':
        bucket.failed++;
        break;
    }
  });

  // Convert to array
  return Array.from(hourly.entries())
    .map(([hour, counts]) => ({ hour, ...counts }))
    .sort((a, b) => a.hour - b.hour);
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Clear all events for a campaign
 */
export function clearCampaignEvents(campaignId: string): void {
  const events = getEvents().filter(e => e.campaignId !== campaignId);
  saveEvents(events);
  
  logger.info('Cleared campaign events', { campaignId });
}

/**
 * Clear old events (older than days)
 */
export function pruneOldEvents(daysToKeep: number = 30): number {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  const events = getEvents();
  const filtered = events.filter(e => e.timestamp >= cutoff);
  const removed = events.length - filtered.length;
  
  saveEvents(filtered);
  
  if (removed > 0) {
    logger.info('Pruned old events', { removed, daysToKeep });
  }
  
  return removed;
}

/**
 * Clear all events
 */
export function clearAllEvents(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  logger.info('Cleared all events');
}

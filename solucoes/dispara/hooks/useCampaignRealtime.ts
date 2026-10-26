'use client'

/**
 * useCampaignRealtime Hook
 * 
 * Smart Realtime strategy for campaign updates:
 * 
 * 1. DEBOUNCE based on campaign size:
 *    - < 1,000 recipients → 2s debounce
 *    - 1,000-10,000 → 5s debounce
 *    - > 10,000 → 10s debounce
 * 
 * 2. TIMEOUT: 5 minutes after COMPLETED, then disconnect
 * 
 * 3. POLLING: 60s backup while connected (in useCampaignDetails)
 * 
 * 4. After disconnect: Show "Atualizar" button
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CampaignStatus } from '@/types'
import { createRealtimeChannel, subscribeToTable, subscribeToBroadcast, activateChannel, removeChannel } from '@/lib/supabase-realtime'
import { REALTIME_FILTERS } from '@/lib/realtime-db-change'
import type { RealtimePayload } from '@/types'
import type { CampaignProgressBroadcastPayload } from '@/types'
import type { RealtimeLatencyTelemetry } from '@/types'

// Constants
const POST_COMPLETION_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const isDev = process.env.NODE_ENV === 'development'

interface UseCampaignRealtimeOptions {
  campaignId: string | undefined
  status: CampaignStatus | undefined
  recipients?: number
  completedAt?: string
}

// Calculate debounce time based on campaign size
function getDebounceTime(recipients: number): number {
  // Objetivo: sensação de tempo real.
  // O debounce anterior (2s/5s/10s) deixava a UI “parada”, especialmente sob cache/latência de rede.
  if (recipients < 1000) return 250     // 250ms for small campaigns
  if (recipients <= 10000) return 500   // 500ms for medium campaigns
  return 1000                            // 1s for large campaigns
}

export function useCampaignRealtime({
  campaignId,
  status,
  recipients = 0,
  completedAt,
}: UseCampaignRealtimeOptions) {
  const queryClient = useQueryClient()
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null)
  const mountedRef = useRef(true)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingRefetchRef = useRef(false)

  const telemetryEnabled = process.env.NEXT_PUBLIC_REALTIME_TELEMETRY === '1'
  const [telemetry, setTelemetry] = useState<RealtimeLatencyTelemetry | null>(null)

  const pendingBroadcastTelemetryRef = useRef<{
    traceId: string
    seq: number
    serverTs: number
    receivedAt: number
  } | null>(null)

  const pendingDbTelemetryRef = useRef<{
    table: string
    eventType: string
    commitTimestamp: string
    commitTs: number
    receivedAt: number
  } | null>(null)

  const telemetryTickRef = useRef(0)
  const [telemetryTick, setTelemetryTick] = useState(0)

  // Broadcast ordering guards (best-effort)
  const lastBroadcastSeqRef = useRef(0)
  const lastBroadcastTraceIdRef = useRef<string | null>(null)

  const [isActuallyConnected, setIsActuallyConnected] = useState(false)
  const [hasTimedOut, setHasTimedOut] = useState(false)

  // Debounce time based on campaign size
  const debounceTime = useMemo(() => getDebounceTime(recipients), [recipients])

  // Check if within post-completion window (5 minutes)
  const isWithinPostCompletionWindow = useMemo(() => {
    if (!completedAt) return true // No completion time = still active
    const completedTime = new Date(completedAt).getTime()
    const elapsed = Date.now() - completedTime
    return elapsed < POST_COMPLETION_TIMEOUT_MS
  }, [completedAt])

  // Large campaigns (>= 10k) use polling only (saves Supabase Realtime events)
  const isLargeCampaign = recipients >= 10000

  // Should we connect to Realtime?
  const shouldConnect = useMemo(() => {
    if (!campaignId) return false
    if (hasTimedOut) return false // User-initiated or auto timeout

    // LARGE CAMPAIGNS: No Realtime socket (uses polling only)
    // This saves Supabase Free tier events (2M/month limit)
    if (isLargeCampaign) {
      return false
    }

    // Connect during loading (small campaigns only)
    if (!status) return true

    // Active statuses - connect for small/medium campaigns
    if ([CampaignStatus.SENDING, CampaignStatus.SCHEDULED].includes(status)) {
      return true
    }

    // Completed - connect only within 5 min window
    if (status === CampaignStatus.COMPLETED) {
      return isWithinPostCompletionWindow
    }

    // Other statuses (DRAFT, FAILED, PAUSED) - don't connect
    return false
  }, [campaignId, status, hasTimedOut, isWithinPostCompletionWindow, isLargeCampaign])

  // Debounced refetch function
  const debouncedRefetch = useCallback(() => {
    // Mark that we have a pending refetch
    pendingRefetchRef.current = true

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || !pendingRefetchRef.current) return

      const startedAt = Date.now()
      if (telemetryEnabled) {
        setTelemetry((prev) => ({
          ...(prev || {}),
          refetch: { startedAt, reason: 'debounced_refetch' },
        }))
      }

      Promise.allSettled([
        queryClient.refetchQueries({ queryKey: ['campaign', campaignId] }),
        queryClient.refetchQueries({ queryKey: ['campaignMessages', campaignId] }),
        queryClient.refetchQueries({ queryKey: ['campaignMetrics', campaignId] }),
      ]).then(() => {
        if (!telemetryEnabled) return
        const finishedAt = Date.now()
        setTelemetry((prev) => ({
          ...(prev || {}),
          refetch: {
            startedAt,
            finishedAt,
            durationMs: Math.max(0, finishedAt - startedAt),
            reason: 'debounced_refetch',
          },
        }))
      })

      pendingRefetchRef.current = false
    }, debounceTime)
  }, [queryClient, campaignId, debounceTime, telemetryEnabled])

  // Handle campaign updates
  const handleCampaignUpdate = useCallback((payload: RealtimePayload) => {
    if (!mountedRef.current) return

    if (telemetryEnabled) {
      const receivedAt = Date.now()
      const commitTimestamp = String(payload?.commit_timestamp || '')
      const commitTs = Date.parse(commitTimestamp)
      if (Number.isFinite(commitTs)) {
        pendingDbTelemetryRef.current = {
          table: 'campaigns',
          eventType: String(payload?.eventType || 'UPDATE'),
          commitTimestamp,
          commitTs,
          receivedAt,
        }
        telemetryTickRef.current += 1
        setTelemetryTick(telemetryTickRef.current)
      }
    }

    debouncedRefetch()
  }, [debouncedRefetch, telemetryEnabled])

  // Computa "até paint" (useEffect roda após render/paint)
  useEffect(() => {
    if (!telemetryEnabled) return
    if (!mountedRef.current) return

    const now = Date.now()

    const pb = pendingBroadcastTelemetryRef.current
    if (pb) {
      pendingBroadcastTelemetryRef.current = null
      const serverToClientMs = Math.max(0, pb.receivedAt - pb.serverTs)
      const handlerToPaintMs = Math.max(0, now - pb.receivedAt)
      const serverToPaintMs = Math.max(0, now - pb.serverTs)
      setTelemetry((prev) => ({
        ...(prev || {}),
        broadcast: {
          traceId: pb.traceId,
          seq: pb.seq,
          serverTs: pb.serverTs,
          receivedAt: pb.receivedAt,
          paintedAt: now,
          serverToClientMs,
          handlerToPaintMs,
          serverToPaintMs,
        },
      }))
    }

    const db = pendingDbTelemetryRef.current
    if (db) {
      pendingDbTelemetryRef.current = null
      const commitToClientMs = Math.max(0, db.receivedAt - db.commitTs)
      const handlerToPaintMs = Math.max(0, now - db.receivedAt)
      const commitToPaintMs = Math.max(0, now - db.commitTs)
      setTelemetry((prev) => ({
        ...(prev || {}),
        dbChange: {
          table: db.table,
          eventType: db.eventType,
          commitTimestamp: db.commitTimestamp,
          commitTs: db.commitTs,
          receivedAt: db.receivedAt,
          paintedAt: now,
          commitToClientMs,
          handlerToPaintMs,
          commitToPaintMs,
        },
      }))
    }
  }, [telemetryTick, telemetryEnabled])

  // Set up timeout for post-completion window
  useEffect(() => {
    if (status !== CampaignStatus.COMPLETED || !completedAt || hasTimedOut) {
      return
    }

    const completedTime = new Date(completedAt).getTime()
    const elapsed = Date.now() - completedTime
    const remaining = POST_COMPLETION_TIMEOUT_MS - elapsed

    if (remaining <= 0) {
      // Already past the window
      setHasTimedOut(true)
      return
    }

    const timer = setTimeout(() => {
      setHasTimedOut(true)
    }, remaining)

    return () => clearTimeout(timer)
  }, [status, completedAt, hasTimedOut])

  // Connect/disconnect Realtime
  useEffect(() => {
    // Disconnect if shouldn't connect (shouldConnect já é false sem campaignId; o !campaignId estreita o tipo)
    if (!shouldConnect || !campaignId) {
      if (channelRef.current) {
        removeChannel(channelRef.current)
        channelRef.current = null
        setIsActuallyConnected(false)
      }
      return
    }

    mountedRef.current = true

    // Precisa ser determinístico para receber Broadcast emitido pelo server.
    // Vários clientes podem ouvir o mesmo canal simultaneamente.
    const channelName = `campaign-progress:${campaignId}`
    const channel = createRealtimeChannel(channelName)

    if (!channel) {
      console.warn('[CampaignRealtime] Supabase not configured, skipping realtime')
      return
    }

    channelRef.current = channel

    // Subscribe to campaign table updates (broadcast `dispara-db`: só status/contadores)
    subscribeToTable(channel, 'campaigns', 'UPDATE', handleCampaignUpdate, REALTIME_FILTERS.campaignById(campaignId))

    // campaign_contacts não tem trigger de broadcast (volume do disparo em massa):
    // o progresso por mensagem vem do broadcast 'campaign_progress' abaixo
    // (lib/realtime-broadcast-server.ts) e dos contadores em campaigns.

    // Subscribe to ephemeral Broadcast progress (smooth UI without DB round-trips)
    subscribeToBroadcast<CampaignProgressBroadcastPayload>(channel, 'campaign_progress', (msg) => {
      if (!mountedRef.current) return
      const p = msg?.payload
      if (!p || p.campaignId !== campaignId) return

      // Reset ordering when trace muda
      if (lastBroadcastTraceIdRef.current !== p.traceId) {
        lastBroadcastTraceIdRef.current = p.traceId
        lastBroadcastSeqRef.current = 0
      }

      if (typeof p.seq === 'number' && p.seq <= lastBroadcastSeqRef.current) return
      if (typeof p.seq === 'number') lastBroadcastSeqRef.current = p.seq

      const delta = p.delta
      if (!delta) return

      if (telemetryEnabled) {
        const receivedAt = Date.now()
        pendingBroadcastTelemetryRef.current = {
          traceId: String(p.traceId || ''),
          seq: typeof p.seq === 'number' ? p.seq : 0,
          serverTs: typeof p.ts === 'number' ? p.ts : receivedAt,
          receivedAt,
        }
        telemetryTickRef.current += 1
        setTelemetryTick(telemetryTickRef.current)
      }

      // Atualiza a campanha (detalhe)
      queryClient.setQueryData<any>(['campaign', campaignId], (old: any) => {
        if (!old) return old
        const next = { ...old }
        const sent = Number(next.sent || 0) + Number(delta.sent || 0)
        const failed = Number(next.failed || 0) + Number(delta.failed || 0)
        const skipped = Number(next.skipped || 0) + Number(delta.skipped || 0)
        next.sent = sent
        next.failed = failed
        next.skipped = skipped
        return next
      })

      // Atualiza listas de campanhas (paginadas ou completas)
      queryClient.setQueriesData<any>({ queryKey: ['campaigns'] }, (old: any) => {
        if (!old) return old
        if (Array.isArray(old)) {
          return old.map((c: any) => {
            if (!c || c.id !== campaignId) return c
            return {
              ...c,
              sent: Number(c.sent || 0) + Number(delta.sent || 0),
              failed: Number(c.failed || 0) + Number(delta.failed || 0),
              skipped: Number(c.skipped || 0) + Number(delta.skipped || 0),
            }
          })
        }

        if (Array.isArray(old.data)) {
          return {
            ...old,
            data: old.data.map((c: any) => {
              if (!c || c.id !== campaignId) return c
              return {
                ...c,
                sent: Number(c.sent || 0) + Number(delta.sent || 0),
                failed: Number(c.failed || 0) + Number(delta.failed || 0),
                skipped: Number(c.skipped || 0) + Number(delta.skipped || 0),
              }
            })
          }
        }

        return old
      })

      // Ajusta stats do endpoint de mensagens (se estiver em cache)
      queryClient.setQueriesData<any>({ queryKey: ['campaignMessages', campaignId] }, (old: any) => {
        if (!old || typeof old !== 'object') return old
        const next = { ...old }
        if (!next.stats) return old
        next.stats = {
          ...next.stats,
          sent: Number(next.stats.sent || 0) + Number(delta.sent || 0),
          failed: Number(next.stats.failed || 0) + Number(delta.failed || 0),
          skipped: Number(next.stats.skipped || 0) + Number(delta.skipped || 0),
          pending: Math.max(0, Number(next.stats.pending || 0) - (Number(delta.sent || 0) + Number(delta.failed || 0) + Number(delta.skipped || 0))),
        }
        return next
      })
    })

    // Quando receber fase "complete", força reconciliação imediata via refetch
    subscribeToBroadcast<CampaignProgressBroadcastPayload>(channel, 'campaign_phase', (msg) => {
      if (!mountedRef.current) return
      const p = msg?.payload
      if (!p || p.campaignId !== campaignId) return
      if (p.phase !== 'complete') return
      debouncedRefetch()
    })

    // Activate channel with silent mode to centralize error handling
    activateChannel(channel, undefined, { silent: true })
      .then(() => {
        setIsActuallyConnected(true)
      })
      .catch(() => {
        // Errors are logged centrally in supabase-realtime.ts
        setIsActuallyConnected(false)
      })

    return () => {
      mountedRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (channelRef.current) {
        removeChannel(channelRef.current)
        channelRef.current = null
        setIsActuallyConnected(false)
      }
    }
  }, [shouldConnect, campaignId, debounceTime, handleCampaignUpdate, debouncedRefetch, telemetryEnabled])

  // Show refresh button when not connected
  const showRefreshButton = !shouldConnect || hasTimedOut

  return {
    isConnected: isActuallyConnected,
    shouldShowRefreshButton: showRefreshButton,
    telemetry: telemetryEnabled ? telemetry : null,
  }
}

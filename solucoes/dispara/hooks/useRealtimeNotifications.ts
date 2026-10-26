'use client'

/**
 * useRealtimeNotifications Hook
 *
 * Subscribes to global events and shows toast notifications.
 * Part of US5: Real-time Notifications (T021)
 *
 * O canal `dispara-db` é público (qualquer um ouve e emite): o evento é só um GATILHO.
 * O toast de conclusão/falha de campanha só sai depois de confirmado pela API
 * autenticada (confirmCampaignStatus), que foi desenhada para que eventos forjados não
 * consigam nem amplificar buscas nem suprimir o toast legítimo:
 * - nenhum cache negativo para campanha que EXISTE com outro status (só para id que a
 *   API não acha); um evento que chega durante o intervalo mínimo entre buscas do mesmo
 *   id ADIA a busca (trailing), não descarta;
 * - um evento nunca reaproveita uma busca que começou ANTES dele (a resposta pode ser
 *   anterior à conclusão);
 * - ids que o cache autenticado do React Query mostra em andamento não gastam o
 *   orçamento global (limitados pelo número real de campanhas); só ids desconhecidos
 *   (onde ficam os forjados aleatórios) passam pelo orçamento, e com orçamento esgotado
 *   esperam numa fila limitada em vez de serem descartados;
 * - o sinal genérico do hub (excesso da janela: new/old nulos) dispara a conferência
 *   das campanhas em andamento conhecidas — uma conclusão rebaixada a sinal genérico
 *   não perde o toast.
 */

import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createRealtimeChannel, subscribeToTable, activateChannel, removeChannel } from '@/lib/supabase-realtime'
import { campaignService } from '@/services/campaignService'
import type { RealtimePayload, RealtimeTable } from '@/types'

type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface RealtimeNotification {
    /** Um toast por chave por sessão (null = sem deduplicação) */
    key: string | null
    message: string
    type: ToastType
}

export interface NotificationContext {
    /**
     * ids de campanhas que o cache autenticado (React Query) mostra em andamento.
     * Chame ANTES de qualquer await: o refetch disparado pelo mesmo evento atualiza o cache.
     */
    activeCampaignIds: () => ReadonlySet<string>
    /** Já notificado nesta sessão? (evita buscas inúteis) */
    isNotified: (key: string) => boolean
    /** Mostra o toast (deduplicado por key) */
    notify: (notification: RealtimeNotification) => void
}

interface NotificationConfig {
    table: RealtimeTable
    onEvent: (payload: RealtimePayload, ctx: NotificationContext) => void | Promise<void>
}

type CampaignFinalStatus = 'Concluído' | 'Falhou'

const CAMPAIGN_FINAL_STATUSES: readonly CampaignFinalStatus[] = ['Concluído', 'Falhou'] as const

/** Status em que a campanha ainda pode terminar (Concluído/Falhou). */
const CAMPAIGN_ACTIVE_STATUSES: ReadonlySet<string> = new Set(['Enviando', 'Agendado', 'Pausado'])

/**
 * Detecta a TRANSIÇÃO real de uma campanha para um estado final a partir do evento
 * realtime (só colunas whitelisted: id, status, completed_at...). Updates de contadores
 * (delivered/read) após a conclusão não são transição — senão viram spam.
 */
export function getCampaignFinalTransition(
    payload: RealtimePayload
): { id: string; status: CampaignFinalStatus } | null {
    if (payload.eventType !== 'UPDATE') return null

    const data = payload.new as Record<string, unknown> | null
    if (!data) return null
    const id = data.id
    if (typeof id !== 'string' || !id) return null

    const oldData = (payload.old as Record<string, unknown> | null) ?? null

    // Realtime payload normalmente traz colunas do Postgres (snake_case).
    const newStatus = data.status
    const oldStatus = oldData?.status

    const newCompletedAt = (data.completed_at ?? data.completedAt) as unknown
    const oldCompletedAt = (oldData?.completed_at ?? oldData?.completedAt) as unknown

    if (newStatus === 'Concluído') {
        const statusTransition = oldStatus !== 'Concluído'
        const completedAtTransition = (oldCompletedAt == null) && (newCompletedAt != null)

        if (!statusTransition && !completedAtTransition) return null
        return { id, status: 'Concluído' }
    }
    if (newStatus === 'Falhou') {
        const statusTransition = oldStatus !== 'Falhou'
        if (!statusTransition) return null
        return { id, status: 'Falhou' }
    }
    return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Campanhas em andamento (Enviando/Agendado/Pausado) no cache autenticado do React Query:
 * listas ['campaigns', ...], detalhe ['campaign', id] e ['recentCampaigns'] do dashboard.
 * Só respostas da API entram nesses caches — um id forjado nunca está aqui.
 */
export function getActiveCampaignIds(queryClient: QueryClient): Set<string> {
    const ids = new Set<string>()
    const visit = (campaign: unknown) => {
        if (!isRecord(campaign)) return
        const { id, status } = campaign
        if (typeof id === 'string' && typeof status === 'string' && CAMPAIGN_ACTIVE_STATUSES.has(status)) {
            ids.add(id)
        }
    }
    const visitList = (data: unknown) => {
        if (Array.isArray(data)) data.forEach(visit)
        else if (isRecord(data) && Array.isArray(data.data)) data.data.forEach(visit)
    }

    for (const [, data] of queryClient.getQueriesData({ queryKey: ['campaigns'] })) visitList(data)
    for (const [, data] of queryClient.getQueriesData({ queryKey: ['recentCampaigns'] })) visitList(data)
    for (const [key, data] of queryClient.getQueriesData({ queryKey: ['campaign'] })) {
        if (key.length === 2 && isRecord(data) && data.id === key[1]) visit(data)
    }
    return ids
}

// ----------------------------------------------------------------------------
// Confirmação da transição pela API (canal público: eventos forjáveis)
// ----------------------------------------------------------------------------

/** id DESCONHECIDO que a API não achou (404/erro) não é buscado de novo por este tempo. */
export const CAMPAIGN_CONFIRM_NOT_FOUND_TTL_MS = 60_000
/** Intervalo mínimo entre buscas do mesmo id; evento no meio ADIA a busca, não descarta. */
export const CAMPAIGN_CONFIRM_RECHECK_MS = 5_000
/** Teto de buscas de ids DESCONHECIDOS por janela (ids do cache autenticado não gastam). */
export const CAMPAIGN_CONFIRM_BUDGET = 5
export const CAMPAIGN_CONFIRM_BUDGET_WINDOW_MS = 10_000
/** ids desconhecidos esperando orçamento/intervalo; acima disso o evento é descartado. */
export const CAMPAIGN_CONFIRM_QUEUE_MAX = 20
const CAMPAIGN_CONFIRM_MAX_TRACKED_IDS = 500

type ConfirmedCampaign = NonNullable<Awaited<ReturnType<typeof campaignService.getById>>>
type CampaignLookup = Promise<ConfirmedCampaign | undefined>

interface CampaignLookupState {
    /** Busca em voo: começou antes de quem chega agora, então não serve de confirmação. */
    inFlight: CampaignLookup | null
    /** Próxima busca (ainda não começou): todo evento novo do id se junta a ela. */
    next: CampaignLookup | null
    lastStartedAt: number
}

interface Sleeper {
    timer: ReturnType<typeof setTimeout>
    resolve: () => void
}

const campaignConfirmations = {
    /** Incrementado no reset (testes): buscas adiadas de antes desistem. */
    generation: 0,
    lookups: new Map<string, CampaignLookupState>(),
    /** id desconhecido → expira em (ms) */
    notFound: new Map<string, number>(),
    /** Instantes das últimas buscas de ids desconhecidos (orçamento) */
    recentLookups: [] as number[],
    /** ids desconhecidos com busca adiada */
    queuedUnknown: 0,
    sleepers: new Set<Sleeper>(),
}

/** @internal Só para testes: zera caches, fila e orçamento da confirmação. */
export function __resetCampaignConfirmationsForTests(): void {
    const c = campaignConfirmations
    c.generation += 1
    c.lookups.clear()
    c.notFound.clear()
    c.recentLookups = []
    c.queuedUnknown = 0
    c.sleepers.forEach((sleeper) => {
        clearTimeout(sleeper.timer)
        sleeper.resolve()
    })
    c.sleepers.clear()
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        const sleeper: Sleeper = {
            timer: setTimeout(() => {
                campaignConfirmations.sleepers.delete(sleeper)
                resolve()
            }, Math.max(1, ms)),
            resolve,
        }
        campaignConfirmations.sleepers.add(sleeper)
    })
}

function rememberNotFound(id: string, now: number): void {
    const { notFound } = campaignConfirmations
    if (notFound.size >= CAMPAIGN_CONFIRM_MAX_TRACKED_IDS) {
        notFound.forEach((expiresAt, key) => {
            if (expiresAt <= now) notFound.delete(key)
        })
        // Ainda cheio (flood de ids distintos): descarta os mais antigos
        while (notFound.size >= CAMPAIGN_CONFIRM_MAX_TRACKED_IDS) {
            const oldest = notFound.keys().next().value
            if (oldest === undefined) break
            notFound.delete(oldest)
        }
    }
    notFound.set(id, now + CAMPAIGN_CONFIRM_NOT_FOUND_TTL_MS)
}

/** Reserva uma busca no orçamento de ids desconhecidos (false = esgotado). */
function takeBudget(now: number): boolean {
    const c = campaignConfirmations
    c.recentLookups = c.recentLookups.filter((at) => now - at < CAMPAIGN_CONFIRM_BUDGET_WINDOW_MS)
    if (c.recentLookups.length >= CAMPAIGN_CONFIRM_BUDGET) return false
    c.recentLookups.push(now)
    return true
}

function budgetRetryInMs(now: number): number {
    const oldest = campaignConfirmations.recentLookups[0]
    return oldest === undefined ? 1 : oldest + CAMPAIGN_CONFIRM_BUDGET_WINDOW_MS - now
}

function pruneLookupStates(now: number): void {
    const { lookups } = campaignConfirmations
    if (lookups.size < CAMPAIGN_CONFIRM_MAX_TRACKED_IDS) return
    lookups.forEach((state, id) => {
        if (!state.inFlight && !state.next && now - state.lastStartedAt >= CAMPAIGN_CONFIRM_RECHECK_MS) {
            lookups.delete(id)
        }
    })
}

function startCampaignLookup(id: string, state: CampaignLookupState, known: boolean): CampaignLookup {
    state.lastStartedAt = Date.now()
    const request: CampaignLookup = campaignService
        .lookupById(id)
        .catch(() => ({ status: 'error' as const }))
        .then((result) => {
            // Cache negativo só para id desconhecido que a API respondeu 404 (ex.: forjado
            // aleatório). Erro transitório (5xx, rede) não pode suprimir o toast legítimo.
            if (result.status === 'not_found' && !known) rememberNotFound(id, Date.now())
            return result.status === 'found' ? result.campaign : undefined
        })
    state.inFlight = request
    void request.then(() => {
        if (state.inFlight === request) state.inFlight = null
    })
    return request
}

async function deferCampaignLookup(id: string, state: CampaignLookupState, known: boolean): CampaignLookup {
    const c = campaignConfirmations
    const generation = c.generation
    if (!known) c.queuedUnknown += 1
    try {
        // Garante que quem chamou já registrou `state.next` antes de qualquer decisão abaixo.
        await Promise.resolve()
        for (;;) {
            if (c.generation !== generation) return undefined
            if (state.inFlight) {
                await state.inFlight
                continue
            }
            const cooldown = state.lastStartedAt + CAMPAIGN_CONFIRM_RECHECK_MS - Date.now()
            if (cooldown > 0) {
                await sleep(cooldown)
                continue
            }
            if (!known && !takeBudget(Date.now())) {
                await sleep(budgetRetryInMs(Date.now()))
                continue
            }
            break
        }
    } finally {
        if (!known && c.generation === generation) c.queuedUnknown -= 1
    }
    state.next = null
    return startCampaignLookup(id, state, known)
}

/**
 * Busca da campanha que COMEÇA agora ou depois (nunca uma resposta anterior ao evento).
 * @returns null quando o evento é descartado (id desconhecido em cache negativo, ou fila cheia)
 */
function requestCampaignLookup(id: string, known: boolean): CampaignLookup | null {
    const c = campaignConfirmations
    const now = Date.now()

    if (!known) {
        const notFoundUntil = c.notFound.get(id)
        if (notFoundUntil !== undefined) {
            if (notFoundUntil > now) return null
            c.notFound.delete(id)
        }
    }

    let state = c.lookups.get(id)
    if (!state) {
        pruneLookupStates(now)
        state = { inFlight: null, next: null, lastStartedAt: Number.NEGATIVE_INFINITY }
        c.lookups.set(id, state)
    }

    // Já há uma busca futura para este id: junta-se a ela (começa depois deste evento)
    if (state.next) return state.next

    const ready = !state.inFlight && now - state.lastStartedAt >= CAMPAIGN_CONFIRM_RECHECK_MS
    if (ready && (known || takeBudget(now))) return startCampaignLookup(id, state, known)

    // Busca em voo, intervalo mínimo ou orçamento: adia (uma única busca futura por id)
    if (!known && c.queuedUnknown >= CAMPAIGN_CONFIRM_QUEUE_MAX) return null
    const next = deferCampaignLookup(id, state, known)
    state.next = next
    return next
}

/**
 * Confirma pela API autenticada que a campanha está mesmo num dos status finais
 * esperados. O broadcast não traz o nome (canal público, sem dados de negócio) e aceita
 * eventos forjados. Ver o cabeçalho deste arquivo para as garantias.
 *
 * @param options.known id presente no cache autenticado como em andamento
 *   (getActiveCampaignIds): não gasta orçamento nem entra no cache negativo.
 * @returns a campanha confirmada, ou null (outro status, inexistente ou descartado)
 */
export async function confirmCampaignStatus(
    id: string,
    expected: CampaignFinalStatus | readonly CampaignFinalStatus[],
    options: { known?: boolean } = {}
): Promise<ConfirmedCampaign | null> {
    const lookup = requestCampaignLookup(id, options.known === true)
    if (!lookup) return null

    const campaign = await lookup
    const statuses: readonly string[] = typeof expected === 'string' ? [expected] : expected
    if (!campaign || !statuses.includes(campaign.status)) return null
    return campaign
}

export function campaignNotificationKey(id: string, status: string): string {
    // Um toast por campanha+status por sessão
    return `campaign:${id}:${status}`
}

function campaignNotification(campaign: ConfirmedCampaign): RealtimeNotification {
    const name = campaign.name || 'Sem nome'
    const completed = campaign.status === 'Concluído'
    return {
        key: campaignNotificationKey(campaign.id, campaign.status),
        message: completed ? `Campanha "${name}" concluída!` : `Campanha "${name}" falhou`,
        type: completed ? 'success' : 'error',
    }
}

async function handleCampaignEvent(payload: RealtimePayload, ctx: NotificationContext): Promise<void> {
    // Lido antes de qualquer await (o refetch do mesmo evento atualiza o cache)
    const active = ctx.activeCampaignIds()

    const transition = getCampaignFinalTransition(payload)
    if (transition) {
        if (ctx.isNotified(campaignNotificationKey(transition.id, transition.status))) return
        // Busca pela API autenticada, que também confirma o status (ver confirmCampaignStatus).
        const campaign = await confirmCampaignStatus(transition.id, transition.status, {
            known: active.has(transition.id),
        })
        if (campaign) ctx.notify(campaignNotification(campaign))
        return
    }

    // Sinal genérico do hub (excesso da janela, new/old nulos): uma conclusão pode estar
    // dentro dele. Confere as campanhas em andamento que o cache autenticado conhece.
    if (payload.eventType === 'UPDATE' && payload.new == null && payload.old == null) {
        await Promise.all(
            Array.from(active, async (id) => {
                const campaign = await confirmCampaignStatus(id, CAMPAIGN_FINAL_STATUSES, { known: true })
                if (campaign) ctx.notify(campaignNotification(campaign))
            })
        )
    }
}

const DEFAULT_NOTIFICATIONS: NotificationConfig[] = [
    { table: 'campaigns', onEvent: handleCampaignEvent },
    // Note: Contacts notifications removed to avoid spam during bulk imports
]

interface UseRealtimeNotificationsOptions {
    /**
     * Enable/disable notifications (default: true)
     */
    enabled?: boolean

    /**
     * Custom notification configurations (default: campaigns)
     */
    notifications?: NotificationConfig[]
}

/**
 * Shows toast notifications for real-time events
 *
 * @example
 * ```tsx
 * // In layout or root component
 * useRealtimeNotifications({ enabled: true })
 * ```
 */
export function useRealtimeNotifications({
    enabled = true,
    notifications = DEFAULT_NOTIFICATIONS,
}: UseRealtimeNotificationsOptions = {}) {
    const queryClient = useQueryClient()
    const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(null)
    const mountedRef = useRef(true)
    const notifiedRef = useRef<Set<string>>(new Set())

    const notify = useCallback((notification: RealtimeNotification) => {
        if (!mountedRef.current) return

        // Dedupe extra para proteger contra múltiplas subscriptions/reconnect/StrictMode.
        const { key } = notification
        if (key) {
            if (notifiedRef.current.has(key)) return
            notifiedRef.current.add(key)
        }

        const options = key ? { id: key } : undefined
        switch (notification.type) {
            case 'success':
                toast.success(notification.message, options)
                break
            case 'warning':
                toast.warning(notification.message, options)
                break
            case 'error':
                toast.error(notification.message, options)
                break
            case 'info':
            default:
                toast.info(notification.message, options)
        }
    }, [])

    const handleEvent = useCallback(async (config: NotificationConfig, payload: RealtimePayload) => {
        if (!mountedRef.current) return

        let activeIds: ReadonlySet<string> | null = null
        const ctx: NotificationContext = {
            activeCampaignIds: () => (activeIds ??= getActiveCampaignIds(queryClient)),
            isNotified: (key) => notifiedRef.current.has(key),
            notify,
        }
        try {
            await config.onEvent(payload, ctx)
        } catch {
            // best-effort: notificação nunca derruba nada
        }
    }, [queryClient, notify])

    useEffect(() => {
        if (!enabled) return

        mountedRef.current = true

        const channelName = `notifications-${Date.now()}`
        const channel = createRealtimeChannel(channelName)

        // Skip if Supabase not configured
        if (!channel) {
            // Warning is handled centrally in supabase-realtime.ts
            return
        }

        channelRef.current = channel

        // Subscribe to each configured table
        notifications.forEach((config) => {
            subscribeToTable(channel, config.table, '*', (payload) => {
                void handleEvent(config, payload)
            })
        })

        // Activate with silent mode to avoid duplicate error logs
        activateChannel(channel, undefined, { silent: true }).catch(() => {
            // Errors are logged centrally in supabase-realtime.ts
        })

        return () => {
            mountedRef.current = false
            if (channelRef.current) {
                removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
    }, [enabled, notifications, handleEvent])
}

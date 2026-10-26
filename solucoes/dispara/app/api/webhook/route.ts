import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic' // Prevent caching of verification requests
export const runtime = 'nodejs'
import { getSupabaseAdmin, supabase } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/phone-formatter'
import { upsertPhoneSuppression } from '@/lib/phone-suppressions'
import { maybeAutoSuppressByFailure } from '@/lib/auto-suppression'
import {
  mapWhatsAppError,
  isCriticalError,
  isOptOutError,
  getUserFriendlyMessageForMetaError,
  getRecommendedActionForMetaError,
  normalizeMetaErrorTextForStorage
} from '@/lib/whatsapp-errors'

import { emitWorkflowTrace, maskPhone } from '@/lib/workflow-trace'
import {
  applyStatusUpdateToCampaignContact,
  enqueueWebhookStatusReconcileBestEffort,
  markEventAttempt,
  normalizeMetaStatus,
  recordStatusEvent,
  tryParseWebhookTimestampSeconds,
} from '@/lib/whatsapp-status-events'


import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { applyFlowMappingToContact } from '@/lib/flow-mapping'
import { settingsDb } from '@/lib/supabase-db'
import { ensureWorkflowRecord, getCompanyId } from '@/lib/builder/workflow-db'
import { reinvokeSelf } from '@/lib/self-invoke'
import { getPendingConversation } from '@/lib/builder/workflow-conversations'
import { parseWorkflowSettings } from '@/lib/builder/workflow-settings'

// T046-T048: Inbox integration
import {
  handleInboundMessage,
  handleDeliveryStatus,
} from '@/lib/inbox/inbox-webhook'

// Campaign auto-reply
import { sendWhatsAppMessage } from '@/lib/whatsapp-send'
import { persistOutboundToInbox } from '@/lib/inbox/inbox-service'

// Get WhatsApp Access Token from centralized helper
async function getWhatsAppAccessToken(): Promise<string | null> {
  const credentials = await getWhatsAppCredentials()
  return credentials?.accessToken || null
}

// Get or generate webhook verify token (Supabase settings preferred, env var fallback)
import { getVerifyToken, isConfiguredVerifyToken } from '@/lib/verify-token'
import { timingSafeEqualString } from '@/lib/timing-safe-equal'
import {
  META_SIGNATURE_HEADER,
  evaluateMetaSignature,
  reportMetaSignatureFailure,
} from '@/lib/meta-webhook-signature'
import { logWebhookOriginMismatches } from '@/lib/meta-webhook-origin'

async function getCalendarBookingSettings(): Promise<{
  timezone: string | null
  externalWebhookUrl: string | null
}> {
  try {
    const raw = await settingsDb.get('calendar_booking_config')
    if (!raw) {
      return {
        timezone: null,
        externalWebhookUrl: null,
      }
    }
    const parsed = JSON.parse(raw)
    return {
      timezone: typeof parsed?.timezone === 'string' ? parsed.timezone : null,
      externalWebhookUrl: typeof parsed?.externalWebhookUrl === 'string' ? parsed.externalWebhookUrl : null,
    }
  } catch {
    return {
      timezone: null,
      externalWebhookUrl: null,
    }
  }
}

async function sendExternalWebhook(payload: Record<string, unknown>): Promise<void> {
  const settings = await getCalendarBookingSettings()
  const webhookUrl = settings?.externalWebhookUrl?.trim()
  if (!webhookUrl) return

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (e) {
    console.warn('[Webhook] Falha ao enviar payload para webhook externo (best-effort):', e)
  } finally {
    clearTimeout(timeoutId)
  }
}

function extractInboundText(message: any): string {
  // Meta pode enviar diferentes tipos de payload: text/button/interactive
  const textBody = message?.text?.body
  if (typeof textBody === 'string' && textBody.trim()) return textBody

  const buttonText = message?.button?.text
  if (typeof buttonText === 'string' && buttonText.trim()) return buttonText

  const interactiveButtonTitle = message?.interactive?.button_reply?.title
  if (typeof interactiveButtonTitle === 'string' && interactiveButtonTitle.trim()) return interactiveButtonTitle

  const interactiveListTitle = message?.interactive?.list_reply?.title
  if (typeof interactiveListTitle === 'string' && interactiveListTitle.trim()) return interactiveListTitle

  return ''
}

// Identifica se a mensagem veio de um clique de botão/lista de template e
// retorna o texto exato selecionado pelo usuário (usado como filtro no inbox).
function extractInboundSource(message: any): {
  sourceType: 'text' | 'button_reply' | 'list_reply'
  buttonPayload: string | null
} {
  const buttonText = message?.button?.text
  if (typeof buttonText === 'string' && buttonText.trim()) {
    return { sourceType: 'button_reply', buttonPayload: buttonText.trim() }
  }

  const interactiveButtonTitle = message?.interactive?.button_reply?.title
  if (typeof interactiveButtonTitle === 'string' && interactiveButtonTitle.trim()) {
    return { sourceType: 'button_reply', buttonPayload: interactiveButtonTitle.trim() }
  }

  const interactiveListTitle = message?.interactive?.list_reply?.title
  if (typeof interactiveListTitle === 'string' && interactiveListTitle.trim()) {
    return { sourceType: 'list_reply', buttonPayload: interactiveListTitle.trim() }
  }

  return { sourceType: 'text', buttonPayload: null }
}

function isOptOutKeyword(textRaw: string): boolean {
  const t = String(textRaw || '')
    .trim()
    .toLowerCase()
    // normaliza acentos comuns para facilitar matching
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  if (!t) return false

  // Palavras-chave comuns (PT-BR + EN) — agressivo por requisito.
  const keywords = [
    'parar',
    'pare',
    'stop',
    'cancelar',
    'cancele',
    'sair',
    'remover',
    'remove',
    'descadastrar',
    'desinscrever',
    'unsubscribe',
    'optout',
    'opt-out',
    'nao quero',
    'não quero',
    'nao receber',
    'não receber',
  ]

  // Match por inclusão para cobrir frases (ex.: "por favor parar")
  return keywords.some((k) => t.includes(k))
}

async function markContactOptOutAndSuppress(input: {
  phoneRaw: string
  source: string
  reason: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const phone = normalizePhoneNumber(input.phoneRaw)

  // Apenas registra na tabela de supressões (fonte de verdade para bloqueios automáticos)
  // NÃO atualiza contacts.status - esse campo é controlado manualmente pelo usuário
  try {
    await upsertPhoneSuppression({
      phone,
      reason: input.reason,
      source: input.source,
      metadata: input.metadata || {},
      isActive: true,
      expiresAt: null,
    })
  } catch (e) {
    console.warn('[Webhook] Falha ao upsert phone_suppressions (best-effort):', e)
  }
}

function maskTokenPreview(token: string | null | undefined): string {
  if (!token) return '—'
  const t = String(token)
  if (t.length <= 8) return `${t.slice(0, 2)}…(${t.length})`
  return `${t.slice(0, 3)}…${t.slice(-3)}(${t.length})`
}

function safeParseJson(raw: unknown): unknown | null {
  if (raw == null) return null
  if (typeof raw === 'object') return raw as any
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function buildOptionTitleMapFromFlowJson(flowJson: unknown): Record<string, Record<string, string>> {
  const root = safeParseJson(flowJson)
  const out: Record<string, Record<string, string>> = {}
  if (!root || typeof root !== 'object') return out

  const screens = Array.isArray((root as any).screens) ? ((root as any).screens as any[]) : []
  const walk = (nodes: any[]) => {
    for (const n of nodes || []) {
      if (!n || typeof n !== 'object') continue
      const type = typeof n.type === 'string' ? n.type : ''
      const name = typeof n.name === 'string' ? n.name : ''
      const isChoice =
        type === 'Dropdown' || type === 'RadioButtonsGroup' || type === 'CheckboxGroup'
      if (isChoice && name) {
        const ds = (n as any)['data-source']
        const options = Array.isArray(ds) ? ds : Array.isArray((n as any).options) ? (n as any).options : []
        if (Array.isArray(options) && options.length) {
          const map: Record<string, string> = {}
          for (const opt of options) {
            if (!opt || typeof opt !== 'object') continue
            const id = typeof (opt as any).id === 'string' ? String((opt as any).id) : ''
            const title = typeof (opt as any).title === 'string' ? String((opt as any).title) : ''
            if (id && title) map[id] = title
          }
          if (Object.keys(map).length) out[name] = map
        }
      }
      const children = Array.isArray((n as any).children) ? ((n as any).children as any[]) : null
      if (children?.length) walk(children)
    }
  }

  for (const s of screens) {
    const layoutChildren = Array.isArray(s?.layout?.children) ? (s.layout.children as any[]) : []
    if (layoutChildren.length) walk(layoutChildren)
  }

  return out
}

function buildFieldLabelMapFromFlowJson(flowJson: unknown): Record<string, string> {
  const root = safeParseJson(flowJson)
  const out: Record<string, string> = {}
  if (!root || typeof root !== 'object') return out

  const supported = new Set([
    'TextInput',
    'TextArea',
    'Dropdown',
    'RadioButtonsGroup',
    'CheckboxGroup',
    'DatePicker',
    'CalendarPicker',
    'OptIn',
  ])

  const screens = Array.isArray((root as any).screens) ? ((root as any).screens as any[]) : []
  const walk = (nodes: any[]) => {
    for (const n of nodes || []) {
      if (!n || typeof n !== 'object') continue
      const type = typeof n.type === 'string' ? n.type : ''
      const name = typeof n.name === 'string' ? n.name : ''
      if (name && supported.has(type)) {
        const rawLabel =
          typeof (n as any).label === 'string'
            ? String((n as any).label).trim()
            : typeof (n as any).text === 'string'
              ? String((n as any).text).trim()
              : ''
        if (rawLabel) out[name] = rawLabel
      }
      const children = Array.isArray((n as any).children) ? ((n as any).children as any[]) : null
      if (children?.length) walk(children)
    }
  }

  for (const s of screens) {
    const layoutChildren = Array.isArray(s?.layout?.children) ? (s.layout.children as any[]) : []
    if (layoutChildren.length) walk(layoutChildren)
  }

  return out
}

function extractConfirmationConfigFromFlowJson(flowJson: unknown): {
  title?: string
  footer?: string
  fields?: string[]
  labels?: Record<string, string>
} {
  const root = safeParseJson(flowJson)
  if (!root || typeof root !== 'object') return {}
  const screens = Array.isArray((root as any).screens) ? ((root as any).screens as any[]) : []
  const findFooterPayload = (nodes: any[]): Record<string, unknown> | null => {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue
      if (String((node as any).type || '') === 'Footer') {
        const action = (node as any)['on-click-action']
        if (isPlainObject(action) && isPlainObject((action as any).payload)) {
          return (action as any).payload as Record<string, unknown>
        }
      }
      const children = Array.isArray((node as any).children) ? ((node as any).children as any[]) : null
      if (children?.length) {
        const nested = findFooterPayload(children)
        if (nested) return nested
      }
    }
    return null
  }

  for (const s of screens) {
    const layoutChildren = Array.isArray(s?.layout?.children) ? (s.layout.children as any[]) : []
    const payload = layoutChildren.length ? findFooterPayload(layoutChildren) : null
    if (!payload) continue
    const rawTitle = typeof payload.confirmation_title === 'string' ? payload.confirmation_title : undefined
    const rawFooter = typeof payload.confirmation_footer === 'string' ? payload.confirmation_footer : undefined
    const rawFields = Array.isArray(payload.confirmation_fields)
      ? (payload.confirmation_fields as unknown[]).filter((x) => typeof x === 'string').map((x) => String(x))
      : undefined
    const rawLabels =
      payload.confirmation_labels && typeof payload.confirmation_labels === 'object' && !Array.isArray(payload.confirmation_labels)
        ? (payload.confirmation_labels as Record<string, string>)
        : undefined
    if (rawTitle || rawFooter || (rawFields && rawFields.length) || rawLabels) {
      return { title: rawTitle, footer: rawFooter, fields: rawFields, labels: rawLabels }
    }
  }
  return {}
}

function extractConfirmationConfigFromSpec(spec: unknown): {
  title?: string
  footer?: string
  fields?: string[]
  labels?: Record<string, string>
} {
  const root = safeParseJson(spec)
  if (!root || typeof root !== 'object') return {}
  const dynamic = (root as any).dynamicFlow && typeof (root as any).dynamicFlow === 'object' ? (root as any).dynamicFlow : root
  const screens = Array.isArray((dynamic as any).screens) ? ((dynamic as any).screens as any[]) : []
  let screenIndex = 0
  for (const screen of screens) {
    if (!screen || typeof screen !== 'object') continue
    const currentIndex = screenIndex
    screenIndex += 1
    const screenObj = screen as any
    const action = screenObj.action
    const footerAction =
      screenObj.footer && typeof screenObj.footer === 'object' ? (screenObj.footer as any).action : null
    const payload = action && typeof action === 'object' && isPlainObject((action as any).payload) ? ((action as any).payload as Record<string, unknown>) : null
    if (!payload) continue
    const rawTitle = typeof payload.confirmation_title === 'string' ? payload.confirmation_title : undefined
    const rawFooter = typeof payload.confirmation_footer === 'string' ? payload.confirmation_footer : undefined
    const rawFields = Array.isArray(payload.confirmation_fields)
      ? (payload.confirmation_fields as unknown[]).filter((x) => typeof x === 'string').map((x) => String(x))
      : undefined
    const rawLabels =
      payload.confirmation_labels && typeof payload.confirmation_labels === 'object' && !Array.isArray(payload.confirmation_labels)
        ? (payload.confirmation_labels as Record<string, string>)
        : undefined
    if (rawTitle || rawFooter || (rawFields && rawFields.length) || rawLabels) {
      return { title: rawTitle, footer: rawFooter, fields: rawFields, labels: rawLabels }
    }
  }
  return {}
}

function extractMetaFlowIdFromDisparaToken(flowToken: string | null): string | null {
  const raw = String(flowToken || '').trim()
  if (!raw) return null
  const m = raw.match(/^dispara:(\d{6,25}):/)
  return m?.[1] || null
}

function humanizeOptionId(value: string): string {
  const v = String(value || '').trim()
  if (!v) return v
  // Evita "humanizar" coisas que parecem data/telefone
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v
  if (/^\+?\d{8,15}$/.test(v)) return v
  // Apenas IDs simples (minúsculo + número + _ -)
  if (!/^[a-z0-9_-]+$/.test(v)) return v
  const withSpaces = v.replace(/[_-]+/g, ' ').trim()
  if (!withSpaces) return v
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
}

function normalizeInboundText(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

type KeywordWorkflow = {
  workflowId: string
  keywords: string[]
}

async function loadKeywordWorkflows(
  excludeWorkflowId: string | null
): Promise<KeywordWorkflow[]> {
  const { data } = await supabase
    .from('workflow_versions')
    .select('workflow_id, nodes, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  return (data || [])
    .filter((version: any) => version?.workflow_id && version?.nodes)
    .filter((version: any) => version.workflow_id !== excludeWorkflowId)
    .map((version: any) => {
      const triggerNode = (version.nodes as any[]).find(
        (node) => node?.data?.type === 'trigger'
      )
      const triggerType = triggerNode?.data?.config?.triggerType
      if (triggerType !== 'Keywords') return null
      const keywordListRaw = triggerNode?.data?.config?.keywordList as string | undefined
      const keywords = (keywordListRaw || '')
        .split(/\r?\n/)
        .map((entry) => normalizeInboundText(entry))
        .filter(Boolean)
      if (!version.workflow_id || keywords.length === 0) return null
      return {
        workflowId: version.workflow_id,
        keywords,
      }
    })
    .filter((entry): entry is KeywordWorkflow => Boolean(entry))
}

function findMatchingWorkflow(
  workflows: KeywordWorkflow[],
  message: string
): string | null {
  const normalizedMessage = normalizeInboundText(message)
  if (!normalizedMessage) return null
  for (const workflow of workflows) {
    if (workflow.keywords.some((keyword) => keyword === normalizedMessage)) {
      return workflow.workflowId
    }
  }
  return null
}

// Variantes do telefone para lookup (bug do 9 brasileiro + prefixo "+") —
// mesma lógica do bloco AutoReply, extraída para os hooks de workflow.
function buildPhoneLookupVariants(rawPhone: string): string[] {
  const digits = String(rawPhone).replace(/\D/g, '')
  if (!digits) return []
  const variants = new Set<string>([digits, `+${digits}`])
  if (digits.startsWith('55') && digits.length === 12) {
    const withNine = `${digits.slice(0, 4)}9${digits.slice(4)}`
    variants.add(withNine)
    variants.add(`+${withNine}`)
  } else if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    const withoutNine = `${digits.slice(0, 4)}${digits.slice(5)}`
    variants.add(withoutNine)
    variants.add(`+${withoutNine}`)
  }
  return Array.from(variants)
}

type CampaignReplyWorkflow = {
  workflowId: string
  campaignId: string
  replyFilter: string
}

/** Workflows publicados com gatilho "Respondeu ao disparo" (CampaignReply). */
async function loadCampaignReplyWorkflows(): Promise<CampaignReplyWorkflow[]> {
  const { data } = await supabase
    .from('workflow_versions')
    .select('workflow_id, nodes')
    .eq('status', 'published')

  return (data || [])
    .filter((version: any) => version?.workflow_id && version?.nodes)
    .map((version: any) => {
      const triggerNode = (version.nodes as any[]).find(
        (node) => node?.data?.type === 'trigger'
      )
      if (triggerNode?.data?.config?.triggerType !== 'CampaignReply') return null
      return {
        workflowId: version.workflow_id as string,
        campaignId: String(triggerNode?.data?.config?.campaignId || ''),
        replyFilter: String(triggerNode?.data?.config?.replyFilter || ''),
      }
    })
    .filter((entry): entry is CampaignReplyWorkflow => Boolean(entry))
}

/** Allow Re-entry desligado → contato que já participou do fluxo não re-entra. */
async function passesReentryGate(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  workflowId: string,
  phoneVariants: string[]
): Promise<boolean> {
  const { data: wfRow } = await db
    .from('workflows')
    .select('settings')
    .eq('id', workflowId)
    .maybeSingle()
  const settings = parseWorkflowSettings((wfRow as any)?.settings)
  if (settings.allowReentry !== false) return true

  const { data: enr } = await db
    .from('workflow_enrollments')
    .select('id')
    .eq('workflow_id', workflowId)
    .in('phone', phoneVariants)
    .limit(1)
  if (enr && enr.length > 0) return false

  const { data: run } = await db
    .from('workflow_runs')
    .select('id')
    .eq('workflow_id', workflowId)
    .or(phoneVariants.map((v) => `input->>from.eq.${v}`).join(','))
    .limit(1)
  return !(run && run.length > 0)
}

/**
 * Stop on Response (settings do workflow): a resposta do contato cancela os
 * waits de DELAY dos fluxos com a opção ligada. Ask-question não é afetado —
 * a resposta é exatamente o resume esperado.
 */
async function cancelDelayWaitsOnResponse(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  rawPhone: string
): Promise<void> {
  const variants = buildPhoneLookupVariants(rawPhone)
  if (variants.length === 0) return

  const { data: waits } = await db
    .from('workflow_enrollments')
    .select('id, workflow_id')
    .eq('status', 'waiting')
    .eq('wait_kind', 'delay')
    .in('phone', variants)
  if (!waits || waits.length === 0) return

  const workflowIds = Array.from(new Set(waits.map((w: any) => w.workflow_id)))
  const { data: wfs } = await db
    .from('workflows')
    .select('id, settings')
    .in('id', workflowIds)
  const stopIds = new Set(
    (wfs || [])
      .filter((w: any) => parseWorkflowSettings(w.settings).stopOnResponse === true)
      .map((w: any) => w.id)
  )
  const cancelIds = waits
    .filter((w: any) => stopIds.has(w.workflow_id))
    .map((w: any) => w.id)
  if (cancelIds.length === 0) return

  await db
    .from('workflow_enrollments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .in('id', cancelIds)
    .eq('status', 'waiting') // CAS: não pisa em linha que o drain claimou
  console.log('[StopOnResponse] cancelled delay waits:', cancelIds.length)
}

function isMissingColumnError(e: unknown, columnName: string): boolean {
  const msg = e instanceof Error ? e.message : String((e as any)?.message || e || '')
  return msg.toLowerCase().includes('column') && msg.toLowerCase().includes(columnName.toLowerCase())
}

function extractCampaignIdFromFlowToken(flowToken: string | null): string | null {
  if (!flowToken) return null
  const match = flowToken.match(/:c:([A-Za-z0-9_-]+)/)
  if (!match) return null
  const value = match[1]?.trim()
  return value ? value : null
}

function isMissingTableError(e: unknown, tableName: string): boolean {
  const code = String((e as any)?.code || '')
  const msg = String((e as any)?.message || (e instanceof Error ? e.message : e || ''))
  const m = msg.toLowerCase()
  const t = tableName.toLowerCase()

  // Postgres undefined_table
  if (code === '42P01') return true

  // PostgREST / Supabase cache errors often include the table name.
  if (m.includes('does not exist') && m.includes(t)) return true
  if (m.includes('relation') && m.includes(t)) return true
  if (m.includes('schema cache') && m.includes(t)) return true

  return false
}

// Meta Webhook Verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const MY_VERIFY_TOKEN = await getVerifyToken({ readonly: true })
  // Sentinelas ('token-not-found-readonly' etc.) são previsíveis: nunca podem casar.
  const hasVerifyToken = isConfiguredVerifyToken(MY_VERIFY_TOKEN)

  console.log('🔍 Webhook Verification Request:')
  console.log(`- Mode: ${mode}`)
  console.log(`- Received Token: ${maskTokenPreview(token)}`)
  console.log(`- Verify token configurado: ${hasVerifyToken ? 'sim' : 'não'}`)

  if (!hasVerifyToken) {
    console.warn(
      '⚠️ Webhook verify token ausente em modo readonly. Configure em settings (webhook_verify_token) ou via env WEBHOOK_VERIFY_TOKEN.'
    )
    return new Response('Forbidden', { status: 403 })
  }

  if (mode === 'subscribe' && timingSafeEqualString(token, MY_VERIFY_TOKEN)) {
    console.log('✅ Webhook verified successfully')
    return new Response(challenge || '', { status: 200 })
  }

  console.log('❌ Webhook verification failed')
  return new Response('Forbidden', { status: 403 })
}

// Webhook Event Receiver
// Supabase: fonte da verdade para status de mensagens
export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => '')

  // Assinatura X-Hub-Signature-256 sobre o corpo CRU, antes de qualquer processamento.
  const signature = await evaluateMetaSignature(rawBody, request.headers.get(META_SIGNATURE_HEADER))
  if (!signature.ok) {
    console.warn(`[Webhook] POST rejeitado: assinatura ${signature.reason} (modo ${signature.mode})`)
    if (signature.reason === 'secret_unavailable') {
      // Não deu para ler o App Secret: 503 faz a Meta reentregar depois.
      return NextResponse.json({ status: 'unavailable' }, { status: 503 })
    }
    await reportMetaSignatureFailure({ evaluation: signature, endpoint: 'webhook' })
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  }
  if (!signature.verified) {
    // report_only (secret de Configurações ainda não comprovado) ou sem App Secret:
    // aceita (como sempre foi), mas registra para o diagnóstico/alerta.
    await reportMetaSignatureFailure({ evaluation: signature, endpoint: 'webhook' })
  }

  if (!rawBody) {
    return NextResponse.json({ status: 'ignored', error: 'Body inválido' }, { status: 400 })
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody)
    } catch {
      return null
    }
  })()
  if (!body) {
    return NextResponse.json({ status: 'ignored', error: 'Body inválido' }, { status: 400 })
  }
  const supabaseAdmin = getSupabaseAdmin()
  if (!supabaseAdmin) {
    return NextResponse.json({ status: 'error', error: 'Supabase not configured' }, { status: 500 })
  }

  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ignored' })
  }

  // Defesa em profundidade (só log, não descarta): WABA/phone_number_id diferentes
  // das credenciais configuradas. Ver lib/meta-webhook-origin.ts.
  await logWebhookOriginMismatches(body, { verified: signature.verified, mode: signature.mode })

  // Evita logs gigantes: guardamos payload estruturado em DB (whatsapp_status_events)
  // e fazemos logs de alto nível aqui.
  console.log('📨 Webhook received:', JSON.stringify({
    object: body?.object,
    entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
  }))

  // OTIMIZAÇÃO V2: Paraleliza busca de defaultWorkflowId + keywordWorkflows
  // Antes: 2 queries sequenciais (~200ms cada)
  // Depois: 1 batch paralelo (~200ms total)
  const [defaultWorkflowIdFromDb, allKeywordWorkflows] = await Promise.all([
    settingsDb.get('workflow_builder_default_id'),
    loadKeywordWorkflows(null), // Carrega todos, filtra depois
  ])

  const defaultWorkflowId =
    defaultWorkflowIdFromDb ||
    process.env.WORKFLOW_BUILDER_DEFAULT_ID ||
    null

  // Filtra o workflow padrão (se existir) para evitar execução duplicada
  const keywordWorkflows = defaultWorkflowId
    ? allKeywordWorkflows.filter((w) => w.workflowId !== defaultWorkflowId)
    : allKeywordWorkflows

  try {
    const entries = body.entry || []

    for (const entry of entries) {
      const changes = entry.changes || []

      for (const change of changes) {
        // =========================================================
        // Template Status Updates (Meta)
        // =========================================================
        const rawTemplateUpdates =
          change.value?.message_template_status_update ??
          change.value?.message_template_status_updates ??
          []

        const templateUpdates = Array.isArray(rawTemplateUpdates)
          ? rawTemplateUpdates
          : rawTemplateUpdates
            ? [rawTemplateUpdates]
            : []

        // Sem assinatura verificada qualquer um forja "template X → REJECTED/APPROVED"
        // pelo nome. O status real é ressincronizado pela Graph (Templates > Sincronizar),
        // então aqui só aplicamos o que veio comprovadamente da Meta.
        if (templateUpdates.length > 0 && !signature.verified) {
          console.warn(
            `[Webhook] ${templateUpdates.length} message_template_status_update ignorado(s): requisição sem assinatura verificada (modo ${signature.mode}). ` +
              'Sincronize os templates em Templates para atualizar o status; configure o App Secret para aplicar em tempo real.'
          )
        }
        const verifiedTemplateUpdates = signature.verified ? templateUpdates : []

        for (const tu of verifiedTemplateUpdates) {
          const templateId = (tu?.message_template_id || tu?.id || null) as string | null
          const templateName = (tu?.message_template_name || tu?.name || null) as string | null
          const eventRaw = (tu?.event || tu?.status || tu?.message_template_status || tu?.template_status || '') as string
          const reason = (tu?.reason || tu?.rejected_reason || tu?.reason_text || tu?.details || '') as string

          const event = String(eventRaw || '').toUpperCase()
          if (!templateId && !templateName) continue

          // Normaliza para os status mais comuns da Meta
          let newStatus = event
          if (!newStatus) newStatus = 'PENDING'
          if (newStatus === 'DISABLED') newStatus = 'REJECTED'

          try {
            // Tenta atualizar por meta_id primeiro (mais confiável)
            let updated = false
            if (templateId) {
              const { data, error } = await supabase
                .from('templates')
                .update({
                  status: newStatus,
                  meta_id: templateId,
                  rejected_reason: newStatus === 'REJECTED' && reason ? reason : null,
                  updated_at: new Date().toISOString(),
                })
                .eq('meta_id', templateId)
                .select('id')

              if (error) throw error
              updated = !!(data && data.length > 0)
            }

            // Fallback: atualizar por nome
            if (!updated && templateName) {
              const { data, error } = await supabase
                .from('templates')
                .update({
                  status: newStatus,
                  ...(templateId ? { meta_id: templateId } : {}),
                  rejected_reason: newStatus === 'REJECTED' && reason ? reason : null,
                  updated_at: new Date().toISOString(),
                })
                .eq('name', templateName)
                .select('id')

              if (error) throw error
              updated = !!(data && data.length > 0)
            }

            console.log(`🧩 Template status update: ${templateName || templateId} -> ${newStatus}${reason ? ` (${reason})` : ''}`)
          } catch (e) {
            console.error('Failed to process template status update:', e)
          }
        }

        const statuses = change.value?.statuses || []

        // =========================================================
        // Message Status Updates (durável + idempotente)
        // - 1) Persistimos o evento em whatsapp_status_events (nunca perde)
        // - 2) Aplicamos no campaign_contacts (idempotente)
        // - 3) Em erro de persistência/aplicação, retornamos 500 para forçar retry
        // =========================================================
        for (const statusUpdate of statuses) {
          const messageId = String(statusUpdate?.id || '').trim()
          const status = normalizeMetaStatus(statusUpdate?.status)
          try {
            const errs = Array.isArray((statusUpdate as any)?.errors) ? (statusUpdate as any).errors : []
            const firstErr = errs?.[0]
            const hasErr = !!firstErr
            if (status === 'failed' || hasErr) {
            }
          } catch {}
          if (!messageId || !status) continue

          // Dedupe: garantido no Postgres pelo UNIQUE dedupe_key do upsert em
          // recordStatusEvent (whatsapp_status_events). Sem pré-filtro Redis.
          const { iso: eventTsIso, raw: eventTsRaw } = tryParseWebhookTimestampSeconds((statusUpdate as any)?.timestamp)

          // (A) Persistir evento primeiro (durável)
          let eventId: string | null = null
          try {
            const payloadSubset = {
              waba_id: entry?.id || null,
              phone_number_id: change?.value?.metadata?.phone_number_id || null,
            }

            const rec = await recordStatusEvent({
              messageId,
              status,
              eventTsIso,
              eventTsRaw,
              recipientId: (statusUpdate as any)?.recipient_id || null,
              errors: (statusUpdate as any)?.errors ?? null,
              payload: payloadSubset,
            })
            eventId = rec.id
          } catch (e) {
            // Compat: se a migração ainda não foi aplicada em produção,
            // não podemos 500ar para sempre. Seguimos sem “durable inbox” até o banco estar pronto.
            if (isMissingTableError(e, 'whatsapp_status_events')) {
              console.warn('[Webhook] Tabela whatsapp_status_events ausente — seguindo sem persistência (compat):', e)
              eventId = null
            } else {
              console.error('[Webhook] Falha ao persistir whatsapp_status_events:', e)
              return NextResponse.json(
                { status: 'error', error: 'Falha ao persistir evento do webhook (retry)' },
                { status: 500 }
              )
            }
          }

          // (B) Aplicar no banco (fonte da verdade)
          try {
            if (status === 'failed') {
              // Mantemos o tratamento rico existente (alerts/supressão/opt-out)
              // para não regredir features.

              const { data: rows, error: lookupErr } = await supabase
                .from('campaign_contacts')
                .select('id, status, campaign_id, phone, trace_id, delivered_at')
                .eq('message_id', messageId)
                .limit(1)

              if (lookupErr) throw lookupErr
              const existingUpdate = Array.isArray(rows) ? rows[0] : (rows as any)
              if (!existingUpdate) {
                if (eventId) {
                  await markEventAttempt({ eventId, state: 'unmatched', error: 'campaign_contact_not_found' })
                  await enqueueWebhookStatusReconcileBestEffort('unmatched_failed')
                }
                continue
              }

              const campaignId = existingUpdate.campaign_id
              const phone = existingUpdate.phone
              const traceId = (existingUpdate as any).trace_id as string | null
              const phoneMasked = maskPhone(phone)

              const errors = (statusUpdate as any)?.errors
              const metaError = errors?.[0] || null
              const errorCode = metaError?.code || 0
              const errorTitle = metaError?.title || 'Unknown error'
              const metaMessage = metaError?.message || ''
              const metaDetails = metaError?.error_data?.details || ''
              const errorDetails = metaDetails || metaMessage
              const errorHref = metaError?.href || ''

              const mappedError = mapWhatsAppError(errorCode)
              const failureReason = getUserFriendlyMessageForMetaError({
                code: errorCode,
                title: errorTitle,
                message: metaMessage,
                details: metaDetails,
              })
              const recommendedAction = getRecommendedActionForMetaError({
                code: errorCode,
                title: errorTitle,
                message: metaMessage,
                details: metaDetails,
              })

              console.log(
                `❌ Failed: ${phoneMasked || phone} - [${errorCode}] ${errorTitle} (campaign: ${campaignId})${traceId ? ` (traceId: ${traceId})` : ''}`
              )
              console.log(`   Category: ${mappedError.category}, Retryable: ${mappedError.retryable}`)

              if (traceId) {
                await emitWorkflowTrace({
                  traceId,
                  campaignId,
                  step: 'webhook',
                  phase: 'webhook_failed_details',
                  ok: false,
                  phoneMasked,
                  extra: {
                    messageId,
                    errorCode,
                    errorTitle,
                    errorDetails,
                    category: mappedError.category,
                    retryable: mappedError.retryable,
                  },
                })
              }

              const nowFailed = eventTsIso || new Date().toISOString()

              const { data: updatedRowsFailed, error: updateErrorFailed } = await supabase
                .from('campaign_contacts')
                .update({
                  status: 'failed',
                  failed_at: nowFailed,
                  failure_code: errorCode,
                  failure_reason: failureReason,
                  failure_title: normalizeMetaErrorTextForStorage(errorTitle, 200),
                  failure_details: normalizeMetaErrorTextForStorage(errorDetails, 800),
                  failure_href: normalizeMetaErrorTextForStorage(errorHref, 400),
                })
                .eq('message_id', messageId)
                .neq('status', 'failed')
                .select('id')

              if (updateErrorFailed) throw updateErrorFailed

              if (updatedRowsFailed && updatedRowsFailed.length > 0) {
                const { error: rpcError } = await supabase.rpc('increment_campaign_stat', {
                  campaign_id_input: campaignId,
                  field: 'failed',
                })

                if (rpcError) console.error('Failed to increment failed count:', rpcError)

                if (isCriticalError(errorCode)) {
                  await supabase.from('account_alerts').upsert({
                    id: `alert_${errorCode}_${Date.now()}`,
                    type: mappedError.category,
                    code: errorCode,
                    message: failureReason,
                    details: JSON.stringify({ title: errorTitle, details: errorDetails, action: recommendedAction }),
                    created_at: nowFailed,
                  })
                }

                if (isOptOutError(errorCode)) {
                  await markContactOptOutAndSuppress({
                    phoneRaw: phone,
                    source: 'meta_opt_out_error',
                    reason: failureReason || `Opt-out detectado pela Meta (código ${errorCode})`,
                    metadata: {
                      messageId,
                      errorCode,
                      errorTitle,
                      errorDetails,
                    },
                  })
                }

                try {
                  await maybeAutoSuppressByFailure({
                    phone,
                    failureCode: errorCode,
                    failureTitle: errorTitle,
                    failureDetails: errorDetails,
                    failureHref: errorHref,
                    campaignId,
                    campaignContactId: existingUpdate.id,
                    messageId,
                  })
                } catch (e) {
                  console.warn('[Webhook] Falha ao aplicar auto-supressão (best-effort):', e)
                }
              }

              if (eventId) {
                await markEventAttempt({ eventId, state: 'applied', campaignId, campaignContactId: existingUpdate.id })
              }
              continue
            }

            const result = await applyStatusUpdateToCampaignContact({
              messageId,
              status,
              eventTsIso,
              errors: (statusUpdate as any)?.errors ?? null,
            })

            // Trace "positivo" (delivered/read) para fechar o loop na timeline do run.
            // Observação: para status='failed' existe um caminho rico separado acima.
            if (result.reason === 'applied' && result.traceId && (status === 'delivered' || status === 'read')) {
              await emitWorkflowTrace({
                traceId: String(result.traceId),
                campaignId: result.campaignId,
                step: 'webhook',
                phase: status === 'delivered' ? 'webhook_delivered_applied' : 'webhook_read_applied',
                ok: true,
                phoneMasked: result.phone ? maskPhone(result.phone) : undefined,
                extra: {
                  messageId,
                  status,
                  eventTsIso: eventTsIso || null,
                },
              })
            }

            // T048: Update inbox message delivery status (best-effort)
            try {
              await handleDeliveryStatus({
                messageId,
                status: status as 'sent' | 'delivered' | 'read' | 'failed',
                timestamp: eventTsIso || undefined,
                errors: (statusUpdate as any)?.errors ?? undefined,
              })
            } catch (inboxError) {
              // Best-effort: don't fail webhook if inbox update fails
              console.warn('[Webhook] Failed to update inbox delivery status:', inboxError)
            }

            if (eventId) {
              if (result.reason === 'applied') {
                await markEventAttempt({
                  eventId,
                  state: 'applied',
                  campaignId: result.campaignId || null,
                  campaignContactId: result.campaignContactId || null,
                })
              } else if (result.reason === 'unmatched') {
                await markEventAttempt({ eventId, state: 'unmatched', error: 'campaign_contact_not_found' })
                await enqueueWebhookStatusReconcileBestEffort('unmatched_status')
              } else {
                await markEventAttempt({
                  eventId,
                  state: 'pending',
                  campaignId: result.campaignId || null,
                  campaignContactId: result.campaignContactId || null,
                })
              }
            }
          } catch (e) {
            console.error('[Webhook] Falha ao aplicar status no DB:', e)
            if (eventId) {
              await markEventAttempt({ eventId, state: 'error', error: e instanceof Error ? e.message : String(e) })
              await enqueueWebhookStatusReconcileBestEffort('apply_error')
            }
            return NextResponse.json(
              { status: 'error', error: e instanceof Error ? e.message : String(e) },
              { status: 500 }
            )
          }
        }

        // =====================================================================
        // Process incoming messages (Chatbot Engine Disabled in Template)
        // =====================================================================
        const messages = change.value?.messages || []
        for (const message of messages) {
          const from = message.from
          const messageType = message.type
          const text = extractInboundText(message)
          const { sourceType, buttonPayload } = extractInboundSource(message)
          const phoneNumberId = change?.value?.metadata?.phone_number_id || null
          console.log(`📩 Incoming message from ${from}: ${messageType}${text ? ` | text="${text}"` : ''}${sourceType !== 'text' ? ` | source=${sourceType}` : ''}`)

          // Debug log no DB (backup garantido pra debug de prod)
          try {
            const debugDb = getSupabaseAdmin()
            if (debugDb) {
              debugDb.from('webhook_debug_logs').insert({
                phase: 'message_received',
                phone: from,
                text_preview: text?.slice(0, 100) || null,
                details: { messageType, messageId: message?.id, timestamp: message?.timestamp },
              }).then(() => {})
            }
          } catch {}

          // =================================================================
          // T046-T047: Persist to Inbox and trigger AI if mode=bot
          // =================================================================
          try {
            const inboxResult = await handleInboundMessage({
              messageId: message.id || '',
              from,
              type: messageType,
              text,
              timestamp: message.timestamp,
              mediaUrl: message.image?.url || message.video?.url || message.audio?.url || message.document?.url || null,
              phoneNumberId: phoneNumberId || undefined,
              sourceType,
              buttonPayload,
            })
            console.log(`📥 Inbox: conversation=${inboxResult.conversationId}, message=${inboxResult.messageId}, ai=${inboxResult.triggeredAI}`)
          } catch (inboxError) {
            // Best-effort: don't fail webhook if inbox persist fails
            console.warn('[Webhook] Failed to persist to inbox:', inboxError)
          }

          // =================================================================
          // Campaign auto-reply (Story 001): responde conforme config da campanha
          //   - quick_reply match (texto == botão) → envia resposta mapeada
          //   - senão, fallback_response (se configurado)
          //   - senão, nada
          // Status do contato sempre vira 'replied' (para não disparar de novo).
          // IMPORTANTE: este bloco roda ANTES do workflow builder (que tem `continue`
          // em pending_conversation). Garante que a resposta automática da campanha
          // tenha prioridade sobre qualquer workflow.
          // =================================================================
          console.log('[AutoReply] entering block — text:', text ? `"${text}"` : '(empty)', 'from:', maskPhone(from))

          // Debug log no DB
          try {
            const _debugDb = getSupabaseAdmin()
            if (_debugDb) {
              _debugDb.from('webhook_debug_logs').insert({
                phase: 'autoreply_enter',
                phone: from,
                text_preview: text?.slice(0, 100) || null,
                details: { hasText: !!text, hasFrom: !!from, isOptOut: text ? isOptOutKeyword(text) : false },
              }).then(() => {})
            }
          } catch {}

          if (text && from && !isOptOutKeyword(text)) {
            try {
              const db = getSupabaseAdmin()
              if (db) {
                // Gera variantes de telefone — cobre o "bug do 9" brasileiro: Meta pode enviar
                // o número SEM o 9 (12 dígitos) mesmo que esteja salvo COM (13 dígitos), ou vice-versa.
                const digits = String(from).replace(/\D/g, '')
                const variants = new Set<string>([digits, `+${digits}`])
                if (digits.startsWith('55') && digits.length === 12) {
                  // 55 + DDD(2) + 8 dígitos → adiciona 9 depois do DDD
                  const withNine = `${digits.slice(0, 4)}9${digits.slice(4)}`
                  variants.add(withNine)
                  variants.add(`+${withNine}`)
                } else if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
                  // 55 + DDD(2) + 9 + 8 dígitos → remove 9 para legacy
                  const withoutNine = `${digits.slice(0, 4)}${digits.slice(5)}`
                  variants.add(withoutNine)
                  variants.add(`+${withoutNine}`)
                }
                const phoneVariants = Array.from(variants)
                console.log('[AutoReply] check phone:', maskPhone(from), 'variants:', phoneVariants.length, 'text:', JSON.stringify(text))

                // 1) Acha o campaign_contact (qualquer status exceto replied/failed — mais permissivo)
                const { data: ccRows, error: ccErr } = await db
                  .from('campaign_contacts')
                  .select('id, campaign_id, status, sent_at')
                  .in('phone', phoneVariants)
                  .in('status', ['pending', 'sent', 'delivered', 'read'])
                  .order('sent_at', { ascending: false, nullsFirst: false })
                  .limit(1)

                if (ccErr) {
                  console.log('[AutoReply] campaign_contacts query error:', ccErr.message)
                }

                const campaignContact = ccRows?.[0]
                console.log('[AutoReply] cc found:', !!campaignContact, 'campaign_id:', campaignContact?.campaign_id, 'status:', campaignContact?.status)

                if (campaignContact) {
                  // 2) Busca config da campanha (query separada)
                  const { data: campaignRow, error: campErr } = await db
                    .from('campaigns')
                    .select('id, quick_reply_responses, fallback_response')
                    .eq('id', campaignContact.campaign_id)
                    .single()

                  if (campErr) {
                    console.log('[AutoReply] campaigns query error:', campErr.message)
                  }

                  const qrMap: Record<string, string> | null = (campaignRow as any)?.quick_reply_responses ?? null
                  const fallback: string | null = (campaignRow as any)?.fallback_response ?? null
                  console.log('[AutoReply] campaign config:', { hasQuickReplies: !!qrMap, quickReplyKeys: qrMap ? Object.keys(qrMap) : [], hasFallback: !!fallback })

                  const received = String(text).trim().toLowerCase()
                  let replyText: string | null = null
                  let matchType: 'quick' | 'fallback' | null = null

                  if (qrMap && typeof qrMap === 'object') {
                    const matched = Object.entries(qrMap).find(
                      ([key]) => String(key).trim().toLowerCase() === received
                    )
                    if (matched && String(matched[1] || '').trim() !== '') {
                      replyText = String(matched[1])
                      matchType = 'quick'
                      console.log('[AutoReply] quick_reply matched:', JSON.stringify(matched[0]))
                    }
                  }
                  if (!replyText && fallback && String(fallback).trim() !== '') {
                    replyText = String(fallback)
                    matchType = 'fallback'
                    console.log('[AutoReply] using fallback')
                  }

                  // AC5: sempre marca como replied (await para garantir)
                  const { error: updErr } = await db
                    .from('campaign_contacts')
                    .update({ status: 'replied' })
                    .eq('id', campaignContact.id)
                  if (updErr) {
                    console.log('[AutoReply] mark replied failed:', updErr.message)
                  } else {
                    console.log('[AutoReply] marked cc as replied:', campaignContact.id)
                  }

                  // ===============================================================
                  // Gatilho "Respondeu ao disparo" (CampaignReply): dispara os
                  // workflows publicados que casam com esta campanha/frase.
                  // Auto-dedupe: o replied acima tira o contato da elegibilidade,
                  // então reentrega da Meta não redispara.
                  // ===============================================================
                  try {
                    const replyWorkflows = await loadCampaignReplyWorkflows()
                    if (replyWorkflows.length > 0) {
                      const normalizedReply = normalizeInboundText(text)
                      for (const wf of replyWorkflows) {
                        if (wf.campaignId && wf.campaignId !== campaignContact.campaign_id) continue
                        if (
                          wf.replyFilter &&
                          !normalizedReply.includes(normalizeInboundText(wf.replyFilter))
                        ) {
                          continue
                        }
                        if (!(await passesReentryGate(db, wf.workflowId, phoneVariants))) {
                          console.log('[CampaignReply] blocked by re-entry:', wf.workflowId)
                          continue
                        }
                        console.log('[CampaignReply] dispatching workflow:', wf.workflowId)
                        reinvokeSelf(`/api/builder/workflow/${wf.workflowId}/execute`, {
                          input: {
                            from,
                            to: from,
                            message: text,
                            campaignId: campaignContact.campaign_id,
                          },
                        })
                      }
                    }
                  } catch (crErr) {
                    console.error('[CampaignReply] dispatch failed:', crErr)
                  }

                  // Envia só se houver resposta configurada
                  if (replyText && matchType) {
                    // Delay defensivo contra rate limit (1 msg / 6s Meta) e greeting automática do
                    // WhatsApp Business que pode chegar simultaneamente ao click do botão.
                    const AUTO_REPLY_DELAY_MS = 4500
                    console.log('[AutoReply] scheduling send to:', maskPhone(from), 'matchType:', matchType, 'delayMs:', AUTO_REPLY_DELAY_MS, 'textPreview:', replyText.slice(0, 40))
                    await new Promise((r) => setTimeout(r, AUTO_REPLY_DELAY_MS))
                    const sendResult = await sendWhatsAppMessage({
                      to: from,
                      type: 'text',
                      text: replyText,
                    })
                    console.log('[AutoReply] send result:', { success: sendResult.success, error: sendResult.error })

                    if (sendResult.success) {
                      const { error: rpcErr } = await db.rpc('increment_campaign_auto_reply_counters', {
                        p_campaign_id: campaignContact.campaign_id,
                        p_match_type: matchType,
                      })
                      if (rpcErr) {
                        console.log('[AutoReply] counter RPC failed:', rpcErr.message)
                      } else {
                        console.log('[AutoReply] counter incremented for campaign:', campaignContact.campaign_id, 'matchType:', matchType)
                      }

                      try {
                        await persistOutboundToInbox({
                          phone: from,
                          content: replyText,
                          messageType: 'text',
                          whatsappMessageId: sendResult.messageId || null,
                          payload: {
                            type: 'campaign_auto_reply',
                            campaign_id: campaignContact.campaign_id,
                            match_type: matchType,
                            synced_at: new Date().toISOString(),
                          },
                        })
                      } catch (err) {
                        console.warn('[AutoReply] persistOutbound failed:', err)
                      }
                    }
                  } else {
                    console.log('[AutoReply] no auto-reply configured for this campaign; skipping send')
                  }
                } else {
                  console.log('[AutoReply] no eligible campaign_contact found')
                }
              } else {
                console.log('[AutoReply] supabase admin not available')
              }
            } catch (autoReplyErr) {
              console.error('[AutoReply] exception:', autoReplyErr)
            }
          } else {
            console.log('[AutoReply] skipped — text empty or opt-out keyword')
          }

          // =================================================================
          // Dedupe de inbound (Meta at-least-once): garante que um mesmo message.id
          // dispare o fluxo (resume/execute) UMA vez só. Sem isto, uma reentrega da
          // Meta reenviaria as mensagens antes do primeiro wait (double-send). Fase D.
          // =================================================================
          const inboundMsgId = String(message?.id || '')
          let isNewInboundForWorkflow = true
          if (inboundMsgId) {
            const { data: dedupeRow } = await supabaseAdmin
              .from('processed_inbound_messages')
              .upsert(
                { message_id: inboundMsgId },
                { onConflict: 'message_id', ignoreDuplicates: true }
              )
              .select('message_id')
              .maybeSingle()
            // Sem linha retornada = conflito (já processado) → não redisparar o fluxo.
            isNewInboundForWorkflow = !!dedupeRow
          }

          // =================================================================
          // Stop on Response (settings do workflow): resposta cancela waits
          // de Delay dos fluxos com a opção ligada.
          // =================================================================
          if (isNewInboundForWorkflow && text && from) {
            try {
              await cancelDelayWaitsOnResponse(supabaseAdmin, from)
            } catch (sorErr) {
              console.warn('[StopOnResponse] failed:', sorErr)
            }
          }

          // =================================================================
          // Workflow Builder (MVP): resume pending conversation if any
          // =================================================================
          const normalizedFrom = normalizePhoneNumber(from)
          if (isNewInboundForWorkflow && normalizedFrom && text) {
            const pendingConversation = await getPendingConversation(
              supabaseAdmin,
              normalizedFrom
            )
            if (pendingConversation) {
              // Fase D: chamada interna autenticada (verifyCronRequest), fire-and-forget
              // via after() — responde rápido ao Meta. Antes já era fetch direto.
              reinvokeSelf(
                `/api/builder/workflow/${pendingConversation.workflow_id}/resume`,
                {
                  conversationId: pendingConversation.id,
                  input: { from: normalizedFrom, to: normalizedFrom, message: text },
                }
              )
              continue
            }
          }

          // =================================================================
          // Workflow Builder (MVP): run keyword/default workflow
          // =================================================================
          const matchedWorkflowId = findMatchingWorkflow(keywordWorkflows, text)
          const targetWorkflowId = matchedWorkflowId || defaultWorkflowId

          if (isNewInboundForWorkflow && targetWorkflowId && text && from) {
            try {
              const companyId = await getCompanyId(supabaseAdmin)
              await ensureWorkflowRecord(supabaseAdmin, targetWorkflowId, companyId)

              // Fase D (migração QStash→pg_cron): dispara o workflow via chamada interna
              // autenticada (verifyCronRequest) em vez do QStash WorkflowClient.trigger.
              // Fire-and-forget via after() — o webhook responde rápido ao Meta.
              reinvokeSelf(
                `/api/builder/workflow/${targetWorkflowId}/execute`,
                { input: { from, to: from, message: text } }
              )
            } catch (e) {
              console.error('[Webhook] Failed to trigger builder workflow:', e)
            }
          }

          // =================================================================
          // WhatsApp Flows (MVP sem endpoint): captura submissão final
          // interactive.type = 'nfm_reply' com response_json
          // =================================================================
          try {
            const interactiveType = message?.interactive?.type
            const nfm = message?.interactive?.nfm_reply

            if (messageType === 'interactive' && interactiveType === 'nfm_reply' && nfm?.response_json) {
              const messageId = (message?.id || '') as string
              const phoneNumberId = (change?.value?.metadata?.phone_number_id || null) as string | null
              const wabaId = (entry?.id || null) as string | null

              const normalizedFrom = normalizePhoneNumber(from)

              // Best-effort: resolve contact_id
              let contactId: string | null = null
              try {
                const { data: contacts } = await supabase
                  .from('contacts')
                  .select('id')
                  .eq('phone', normalizedFrom)
                  .limit(1)

                contactId = contacts?.[0]?.id ?? null
              } catch {
                // ignore (best-effort)
              }

              const responseRaw = typeof nfm.response_json === 'string' ? nfm.response_json : JSON.stringify(nfm.response_json)
              const responseJson = safeParseJson(nfm.response_json)
              const messageTimestamp = tryParseWebhookTimestampSeconds(message?.timestamp).iso

              // IMPORTANTE: Meta WhatsApp retorna flow_token DENTRO do response_json, não no nfm diretamente
              let flowId = (nfm?.flow_id || nfm?.flowId || (responseJson as any)?.flow_id || null) as string | null
              const flowName = (nfm?.name || null) as string | null
              let flowToken = (nfm?.flow_token || nfm?.flowToken || (responseJson as any)?.flow_token || null) as string | null
              if (!flowToken && messageId) {
                try {
                  const { data: rows } = await supabase
                    .from('flow_submissions')
                    .select('flow_token,flow_id')
                    .eq('message_id', messageId)
                    .limit(1)
                  const row = Array.isArray(rows) ? rows[0] : (rows as any)
                    if (row?.flow_token && typeof row.flow_token === 'string') {
                      flowToken = row.flow_token
                    }
                  if (!flowId && row?.flow_id) {
                    flowId = row.flow_id
                  }
                } catch {}
              }
              if (!flowToken && normalizedFrom) {
                try {
                  const { data: rows } = await supabase
                    .from('flow_submissions')
                    .select('flow_token,flow_id,created_at')
                    .eq('from_phone', normalizedFrom)
                    .order('created_at', { ascending: false })
                    .limit(1)
                  const row = Array.isArray(rows) ? rows[0] : (rows as any)
                  if (row?.flow_token && typeof row.flow_token === 'string') {
                    flowToken = row.flow_token
                  }
                  if (!flowId && row?.flow_id) {
                    flowId = row.flow_id
                  }
                } catch {}
              }
              const campaignId = extractCampaignIdFromFlowToken(flowToken)

              // Best-effort: mapping para campos do Dispara
              let flowLocalId: string | null = null
              let mappedData: Record<string, unknown> | null = null
              let mappedAt: string | null = null
              let flowJsonForChoiceMap: unknown | null = null
              let choiceTitleMap: Record<string, Record<string, string>> | null = null
              let fieldLabelMap: Record<string, string> | null = null
              let confirmationConfig: {
                title?: string
                footer?: string
                fields?: string[]
                labels?: Record<string, string>
              } | null = null

              const metaFlowIdFromToken = extractMetaFlowIdFromDisparaToken(flowToken)
              const metaFlowIdMismatch = !!(flowId && metaFlowIdFromToken && flowId !== metaFlowIdFromToken)
              const metaFlowIdForLookup = metaFlowIdFromToken || flowId
              if (metaFlowIdForLookup && responseJson && typeof responseJson === 'object') {
                try {
                  const { data: flowRows } = await supabase
                    .from('flows')
                    .select('id,mapping,flow_json,spec')
                    .eq('meta_flow_id', metaFlowIdForLookup)
                    .limit(1)

                  const flowRow = Array.isArray(flowRows) ? flowRows[0] : (flowRows as any)
                  const specConfig = extractConfirmationConfigFromSpec(flowRow?.spec ?? null)
                  if (flowRow?.id && flowRow?.mapping) {
                    flowLocalId = String(flowRow.id)
                    const applied = await applyFlowMappingToContact({
                      normalizedPhone: normalizedFrom,
                      flowId,
                      responseJson,
                      mapping: flowRow.mapping,
                    })
                    if (applied.updated) {
                      mappedData = applied.mappedData
                      mappedAt = new Date().toISOString()
                    }
                  }

                  // Best-effort: tenta carregar flow_json para mapear IDs -> títulos em campos de opção.
                  if (flowRow?.id) {
                    try {
                      flowJsonForChoiceMap = flowRow?.flow_json ?? null
                      if (!flowJsonForChoiceMap) {
                        const { data: jsonRows } = await supabase
                          .from('flows')
                          .select('flow_json')
                          .eq('id', String(flowRow.id))
                          .limit(1)
                        const row = Array.isArray(jsonRows) ? jsonRows[0] : (jsonRows as any)
                        flowJsonForChoiceMap = row?.flow_json ?? null
                      }
                      choiceTitleMap = buildOptionTitleMapFromFlowJson(flowJsonForChoiceMap)
                      fieldLabelMap = buildFieldLabelMapFromFlowJson(flowJsonForChoiceMap)
                      confirmationConfig = extractConfirmationConfigFromFlowJson(flowJsonForChoiceMap)
                      if (!confirmationConfig.title && !confirmationConfig.footer && !confirmationConfig.fields && !confirmationConfig.labels) {
                        confirmationConfig = specConfig
                      }
                    } catch (e) {
                      // ignore (best-effort)
                    }
                  }
                } catch (e) {
                  console.warn('[Webhook] Falha ao aplicar mapping do Flow (best-effort):', e)
                }
              }

              if (!flowLocalId && flowName && typeof flowName === 'string') {
                try {
                  const { data: flowRowsByName } = await supabase
                    .from('flows')
                    .select('id,flow_json,spec')
                    .eq('name', flowName)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                  const rowByName = Array.isArray(flowRowsByName) ? flowRowsByName[0] : (flowRowsByName as any)
                  if (rowByName?.id) {
                    flowLocalId = String(rowByName.id)
                    flowJsonForChoiceMap = rowByName.flow_json ?? null
                    choiceTitleMap = buildOptionTitleMapFromFlowJson(flowJsonForChoiceMap)
                    fieldLabelMap = buildFieldLabelMapFromFlowJson(flowJsonForChoiceMap)
                    confirmationConfig = extractConfirmationConfigFromFlowJson(flowJsonForChoiceMap)
                    if (!confirmationConfig.title && !confirmationConfig.footer && !confirmationConfig.fields && !confirmationConfig.labels) {
                      confirmationConfig = extractConfirmationConfigFromSpec(rowByName?.spec ?? null)
                    }
                  }
                } catch (e) {
                  // ignore (best-effort)
                }
              }

              if (messageId) {
                // Primeira tentativa: com campos novos (flow_local_id/mapped_data)
                let upsertError: any = null
                try {
                  const { error } = await supabase
                    .from('flow_submissions')
                    .upsert(
                      {
                        message_id: messageId,
                        from_phone: normalizedFrom,
                        contact_id: contactId,
                        flow_id: flowId,
                        flow_name: flowName,
                        flow_token: flowToken,
                        ...(campaignId ? { campaign_id: campaignId } : {}),
                        response_json_raw: responseRaw,
                        response_json: responseJson,
                        waba_id: wabaId,
                        phone_number_id: phoneNumberId,
                        message_timestamp: messageTimestamp,
                        ...(flowLocalId ? { flow_local_id: flowLocalId } : {}),
                        ...(mappedData ? { mapped_data: mappedData } : {}),
                        ...(mappedAt ? { mapped_at: mappedAt } : {}),
                      },
                      { onConflict: 'message_id' }
                    )
                  upsertError = error
                } catch (e) {
                  upsertError = e
                }

                // Fallback: bancos sem migração ainda (evita 500 e mantém captura)
                if (
                  upsertError &&
                  (isMissingColumnError(upsertError, 'flow_local_id') ||
                    isMissingColumnError(upsertError, 'mapped_data') ||
                    isMissingColumnError(upsertError, 'campaign_id'))
                ) {
                  try {
                    const { error } = await supabase
                      .from('flow_submissions')
                      .upsert(
                        {
                          message_id: messageId,
                          from_phone: normalizedFrom,
                          contact_id: contactId,
                          flow_id: flowId,
                          flow_name: flowName,
                          flow_token: flowToken,
                          response_json_raw: responseRaw,
                          response_json: responseJson,
                          waba_id: wabaId,
                          phone_number_id: phoneNumberId,
                          message_timestamp: messageTimestamp,
                        },
                        { onConflict: 'message_id' }
                      )
                    upsertError = error
                  } catch (e) {
                    upsertError = e
                  }
                }

                if (upsertError) {
                  console.warn('[Webhook] Falha ao persistir flow_submissions:', upsertError)
                } else {
                  console.log(`🧾 Flow submission salva (message_id=${messageId}, from=${maskPhone(normalizedFrom)})`)
                }
              }

              // Enviar payload para webhook externo (se configurado)
              try {
                const settings = await getCalendarBookingSettings()
                const timezone = settings?.timezone || 'America/Sao_Paulo'
                const responseObj = (responseJson as any) || {}
                const selectedDate = typeof responseObj.selected_date === 'string' ? responseObj.selected_date : null
                const selectedSlot = typeof responseObj.selected_slot === 'string' ? responseObj.selected_slot : null
                const service = typeof responseObj.selected_service === 'string' ? responseObj.selected_service : null
                const customerName = typeof responseObj.customer_name === 'string' ? responseObj.customer_name : null
                const customerPhone = typeof responseObj.customer_phone === 'string' ? responseObj.customer_phone : null
                const notes = typeof responseObj.notes === 'string' ? responseObj.notes : null
                const formattedDate = selectedDate
                  ? selectedDate.split('-').reverse().join('/')
                  : null
                const formattedWeekday = selectedDate
                  ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: timezone }).format(
                    new Date(`${selectedDate}T00:00:00`)
                  )
                  : null

                await sendExternalWebhook({
                  event: 'flow_submission',
                  source: 'whatsapp',
                  message_id: messageId || null,
                  message_timestamp: messageTimestamp || null,
                  from_phone: normalizedFrom,
                  wa_id: from || null,
                  flow_id: flowId,
                  flow_name: flowName,
                  flow_token: flowToken,
                  phone_number_id: phoneNumberId,
                  waba_id: wabaId,
                  contact_id: contactId,
                  campaign_id: campaignId,
                  selected_service: service,
                  selected_date: selectedDate,
                  selected_slot: selectedSlot,
                  customer_name: customerName,
                  customer_phone: customerPhone,
                  notes,
                  formatted_date: formattedDate,
                  formatted_weekday: formattedWeekday,
                  response_json: responseJson,
                })
              } catch (e) {
                console.warn('[Webhook] Falha ao enviar webhook externo (best-effort):', e)
              }

              // Confirmação automática após conclusão do Flow
              try {
                const token = await getWhatsAppAccessToken()
                if (token && phoneNumberId && normalizedFrom) {
                  const settings = await getCalendarBookingSettings()
                  const timezone = settings?.timezone || 'America/Sao_Paulo'
                  const responseObj =
                    responseJson && typeof responseJson === 'object' ? (responseJson as any) : {}
                  const sendConfirmationFlag =
                    responseObj.send_confirmation ?? responseObj.__send_confirmation ?? null
                  const shouldSendConfirmation = !(
                    sendConfirmationFlag === false ||
                    sendConfirmationFlag === 'false'
                  )

                  try {
                    const keys = Object.keys(responseObj || {})
                  } catch {}

                  if (shouldSendConfirmation) {
                    const configTitle = typeof confirmationConfig?.title === 'string' ? confirmationConfig.title.trim() : ''
                    const configFooter = typeof confirmationConfig?.footer === 'string' ? confirmationConfig.footer.trim() : ''
                    const flowTitleOverride =
                      configTitle ||
                      (typeof responseObj.confirmation_title === 'string'
                        ? responseObj.confirmation_title.trim()
                        : '')
                    const flowFooterOverride =
                      configFooter ||
                      (typeof responseObj.confirmation_footer === 'string'
                        ? responseObj.confirmation_footer.trim()
                        : '')
                    const confirmationTitle =
                      flowTitleOverride ||
                      (typeof responseObj.message === 'string' ? responseObj.message.trim() : '') ||
                      'Agendamento confirmado ✅'
                    const confirmationFooter =
                      flowFooterOverride || 'Qualquer ajuste, responda esta mensagem.'
                    const selectedKeys =
                      Array.isArray(confirmationConfig?.fields) && confirmationConfig?.fields?.length
                        ? new Set(
                            confirmationConfig.fields
                              .filter((x) => typeof x === 'string')
                              .map((x) => String(x).trim())
                              .filter(Boolean),
                          )
                        : Array.isArray((responseObj as any).confirmation_fields)
                          ? new Set(
                              ((responseObj as any).confirmation_fields as unknown[])
                                .filter((x) => typeof x === 'string')
                                .map((x) => String(x).trim())
                                .filter(Boolean),
                            )
                          : null
                    const labelsFromConfig =
                      confirmationConfig?.labels && typeof confirmationConfig.labels === 'object'
                        ? confirmationConfig.labels
                        : null
                    let selectedDate = typeof responseObj.selected_date === 'string' ? responseObj.selected_date : null
                    const selectedSlot = typeof responseObj.selected_slot === 'string' ? responseObj.selected_slot : null
                    const service = typeof responseObj.selected_service === 'string' ? responseObj.selected_service : null
                    const customerName = typeof responseObj.customer_name === 'string' ? responseObj.customer_name : null
                    const customerPhone = typeof responseObj.customer_phone === 'string' ? responseObj.customer_phone : null
                    const notes = typeof responseObj.notes === 'string' ? responseObj.notes : null
                    if (!selectedDate && responseObj && typeof responseObj === 'object') {
                      const dateKey = Object.keys(responseObj as any).find((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
                      if (dateKey) selectedDate = dateKey
                    }
                    const hasBookingFields = Boolean(selectedDate || selectedSlot || service)
                    const rawMessage = typeof responseObj.message === 'string' ? responseObj.message : ''
                    const hasStructuredMessage =
                      !!rawMessage &&
                      (rawMessage.includes('\n') ||
                        /(?:Servico:|Hor[áa]rio:|Nome:|Telefone:|Observa[çc][õo]es:)/i.test(rawMessage))

                    let parts: string[] = []

                    const useStructuredMessage =
                      hasStructuredMessage && !configTitle && !configFooter && !selectedKeys && !labelsFromConfig

                    if (useStructuredMessage) {
                      const footerToAppend =
                        confirmationFooter && !rawMessage.includes(confirmationFooter) ? confirmationFooter : null
                      parts = [rawMessage.trim(), footerToAppend].filter(Boolean) as string[]
                    } else if (hasBookingFields) {
                      const labelFor = (key: string, fallback: string) => {
                        const fromConfig =
                          labelsFromConfig && typeof labelsFromConfig[key] === 'string' ? String(labelsFromConfig[key]).trim() : ''
                        const fromMap =
                          fieldLabelMap && typeof fieldLabelMap[key] === 'string' ? fieldLabelMap[key].trim() : ''
                        return fromConfig || fromMap || fallback
                      }
                      const includeKey = (key: string) => !selectedKeys || selectedKeys.has(key)
                      const formattedDate = selectedDate
                        ? selectedDate.split('-').reverse().join('/')
                        : null
                      const formattedTime = selectedSlot
                        ? new Intl.DateTimeFormat('pt-BR', {
                          timeZone: timezone,
                          hour: '2-digit',
                          minute: '2-digit',
                        }).format(new Date(selectedSlot))
                        : null
                      const formattedWeekday = selectedDate
                        ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: timezone }).format(
                          new Date(`${selectedDate}T00:00:00`)
                        )
                        : null

                      parts = [
                        confirmationTitle,
                        confirmationTitle ? '' : null,
                        includeKey('selected_service') && service ? `${labelFor('selected_service', 'Serviço')}: ${service}` : null,
                        includeKey('selected_date') && formattedDate
                          ? `${labelFor('selected_date', 'Data')}: ${formattedDate}${formattedWeekday ? ` (${formattedWeekday})` : ''}`
                          : null,
                        includeKey('selected_slot') && formattedTime
                          ? `${labelFor('selected_slot', 'Horário')}: ${formattedTime}`
                          : null,
                        includeKey('customer_name') && customerName
                          ? `${labelFor('customer_name', 'Nome')}: ${customerName}`
                          : null,
                        includeKey('customer_phone') && customerPhone
                          ? `${labelFor('customer_phone', 'Telefone')}: ${customerPhone}`
                          : null,
                        includeKey('notes') && notes ? `${labelFor('notes', 'Observações')}: ${notes}` : null,
                        confirmationFooter ? '' : null,
                        confirmationFooter,
                      ].filter((value) => value !== null) as string[]
                    } else {
                      const ignoredKeys = new Set([
                        'flow_id',
                        'flow_token',
                        'flow_name',
                        'event_id',
                        'success',
                        'message',
                        'send_confirmation',
                        '__send_confirmation',
                        'confirmation_title',
                        'confirmation_footer',
                        'confirmation_fields',
                        'confirmation_labels',
                      ])
                      const ignoredKeysLower = new Set(Array.from(ignoredKeys).map((k) => k.toLowerCase()))

                      const entries = Object.entries(responseObj || {}).filter(([key, value]) => {
                        const keyNorm = String(key || '').toLowerCase()
                        if (ignoredKeysLower.has(keyNorm)) {
                          return false
                        }
                        if (selectedKeys && !selectedKeys.has(key)) return false
                        if (value == null) return false
                        if (typeof value === 'string' && !value.trim()) return false
                        return true
                      })

                      const lines = entries.map(([key, value]) => {
                        const responseLabelMap =
                          labelsFromConfig ||
                          (responseObj && typeof responseObj.confirmation_labels === 'object' && !Array.isArray(responseObj.confirmation_labels)
                            ? (responseObj.confirmation_labels as Record<string, unknown>)
                            : null)
                        const labelFromResponse =
                          responseLabelMap && typeof responseLabelMap[key] === 'string' ? String(responseLabelMap[key]).trim() : ''
                        const labelFromMap =
                          fieldLabelMap && typeof fieldLabelMap[key] === 'string' ? fieldLabelMap[key].trim() : ''
                        const label = labelFromResponse
                          ? labelFromResponse
                          : labelFromMap
                            ? labelFromMap
                          : key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
                        let display = ''
                        if (Array.isArray(value)) {
                          if (choiceTitleMap && choiceTitleMap[key]) {
                            const map = choiceTitleMap[key]
                            const mapped = value.map((v) => {
                              if (typeof v === 'string' && map[v]) return map[v]
                              if (typeof v === 'string') return humanizeOptionId(v)
                              return String(v)
                            })
                            display = mapped.join(', ')
                          } else {
                            const mapped = value.map((v) => (typeof v === 'string' ? humanizeOptionId(v) : String(v)))
                            display = mapped.join(', ')
                          }
                        } else if (typeof value === 'string') {
                          if (choiceTitleMap && choiceTitleMap[key] && choiceTitleMap[key][value]) {
                            display = choiceTitleMap[key][value]
                          } else {
                            display = humanizeOptionId(value)
                          }
                        } else if (typeof value === 'boolean') {
                          display = value ? 'Sim' : 'Nao'
                        } else if (typeof value === 'object') {
                          display = JSON.stringify(value)
                        } else {
                          display = String(value)
                        }
                        try {
                          const usedMap =
                            !!choiceTitleMap &&
                            !!choiceTitleMap[key] &&
                            ((typeof value === 'string' && !!choiceTitleMap[key][value]) ||
                              (Array.isArray(value) && value.some((v) => typeof v === 'string' && !!choiceTitleMap?.[key]?.[v])))
                        } catch {}
                        return `${label}: ${display}`
                      })

                      const genericTitle = flowTitleOverride || 'Resposta registrada ✅'
                      const genericFooter = flowFooterOverride || confirmationFooter
                      const rawParts = [
                        genericTitle,
                        '',
                        ...lines,
                        '',
                        genericFooter,
                      ]
                      parts = rawParts.filter((value) => value !== null && value !== undefined) as string[]
                    }

                    try {
                    } catch {}

                    await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to: normalizedFrom,
                        type: 'text',
                        text: { body: parts.join('\n') },
                      }),
                    })
                  }

                }
              } catch (e) {
              }
            }
          } catch (e) {
            console.warn('[Webhook] Falha ao processar Flow submission (best-effort):', e)
          }

          // Opt-out real: usuário envia palavra-chave
          if (text && isOptOutKeyword(text)) {
            console.log(`📵 Opt-out keyword detected from ${from}: "${text}"`)
            await markContactOptOutAndSuppress({
              phoneRaw: from,
              source: 'inbound_keyword',
              reason: 'Usuário solicitou opt-out via mensagem inbound',
              metadata: {
                messageType,
                text,
                messageId: message?.id || null,
                timestamp: message?.timestamp || null,
              },
            })
          }

          // Bloco Campaign auto-reply foi movido para ANTES do workflow builder
          // para evitar ser pulado por "continue" de pending_conversation.
        }
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
  }

  // Always return 200 to acknowledge receipt (Meta requirement)
  return NextResponse.json({ status: 'ok' })
}

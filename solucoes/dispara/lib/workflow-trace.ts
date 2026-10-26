export type WorkflowTraceEvent = {
  tag: 'workflow_trace'
  ts: string
  traceId: string
  campaignId?: string
  step?: string
  batchIndex?: number
  contactId?: string
  phoneMasked?: string
  phase: string
  ms?: number
  ok?: boolean
  extra?: Record<string, unknown>
}

import { supabase } from '@/lib/supabase'

export function maskPhone(phone: string | null | undefined): string {
  const p = String(phone || '').trim()
  if (!p) return ''
  const last4 = p.replace(/\D/g, '').slice(-4)
  return last4 ? `***${last4}` : '***'
}

function isMissingTableError(e: unknown, tableName: string): boolean {
  const code = String((e as any)?.code || '')
  const msg = e instanceof Error ? e.message : String((e as any)?.message || e || '')
  const m = msg.toLowerCase()
  const t = tableName.toLowerCase()

  // Postgres undefined_table
  if (code === '42P01') return true
  if (m.includes('does not exist') && m.includes(t)) return true
  if (m.includes('relation') && m.includes(t)) return true
  if (m.includes('schema cache') && m.includes(t)) return true
  return false
}

function sanitizeExtraForStorage(input: unknown, opts?: { maxDepth?: number; maxString?: number }): Record<string, unknown> | null {
  const maxDepth = Math.max(1, Math.min(8, opts?.maxDepth ?? 4))
  const maxString = Math.max(32, Math.min(5000, opts?.maxString ?? 800))

  const visit = (v: any, depth: number): any => {
    if (v == null) return null
    if (typeof v === 'string') {
      if (v.length <= maxString) return v
      return `${v.slice(0, maxString)}…(truncated ${v.length - maxString})`
    }
    if (typeof v === 'number' || typeof v === 'boolean') return v
    if (v instanceof Date) return v.toISOString()

    if (Array.isArray(v)) {
      if (depth >= maxDepth) return `[array:${v.length}]`
      return v.slice(0, 50).map((x) => visit(x, depth + 1))
    }

    if (typeof v === 'object') {
      if (depth >= maxDepth) return '[object]'
      const out: Record<string, unknown> = {}
      const entries = Object.entries(v as Record<string, unknown>).slice(0, 50)
      for (const [k, val] of entries) {
        out[k] = visit(val, depth + 1)
      }
      return out
    }

    try {
      return String(v)
    } catch {
      return '[unserializable]'
    }
  }

  const normalized = visit(input, 0)
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return null
  return normalized as Record<string, unknown>
}

const TRACE_TABLE = 'campaign_trace_events'

// Para manter custo/volume sob controle, persistimos só eventos de alto sinal por padrão.
const DEFAULT_PERSIST_PHASES = new Set<string>([
  'start',
  'cancelled_before_start',
  'batch_start',
  'batch_end',
  'db_claim_pending_bulk',
  'db_bulk_upsert_contacts',
  'contact_exception',
  // Observabilidade de envio
  'meta_send_ok',
  'meta_send_fail',
  // Retry / refresh de template (mídia weblink 403)
  'template_refresh_retry_start',
  'template_refresh_retry_ok',
  'template_refresh_retry_fail',
  'template_refresh_retry_skip',
  // Rehost de mídia do template (preventivo e reativo)
  'template_media_rehost_prepare_start',
  'template_media_rehost_prepare_ok',
  'template_media_rehost_prepare_skip',
  'template_media_rehost_prepare_error',
  'template_media_rehost_start',
  'template_media_rehost_ok',
  'template_media_rehost_fail',
  'template_media_rehost_skip',
  'webhook_failed_details',
  'webhook_delivered_applied',
  'webhook_read_applied',
  'complete',
  'metrics_batch_insert',
  'metrics_run_upsert',
])

function shouldPersistEvent(e: WorkflowTraceEvent): boolean {
  // Feature flag: permitir persistir tudo durante investigações.
  if (process.env.WORKFLOW_TRACE_PERSIST_ALL === '1') return true
  // Default: sempre persiste erros
  if (e.ok === false) return true
  // Default: persiste fases importantes
  return DEFAULT_PERSIST_PHASES.has(e.phase)
}

let tracePersistenceDisabled = false

async function persistWorkflowTraceEventBestEffort(e: WorkflowTraceEvent): Promise<void> {
  // Compat: permitir desligar persistência explicitamente.
  if (process.env.WORKFLOW_TRACE_PERSIST === '0') return
  if (tracePersistenceDisabled) return
  if (!shouldPersistEvent(e)) return

  try {
    await supabase.from(TRACE_TABLE).insert({
      trace_id: e.traceId,
      ts: e.ts,
      campaign_id: e.campaignId || null,
      step: e.step || null,
      phase: e.phase,
      ok: typeof e.ok === 'boolean' ? e.ok : null,
      ms: typeof e.ms === 'number' ? Math.max(0, Math.floor(e.ms)) : null,
      batch_index: typeof e.batchIndex === 'number' ? Math.floor(e.batchIndex) : null,
      contact_id: e.contactId || null,
      phone_masked: e.phoneMasked || null,
      extra: sanitizeExtraForStorage(e.extra, { maxDepth: 4, maxString: 800 }),
    })
  } catch (err) {
    // Se a tabela ainda não existe (rollout parcial), não podemos ficar tentando a cada evento.
    if (isMissingTableError(err, TRACE_TABLE)) {
      tracePersistenceDisabled = true
      return
    }
    // Best-effort: não quebra execução por falha de observabilidade.
    tracePersistenceDisabled = true
    console.warn('[workflow-trace] failed to persist trace event (disabled for process):', err)
  }
}

export async function emitWorkflowTrace(event: Omit<WorkflowTraceEvent, 'tag' | 'ts'>) {
  const payload: WorkflowTraceEvent = {
    tag: 'workflow_trace',
    ts: new Date().toISOString(),
    ...event,
  }

  // 1) Logs estruturados (aparece no Vercel Logs e é fácil de filtrar por traceId)
  // Não use console.debug: muitas vezes é filtrado dependendo da configuração.
  console.log(JSON.stringify(payload))

  // 2) Persistência best-effort para uma "timeline" consultável no Supabase
  // (útil para debug sem depender de logs distribuídos).
  await persistWorkflowTraceEventBestEffort(payload)
}

export async function timePhase<T>(
  phase: string,
  meta: Omit<WorkflowTraceEvent, 'tag' | 'ts' | 'phase' | 'ms'>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    await emitWorkflowTrace({
      ...meta,
      phase,
      ms: Date.now() - start,
      ok: true,
    })
    return result
  } catch (err) {
    await emitWorkflowTrace({
      ...meta,
      phase,
      ms: Date.now() - start,
      ok: false,
      extra: {
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }
}

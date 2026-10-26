import { z } from 'zod'

export type FlowRow = {
  id: string
  name: string
  status: string
  meta_flow_id: string | null
  meta_status?: string | null
  meta_preview_url?: string | null
  meta_validation_errors?: any
  meta_last_checked_at?: string | null
  meta_published_at?: string | null
  template_key?: string | null
  flow_json?: any
  flow_version?: string | null
  mapping?: any
  spec: any
  created_at: string
  updated_at: string | null
}

const FlowRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  meta_flow_id: z.string().nullable().optional(),
  meta_status: z.string().nullable().optional(),
  meta_preview_url: z.string().nullable().optional(),
  meta_validation_errors: z.any().optional(),
  meta_last_checked_at: z.string().nullable().optional(),
  meta_published_at: z.string().nullable().optional(),
  template_key: z.string().nullable().optional(),
  flow_json: z.any().optional(),
  flow_version: z.string().nullable().optional(),
  mapping: z.any().optional(),
  spec: z.any(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
})

function parseList(raw: unknown): FlowRow[] {
  if (!Array.isArray(raw)) return []
  const out: FlowRow[] = []
  for (const item of raw) {
    const res = FlowRowSchema.safeParse(item)
    if (res.success) out.push(res.data as any)
  }
  return out
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json().catch(() => null)
    const base = (data?.error && String(data.error)) || fallback
    const details = data?.details ? String(data.details) : ''
    return details ? `${base}: ${details}` : base
  } catch {
    return fallback
  }
}

export const flowsService = {
  async list(): Promise<FlowRow[]> {
    const res = await fetch('/api/flows', { method: 'GET', credentials: 'include' })
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Falha ao listar MiniApps'))
    }
    const data = await res.json()
    return parseList(data)
  },

  async create(input: { name: string }): Promise<FlowRow> {
    const res = await fetch('/api/flows', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Falha ao criar MiniApp'))
    }
    const data = await res.json()
    const parsed = FlowRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao criar MiniApp')
    return parsed.data as any
  },

  async createFromTemplate(input: { name: string; templateKey: string }): Promise<FlowRow> {
    const res = await fetch('/api/flows', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Falha ao criar MiniApp'))
    }
    const data = await res.json()
    const parsed = FlowRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao criar MiniApp')
    return parsed.data as any
  },

  async get(id: string): Promise<FlowRow> {
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}`, { method: 'GET', credentials: 'include' })
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Falha ao buscar MiniApp'))
    }
    const data = await res.json()
    const parsed = FlowRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao buscar MiniApp')
    return parsed.data as any
  },

  async update(
    id: string,
    patch: {
      name?: string
      status?: string
      metaFlowId?: string
      resetMeta?: boolean
      spec?: unknown
      templateKey?: string
      flowJson?: unknown
      mapping?: unknown
    }
  ): Promise<FlowRow> {
    const flowJsonObj = patch.flowJson && typeof patch.flowJson === 'object' ? (patch.flowJson as Record<string, unknown>) : null
    // #region agent log
    // #endregion agent log
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Falha ao atualizar MiniApp'))
    }
    // #region agent log
    // #endregion agent log
    const data = await res.json()
    const parsed = FlowRowSchema.safeParse(data)
    if (!parsed.success) throw new Error('Resposta inválida ao atualizar MiniApp')
    return parsed.data as any
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Falha ao excluir MiniApp'))
    }
  },

  async publishToMeta(
    id: string,
    input?: {
      publish?: boolean
      categories?: string[]
      updateIfExists?: boolean
    }
  ): Promise<FlowRow> {
    const res = await fetch(`/api/flows/${encodeURIComponent(id)}/meta/publish`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-debug-client': '1',
      },
      body: JSON.stringify(input || {}),
    })

    const data = await res.json().catch(() => null)
    // #region agent log
    // #endregion agent log
    if (!res.ok) {
      if (data?.debug?.graphError) {
        const ge = data.debug.graphError
        const userTitle = ge.error_user_title ? String(ge.error_user_title) : ''
        const userMsg = ge.error_user_msg ? String(ge.error_user_msg) : ''
        const details = [userTitle, userMsg].filter(Boolean).join(' — ')
        const base = (data?.error && String(data.error)) || 'Falha ao publicar MiniApp na Meta'
        throw new Error(details ? `${base}: ${details}` : base)
      }
      const msg = (data?.error && String(data.error)) || 'Falha ao publicar MiniApp na Meta'
      const details = data?.issues ? `: ${Array.isArray(data.issues) ? data.issues.join(', ') : String(data.issues)}` : ''
      throw new Error(`${msg}${details}`)
    }

    const row = data?.row
    const parsed = FlowRowSchema.safeParse(row)
    if (!parsed.success) throw new Error('Resposta inválida ao publicar MiniApp na Meta')
    return parsed.data as any
  },

  async send(payload: {
    to: string
    flowId: string
    flowToken: string
    body?: string
    ctaText?: string
    footer?: string
    action?: 'navigate' | 'data_exchange'
    actionPayload?: Record<string, unknown>
    flowMessageVersion?: string
  }): Promise<unknown> {
    // #region agent log
    // #endregion agent log
    const res = await fetch('/api/flows/send', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json().catch(() => null)
    // #region agent log
    // #endregion agent log
    if (!res.ok) {
      const msg = data?.error || 'Falha ao enviar MiniApp'
      throw new Error(msg)
    }
    return data
  },

  async generateForm(params: {
    prompt: string
    titleHint?: string
    maxQuestions?: number
  }): Promise<unknown> {
    const res = await fetch('/api/ai/generate-flow-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        titleHint: params.titleHint,
        maxQuestions: params.maxQuestions || 10,
      }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = (data?.error && String(data.error)) || 'Falha ao gerar formulário com IA'
      const details = data?.details ? `: ${String(data.details)}` : ''
      throw new Error(`${msg}${details}`)
    }

    const generatedForm = data?.form || null
    if (!generatedForm) throw new Error('Resposta inválida da IA (form ausente)')

    return generatedForm
  },
}

export type FlowTemplateDTO = {
  key: string
  name: string
  description: string
  flowJson: Record<string, unknown>
  defaultMapping: any
  isDynamic: boolean
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

export const flowTemplatesService = {
  async list(): Promise<FlowTemplateDTO[]> {
    const res = await fetch('/api/flows/templates', { method: 'GET', credentials: 'include' })
    if (!res.ok) throw new Error(await readErrorMessage(res, 'Falha ao listar templates de flow'))
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as FlowTemplateDTO[]
  },
}

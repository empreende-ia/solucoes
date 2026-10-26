import { supabase } from '@/lib/supabase'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  if (v == null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t ? t : null
  }
  // Alguns componentes retornam { id, title } ou arrays; deixamos isso para custom_fields
  return null
}

function deepGetResponseValue(response: Record<string, unknown>, field: string): unknown {
  // MVP: suporta somente acesso direto por chave.
  // Futuro: suportar paths do tipo "a.b.c".
  return response[field]
}

export async function applyFlowMappingToContact(input: {
  normalizedPhone: string
  flowId: string | null
  responseJson: unknown
  mapping: unknown
}): Promise<{ updated: boolean; mappedData: Record<string, unknown> }>
{
  const mappedData: Record<string, unknown> = {}
  if (!isPlainObject(input.responseJson)) return { updated: false, mappedData }
  if (!isPlainObject(input.mapping)) return { updated: false, mappedData }

  const response = input.responseJson
  const now = new Date().toISOString()

  const contactMap = isPlainObject(input.mapping.contact) ? (input.mapping.contact as any) : null
  const nameField = typeof contactMap?.nameField === 'string' ? contactMap.nameField : null
  const emailField = typeof contactMap?.emailField === 'string' ? contactMap.emailField : null

  const updates: Record<string, any> = { updated_at: now }

  if (nameField) {
    const v = deepGetResponseValue(response, nameField)
    if (typeof v === 'string' && v.trim()) {
      updates.name = v.trim()
      mappedData.name = v.trim()
    }
  }

  if (emailField) {
    const v = deepGetResponseValue(response, emailField)
    if (typeof v === 'string' && v.trim()) {
      updates.email = v.trim()
      mappedData.email = v.trim()
    }
  }

  const cfMap = isPlainObject(input.mapping.customFields) ? (input.mapping.customFields as Record<string, unknown>) : null
  const customFieldsUpdates: Record<string, unknown> = {}
  if (cfMap) {
    for (const [disparaKey, flowFieldAny] of Object.entries(cfMap)) {
      const flowField = typeof flowFieldAny === 'string' ? flowFieldAny : null
      if (!flowField) continue
      const v = deepGetResponseValue(response, flowField)
      if (v === undefined) continue
      customFieldsUpdates[disparaKey] = v
    }
  }

  // Se não tem nada para atualizar, encerra
  const hasAny = Object.keys(updates).some((k) => k !== 'updated_at')
  const hasCustomFields = Object.keys(customFieldsUpdates).length > 0
  if (!hasAny && !hasCustomFields) return { updated: false, mappedData }

  // Busca contato atual (para merge seguro de custom_fields)
  const { data: existingRows, error: existingError } = await supabase
    .from('contacts')
    .select('id,custom_fields')
    .eq('phone', input.normalizedPhone)
    .limit(1)

  if (existingError) throw existingError
  const existing = Array.isArray(existingRows) ? existingRows[0] : (existingRows as any)
  if (!existing?.id) return { updated: false, mappedData }

  if (hasCustomFields) {
    const current = isPlainObject(existing.custom_fields) ? (existing.custom_fields as Record<string, unknown>) : {}
    updates.custom_fields = { ...current, ...customFieldsUpdates }
    mappedData.custom_fields = customFieldsUpdates
  }

  // Best-effort: atualiza contato existente por phone.
  // Se não existir, não cria automaticamente (para evitar contatos fantasmas).
  const { data: row, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('phone', input.normalizedPhone)
    .select('id')
    .limit(1)

  if (error) throw error

  const updated = Array.isArray(row) ? row.length > 0 : !!row
  return { updated, mappedData }
}

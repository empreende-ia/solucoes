import { supabase } from '@/lib/supabase'

export type PhoneSuppressionRow = {
  phone: string
  is_active: boolean
  reason: string | null
  source: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  last_seen_at: string | null
  expires_at: string | null
}

export function isSuppressionActive(row: Pick<PhoneSuppressionRow, 'is_active' | 'expires_at'>): boolean {
  if (!row.is_active) return false
  if (!row.expires_at) return true
  const expiresMs = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresMs)) return true
  return expiresMs > Date.now()
}

export async function getActiveSuppressionsByPhone(
  phones: string[]
): Promise<Map<string, PhoneSuppressionRow>> {
  const uniquePhones = Array.from(new Set(phones.map(p => String(p || '').trim()).filter(Boolean)))
  if (uniquePhones.length === 0) return new Map()

  const { data, error } = await supabase
    .from('phone_suppressions')
    .select('phone, is_active, reason, source, metadata, created_at, last_seen_at, expires_at')
    .in('phone', uniquePhones)

  if (error) throw error

  const map = new Map<string, PhoneSuppressionRow>()
  for (const row of (data || []) as any[]) {
    if (!row?.phone) continue
    const normalizedPhone = String(row.phone)
    const typed: PhoneSuppressionRow = {
      phone: normalizedPhone,
      is_active: Boolean(row.is_active),
      reason: row.reason ?? null,
      source: row.source ?? null,
      metadata: (row.metadata ?? null) as any,
      created_at: String(row.created_at || new Date().toISOString()),
      last_seen_at: row.last_seen_at ?? null,
      expires_at: row.expires_at ?? null,
    }
    if (isSuppressionActive(typed)) {
      map.set(normalizedPhone, typed)
    }
  }
  return map
}

export async function upsertPhoneSuppression(input: {
  phone: string
  reason?: string | null
  source?: string | null
  metadata?: Record<string, unknown>
  expiresAt?: string | null
  isActive?: boolean
}): Promise<void> {
  const phone = String(input.phone || '').trim()
  if (!phone) return

  const now = new Date().toISOString()

  // "Upsert" por phone (unique)
  const { error } = await supabase
    .from('phone_suppressions')
    .upsert(
      {
        phone,
        is_active: input.isActive ?? true,
        reason: input.reason ?? null,
        source: input.source ?? null,
        metadata: input.metadata ?? {},
        last_seen_at: now,
        expires_at: input.expiresAt ?? null,
      },
      { onConflict: 'phone' }
    )

  if (error) throw error
}

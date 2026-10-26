import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPrincipal, requireAttendantPermission } from '@/lib/principal'

/**
 * POST /api/push/unsubscribe
 *
 * Remove uma subscription de push do banco.
 * Dono (dashboard) ou atendente com canView (PWA).
 * O atendente só remove as subscriptions ligadas ao próprio token (nunca a do dono).
 */
export async function POST(request: Request) {
  const denied = requireAttendantPermission(request, 'canView')
  if (denied) return denied

  try {
    const { endpoint } = await request.json()

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint obrigatório' }, { status: 400 })
    }

    const principal = getPrincipal(request)
    const attendantTokenId = principal?.kind === 'attendant' ? principal.attendant?.id ?? null : null

    const supabase = await createClient()

    let query = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (attendantTokenId) query = query.eq('attendant_token_id', attendantTokenId)

    const { error } = await query

    if (error) {
      console.error('[Push Unsubscribe] Erro:', error)
      return NextResponse.json({ error: 'Erro ao remover subscription' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Push Unsubscribe] Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

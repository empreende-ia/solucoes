/**
 * GET /api/inbox/unread-count - Quantidade de conversas abertas com mensagens não lidas
 *
 * Substitui a contagem que o browser fazia direto em inbox_conversations com a chave
 * publishable (hooks/useUnreadCount.ts). Política: default 'session' (lib/route-policy.ts)
 * — dono com sessão válida ou API key.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePrincipal } from '@/lib/principal'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const

export async function GET(request: Request) {
  const denied = requirePrincipal(request)
  if (denied) return denied

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase não configurado' },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  try {
    const { count, error } = await supabase
      .from('inbox_conversations')
      .select('id', { count: 'exact', head: true })
      .gt('unread_count', 0)
      .eq('status', 'open')

    if (error) throw error

    return NextResponse.json({ count: count ?? 0 }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('[GET /api/inbox/unread-count]', error)
    return NextResponse.json(
      { error: 'Falha ao contar conversas não lidas' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}

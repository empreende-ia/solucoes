import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPrincipal, requireAttendantPermission } from '@/lib/principal'

/**
 * POST /api/push/subscribe
 *
 * Salva uma nova subscription de push no banco.
 * Dono (dashboard) ou atendente com canView (PWA).
 *
 * A subscription fica ligada a QUEM se inscreveu (`attendant_token_id`):
 * - dono → NULL;
 * - atendente → id do token dele. Assim o envio ignora atendentes desativados/
 *   expirados (lib/push-notifications.ts), a desativação apaga as subscriptions
 *   do token e o DELETE do token as remove em cascata (FK ON DELETE CASCADE).
 *
 * Um atendente não "toma" a subscription do dono: se o endpoint (mesmo navegador)
 * já está registrado para o dono, a linha continua do dono.
 */
export async function POST(request: Request) {
  const denied = requireAttendantPermission(request, 'canView')
  if (denied) return denied

  try {
    const subscription = await request.json()

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Subscription inválida' }, { status: 400 })
    }

    const principal = getPrincipal(request)
    const attendantTokenId = principal?.kind === 'attendant' ? principal.attendant?.id ?? null : null

    const supabase = await createClient()

    if (attendantTokenId) {
      const { data: existing, error: lookupError } = await supabase
        .from('push_subscriptions')
        .select('attendant_token_id')
        .eq('endpoint', subscription.endpoint)
        .maybeSingle()

      if (lookupError) {
        console.error('[Push Subscribe] Erro:', lookupError)
        return NextResponse.json({ error: 'Erro ao salvar subscription' }, { status: 500 })
      }

      // Endpoint já registrado pelo dono neste navegador: mantém a linha como do dono.
      if (existing && existing.attendant_token_id === null) {
        return NextResponse.json({ success: true })
      }
    }

    // Upsert: atualiza se já existir, insere se não
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        attendant_token_id: attendantTokenId,
        user_agent: request.headers.get('user-agent'),
        last_used_at: new Date().toISOString(),
      },
      {
        onConflict: 'endpoint',
      }
    )

    if (error) {
      console.error('[Push Subscribe] Erro:', error)
      return NextResponse.json({ error: 'Erro ao salvar subscription' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Push Subscribe] Erro inesperado:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

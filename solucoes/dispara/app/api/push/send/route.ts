import { NextResponse } from 'next/server'
import { broadcastPushNotification, sendNewMessageNotification, PushPayload } from '@/lib/push-notifications'
import { getBrandConfig } from '@/lib/branding'

/**
 * POST /api/push/send
 *
 * Envia notificação push para todos os subscriptions ativos.
 * Requer autenticação (DISPARA_ADMIN_KEY).
 *
 * Body pode ser:
 * 1. { type: 'message', contactName, preview, conversationId } - Para nova mensagem
 * 2. { title, body, ... } - Para notificação customizada
 */
export async function POST(request: Request) {
  // Verificar autenticação
  const authHeader = request.headers.get('authorization')
  const adminKey = process.env.DISPARA_ADMIN_KEY

  if (!adminKey || authHeader !== `Bearer ${adminKey}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Notificação de nova mensagem
    if (body.type === 'message') {
      const { contactName, preview, conversationId } = body

      if (!contactName || !preview || !conversationId) {
        return NextResponse.json({ error: 'Campos obrigatórios: contactName, preview, conversationId' }, { status: 400 })
      }

      const result = await sendNewMessageNotification(contactName, preview, conversationId)
      return NextResponse.json(result)
    }

    // Notificação customizada
    // Whitelabel: título default vem do brand_name do deploy (nunca lança)
    const defaultTitle = body.title ? null : (await getBrandConfig()).name

    const payload: PushPayload = {
      title: body.title || defaultTitle || 'Dispara',
      body: body.body || '',
      icon: body.icon || '/icons/icon-192.png',
      badge: body.badge || '/icons/icon-192.png',
      tag: body.tag,
      data: body.data,
      actions: body.actions,
    }

    if (!payload.body) {
      return NextResponse.json({ error: 'Body obrigatório' }, { status: 400 })
    }

    const result = await broadcastPushNotification(payload)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Push Send] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { settingsDb } from '@/lib/supabase-db'

/**
 * GET /api/webhook/validate
 * Verifica se o webhook está configurado e recebendo eventos
 *
 * Retorna:
 * - isValid: boolean - se o webhook parece estar funcionando
 * - lastEventAt: string | null - timestamp do último evento recebido
 * - message: string - descrição do status
 */
export async function GET() {
  try {
    // Estratégia 1: Verificar se existem eventos recentes na tabela whatsapp_status_events
    let lastEventAt: string | null = null
    let hasRecentEvents = false

    try {
      const { data: events, error } = await supabase
        .from('whatsapp_status_events')
        .select('last_received_at')
        .order('last_received_at', { ascending: false })
        .limit(1)

      if (!error && events && events.length > 0) {
        lastEventAt = events[0].last_received_at

        // Considerar "recente" se foi nas últimas 24 horas
        if (lastEventAt) {
          const eventDate = new Date(lastEventAt)
          const now = new Date()
          const hoursSinceLastEvent = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60)
          hasRecentEvents = hoursSinceLastEvent < 24
        }
      }
    } catch (e) {
      // Tabela pode não existir ainda - continuar com outras estratégias
      console.warn('[Webhook Validate] Tabela whatsapp_status_events não encontrada:', e)
    }

    // Estratégia 2: Verificar se existem entregas/leituras em campaign_contacts
    if (!hasRecentEvents) {
      try {
        const { data: deliveries, error } = await supabase
          .from('campaign_contacts')
          .select('delivered_at, read_at')
          .or('delivered_at.not.is.null,read_at.not.is.null')
          .order('delivered_at', { ascending: false })
          .limit(1)

        if (!error && deliveries && deliveries.length > 0) {
          const delivery = deliveries[0]
          const latestDelivery = delivery.read_at || delivery.delivered_at

          if (latestDelivery) {
            if (!lastEventAt || new Date(latestDelivery) > new Date(lastEventAt)) {
              lastEventAt = latestDelivery
            }

            const eventDate = new Date(latestDelivery)
            const now = new Date()
            const hoursSinceLastEvent = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60)
            hasRecentEvents = hoursSinceLastEvent < 24
          }
        }
      } catch (e) {
        console.warn('[Webhook Validate] Erro ao verificar campaign_contacts:', e)
      }
    }

    // Estratégia 3: Verificar se existe token de webhook configurado (mínimo necessário)
    let hasWebhookToken = false
    try {
      const token = await settingsDb.get('webhook_verify_token')
      hasWebhookToken = Boolean(token)
    } catch {
      // ignore
    }

    // Decidir resultado
    if (hasRecentEvents && lastEventAt) {
      return NextResponse.json({
        isValid: true,
        lastEventAt,
        message: 'Webhook está recebendo eventos normalmente',
        details: {
          hasRecentEvents,
          hasWebhookToken,
        },
      })
    }

    if (lastEventAt) {
      // Tem eventos mas não são recentes
      return NextResponse.json({
        isValid: true,
        lastEventAt,
        message: 'Webhook configurado, mas sem eventos recentes (últimas 24h)',
        details: {
          hasRecentEvents: false,
          hasWebhookToken,
        },
      })
    }

    if (hasWebhookToken) {
      // Tem token mas nunca recebeu eventos
      return NextResponse.json({
        isValid: false,
        lastEventAt: null,
        message: 'Token configurado, mas nenhum evento recebido ainda. Verifique a configuração no Meta.',
        details: {
          hasRecentEvents: false,
          hasWebhookToken,
        },
      })
    }

    // Nenhuma indicação de webhook funcionando
    return NextResponse.json({
      isValid: false,
      lastEventAt: null,
      message: 'Webhook não está configurado ou não recebeu eventos',
      details: {
        hasRecentEvents: false,
        hasWebhookToken: false,
      },
    })
  } catch (error) {
    console.error('[Webhook Validate] Error:', error)
    return NextResponse.json(
      {
        isValid: false,
        lastEventAt: null,
        message: 'Erro ao verificar status do webhook',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

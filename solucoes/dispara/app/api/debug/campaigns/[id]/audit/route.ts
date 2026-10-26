import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Params = { params: Promise<{ id: string }> }

function noStoreJson(payload: unknown, init?: { status?: number }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

function safeCount(x: any): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
}

/**
 * GET /api/debug/campaigns/:id/audit
 * Diagnóstico de contadores e estado por contato (sem PII).
 * Útil para validar discrepâncias de delivered/read.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id: campaignId } = await params

  if (!campaignId) {
    return noStoreJson({ ok: false, error: 'campaignId ausente' }, { status: 400 })
  }

  try {
    const [
      { data: campaignRow, error: campaignErr },
      { count: total },
      { count: pending },
      { count: sending },
      { count: sent },
      { count: delivered },
      { count: read },
      { count: failed },
      { count: skipped },
      { count: messageIdNull },
      { count: deliveredAtNullButDeliveredStatus },
    ] = await Promise.all([
      supabase
        .from('campaigns')
        // IMPORTANTE: schemas antigos/usados em prod podem não ter `recipients`.
        // Para evitar quebrar o endpoint por diferença de coluna, buscamos a linha inteira
        // e só expomos campos não sensíveis no response.
        .select('*')
        .eq('id', campaignId)
        .maybeSingle(),

      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'pending'),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'sending'),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'sent'),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'delivered'),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'read'),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'failed'),
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'skipped'),

      // message_id ausente (importante: sem message_id, webhook não consegue correlacionar delivered/read)
      supabase.from('campaign_contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId).is('message_id', null),

      // sanity: status delivered/read mas delivered_at null (não deveria acontecer)
      supabase
        .from('campaign_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['delivered', 'read'])
        .is('delivered_at', null),
    ])

    if (campaignErr) {
      return noStoreJson({ ok: false, error: campaignErr.message }, { status: 500 })
    }

    const [
      { data: newestRead },
      { data: newestDelivered },
      { data: newestSent },
      { data: sampleReadRows },
      { data: sampleDeliveredNotReadRows },
    ] = await Promise.all([
      supabase
        .from('campaign_contacts')
        .select('id, contact_id, status, message_id, sent_at, delivered_at, read_at')
        .eq('campaign_id', campaignId)
        .not('read_at', 'is', null)
        .order('read_at', { ascending: false, nullsFirst: false })
        .limit(1),

      supabase
        .from('campaign_contacts')
        .select('id, contact_id, status, message_id, sent_at, delivered_at, read_at')
        .eq('campaign_id', campaignId)
        .not('delivered_at', 'is', null)
        .order('delivered_at', { ascending: false, nullsFirst: false })
        .limit(1),

      supabase
        .from('campaign_contacts')
        .select('id, contact_id, status, message_id, sent_at, delivered_at, read_at')
        .eq('campaign_id', campaignId)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(1),

      // amostras sem PII
      supabase
        .from('campaign_contacts')
        .select('id, contact_id, status, message_id, sent_at, delivered_at, read_at')
        .eq('campaign_id', campaignId)
        .eq('status', 'read')
        .order('read_at', { ascending: false, nullsFirst: false })
        .limit(10),

      supabase
        .from('campaign_contacts')
        .select('id, contact_id, status, message_id, sent_at, delivered_at, read_at')
        .eq('campaign_id', campaignId)
        .not('delivered_at', 'is', null)
        .is('read_at', null)
        .order('delivered_at', { ascending: false, nullsFirst: false })
        .limit(10),
    ])

    const counts = {
      total: safeCount(total),
      pending: safeCount(pending),
      sending: safeCount(sending),
      sent: safeCount(sent),
      delivered: safeCount(delivered),
      read: safeCount(read),
      failed: safeCount(failed),
      skipped: safeCount(skipped),
    }

    const derived = {
      // Progressão (cumulativo):
      sentEffective: counts.sent + counts.delivered + counts.read,
      deliveredEffective: counts.delivered + counts.read,
      read: counts.read,
    }

    const campaignCounters = campaignRow
      ? {
          id: campaignRow.id,
          status: campaignRow.status,
          recipients:
            (campaignRow as any).recipients ??
            (campaignRow as any).total_recipients ??
            (campaignRow as any).totalRecipients ??
            (campaignRow as any).recipientsCount ??
            null,
          sent: campaignRow.sent ?? 0,
          delivered: campaignRow.delivered ?? 0,
          read: (campaignRow as any).read ?? 0,
          failed: campaignRow.failed ?? 0,
          skipped: campaignRow.skipped ?? 0,
          createdAt: (campaignRow as any).created_at ?? null,
          firstDispatchAt:
            (campaignRow as any).first_dispatch_at ??
            (campaignRow as any).firstDispatchAt ??
            null,
          lastSentAt:
            (campaignRow as any).last_sent_at ??
            (campaignRow as any).lastSentAt ??
            null,
        }
      : null

    return noStoreJson({
      ok: true,
      campaignId,
      campaignCounters,
      contactCounts: counts,
      derived,
      integrity: {
        messageIdNull: safeCount(messageIdNull),
        deliveredOrReadButDeliveredAtNull: safeCount(deliveredAtNullButDeliveredStatus),
      },
      newestTimestamps: {
        newestSentAt: newestSent?.[0]?.sent_at ?? null,
        newestDeliveredAt: newestDelivered?.[0]?.delivered_at ?? null,
        newestReadAt: newestRead?.[0]?.read_at ?? null,
      },
      samples: {
        read: sampleReadRows || [],
        deliveredNotRead: sampleDeliveredNotReadRows || [],
      },
      notes: [
        'read é evento de webhook; depende do usuário abrir a conversa e ter confirmações de leitura ativas.',
        'Se messageIdNull > 0 em muitos contatos, delivered/read podem nunca correlacionar (webhook busca por message_id).',
      ],
    })
  } catch (e: any) {
    return noStoreJson(
      {
        ok: false,
        error: e?.message || 'Erro inesperado',
      },
      { status: 500 }
    )
  }
}

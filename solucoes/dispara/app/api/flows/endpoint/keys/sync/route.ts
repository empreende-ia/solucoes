/**
 * POST /api/flows/endpoint/keys/sync
 *
 * Re-sincroniza a chave pública do endpoint de Flows com a Meta: compara a chave
 * registrada no número com a derivada da chave privada local e, se divergir,
 * registra de novo a chave LOCAL existente. Não gera par novo.
 *
 * Exige sessão do dono (DEFAULT_API_POLICY em lib/route-policy.ts). Usado pela
 * ação do Diagnóstico da Meta.
 */

import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase'
import { dismissFlowKeyAlerts, syncFlowPublicKeyWithMeta } from '@/lib/whatsapp/flow-endpoint-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
  }

  const result = await syncFlowPublicKeyWithMeta()

  switch (result.status) {
    case 'in_sync':
    case 'resynced':
      await dismissFlowKeyAlerts()
      return NextResponse.json({
        success: true,
        status: result.status,
        message:
          result.status === 'resynced'
            ? 'Chave pública re-registrada na Meta. A propagação pode levar alguns minutos.'
            : 'A chave registrada na Meta já é a do endpoint. Nada a sincronizar.',
      })
    case 'missing_local_key':
    case 'invalid_local_key':
      return NextResponse.json(
        {
          error:
            'Não há chave privada válida no endpoint de Flows. Gere as chaves em Configurações > MiniApp Dinâmico.',
          status: result.status,
        },
        { status: 400 }
      )
    case 'no_credentials':
      return NextResponse.json(
        { error: 'Credenciais do WhatsApp não configuradas.', status: result.status },
        { status: 400 }
      )
    default:
      return NextResponse.json(
        { error: `Falha ao sincronizar a chave com a Meta: ${result.error}`, status: result.status },
        { status: 502 }
      )
  }
}

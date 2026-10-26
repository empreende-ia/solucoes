/**
 * API para gerenciar chaves RSA do Flow Endpoint
 *
 * GET - Retorna chave publica atual (para configurar na Meta)
 * POST - Gera novo par de chaves
 * DELETE - Remove chaves configuradas
 */

import { NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  generateKeyPair,
  isValidPrivateKey,
} from '@/lib/whatsapp/flow-endpoint-crypto'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { metaSetEncryptionPublicKey } from '@/lib/meta-flows-api'
import { dismissFlowKeyAlerts } from '@/lib/whatsapp/flow-endpoint-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const PRIVATE_KEY_SETTING = 'whatsapp_flow_private_key'
const PUBLIC_KEY_SETTING = 'whatsapp_flow_public_key'
const ENDPOINT_URL_SETTING = 'whatsapp_flow_endpoint_url'

function resolveEndpointUrlFromRequest(request: Request): string | null {
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (!host) return null
  return `${proto}://${host}/api/flows/endpoint`
}

function isLocalhostUrl(value: string | null): boolean {
  if (!value) return false
  return value.includes('localhost') || value.includes('127.0.0.1')
}

/**
 * GET - Retorna status das chaves e URL do endpoint
 */
export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    const [privateKey, publicKey] = await Promise.all([
      settingsDb.get(PRIVATE_KEY_SETTING),
      settingsDb.get(PUBLIC_KEY_SETTING),
    ])
    const storedEndpointUrl = await settingsDb.get(ENDPOINT_URL_SETTING)

    const hasPrivateKey = !!privateKey && isValidPrivateKey(privateKey)
    const hasPublicKey = !!publicKey
    const envEndpointUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/flows/endpoint`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/flows/endpoint`
        : process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/api/flows/endpoint`
          : null
    const headerEndpointUrl = resolveEndpointUrlFromRequest(request)
    const safeStoredEndpointUrl =
      storedEndpointUrl && !isLocalhostUrl(headerEndpointUrl) && isLocalhostUrl(storedEndpointUrl)
        ? null
        : storedEndpointUrl
    const endpointUrl = envEndpointUrl || safeStoredEndpointUrl || headerEndpointUrl || null
    const endpointSource = envEndpointUrl
      ? 'env'
      : safeStoredEndpointUrl
        ? 'stored'
        : headerEndpointUrl
          ? 'header'
          : 'none'
    // #region agent log
    // #endregion agent log

    const responseBody = {
      configured: hasPrivateKey && hasPublicKey,
      publicKey: hasPublicKey ? publicKey : null,
      endpointUrl,
      debug: {
        endpointSource,
        envEndpointUrl,
        storedEndpointUrl,
        headerEndpointUrl,
        resolvedEndpointUrl: endpointUrl,
        headerHost: request.headers.get('x-forwarded-host') || request.headers.get('host') || null,
        headerProto: request.headers.get('x-forwarded-proto') || null,
      },
    }
    // #region agent log
    // #endregion agent log
    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[flow-endpoint-keys] GET error:', error)
    return NextResponse.json(
      { error: 'Erro ao verificar chaves' },
      { status: 500 }
    )
  }
}

/**
 * POST - Gera novo par de chaves para o endpoint de flows dinamicos
 *
 * NOTA: O endpoint whatsapp_business_encryption da Meta NAO esta disponivel
 * para Cloud API direto - apenas para BSPs. Por isso, geramos as chaves
 * localmente e confiamos que a Meta ira lidar com a criptografia quando
 * o flow for criado com endpoint_uri.
 *
 * Body opcional:
 * - privateKey: string (importar chave existente)
 * - publicKey: string (importar chave existente)
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))

    let privateKey: string
    let publicKey: string

    // Se usuario forneceu chaves, usa elas
    if (body.privateKey && body.publicKey) {
      if (!isValidPrivateKey(body.privateKey)) {
        return NextResponse.json(
          { error: 'Chave privada invalida' },
          { status: 400 }
        )
      }
      privateKey = body.privateKey
      publicKey = body.publicKey
    } else {
      // Gera novo par de chaves
      const keyPair = generateKeyPair()
      privateKey = keyPair.privateKey
      publicKey = keyPair.publicKey
    }

    // Salva as chaves localmente
    await Promise.all([
      settingsDb.set(PRIVATE_KEY_SETTING, privateKey),
      settingsDb.set(PUBLIC_KEY_SETTING, publicKey),
    ])
    const endpointUrl = resolveEndpointUrlFromRequest(request)
    const shouldStoreEndpointUrl = endpointUrl && !isLocalhostUrl(endpointUrl)
    if (shouldStoreEndpointUrl) {
      await settingsDb.set(ENDPOINT_URL_SETTING, endpointUrl)
    }

    // Sincroniza automaticamente com a Meta (se credenciais disponíveis)
    let metaSyncSuccess = false
    let metaSyncError: string | null = null

    try {
      const credentials = await getWhatsAppCredentials()

      if (credentials?.accessToken && credentials?.phoneNumberId) {
        console.log('[flow-endpoint-keys] 🔄 Sincronizando chave pública com a Meta...')

        await metaSetEncryptionPublicKey({
          accessToken: credentials.accessToken,
          phoneNumberId: credentials.phoneNumberId,
          publicKey,
        })

        metaSyncSuccess = true
        console.log('[flow-endpoint-keys] ✅ Chave pública sincronizada com a Meta')
        // Chaves novas e registradas: avisos de chave dos Flows deixam de valer.
        await dismissFlowKeyAlerts()
      } else {
        console.log('[flow-endpoint-keys] ⚠️ Credenciais WhatsApp não configuradas, sincronização com Meta ignorada')
        metaSyncError = 'Credenciais WhatsApp não configuradas'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[flow-endpoint-keys] ❌ Falha ao sincronizar com Meta:', errorMsg)
      metaSyncError = errorMsg
    }

    return NextResponse.json({
      success: true,
      message: metaSyncSuccess
        ? 'Chaves geradas e sincronizadas com a Meta!'
        : 'Chaves geradas! Sincronização com Meta pendente.',
      metaSync: {
        success: metaSyncSuccess,
        error: metaSyncError,
      },
    })
  } catch (error) {
    console.error('[flow-endpoint-keys] POST error:', error)
    return NextResponse.json(
      { error: 'Erro ao gerar chaves' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Remove chaves configuradas
 */
export async function DELETE() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 400 })
    }

    await Promise.all([
      settingsDb.set(PRIVATE_KEY_SETTING, ''),
      settingsDb.set(PUBLIC_KEY_SETTING, ''),
    ])

    return NextResponse.json({
      success: true,
      message: 'Chaves removidas',
    })
  } catch (error) {
    console.error('[flow-endpoint-keys] DELETE error:', error)
    return NextResponse.json(
      { error: 'Erro ao remover chaves' },
      { status: 500 }
    )
  }
}

/**
 * WhatsApp Flow Endpoint
 *
 * Endpoint para data_exchange em WhatsApp Flows.
 * Recebe requests criptografadas da Meta e responde com dados dinamicos.
 *
 * POST /api/flows/endpoint
 *
 * Segurança: rota pública no proxy (public_route_auth). A assinatura
 * X-Hub-Signature-256 é verificada antes de decifrar (lib/meta-webhook-signature.ts)
 * e as chaves RSA só são geradas/regeneradas automaticamente com assinatura verificada.
 * Sem assinatura verificada, um erro OAEP só re-sincroniza a chave pública LOCAL
 * existente com a Meta (idempotente, com cooldown) e falhas de chave que não dá para
 * consertar viram account_alert + diagnóstico (lib/whatsapp/flow-endpoint-keys.ts).
 *
 * Handlers:
 * - ping: health check
 * - INIT: primeira tela do flow
 * - data_exchange: interacao do usuario
 * - BACK: usuario voltou para tela anterior
 */

import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import {
  decryptRequest,
  encryptResponse,
  createErrorResponse,
  type FlowDataExchangeRequest,
} from '@/lib/whatsapp/flow-endpoint-crypto'
import { handleFlowAction } from '@/lib/whatsapp/flow-endpoint-handlers'
import {
  FLOW_PRIVATE_KEY_SETTING,
  type FlowDecryptKeyStatus,
  type FlowKeyRecoveryTrigger,
  decideFlowKeyRecovery,
  getLastFlowKeyRegenAt,
  isOaepDecryptError,
  reportFlowDecryptFailure,
  resyncFlowPublicKeyIfDue,
  rotateFlowEndpointKeys,
} from '@/lib/whatsapp/flow-endpoint-keys'
import {
  META_SIGNATURE_HEADER,
  evaluateMetaSignature,
  reportMetaSignatureFailure,
} from '@/lib/meta-webhook-signature'

export const runtime = 'nodejs'

// Status que a Meta define para o endpoint de Flows:
// 421 = não consegui decifrar (o cliente rebusca a chave pública e tenta de novo);
// 432 = falha na autenticação da assinatura da request.
const STATUS_DECRYPT_FAILED = 421
const STATUS_SIGNATURE_FAILED = 432

type EncryptedFlowEnvelope = {
  encrypted_flow_data: string
  encrypted_aes_key: string
  initial_vector: string
}

function parseEnvelope(rawBody: string): EncryptedFlowEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { encrypted_flow_data, encrypted_aes_key, initial_vector } = parsed as Record<string, unknown>
  if (
    typeof encrypted_flow_data !== 'string' || !encrypted_flow_data ||
    typeof encrypted_aes_key !== 'string' || !encrypted_aes_key ||
    typeof initial_vector !== 'string' || !initial_vector
  ) {
    return null
  }
  return { encrypted_flow_data, encrypted_aes_key, initial_vector }
}

/**
 * Auto-recuperação das chaves RSA. Só gera/regenera com assinatura VERIFICADA
 * (prova de que a request veio da Meta) e fora do cooldown. Sem assinatura
 * verificada, só re-sincroniza a chave LOCAL existente com a Meta. Sempre registra
 * a falha (diagnóstico/alerta). Retorna o hint da resposta.
 */
async function recoverFlowKeys(params: {
  signatureVerified: boolean
  trigger: FlowKeyRecoveryTrigger
  privateKey: string | null
}): Promise<string | undefined> {
  if (params.trigger === 'other_error') return undefined

  const now = Date.now()
  // Sem assinatura verificada, o cooldown da re-sincronização NÃO é decidido aqui
  // (ler e depois gravar deixava uma rajada concorrente passar): a janela é
  // reivindicada de forma atômica em resyncFlowPublicKeyIfDue.
  const decision = decideFlowKeyRecovery({
    signatureVerified: params.signatureVerified,
    trigger: params.trigger,
    lastRegenAt: params.signatureVerified ? await getLastFlowKeyRegenAt() : 0,
    now,
  })
  const what = params.trigger === 'missing_key' ? 'Chave privada ausente' : 'OAEP Error'
  let keyStatus: FlowDecryptKeyStatus = params.trigger === 'missing_key' ? 'missing_key' : 'pending'
  let hint: string | undefined

  if (decision === 'regenerate') {
    console.log(`[flow-endpoint] 🔑 ${what} com assinatura verificada! Gerando novas chaves...`)
    try {
      const { metaSynced } = await rotateFlowEndpointKeys(now)
      keyStatus = metaSynced ? 'regenerated' : 'unconfirmed'
      hint = 'Chaves foram regeneradas e sincronizadas. Tente novamente.'
    } catch (recoveryError) {
      console.error('[flow-endpoint] ❌ Falha na auto-recuperação:', recoveryError)
      keyStatus = 'unconfirmed'
    }
  } else if (decision === 'resync') {
    // Só quem reivindica a janela (atômica no banco, vale entre instâncias; e uma por
    // vez nesta instância) fala com a Graph: lixo em rajada não multiplica chamadas.
    const attempt = await resyncFlowPublicKeyIfDue({ privateKey: params.privateKey, now })
    const result = attempt.claimed ? attempt.result : null
    if (!result) {
      console.log(`[flow-endpoint] ⏳ ${what}, mas a re-sincronização da chave está em cooldown.`)
    } else if (result.status === 'in_sync') {
      // A Meta já tem a nossa chave: a falha não é de chave nossa (lixo/forja, ou o
      // cliente com chave em cache — o 421 faz ele rebuscar). Nada a consertar.
      keyStatus = 'in_sync'
    } else if (result.status === 'resynced') {
      keyStatus = 'resynced'
      hint = 'Chave pública re-sincronizada com a Meta. Tente novamente.'
    } else {
      keyStatus = 'unconfirmed'
      const detail = result.status === 'failed' ? `${result.status}: ${result.error}` : result.status
      console.warn(
        `[flow-endpoint] ⚠️ ${what} sem assinatura verificada e não foi possível conferir a chave na Meta (${detail}).`
      )
    }
  } else if (decision === 'cooldown') {
    console.log(`[flow-endpoint] ⏳ ${what}, mas cooldown de regeneração/sincronização ativo.`)
    console.log('[flow-endpoint] 💡 A Meta pode demorar alguns minutos para propagar a nova chave.')
  } else if (decision === 'unverified') {
    // Sem assinatura verificada qualquer um manda lixo aqui: gerar chave viraria DoS.
    console.warn(
      `[flow-endpoint] ⚠️ ${what} sem assinatura verificada (App Secret ausente ou ainda não confirmado): chaves NÃO geradas automaticamente. ` +
        'Se os Flows pararam, gere as chaves em Configurações > MiniApp Dinâmico e configure o App Secret.'
    )
  }

  await reportFlowDecryptFailure({
    trigger: params.trigger,
    keyStatus,
    signatureVerified: params.signatureVerified,
    now,
  })
  return hint
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    console.log('[flow-endpoint] 📥 POST received at', new Date().toISOString())

    // A Meta assina o data exchange com X-Hub-Signature-256 (App Secret).
    // Verifica sobre o corpo CRU, antes de decifrar ou tocar em qualquer chave.
    const signature = await evaluateMetaSignature(rawBody, request.headers.get(META_SIGNATURE_HEADER))
    if (!signature.ok) {
      console.warn(`[flow-endpoint] ❌ Assinatura rejeitada: ${signature.reason} (modo ${signature.mode})`)
      if (signature.reason === 'secret_unavailable') {
        return NextResponse.json({ error: 'Indisponível' }, { status: 503 })
      }
      await reportMetaSignatureFailure({ evaluation: signature, endpoint: 'flows_endpoint' })
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: STATUS_SIGNATURE_FAILED })
    }
    if (!signature.verified) {
      // report_only (secret de Configurações ainda não comprovado) ou sem App Secret:
      // aceita, mas registra para o diagnóstico/alerta.
      await reportMetaSignatureFailure({ evaluation: signature, endpoint: 'flows_endpoint' })
    }
    // Só assinatura VERIFICADA prova que a request veio da Meta: só nesse caso o
    // endpoint pode gerar/regenerar as chaves RSA e re-registrá-las na Meta.
    const signatureVerified = signature.verified

    // Valida campos obrigatorios
    const envelope = parseEnvelope(rawBody)
    if (!envelope) {
      console.error('[flow-endpoint] ❌ Campos obrigatorios ausentes')
      return NextResponse.json({ error: 'Campos obrigatorios ausentes' }, { status: 400 })
    }

    const privateKey = await settingsDb.get(FLOW_PRIVATE_KEY_SETTING)

    if (!privateKey) {
      // Sem chave não há como decifrar; com assinatura verificada, gera e registra
      // para as próximas requests.
      const hint = await recoverFlowKeys({ signatureVerified, trigger: 'missing_key', privateKey: null })
      return NextResponse.json(
        { error: 'Chave do endpoint não configurada', hint },
        { status: STATUS_DECRYPT_FAILED }
      )
    }

    // Descriptografa a request
    let decrypted
    try {
      decrypted = decryptRequest(envelope, privateKey)
    } catch (error) {
      console.error('[flow-endpoint] ❌ Erro ao descriptografar:', error)
      const hint = await recoverFlowKeys({
        signatureVerified,
        trigger: isOaepDecryptError(error) ? 'oaep_error' : 'other_error',
        privateKey,
      })
      return NextResponse.json(
        { error: 'Falha na descriptografia', hint },
        { status: STATUS_DECRYPT_FAILED }
      )
    }

    const flowRequest = decrypted.decryptedBody as unknown as FlowDataExchangeRequest
    console.log('[flow-endpoint] 🔓 Decrypted - Action:', flowRequest.action, 'Screen:', flowRequest.screen, 'Data:', JSON.stringify(flowRequest.data || {}))
    // #region agent log
    // #endregion

    // Health check - DEVE ser criptografado como todas as outras respostas
    // Ref: https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint#health_check_request
    if (flowRequest.action === 'ping') {
      console.log('[flow-endpoint] 🏓 PING received at', new Date().toISOString())
      const pingResponse = { data: { status: 'active' } }
      const encryptedPingResponse = encryptResponse(
        pingResponse,
        decrypted.aesKeyBuffer,
        decrypted.initialVectorBuffer
      )
      console.log('[flow-endpoint] 🔐 PING response encrypted, length:', encryptedPingResponse.length, 'isBase64:', !encryptedPingResponse.startsWith('{'))
      return new NextResponse(encryptedPingResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Processa a acao do flow
    let response
    try {
      response = await handleFlowAction(flowRequest)
      console.log('[flow-endpoint] ✅ Handler response:', JSON.stringify(response).substring(0, 500))
    } catch (error) {
      console.error('[flow-endpoint] ❌ Erro no handler:', error)
      response = createErrorResponse(
        error instanceof Error ? error.message : 'Erro interno'
      )
    }

    // Criptografa a response
    const encryptedResponse = encryptResponse(
      response,
      decrypted.aesKeyBuffer,
      decrypted.initialVectorBuffer
    )
    console.log('[flow-endpoint] 🔐 Response encrypted, length:', encryptedResponse.length)

    return new NextResponse(encryptedResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (error) {
    console.error('[flow-endpoint] Erro geral:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}

/**
 * GET - Health check simples (sem criptografia)
 */
export async function GET() {
  const privateKey = await settingsDb.get(FLOW_PRIVATE_KEY_SETTING)
  const configured = !!privateKey

  return NextResponse.json({
    status: configured ? 'ready' : 'not_configured',
    message: configured
      ? 'Flow endpoint configurado e pronto'
      : 'Chave privada nao configurada. Configure em /settings/flows',
  })
}

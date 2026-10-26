import { NextRequest, NextResponse } from 'next/server'
import { requireSessionOrApiKey } from '@/lib/request-auth'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { getMetaAppId } from '@/lib/meta-app-credentials'

export const dynamic = 'force-dynamic'
export const revalidate = 0
// Node.js runtime - necessário para multipart/form-data com arquivos grandes
export const runtime = 'nodejs'

// Aumentar limite de body para 20MB (Next.js 14+)
export const maxDuration = 60

type UploadFormat = 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT'

type GraphErrorBody = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

// Limite máximo do Vercel Serverless é ~4.5MB para request body
// Aplicamos 4.5MB para VIDEO e DOCUMENT que excedem esse limite
const VERCEL_SERVERLESS_LIMIT = 4_500_000

function maxBytesFor(format: UploadFormat): number {
  if (format === 'GIF') return 3_500_000
  if (format === 'IMAGE') return Math.min(5_000_000, VERCEL_SERVERLESS_LIMIT)
  if (format === 'VIDEO') return VERCEL_SERVERLESS_LIMIT // Meta permite 16MB, mas Vercel limita a 4.5MB
  if (format === 'DOCUMENT') return VERCEL_SERVERLESS_LIMIT // Meta permite 20MB, mas Vercel limita a 4.5MB
  return 0
}

function allowedMimeTypesFor(format: UploadFormat): string[] {
  if (format === 'IMAGE') return ['image/png', 'image/jpeg', 'image/jpg']
  if (format === 'VIDEO') return ['video/mp4']
  if (format === 'GIF') return ['video/mp4']
  if (format === 'DOCUMENT') return ['application/pdf']
  return []
}

function jsonNoStore(body: any, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

function guessMimeType(fileName: string, providedType?: string): string {
  const t = String(providedType || '').trim()
  if (t && t !== 'application/octet-stream') return t

  const name = String(fileName || '').toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.mp4')) return 'video/mp4'

  return t || 'application/octet-stream'
}

/**
 * POST /api/meta/uploads/template-header
 *
 * Recebe um arquivo via multipart/form-data e retorna { handle } para ser usado
 * como `header_handle` em templates com HEADER de mídia.
 *
 * Campos esperados:
 * - file: File (o arquivo de mídia)
 * - format: string ('IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT')
 *
 * Implementa Graph Resumable Upload API:
 * 1) POST /v24.0/{app_id}/uploads?file_name&file_length&file_type&access_token
 * 2) POST /v24.0/upload:{upload_session_id} (Authorization: OAuth <token>, file_offset: 0, body=bytes)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionOrApiKey(request)
    if (auth) return auth

    const metaAppId = await getMetaAppId()
    if (!metaAppId) {
      return jsonNoStore(
        {
          error:
            'Meta App não configurado. Configure metaAppId nas settings para habilitar uploads via Resumable Upload API.',
        },
        { status: 400 }
      )
    }

    const wa = await getWhatsAppCredentials()
    if (!wa?.accessToken) {
      return jsonNoStore(
        {
          error:
            'Credenciais do WhatsApp não configuradas. Configure accessToken (settings.accessToken ou WHATSAPP_TOKEN) para habilitar uploads.',
        },
        { status: 400 }
      )
    }

    // Parse multipart/form-data
    let form: FormData
    try {
      form = await request.formData()
    } catch (formErr) {
      const formErrMsg = formErr instanceof Error ? formErr.message : String(formErr)
      console.error('[template-header] FormData parse error:', formErrMsg)

      if (formErrMsg.includes('body exceeded') || formErrMsg.includes('too large') || formErrMsg.includes('limit') || formErrMsg.includes('PAYLOAD')) {
        return jsonNoStore(
          { error: 'Arquivo muito grande. O limite máximo é 4.5MB para uploads. Comprima o arquivo antes de enviar.' },
          { status: 413 }
        )
      }

      return jsonNoStore(
        { error: 'Falha ao ler multipart/form-data.', details: formErrMsg },
        { status: 400 }
      )
    }

    const formatRaw = String(form.get('format') || '').trim().toUpperCase()
    const format = (['IMAGE', 'VIDEO', 'GIF', 'DOCUMENT'] as const).includes(formatRaw as any)
      ? (formatRaw as UploadFormat)
      : null

    if (!format) {
      return jsonNoStore({ error: 'Formato inválido. Use IMAGE, VIDEO, GIF ou DOCUMENT.' }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return jsonNoStore({ error: 'Arquivo ausente. Envie multipart com campo "file".' }, { status: 400 })
    }

    const max = maxBytesFor(format)
    if (max > 0 && file.size > max) {
      const mb = (max / 1_000_000).toFixed(1)
      const fileMb = (file.size / 1_000_000).toFixed(1)
      const isPlatformLimit = max === VERCEL_SERVERLESS_LIMIT
      return jsonNoStore(
        {
          error: isPlatformLimit
            ? `Arquivo muito grande (${fileMb}MB). Limite da plataforma: ${mb}MB. Comprima o ${format === 'VIDEO' ? 'vídeo' : 'arquivo'} antes de enviar.`
            : `Arquivo muito grande para ${format}. Limite: ${mb}MB.`,
        },
        { status: 400 }
      )
    }

    const mimeType = guessMimeType(file.name, file.type)
    const allowed = allowedMimeTypesFor(format)
    if (!allowed.includes(mimeType)) {
      return jsonNoStore(
        {
          error: `Tipo de arquivo inválido para ${format}. MIME recebido: ${mimeType}. Aceitos: ${allowed.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Step 1: start upload session
    const fileName = file.name || `template_header_${Date.now()}`
    const startUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(metaAppId)}/uploads`)
    startUrl.searchParams.set('file_name', fileName)
    startUrl.searchParams.set('file_length', String(file.size))
    startUrl.searchParams.set('file_type', mimeType)
    startUrl.searchParams.set('access_token', wa.accessToken)

    const startRes = await fetchWithTimeout(startUrl, {
      method: 'POST',
      timeoutMs: 12_000,
    })

    const startBody = await safeJson<{ id?: string } & GraphErrorBody>(startRes)
    if (!startRes.ok) {
      const msg =
        startBody?.error?.message ||
        `Falha ao iniciar sessão de upload (status ${startRes.status}).`

      return jsonNoStore(
        {
          error: msg,
          details: startBody?.error || null,
        },
        { status: 502 }
      )
    }

    const uploadIdRaw = String(startBody?.id || '').trim()
    const uploadId = uploadIdRaw.startsWith('upload:') ? uploadIdRaw : ''
    if (!uploadId) {
      return jsonNoStore(
        {
          error: 'Sessão de upload iniciada, mas não recebemos um id válido do Graph.',
          details: startBody || null,
        },
        { status: 502 }
      )
    }

    // Step 2: upload bytes (single chunk)
    // Converter File para ArrayBuffer e depois para Uint8Array
    const arrayBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(arrayBuffer)

    const transferUrl = `https://graph.facebook.com/v24.0/${uploadId}`
    // Timeout escalado: mínimo 30s, ~5s por MB, máximo 120s
    const uploadTimeoutMs = Math.min(120_000, Math.max(30_000, Math.ceil(file.size / 1_000_000) * 5_000))

    const transferRes = await fetchWithTimeout(transferUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${wa.accessToken}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      body: fileBytes,
      timeoutMs: uploadTimeoutMs,
    })

    const transferBody = await safeJson<{ h?: string } & GraphErrorBody>(transferRes)
    if (!transferRes.ok) {
      const msg =
        transferBody?.error?.message ||
        `Falha ao enviar bytes para o Graph (status ${transferRes.status}).`

      return jsonNoStore(
        {
          error: msg,
          details: transferBody?.error || null,
        },
        { status: 502 }
      )
    }

    const handle = String(transferBody?.h || '').trim()
    if (!handle) {
      return jsonNoStore(
        {
          error: 'Upload concluído, mas não recebemos o handle (h) do Graph.',
          details: transferBody || null,
        },
        { status: 502 }
      )
    }

    return jsonNoStore({ handle, format, mimeType, size: file.size })
  } catch (err) {
    console.error('Template header upload failed:', err)
    const message = err instanceof Error ? err.message : 'Erro inesperado'

    let userMessage = message
    if (message.includes('timeout') || message.includes('TIMEOUT') || message.includes('Timeout')) {
      userMessage = 'Timeout ao fazer upload. O arquivo pode ser muito grande ou a conexão está lenta. Tente novamente.'
    } else if (message.includes('network') || message.includes('ECONNREFUSED')) {
      userMessage = 'Erro de rede ao fazer upload. Verifique sua conexão e tente novamente.'
    } else if (message.includes('fetch')) {
      userMessage = 'Falha na comunicação com o servidor da Meta. Tente novamente.'
    }

    return jsonNoStore({ error: userMessage, details: message }, { status: 500 })
  }
}

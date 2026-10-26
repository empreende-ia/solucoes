import { createHash } from 'crypto'
import { supabase } from '@/lib/supabase'

type HeaderMediaPreviewResult = {
  url: string
  expiresAt?: string | null
  mode: 'public' | 'signed'
  source: 'cache' | 'generated'
}

type EnsureHeaderMediaPreviewParams = {
  templateName: string
  components: unknown
  accessToken: string
  force?: boolean
  logger?: (message: string, meta?: Record<string, unknown>) => void
}

type HeaderInfo = { format?: string; example?: string }

const warn = (logger: EnsureHeaderMediaPreviewParams['logger'], message: string, meta?: Record<string, unknown>) => {
  if (logger) logger(message, meta)
  else console.warn(message, meta || '')
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || '').trim())
}

export function getTemplateHeaderMediaExampleLink(components: unknown): HeaderInfo {
  if (!Array.isArray(components)) return {}
  const header = components.find((c: any) => String(c?.type || '').toUpperCase() === 'HEADER') as any | undefined
  if (!header) return {}
  const format = header?.format ? String(header.format).toUpperCase() : undefined
  if (!format || !['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)) return { format }

  let exampleObj: any = header.example
  if (typeof header.example === 'string') {
    try {
      exampleObj = JSON.parse(header.example)
    } catch {
      exampleObj = undefined
    }
  }

  const arr = exampleObj?.header_handle
  const example = Array.isArray(arr) && typeof arr[0] === 'string' ? String(arr[0]).trim() : undefined
  return { format, example }
}

function guessExtFromContentType(contentType: string | null | undefined): string {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim()
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg'
  if (ct === 'image/png') return 'png'
  if (ct === 'image/webp') return 'webp'
  if (ct === 'image/gif') return 'gif'
  if (ct === 'video/mp4') return 'mp4'
  if (ct === 'video/quicktime') return 'mov'
  if (ct === 'application/pdf') return 'pdf'
  return 'bin'
}

function maxBytesForFormat(format?: string): number {
  const f = String(format || '').toUpperCase()
  const fallback = Number(process.env.MEDIA_REHOST_MAX_BYTES || String(25 * 1024 * 1024))
  if (f === 'IMAGE') return Number(process.env.MEDIA_PREVIEW_MAX_BYTES_IMAGE || String(5 * 1024 * 1024))
  if (f === 'VIDEO') return Number(process.env.MEDIA_PREVIEW_MAX_BYTES_VIDEO || String(16 * 1024 * 1024))
  if (f === 'GIF') return Number(process.env.MEDIA_PREVIEW_MAX_BYTES_GIF || String(3_500_000))
  if (f === 'DOCUMENT') return Number(process.env.MEDIA_PREVIEW_MAX_BYTES_DOCUMENT || String(20 * 1024 * 1024))
  return fallback
}

function allowedMimeTypesForFormat(format?: string): string[] {
  const f = String(format || '').toUpperCase()
  if (f === 'IMAGE') return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (f === 'VIDEO') return ['video/mp4']
  if (f === 'GIF') return ['video/mp4']
  if (f === 'DOCUMENT') return ['application/pdf']
  return []
}

async function probeExampleUrl(
  url: string,
  timeoutMs: number
): Promise<{ status: number; contentType?: string; contentLength?: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const fetchHead = async () => {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
    const contentType = res.headers.get('content-type') || undefined
    const lengthHeader = res.headers.get('content-length')
    const contentLength = lengthHeader ? Number(lengthHeader) : undefined
    return { status: res.status, contentType, contentLength, res }
  }

  const fetchRange = async () => {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
    })
    const contentType = res.headers.get('content-type') || undefined
    const lengthHeader = res.headers.get('content-length')
    const contentLength = lengthHeader ? Number(lengthHeader) : undefined
    try {
      res.body?.cancel()
    } catch {
      // best-effort
    }
    return { status: res.status, contentType, contentLength, res }
  }

  try {
    const head = await fetchHead()
    if (head.status >= 200 && head.status < 300) {
      return { status: head.status, contentType: head.contentType, contentLength: head.contentLength }
    }
    if (head.status === 405 || head.status === 501) {
      const ranged = await fetchRange()
      return { status: ranged.status, contentType: ranged.contentType, contentLength: ranged.contentLength }
    }
    return { status: head.status, contentType: head.contentType, contentLength: head.contentLength }
  } catch {
    return { status: 0 }
  } finally {
    clearTimeout(timeout)
  }
}

async function tryDownloadBinary(url: string, accessToken?: string): Promise<{
  ok: boolean
  status: number
  contentType?: string
  size?: number
  buffer?: Buffer
  error?: string
}> {
  const timeoutMs = Number(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || '20000')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  const attempt = async (headers?: Record<string, string>) => {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    const contentType = res.headers.get('content-type') || undefined
    if (!res.ok) {
      return { ok: false, status: res.status, contentType, error: `HTTP ${res.status}` }
    }
    const ab = await res.arrayBuffer()
    const buffer = Buffer.from(ab)
    return {
      ok: true,
      status: res.status,
      contentType,
      size: buffer.byteLength,
      buffer,
    }
  }

  try {
    const a1 = await attempt()
    if (a1.ok) return a1
    if (accessToken) {
      const a2 = await attempt({ Authorization: `Bearer ${accessToken}` })
      return a2
    }
    return a1
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 0, error: msg }
  } finally {
    clearTimeout(timeout)
  }
}

async function probeUrl(url: string, timeoutMs: number): Promise<number> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal })
      return res.status
    } finally {
      clearTimeout(t)
    }
  } catch {
    return 0
  }
}

export async function ensureHeaderMediaPreviewUrl(params: EnsureHeaderMediaPreviewParams): Promise<HeaderMediaPreviewResult | null> {
  const { templateName, components, accessToken, force, logger } = params
  const headerInfo = getTemplateHeaderMediaExampleLink(components)
  const example = headerInfo.example
  const format = headerInfo.format ? String(headerInfo.format).toUpperCase() : undefined

  if (!format || !['IMAGE', 'VIDEO', 'DOCUMENT', 'GIF'].includes(format)) {
    return null
  }
  if (!example || !isHttpUrl(example)) {
    warn(logger, '[TemplatePreview] Link de exemplo inválido ou ausente.', { templateName, format })
    return null
  }

  const client = supabase.admin
  if (!client) {
    warn(logger, '[TemplatePreview] Supabase admin indisponível.')
    return null
  }

  const exampleHash = createHash('sha256').update(example).digest('hex').slice(0, 32)
  const nowIso = new Date().toISOString()

  try {
    const cached = await client
      .from('templates')
      .select('header_media_preview_url, header_media_preview_expires_at, header_media_hash')
      .eq('name', templateName)
      .maybeSingle()

    const cachedUrl = String(cached.data?.header_media_preview_url || '').trim()
    const cachedHash = String(cached.data?.header_media_hash || '').trim()
    const cachedExpiresAt = cached.data?.header_media_preview_expires_at as string | null | undefined
    const isExpired = cachedExpiresAt ? new Date(cachedExpiresAt).getTime() <= Date.now() : false

    if (!force && cachedUrl && cachedHash === exampleHash && !isExpired) {
      return { url: cachedUrl, expiresAt: cachedExpiresAt || null, mode: 'public', source: 'cache' }
    }
  } catch (e) {
    warn(logger, '[TemplatePreview] Falha ao ler cache do Supabase.', { templateName })
  }

  const exampleProbeTimeoutMs = Number(process.env.MEDIA_EXAMPLE_PROBE_TIMEOUT_MS || '3000')
  const exampleTtlSeconds = Number(process.env.MEDIA_EXAMPLE_URL_TTL_SECONDS || String(6 * 60 * 60))
  const exampleProbe = await probeExampleUrl(example, exampleProbeTimeoutMs)
  if (exampleProbe.status >= 200 && exampleProbe.status < 300) {
    const allowed = allowedMimeTypesForFormat(format)
    const contentType = exampleProbe.contentType
    const contentLength = exampleProbe.contentLength
    const maxBytes = maxBytesForFormat(format)
    const typeOk = !contentType || allowed.length === 0 || allowed.includes(contentType)
    const sizeOk = !contentLength || contentLength <= maxBytes
    if (typeOk && sizeOk) {
      const expiresAt = new Date(Date.now() + Math.max(300, exampleTtlSeconds) * 1000).toISOString()
      const finalUrl = example

      try {
        await client
          .from('templates')
          .update({
            header_media_preview_url: finalUrl,
            header_media_preview_expires_at: expiresAt,
            header_media_hash: exampleHash,
            header_media_preview_updated_at: nowIso,
            updated_at: nowIso,
          })
          .eq('name', templateName)
      } catch (e) {
        warn(logger, '[TemplatePreview] Falha ao persistir preview.', { templateName })
      }

      return { url: finalUrl, expiresAt, mode: 'public', source: 'generated' }
    }
  }

  const downloaded = await tryDownloadBinary(example, accessToken)
  if (!downloaded.ok || !downloaded.buffer) {
    warn(logger, '[TemplatePreview] Falha ao baixar mídia.', {
      templateName,
      format,
      status: downloaded.status,
      error: downloaded.error,
    })
    return null
  }

  const maxBytes = maxBytesForFormat(format)
  if (typeof downloaded.size === 'number' && downloaded.size > maxBytes) {
    warn(logger, '[TemplatePreview] Mídia acima do limite.', {
      templateName,
      format,
      size: downloaded.size,
      maxBytes,
    })
    return null
  }

  const contentType = downloaded.contentType || 'application/octet-stream'
  const allowed = allowedMimeTypesForFormat(format)
  if (allowed.length && !allowed.includes(contentType)) {
    warn(logger, '[TemplatePreview] MIME não permitido.', { templateName, format, contentType })
    return null
  }

  const bucket = String(process.env.SUPABASE_TEMPLATE_MEDIA_BUCKET || 'wa-template-media')
  try {
    await client.storage.createBucket(bucket, { public: true })
  } catch (e) {
    // ignore
  }
  try {
    await client.storage.updateBucket(bucket, { public: true })
  } catch (e) {
    warn(logger, '[TemplatePreview] Falha ao marcar bucket como público.', { bucket })
  }

  const ext = guessExtFromContentType(contentType)
  const urlHash = createHash('sha256').update(example).digest('hex').slice(0, 12)
  const safeName = String(templateName || 'template').replace(/[^a-zA-Z0-9_\-]/g, '_')
  const path = `templates/${safeName}/preview_${urlHash}.${ext}`

  const up = await client.storage
    .from(bucket)
    .upload(path, downloaded.buffer, {
      contentType,
      upsert: true,
      cacheControl: '3600',
    })
  if (up.error) {
    warn(logger, '[TemplatePreview] Falha ao subir mídia no bucket.', { templateName, error: up.error })
    return null
  }

  const pub = client.storage.from(bucket).getPublicUrl(path)
  const publicUrl = pub?.data?.publicUrl
  const probeTimeoutMs = Number(process.env.MEDIA_PUBLIC_PROBE_TIMEOUT_MS || '8000')

  let finalUrl: string | null = null
  let expiresAt: string | null = null
  let mode: 'public' | 'signed' = 'public'

  if (publicUrl) {
    const status = await probeUrl(publicUrl, probeTimeoutMs)
    if (status >= 200 && status < 300) {
      finalUrl = publicUrl
    } else {
      warn(logger, '[TemplatePreview] URL público inacessível, tentando signed.', {
        templateName,
        status,
        bucket,
      })
      const expiresIn = Number(process.env.MEDIA_SIGNED_URL_TTL_SECONDS || String(24 * 60 * 60))
      const signed = await client.storage.from(bucket).createSignedUrl(path, expiresIn)
      const signedUrl = signed?.data?.signedUrl
      if (signedUrl) {
        const signedStatus = await probeUrl(signedUrl, probeTimeoutMs)
        if (signedStatus >= 200 && signedStatus < 300) {
          finalUrl = signedUrl
          expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()
          mode = 'signed'
        } else {
          warn(logger, '[TemplatePreview] Signed URL inacessível.', { templateName, signedStatus })
        }
      } else {
        warn(logger, '[TemplatePreview] Falha ao criar signed URL.', { templateName })
      }
    }
  }

  if (!finalUrl) return null

  try {
    await client
      .from('templates')
      .update({
        header_media_preview_url: finalUrl,
        header_media_preview_expires_at: expiresAt,
        header_media_hash: exampleHash,
        header_media_preview_updated_at: nowIso,
        updated_at: nowIso,
      })
      .eq('name', templateName)
  } catch (e) {
    warn(logger, '[TemplatePreview] Falha ao persistir preview.', { templateName })
  }

  return { url: finalUrl, expiresAt, mode, source: 'generated' }
}

import { NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { settingsDb } from '@/lib/supabase-db'
import { getPrincipal, OWNER_KINDS } from '@/lib/principal'
import type { HealthStatus } from '@/lib/health-check'

// Payload público: só o necessário para o DashboardShell detectar banco fora
// (onboarding overlay). Cacheado em memória para não virar amplificador anônimo.
const PUBLIC_HEALTH_CACHE_TTL_MS = 5_000
let publicHealthCache: { value: HealthStatus; expiresAt: number } | null = null

async function getPublicHealth(): Promise<HealthStatus> {
  const now = Date.now()
  if (publicHealthCache && publicHealthCache.expiresAt > now) return publicHealthCache.value

  let database: HealthStatus['services']['database']
  if (!isSupabaseConfigured()) {
    database = { status: 'not_configured', provider: 'none', message: 'Banco de dados não configurado' }
  } else {
    try {
      const { error } = await supabase.from('settings').select('key').limit(1)
      if (error && !error.message.includes('does not exist')) throw error
      database = { status: 'ok', provider: 'supabase' }
    } catch {
      // Sem mensagem do driver/URL: só o fato de que o banco está fora.
      database = { status: 'error', provider: 'supabase', message: 'Banco de dados indisponível' }
    }
  }

  const value: HealthStatus = {
    overall: database.status === 'ok' ? 'healthy' : 'unhealthy',
    services: {
      database,
      // Não checado no payload público (sem Graph API, sem dados do número).
      whatsapp: { status: 'not_configured' },
    },
    timestamp: new Date(now).toISOString(),
    scope: 'public',
  }
  publicHealthCache = { value, expiresAt: now + PUBLIC_HEALTH_CACHE_TTL_MS }
  return value
}

// Build Vercel dashboard URL dynamically from environment
function getVercelDashboardUrl(): string | null {
  const vercelUrl = process.env.VERCEL_URL
  if (!vercelUrl) return null

  const cleanUrl = vercelUrl.replace('.vercel.app', '')
  const scopeMatch = cleanUrl.match(/-([a-z0-9]+-projects)$/) || cleanUrl.match(/-([a-z0-9-]+)$/)
  if (!scopeMatch) return null

  const scope = scopeMatch[1]
  const beforeScope = cleanUrl.replace(`-${scope}`, '')
  const lastHyphen = beforeScope.lastIndexOf('-')
  if (lastHyphen === -1) return null

  const possibleHash = beforeScope.substring(lastHyphen + 1)
  const projectName = beforeScope.substring(0, lastHyphen)

  if (!/^[a-z0-9]{7,12}$/.test(possibleHash)) {
    return null
  }

  return `https://vercel.com/${scope}/${projectName}`
}

interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    database: {
      status: 'ok' | 'error' | 'not_configured'
      provider: 'supabase' | 'none'
      latency?: number
      message?: string
    }
    whatsapp: {
      status: 'ok' | 'error' | 'not_configured'
      source?: 'db' | 'env' | 'none'
      phoneNumber?: string
      message?: string
    }
    webhook: {
      status: 'ok' | 'error' | 'not_configured'
      lastEventAt?: string | null
      message?: string
    }
  }
  vercel?: {
    dashboardUrl: string | null
    storesUrl: string | null
    env: string
  }
  timestamp: string
  scope: 'full'
}

export async function GET(request: Request) {
  // Política `public` (lib/route-policy.ts): payload completo só para o dono.
  const principal = getPrincipal(request)
  const isOwner = !!principal && (OWNER_KINDS as readonly string[]).includes(principal.kind)
  if (!isOwner) {
    return NextResponse.json(await getPublicHealth(), {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }

  const dashboardUrl = getVercelDashboardUrl()

  const result: HealthCheckResult = {
    overall: 'healthy',
    services: {
      database: { status: 'not_configured', provider: 'none' },
      whatsapp: { status: 'not_configured' },
      webhook: { status: 'not_configured' },
    },
    vercel: {
      dashboardUrl,
      storesUrl: dashboardUrl ? `${dashboardUrl}/stores` : null,
      env: process.env.VERCEL_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
    scope: 'full',
  }

  // 1. Check Database (Supabase)
  if (isSupabaseConfigured()) {
    try {
      const start = Date.now()
      const { error } = await supabase.from('settings').select('key').limit(1)
      const latency = Date.now() - start

      if (error && !error.message.includes('does not exist')) {
        throw error
      }

      result.services.database = {
        status: 'ok',
        provider: 'supabase',
        latency,
        message: `Supabase connected (${latency}ms)`,
      }
    } catch (error) {
      result.services.database = {
        status: 'error',
        provider: 'supabase',
        message: error instanceof Error ? error.message : (error as any)?.message || 'Connection failed',
      }
      result.overall = 'unhealthy'
    }
  } else {
    result.services.database = {
      status: 'not_configured',
      provider: 'none',
      message: 'Supabase not configured',
    }
    result.overall = 'unhealthy'
  }

  // 2. Check WhatsApp credentials
  try {
    const credentials = await getWhatsAppCredentials()

    if (credentials) {
      // Test connection to Meta API
      const testUrl = `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}?fields=display_phone_number`
      const response = await fetchWithTimeout(testUrl, {
        headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
        timeoutMs: 8000,
      })

      if (response.ok) {
        const data = await safeJson<any>(response)
        result.services.whatsapp = {
          status: 'ok',
          source: 'db',
          phoneNumber: data?.display_phone_number,
          message: data?.display_phone_number ? `Connected: ${data.display_phone_number}` : 'Connected',
        }
      } else {
        const error = await safeJson<any>(response)
        result.services.whatsapp = {
          status: 'error',
          source: 'db',
          message: error?.error?.message || 'Token invalid or expired',
        }
        result.overall = 'degraded'
      }
    } else {
      result.services.whatsapp = {
        status: 'not_configured',
        source: 'none',
        message: 'WhatsApp credentials not configured',
      }
      result.overall = 'unhealthy'
    }
  } catch (error) {
    result.services.whatsapp = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
    result.overall = 'degraded'
  }

  // 3. Check Webhook status (only if database is configured)
  if (isSupabaseConfigured()) {
    try {
      let lastEventAt: string | null = null
      let hasRecentEvents = false
      let hasWebhookToken = false

      // Estratégia 1: Verificar eventos recentes em whatsapp_status_events
      try {
        const { data: events, error } = await supabase
          .from('whatsapp_status_events')
          .select('last_received_at')
          .order('last_received_at', { ascending: false })
          .limit(1)

        if (!error && events && events.length > 0) {
          lastEventAt = events[0].last_received_at
          if (lastEventAt) {
            const eventDate = new Date(lastEventAt)
            const now = new Date()
            const hoursSinceLastEvent = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60)
            hasRecentEvents = hoursSinceLastEvent < 24
          }
        }
      } catch {
        // Tabela pode não existir ainda
      }

      // Estratégia 2: Verificar entregas/leituras em campaign_contacts
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
        } catch {
          // ignore
        }
      }

      // Estratégia 3: Verificar se existe token de webhook configurado
      try {
        const token = await settingsDb.get('webhook_verify_token')
        hasWebhookToken = Boolean(token)
      } catch {
        // ignore
      }

      // Decidir resultado do webhook
      if (hasRecentEvents && lastEventAt) {
        result.services.webhook = {
          status: 'ok',
          lastEventAt,
          message: 'Webhook recebendo eventos normalmente',
        }
      } else if (lastEventAt) {
        // Tem eventos mas não são recentes (ainda consideramos OK, só mais de 24h)
        result.services.webhook = {
          status: 'ok',
          lastEventAt,
          message: 'Webhook configurado (sem eventos nas últimas 24h)',
        }
      } else if (hasWebhookToken) {
        // Tem token mas nunca recebeu eventos
        result.services.webhook = {
          status: 'not_configured',
          lastEventAt: null,
          message: 'Token configurado, aguardando primeiro evento',
        }
      } else {
        // Nenhuma indicação de webhook funcionando
        result.services.webhook = {
          status: 'not_configured',
          lastEventAt: null,
          message: 'Webhook não configurado',
        }
      }
    } catch (error) {
      result.services.webhook = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Erro ao verificar webhook',
      }
    }
  }

  // Determine overall status
  // Webhook não é crítico para o overall - só database e whatsapp
  const criticalServices = ['database', 'whatsapp'] as const
  const criticalStatuses = criticalServices.map(s => result.services[s].status)

  if (criticalStatuses.every(s => s === 'ok')) {
    result.overall = 'healthy'
  } else if (criticalStatuses.some(s => s === 'error') || criticalStatuses.filter(s => s === 'not_configured').length > 1) {
    result.overall = 'unhealthy'
  } else {
    result.overall = 'degraded'
  }

  return NextResponse.json(result, {
    headers: {
      // Health check não deve ser cacheado - precisa refletir estado real
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}

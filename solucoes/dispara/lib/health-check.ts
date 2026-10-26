import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// Types for health check response
export interface HealthStatus {
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
        webhook?: {
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
    /**
     * 'public' = payload mínimo de /api/health para quem não é o dono (ou quando a
     * sessão não pôde ser validada, ex.: banco fora). Só `services.database.status`
     * e `overall` são confiáveis; whatsapp/webhook NÃO foram checados.
     * Ausente ou 'full' = payload completo (dono).
     */
    scope?: 'public' | 'full'
}

interface HealthCheckOptions {
    checkExternal?: boolean // If true, pings Meta API.
    checkPing?: boolean     // If true, pings DB. If false, just checks config.
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

export async function getHealthStatus(options: HealthCheckOptions = { checkExternal: true, checkPing: true }): Promise<HealthStatus> {
    const { checkExternal = true, checkPing = true } = options;
    const dashboardUrl = getVercelDashboardUrl()

    const result: HealthStatus = {
        overall: 'healthy',
        services: {
            database: { status: 'not_configured', provider: 'none' },
            whatsapp: { status: 'not_configured' },
        },
        vercel: {
            dashboardUrl,
            storesUrl: dashboardUrl ? `${dashboardUrl}/stores` : null,
            env: process.env.VERCEL_ENV || 'development',
        },
        timestamp: new Date().toISOString(),
    }

    // 1. Check Database (Supabase)
    if (isSupabaseConfigured()) {
        if (checkPing) {
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
                    message: error instanceof Error ? error.message : 'Connection failed',
                }
                result.overall = 'unhealthy'
            }
        } else {
            result.services.database = {
                status: 'ok',
                provider: 'supabase',
                message: 'Supabase configured',
            }
        }
    }

    // 2. Check WhatsApp credentials
    try {
        const credentials = await getWhatsAppCredentials()

        if (credentials) {
            if (options.checkExternal) {
                // Test connection to Meta API
                const testUrl = `https://graph.facebook.com/v24.0/${credentials.phoneNumberId}?fields=display_phone_number`
                const response = await fetch(testUrl, {
                    headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
                })

                if (response.ok) {
                    const data = await response.json()
                    result.services.whatsapp = {
                        status: 'ok',
                        source: 'db',
                        phoneNumber: data.display_phone_number,
                        message: `Connected: ${data.display_phone_number}`,
                    }
                } else {
                    const error = await response.json()
                    result.services.whatsapp = {
                        status: 'error',
                        source: 'db',
                        message: error.error?.message || 'Token invalid or expired',
                    }
                    result.overall = 'degraded'
                }
            } else {
                result.services.whatsapp = {
                    status: 'ok',
                    source: 'db',
                    message: 'Credentials configured (checked locally)',
                }
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

    // Determine overall status
    const statuses = Object.values(result.services).map(s => s.status)
    if (statuses.every(s => s === 'ok')) {
        result.overall = 'healthy'
    } else if (statuses.some(s => s === 'error') || statuses.filter(s => s === 'not_configured').length > 1) {
        result.overall = 'unhealthy'
    } else {
        result.overall = 'degraded'
    }

    return result
}

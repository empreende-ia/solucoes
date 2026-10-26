import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const SETTINGS_KEYS = {
  tokens: 'google_calendar_tokens',
  config: 'google_calendar_config',
  channel: 'google_calendar_channel',
  clientId: 'googleCalendarClientId',
  clientSecret: 'googleCalendarClientSecret',
} as const

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_API_BASE = 'https://www.googleapis.com/calendar/v3'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
]

export type GoogleCalendarTokens = {
  accessToken: string
  refreshToken?: string | null
  expiryDate?: number | null
  scope?: string | null
  tokenType?: string | null
}

export type GoogleCalendarConfig = {
  calendarId: string
  calendarSummary?: string | null
  calendarTimeZone?: string | null
  connectedAt?: string | null
  accountEmail?: string | null
}

export type GoogleCalendarChannel = {
  id: string
  resourceId: string
  token: string
  expiration?: number | null
  calendarId: string
  createdAt: string
  lastNotificationAt?: string | null
  lastResourceState?: string | null
}

export type GoogleCalendarCredentialsSource = 'db' | 'env' | 'none'

export type GoogleCalendarCredentials = {
  clientId: string
  clientSecret: string
  source: GoogleCalendarCredentialsSource
}

export type GoogleCalendarCredentialsPublic = {
  clientId: string | null
  source: GoogleCalendarCredentialsSource
  hasClientSecret: boolean
  isConfigured: boolean
}

function getBaseUrl(): string {
  const vercelEnv = process.env.VERCEL_ENV || null
  if (vercelEnv === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.trim()}`
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.trim()
  }
  return 'http://localhost:3000'
}

export function getGoogleCalendarRedirectUri(): string {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${getBaseUrl()}/api/integrations/google-calendar/callback`
}

export function getGoogleCalendarWebhookUrl(): string {
  return process.env.GOOGLE_CALENDAR_WEBHOOK_URL || `${getBaseUrl()}/api/integrations/google-calendar/webhook`
}

export async function getGoogleCalendarCredentials(): Promise<GoogleCalendarCredentials | null> {
  const envClientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim()
  const envClientSecret = String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim()

  if (isSupabaseConfigured()) {
    try {
      const [dbClientIdRaw, dbClientSecretRaw] = await Promise.all([
        settingsDb.get(SETTINGS_KEYS.clientId),
        settingsDb.get(SETTINGS_KEYS.clientSecret),
      ])
      const dbClientId = String(dbClientIdRaw || '').trim()
      const dbClientSecret = String(dbClientSecretRaw || '').trim()

      if (dbClientId && dbClientSecret) {
        return { clientId: dbClientId, clientSecret: dbClientSecret, source: 'db' }
      }
    } catch {
      // ignore and fallback to env
    }
  }

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret, source: 'env' }
  }

  return null
}

export async function getGoogleCalendarCredentialsPublic(): Promise<GoogleCalendarCredentialsPublic> {
  const envClientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim()
  const envClientSecret = String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim()

  if (isSupabaseConfigured()) {
    try {
      const [dbClientIdRaw, dbClientSecretRaw] = await Promise.all([
        settingsDb.get(SETTINGS_KEYS.clientId),
        settingsDb.get(SETTINGS_KEYS.clientSecret),
      ])
      const dbClientId = String(dbClientIdRaw || '').trim()
      const dbClientSecret = String(dbClientSecretRaw || '').trim()
      if (dbClientId || dbClientSecret) {
        const hasSecret = Boolean(dbClientSecret)
        return {
          clientId: dbClientId || null,
          source: 'db',
          hasClientSecret: hasSecret,
          isConfigured: Boolean(dbClientId && dbClientSecret),
        }
      }
    } catch {
      // ignore
    }
  }

  const hasEnv = Boolean(envClientId || envClientSecret)
  if (hasEnv) {
    return {
      clientId: envClientId || null,
      source: 'env',
      hasClientSecret: Boolean(envClientSecret),
      isConfigured: Boolean(envClientId && envClientSecret),
    }
  }

  return {
    clientId: null,
    source: 'none',
    hasClientSecret: false,
    isConfigured: false,
  }
}

export async function getGoogleCalendarOAuthConfig(): Promise<{
  clientId: string
  clientSecret: string
} | null> {
  const credentials = await getGoogleCalendarCredentials()
  if (!credentials) return null
  return { clientId: credentials.clientId, clientSecret: credentials.clientSecret }
}

export async function buildGoogleCalendarAuthUrl(state: string): Promise<string> {
  const config = await getGoogleCalendarOAuthConfig()
  if (!config) {
    throw new Error('Google Calendar OAuth nao configurado')
  }
  const redirectUri = getGoogleCalendarRedirectUri()

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_SCOPES.join(' '),
    state,
  })

  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`
}

function randomToken(prefix: string): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '')}`
    }
  } catch {
    // ignore
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function createOAuthState(): string {
  return randomToken('gc_state')
}

export function createChannelToken(): string {
  return randomToken('gc_token')
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleCalendarTokens> {
  const config = await getGoogleCalendarOAuthConfig()
  if (!config) throw new Error('Google Calendar OAuth nao configurado')

  const redirectUri = getGoogleCalendarRedirectUri()

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((json as any)?.error_description || (json as any)?.error || 'Falha ao trocar code')
  }

  return {
    accessToken: String((json as any).access_token || ''),
    refreshToken: (json as any).refresh_token ? String((json as any).refresh_token) : null,
    expiryDate: (json as any).expires_in ? Date.now() + Number((json as any).expires_in) * 1000 : null,
    scope: (json as any).scope ? String((json as any).scope) : null,
    tokenType: (json as any).token_type ? String((json as any).token_type) : null,
  }
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  if (!accessToken) return null
  try {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) return null
    const email = typeof (json as any).email === 'string' ? String((json as any).email) : ''
    return email.trim() ? email.trim() : null
  } catch (error) {
    console.warn('[google-calendar] Falha ao obter email:', error)
    return null
  }
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleCalendarTokens> {
  const config = await getGoogleCalendarOAuthConfig()
  if (!config) throw new Error('Google Calendar OAuth nao configurado')

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error((json as any)?.error_description || (json as any)?.error || 'Falha ao renovar token')
  }

  return {
    accessToken: String((json as any).access_token || ''),
    refreshToken,
    expiryDate: (json as any).expires_in ? Date.now() + Number((json as any).expires_in) * 1000 : null,
    scope: (json as any).scope ? String((json as any).scope) : null,
    tokenType: (json as any).token_type ? String((json as any).token_type) : null,
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const body = new URLSearchParams({ token })
  await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => null)
}

export async function getStoredTokens(): Promise<GoogleCalendarTokens | null> {
  if (!isSupabaseConfigured()) return null
  const raw = await settingsDb.get(SETTINGS_KEYS.tokens)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.accessToken) return null
    return parsed as GoogleCalendarTokens
  } catch {
    return null
  }
}

export async function saveTokens(tokens: GoogleCalendarTokens): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase nao configurado')
  }
  await settingsDb.set(SETTINGS_KEYS.tokens, JSON.stringify(tokens))
}

export async function clearTokens(): Promise<void> {
  if (!isSupabaseConfigured()) return
  await settingsDb.set(SETTINGS_KEYS.tokens, '')
}

export async function getCalendarConfig(): Promise<GoogleCalendarConfig | null> {
  if (!isSupabaseConfigured()) return null
  const raw = await settingsDb.get(SETTINGS_KEYS.config)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.calendarId) return null
    return parsed as GoogleCalendarConfig
  } catch {
    return null
  }
}

export async function saveCalendarConfig(config: GoogleCalendarConfig): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase nao configurado')
  }
  await settingsDb.set(SETTINGS_KEYS.config, JSON.stringify(config))
}

export async function clearCalendarConfig(): Promise<void> {
  if (!isSupabaseConfigured()) return
  await settingsDb.set(SETTINGS_KEYS.config, '')
}

export async function getCalendarChannel(): Promise<GoogleCalendarChannel | null> {
  if (!isSupabaseConfigured()) return null
  const raw = await settingsDb.get(SETTINGS_KEYS.channel)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.id || !parsed?.resourceId) return null
    return parsed as GoogleCalendarChannel
  } catch {
    return null
  }
}

export async function saveCalendarChannel(channel: GoogleCalendarChannel | null): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase nao configurado')
  }
  if (!channel) {
    await settingsDb.set(SETTINGS_KEYS.channel, '')
    return
  }
  await settingsDb.set(SETTINGS_KEYS.channel, JSON.stringify(channel))
}

export async function ensureAccessToken(): Promise<GoogleCalendarTokens> {
  const current = await getStoredTokens()
  if (!current) throw new Error('Google Calendar nao conectado')

  const expiresAt = current.expiryDate || 0
  const safeWindowMs = 60 * 1000
  if (expiresAt && Date.now() < expiresAt - safeWindowMs) {
    return current
  }

  if (!current.refreshToken) {
    return current
  }

  const refreshed = await refreshAccessToken(current.refreshToken)
  const merged = { ...current, ...refreshed }
  await saveTokens(merged)
  return merged
}

async function googleCalendarFetch(path: string, init?: RequestInit): Promise<any> {
  const token = await ensureAccessToken()
  const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.accessToken}`,
      ...(init?.headers || {}),
    },
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (json as any)?.error?.message || (json as any)?.error || 'Falha na chamada Google Calendar'
    throw new Error(message)
  }
  return json
}

export async function listCalendars(): Promise<any[]> {
  const data = await googleCalendarFetch('/users/me/calendarList')
  return Array.isArray(data?.items) ? data.items : []
}

export async function getCalendar(calendarId: string): Promise<any> {
  return googleCalendarFetch(`/calendars/${encodeURIComponent(calendarId)}`)
}

export async function listBusyTimes(params: {
  calendarId: string
  timeMin: string
  timeMax: string
  timeZone?: string
}): Promise<Array<{ start: string; end: string }>> {
  const data = await googleCalendarFetch('/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      timeZone: params.timeZone,
      items: [{ id: params.calendarId }],
    }),
  })

  const busy = data?.calendars?.[params.calendarId]?.busy
  if (!Array.isArray(busy)) return []
  return busy.map((item: any) => ({
    start: String(item.start),
    end: String(item.end),
  }))
}

export async function createEvent(params: {
  calendarId: string
  event: Record<string, unknown>
}): Promise<any> {
  return googleCalendarFetch(`/calendars/${encodeURIComponent(params.calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(params.event),
  })
}

export async function stopWatchChannel(channel: { id: string; resourceId: string }): Promise<void> {
  try {
    await googleCalendarFetch('/channels/stop', {
      method: 'POST',
      body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }),
    })
  } catch (error) {
    console.warn('[google-calendar] Falha ao parar channel:', error)
  }
}

export async function createWatchChannel(params: {
  calendarId: string
  channelId: string
  channelToken: string
  address: string
}): Promise<GoogleCalendarChannel> {
  const data = await googleCalendarFetch(`/calendars/${encodeURIComponent(params.calendarId)}/events/watch`, {
    method: 'POST',
    body: JSON.stringify({
      id: params.channelId,
      type: 'web_hook',
      address: params.address,
      token: params.channelToken,
    }),
  })

  return {
    id: String(data.id || params.channelId),
    resourceId: String(data.resourceId || ''),
    token: params.channelToken,
    expiration: data.expiration ? Number(data.expiration) : null,
    calendarId: params.calendarId,
    createdAt: new Date().toISOString(),
  }
}

export async function buildDefaultCalendarConfig(accountEmail?: string | null): Promise<GoogleCalendarConfig> {
  const calendars = await listCalendars()
  const primary = calendars.find((item: any) => item.primary) || calendars[0]
  if (!primary) {
    throw new Error('Nenhum calendario encontrado')
  }
  return {
    calendarId: String(primary.id),
    calendarSummary: String(primary.summary || ''),
    calendarTimeZone: primary.timeZone ? String(primary.timeZone) : null,
    connectedAt: new Date().toISOString(),
    accountEmail: accountEmail || null,
  }
}

export async function ensureCalendarChannel(calendarId: string): Promise<GoogleCalendarChannel> {
  const existing = await getCalendarChannel()
  const now = Date.now()
  if (existing && existing.calendarId === calendarId) {
    const expiresAt = existing.expiration || 0
    const renewWindow = 24 * 60 * 60 * 1000
    if (!expiresAt || expiresAt - now > renewWindow) {
      return existing
    }
  }

  if (existing?.id && existing.resourceId) {
    await stopWatchChannel({ id: existing.id, resourceId: existing.resourceId })
  }

  const channelId = randomToken('gc_channel')
  const channelToken = createChannelToken()
  const address = getGoogleCalendarWebhookUrl()
  const channel = await createWatchChannel({
    calendarId,
    channelId,
    channelToken,
    address,
  })
  await saveCalendarChannel(channel)
  return channel
}

export async function clearCalendarIntegration(): Promise<void> {
  const channel = await getCalendarChannel()
  if (channel?.id && channel.resourceId) {
    await stopWatchChannel({ id: channel.id, resourceId: channel.resourceId })
  }
  await saveCalendarChannel(null)
  await clearCalendarConfig()
  await clearTokens()
}

export async function markCalendarNotification(params: {
  resourceState?: string | null
}): Promise<void> {
  const channel = await getCalendarChannel()
  if (!channel) return
  const updated: GoogleCalendarChannel = {
    ...channel,
    lastNotificationAt: new Date().toISOString(),
    lastResourceState: params.resourceState || channel.lastResourceState || null,
  }
  await saveCalendarChannel(updated)
}

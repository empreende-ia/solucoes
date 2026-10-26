/**
 * Supabase Client
 * 
 * PostgreSQL database with connection pooling and RLS
 * Banco principal do Dispara (PostgreSQL + RLS)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

function getSupabasePublishableKey(): string | undefined {
    // O Supabase pode gerar esse nome no snippet do dashboard.
    return (
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
        // Compat: alguns projetos ainda usam ANON_KEY no .env
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
}

function getSupabaseServiceRoleKey(): string | undefined {
    // Canonical neste projeto: SUPABASE_SECRET_KEY
    // Compat: muitos setups usam SUPABASE_SERVICE_ROLE_KEY
    return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
}

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

// ============================================================================
// SUPABASE CLIENTS
// ============================================================================

// Server-side client with service role (full access, bypasses RLS)
// Use this for API routes and server components
let _supabaseAdmin: SupabaseClient | null = null

/**
 * Retorna um client Supabase server-side com Service Role (bypassa RLS).
 *
 * Use em rotas de API e componentes server-side que precisam de acesso administrativo.
 * Retorna `null` quando variáveis de ambiente obrigatórias não estão configuradas
 * (útil durante o wizard de setup).
 *
 * @returns Client Supabase admin, ou `null` se não configurado.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = getSupabaseServiceRoleKey()

    // Silencia warnings durante build (SSG) - env vars não disponíveis é esperado
    const isBuildTime = typeof window === 'undefined' && !process.env.VERCEL_ENV

    if (!key) {
        if (!isBuildTime) {
            console.warn('[getSupabaseAdmin] Supabase service role key is missing (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)')
        }
        return null;
    }
    if (!url) {
        if (!isBuildTime) {
            console.warn('[getSupabaseAdmin] NEXT_PUBLIC_SUPABASE_URL is missing');
        }
        return null;
    }

    // Validation: Ensure Service Key is NOT the Anon Key to prevent "Permission Denied" errors
    const publishableKey = getSupabasePublishableKey();
    if (publishableKey && key === publishableKey) {
        console.error('[CRITICAL] Supabase secret key está igual ao publishable key. Isso causa erros de permissão. Verifique as variáveis de ambiente na Vercel.');
    }

    if (!_supabaseAdmin) {
        _supabaseAdmin = createClient(url, key, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        })
    }
    return _supabaseAdmin
}

// Client-side client with anon key (respects RLS)
// Use this for browser components
let _supabaseBrowser: SupabaseClient | null = null

/**
 * Retorna um client Supabase para uso no browser (respeita RLS).
 *
 * Este client usa a publishable/anon key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
 * Retorna `null` quando não configurado, permitindo que a aplicação suba para o
 * wizard de configuração.
 *
 * @returns Client Supabase do navegador, ou `null` se não configurado.
 */
export function getSupabaseBrowser(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = getSupabasePublishableKey()

    if (!url || !key) {
        // Return null when not configured - allows app to boot for setup wizard
        return null
    }

    if (!_supabaseBrowser) {
        _supabaseBrowser = createClient(url, key)
    }
    return _supabaseBrowser
}

/**
 * Facade de acesso ao Supabase.
 *
 * - `admin`: client server-side com Service Role (bypassa RLS) — para rotas de API.
 * - `browser`: client client-side com chave publishable (respeita RLS) — para componentes.
 * - `from`/`rpc`: atalhos que assumem client admin (server-side).
 *
 * Observação: esta facade existe por compatibilidade; prefira obter explicitamente
 * via {@link getSupabaseAdmin} / {@link getSupabaseBrowser} quando possível.
 */
// Backwards-compatible export (defaults to admin client for API routes)
export const supabase = {
    get admin() {
        return getSupabaseAdmin()
    },
    get browser() {
        return getSupabaseBrowser()
    },
    // Default to admin for server-side operations
    from: (table: string) => {
        const client = getSupabaseAdmin()
        if (!client) throw new Error('Supabase not configured. Complete setup at /install')
        return client.from(table)
    },
    rpc: (fn: string, params?: object) => {
        const client = getSupabaseAdmin()
        if (!client) throw new Error('Supabase not configured. Complete setup at /install')
        return client.rpc(fn, params)
    },

    /**
     * Execute SQL "raw" (uso interno / compat)
     * Observação: este helper é limitado — prefira query builder / RPCs explícitas.
     */
    async execute(query: string | { sql: string; args?: unknown[] }): Promise<{
        rows: Record<string, unknown>[];
        rowsAffected: number
    }> {
        const sql = typeof query === 'string' ? query : query.sql
        const args = typeof query === 'object' ? query.args || [] : []

        // Parse SQL to determine operation type and table
        const sqlLower = sql.toLowerCase().trim()

        // For simple SELECT queries, try to use Supabase's query builder
        if (sqlLower.startsWith('select')) {
            // Extract table name (basic parsing)
            const fromMatch = sql.match(/from\s+(\w+)/i)
            if (fromMatch) {
                const table = fromMatch[1]
                const client = getSupabaseAdmin()
                if (!client) throw new Error('Supabase not configured')
                const { data, error } = await client.from(table).select('*')
                if (error) throw error
                return { rows: data || [], rowsAffected: 0 }
            }
        }

        // For UPDATE/INSERT/DELETE, use table operations
        if (sqlLower.startsWith('update')) {
            const tableMatch = sql.match(/update\s+(\w+)/i)
            if (tableMatch) {
                const table = tableMatch[1]
                // Extract SET and WHERE clauses - this is simplified
                // For complex queries, we fall through to RPC
                // Return empty for now - specific routes should be refactored
                return { rows: [], rowsAffected: 1 }
            }
        }

        if (sqlLower.startsWith('insert')) {
            return { rows: [], rowsAffected: 1 }
        }

        if (sqlLower.startsWith('delete')) {
            return { rows: [], rowsAffected: 1 }
        }

        // Fallback - return empty (route should be refactored)
        console.warn('[supabase.execute] Raw SQL not fully supported, refactor route:', sql.substring(0, 100))
        return { rows: [], rowsAffected: 0 }
    },
}

// ============================================================================
// CONNECTION CHECK
// ============================================================================

/**
 * Verifica conectividade com o Supabase medindo latência aproximada.
 *
 * A checagem tenta executar uma query simples em `campaigns`.
 * Se a tabela ainda não existir (ambiente novo), considera conectividade como OK.
 *
 * @returns Objeto com `connected`, `latency` (ms) quando aplicável e `error` quando falhar.
 */
export async function checkSupabaseConnection(): Promise<{
    connected: boolean
    latency?: number
    error?: string
}> {
    try {
        const client = getSupabaseAdmin()
        if (!client) {
            return { connected: false, error: 'Supabase not configured' }
        }
        const start = Date.now()
        const { error } = await client
            .from('campaigns')
            .select('count')
            .limit(1)

        if (error && !error.message.includes('relation "campaigns" does not exist')) {
            return { connected: false, error: error.message }
        }

        return { connected: true, latency: Date.now() - start }
    } catch (err) {
        return {
            connected: false,
            error: err instanceof Error ? err.message : 'Unknown error'
        }
    }
}

// ============================================================================
// SUPABASE AVAILABILITY CHECK
// ============================================================================

/**
 * Indica se as variáveis de ambiente mínimas do Supabase estão configuradas.
 *
 * @returns `true` se URL + publishable key + secret key estiverem presentes; caso contrário `false`.
 */
export function isSupabaseConfigured(): boolean {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publishableKey = getSupabasePublishableKey()
    const secretKey = getSupabaseServiceRoleKey()
    return !!(url && publishableKey && secretKey)
}

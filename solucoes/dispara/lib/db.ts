/**
 * Database Layer Export
 * 
 * Provides a unified interface for database operations
 * Currently exclusively uses Supabase (PostgreSQL)
 */

// Always use Supabase
const provider = 'supabase'

// Lazy imports for code splitting
async function getSupabaseDb() {
    const supabaseDb = await import('./supabase-db')
    return supabaseDb
}

// =============================================================================
// TYPE EXPORTS (always available)
// =============================================================================

export type {
    Campaign,
    Contact,
    Template,
    AppSettings,
} from '../types'

// =============================================================================
// DATABASE EXPORTS (provider-based)
// =============================================================================

// For synchronous imports, we export provider-specific modules
// Use these when you need synchronous access

export * from './supabase' // Supabase client is always available

console.log('[DB] Using Supabase (PostgreSQL)')

// =============================================================================
// UNIFIED DATABASE ACCESSOR
// =============================================================================

/**
 * Get the database module based on current provider
 * Use this for dynamic access
 */
export async function getDb() {
    return getSupabaseDb()
}

/**
 * Get the current database provider name
 */
export function getDbProvider(): 'supabase' {
    return 'supabase'
}

import { settingsDb } from '@/lib/supabase-db'

interface VerifyTokenOptions {
    readonly?: boolean
}

let inMemoryToken: string | null = null

const TOKEN_NOT_FOUND_READONLY = 'token-not-found-readonly'
const TOKEN_RETRIEVAL_ERROR = 'error-retrieving-token'

/**
 * Valores que getVerifyToken devolve quando NÃO há token. São previsíveis, então
 * quem compara (handshake GET do webhook) precisa tratá-los como "não configurado".
 */
export const VERIFY_TOKEN_SENTINELS: readonly string[] = [TOKEN_NOT_FOUND_READONLY, TOKEN_RETRIEVAL_ERROR] as const

/** true se o valor é um verify token de verdade (não vazio e não sentinela). */
export function isConfiguredVerifyToken(token: string | null | undefined): token is string {
    if (typeof token !== 'string') return false
    const value = token.trim()
    return value.length > 0 && !VERIFY_TOKEN_SENTINELS.includes(value)
}

/**
 * Get or generate webhook verify token
 * 
 * @param options.readonly If true, will NOT generate a new token if missing (prevents race conditions)
 */
export async function getVerifyToken(options: VerifyTokenOptions = {}): Promise<string> {
    const { readonly = false } = options

    try {
        // 1. Try Supabase settings (Primary - "Source of Truth")
        console.log('🔍 getVerifyToken: Checking DB...')
        const storedToken = await settingsDb.get('webhook_verify_token')
        if (storedToken) {
            console.log('✅ getVerifyToken: Found in DB')
            return storedToken
        }

        // 2. Try Environment Variable (Fallback)
        if (process.env.WEBHOOK_VERIFY_TOKEN) {
            console.log('ℹ️ getVerifyToken: Using ENV fallback')
            return process.env.WEBHOOK_VERIFY_TOKEN.trim()
        }

        // 3. If Read-Only, stop here (use in-memory if available)
        if (readonly) {
            if (inMemoryToken) {
                console.log('ℹ️ getVerifyToken: Using in-memory fallback (readonly)')
                return inMemoryToken
            }
            console.warn('⚠️ getVerifyToken: Token missing and Read-Only. Failing.')
            return TOKEN_NOT_FOUND_READONLY
        }

        // 4. Generate New Token (fallback to memory if DB unavailable)
        const newToken = crypto.randomUUID()
        inMemoryToken = newToken
        console.log('🔑 getVerifyToken: Generating new token')
        try {
            await settingsDb.set('webhook_verify_token', newToken)
        } catch (err) {
            console.warn('⚠️ getVerifyToken: Failed to persist token, using in-memory fallback.')
        }

        // Safety: Verify it was written (Consistency check)
        const check = await settingsDb.get('webhook_verify_token')
        if (check !== newToken) {
            console.error('💥 getVerifyToken: Write failed consistency check!')
        }

        return newToken

    } catch (err) {
        console.error('💥 getVerifyToken Error:', err)
        if (inMemoryToken) return inMemoryToken
        return process.env.WEBHOOK_VERIFY_TOKEN?.trim() || TOKEN_RETRIEVAL_ERROR
    }
}

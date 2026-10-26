import { randomBytes } from 'crypto'

/**
 * Authentication & Authorization helpers
 *
 * Verificação de API key (DISPARA_API_KEY / DISPARA_ADMIN_KEY) e respostas 401/403.
 *
 * A política de QUEM pode chamar cada rota NÃO mora mais aqui: ela é a tabela
 * de lib/route-policy.ts, aplicada pelo proxy.ts (casamento exato por segmento).
 * As antigas listas PUBLIC_ENDPOINTS/ADMIN_ENDPOINTS casavam por prefixo
 * (`startsWith`) e expunham rotas inteiras por engano.
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqualString } from '@/lib/safe-compare'

// ============================================================================
// Types
// ============================================================================

export interface AuthResult {
  valid: boolean
  error?: string
  keyType?: 'admin' | 'api'
}

// ============================================================================
// API Key Verification
// ============================================================================

/**
 * Verify API key from request headers
 *
 * Expects header: Authorization: Bearer <api_key>
 * Or: X-API-Key: <api_key>
 *
 * Comparação em tempo constante (lib/safe-compare.ts).
 */
export async function verifyApiKey(request: Pick<NextRequest, 'headers'>): Promise<AuthResult> {
  // Extract API key from headers
  const authHeader = request.headers.get('authorization')
  const apiKeyHeader = request.headers.get('x-api-key')

  let apiKey: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7)
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader
  }

  if (!apiKey) {
    return {
      valid: false,
      error: 'Missing API key. Use Authorization: Bearer <key> or X-API-Key header'
    }
  }

  // Check against environment variables
  const envApiKey = process.env.DISPARA_API_KEY
  const envAdminKey = process.env.DISPARA_ADMIN_KEY

  // Compara com as duas chaves sempre (sem curto-circuito) para não vazar por timing
  // qual delas está configurada.
  const isAdmin = timingSafeEqualString(apiKey, envAdminKey)
  const isApi = timingSafeEqualString(apiKey, envApiKey)

  if (isAdmin) {
    return { valid: true, keyType: 'admin' }
  }

  if (isApi) {
    return { valid: true, keyType: 'api' }
  }

  return {
    valid: false,
    error: 'Invalid API key'
  }
}

/**
 * Verify admin access
 * Returns true if request has admin-level API key
 */
export async function verifyAdminAccess(request: Pick<NextRequest, 'headers'>): Promise<AuthResult> {
  const authResult = await verifyApiKey(request)

  if (!authResult.valid) {
    return authResult
  }

  if (authResult.keyType !== 'admin') {
    return {
      valid: false,
      error: 'Admin access required for this endpoint'
    }
  }

  return authResult
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    {
      error: 'Unauthorized',
      message,
      hint: 'Include Authorization: Bearer <api_key> header'
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="Dispara API"'
      }
    }
  )
}

/**
 * Create forbidden response
 */
export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
  return NextResponse.json(
    {
      error: 'Forbidden',
      message
    },
    { status: 403 }
  )
}

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Generate a new API key
 */
export function generateApiKey(): string {
  return 'dsp_' + randomBytes(24).toString('base64url').slice(0, 32)
}

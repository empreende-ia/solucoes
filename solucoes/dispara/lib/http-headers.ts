/**
 * Common HTTP headers for API responses.
 * Extracted to avoid duplication across API routes.
 */

/**
 * Headers to completely disable caching.
 * Use for dynamic data that should never be cached.
 *
 * @example
 * return NextResponse.json(data, { headers: CACHE_DISABLE_HEADERS })
 */
export const CACHE_DISABLE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
} as const

/**
 * Headers for private cache (browser only, no CDN).
 * Use for user-specific data.
 */
export const CACHE_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
} as const

/**
 * Headers for short-term caching (1 minute).
 * Use for data that changes occasionally.
 */
export const CACHE_SHORT_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=60',
} as const

/**
 * Headers for medium-term caching (5 minutes).
 * Use for relatively stable data.
 */
export const CACHE_MEDIUM_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300',
} as const

/**
 * CORS headers for public endpoints (e.g., lead forms).
 * Allows requests from any origin.
 */
export const CORS_PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

/**
 * Creates cache headers with custom max-age.
 *
 * @param maxAge - Max age in seconds
 * @param isPrivate - Whether cache should be private (browser only)
 * @returns Cache headers object
 */
export function createCacheHeaders(maxAge: number, isPrivate = false): Record<string, string> {
  const directive = isPrivate ? 'private' : 'public'
  return {
    'Cache-Control': `${directive}, max-age=${maxAge}, s-maxage=${maxAge}`,
  }
}

/**
 * Brand API (whitelabel)
 *
 * GET público: retorna { name, logoUrl, primaryColor } do deploy.
 * Usado pelo login, sidebar e PWA — não expõe dados sensíveis.
 */

import { NextResponse } from 'next/server'
import { getBrandConfig } from '@/lib/branding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const brand = await getBrandConfig()

  return NextResponse.json(brand, {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
  })
}

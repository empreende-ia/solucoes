import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

// GET - Detect available domains for webhook configuration
export async function GET(request: NextRequest) {
  const headersList = await headers()

  // Collect all possible domains
  const domains: Array<{ url: string; source: string; recommended: boolean }> = []

  // 1. Vercel production URL (highest priority - always recommended)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const url = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    domains.push({
      url,
      source: 'Vercel Production',
      recommended: true, // Always recommended
    })
  }

  // 2. User-configured domain (manual override)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const url = process.env.NEXT_PUBLIC_APP_URL
    if (!domains.some(d => d.url === url)) {
      domains.push({
        url,
        source: 'Configurado manualmente',
        recommended: !process.env.VERCEL_PROJECT_PRODUCTION_URL,
      })
    }
  }

  // 3. Detect from request host header
  const host = headersList.get('host')
  const protocol = headersList.get('x-forwarded-proto') || 'https'
  if (host && !host.includes('localhost')) {
    const url = `${protocol}://${host}`
    if (!domains.some(d => d.url === url)) {
      domains.push({
        url,
        source: 'Request Host',
        recommended: false,
      })
    }
  }

  // Get currently selected domain from localStorage proxy (we'll handle this client-side)
  // Here we just return the available options

  return NextResponse.json({
    domains,
    webhookPath: '/api/webhook',
    currentSelection: process.env.NEXT_PUBLIC_APP_URL || null,
  })
}

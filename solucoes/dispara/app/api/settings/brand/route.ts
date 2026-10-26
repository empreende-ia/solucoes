import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { getBrandConfig, normalizeHexColor, DEFAULT_BRAND } from '@/lib/branding'

/**
 * API Route: Brand Settings (whitelabel)
 *
 * GET: retorna a configuração de marca resolvida (com defaults)
 * PUT: atualiza brand_name / brand_logo_url / brand_primary_color na tabela settings
 *      (permite ajustar a marca sem reinstalar)
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const brand = await getBrandConfig()
  return NextResponse.json(brand)
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Supabase não configurado. Complete o setup em /install.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl.trim() : ''
    const rawColor = typeof body.primaryColor === 'string' ? body.primaryColor.trim() : ''

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: 'Nome da marca deve ter pelo menos 2 caracteres' },
        { status: 400 }
      )
    }

    // Logo: aceita URL absoluta (http/https) ou caminho relativo iniciado por "/"
    if (logoUrl && !/^https?:\/\//i.test(logoUrl) && !logoUrl.startsWith('/')) {
      return NextResponse.json(
        { error: 'URL do logo inválida (use https://... ou caminho iniciado por /)' },
        { status: 400 }
      )
    }

    const primaryColor = rawColor
      ? normalizeHexColor(rawColor)
      : DEFAULT_BRAND.primaryColor

    if (!primaryColor) {
      return NextResponse.json(
        { error: 'Cor primária inválida (use formato hex, ex: #10b981)' },
        { status: 400 }
      )
    }

    // Persiste via settingsDb (invalida cache Redis automaticamente)
    await Promise.all([
      settingsDb.set('brand_name', name),
      settingsDb.set('brand_logo_url', logoUrl),
      settingsDb.set('brand_primary_color', primaryColor),
    ])

    const brand = await getBrandConfig()
    return NextResponse.json({ success: true, brand })
  } catch (error) {
    console.error('[Settings Brand] Erro:', error)
    return NextResponse.json({ error: 'Erro ao salvar configuração de marca' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'

function isMaskedToken(token: unknown): boolean {
  if (typeof token !== 'string') return false
  const t = token.trim()
  return t === '' || t === '***configured***' || t === '••••••••••'
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  let phoneNumberId = (body.phoneNumberId || '').trim()
  let accessToken = (body.accessToken || '').trim()

  // Se o token está mascarado, usa o token salvo no banco
  if (isMaskedToken(accessToken)) {
    const creds = await getWhatsAppCredentials()
    if (!creds?.accessToken) {
      return NextResponse.json({ error: 'Token não configurado' }, { status: 400 })
    }
    accessToken = creds.accessToken
  }

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${phoneNumberId}?fields=display_phone_number,quality_rating,verified_name`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeoutMs: 3500,
      }
    )

    const data = (await safeJson<any>(response)) || {}
    
    if (!response.ok) {
      console.error('Meta API Error (phone-number):', JSON.stringify(data, null, 2))
      const errorMessage = data.error?.message || 'Failed to fetch phone details'
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Meta API Error (phone-number):', error)
    // Evita 500 para não quebrar UX; o front consegue exibir erro amigável.
    return NextResponse.json({ error: 'Falha ao consultar a Meta (timeout/rede). Tente novamente.' }, { status: 502 })
  }
}

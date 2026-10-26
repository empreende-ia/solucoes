import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest) {
  let businessAccountId: string | undefined
  let accessToken: string | undefined

  // Try to get from request body first
  try {
    const body = await request.json()
    businessAccountId = body.businessAccountId
    accessToken = body.accessToken
  } catch {
    // Sem body: fallback para credenciais salvas
  }

  // Fallback para credenciais salvas (Supabase/env)
  if (!businessAccountId || !accessToken) {
    const credentials = await getWhatsAppCredentials()
    if (credentials) {
      businessAccountId = credentials.businessAccountId
      accessToken = credentials.accessToken
    }
  }

  if (!businessAccountId || !accessToken) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas. Configure em Ajustes.' }, 
      { status: 401 }
    )
  }

  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,webhook_configuration`,
      { headers: { 'Authorization': `Bearer ${accessToken}` }, timeoutMs: 8000 }
    )

    if (!response.ok) {
      const error = await safeJson<any>(response)
      return NextResponse.json(
        { error: error?.error?.message || 'Falha ao buscar números de telefone' }, 
        { status: response.status }
      )
    }

    const data = await safeJson<any>(response)
    return NextResponse.json(data.data || [])
  } catch (error) {
    console.error('Error fetching phone numbers:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Also support GET for simpler access
export async function GET() {
  const credentials = await getWhatsAppCredentials()
  
  if (!credentials) {
    return NextResponse.json(
      { error: 'Credenciais não configuradas. Configure em Ajustes.' }, 
      { status: 401 }
    )
  }

  try {
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,webhook_configuration`,
      { headers: { 'Authorization': `Bearer ${credentials.accessToken}` }, timeoutMs: 8000 }
    )

    if (!response.ok) {
      const error = await safeJson<any>(response)
      return NextResponse.json(
        { error: error?.error?.message || 'Falha ao buscar números de telefone' }, 
        { status: response.status }
      )
    }

    const data = await safeJson<any>(response)
    return NextResponse.json(data.data || [])
  } catch (error) {
    console.error('Error fetching phone numbers:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { z } from 'zod'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'

const BulkDeleteSchema = z.object({
  names: z.array(z.string()).min(1, 'Selecione pelo menos um template')
})

/**
 * POST /api/templates/bulk-delete
 * Delete multiple templates from Meta
 */
export async function POST(request: NextRequest) {
  try {
    const credentials = await getWhatsAppCredentials()
    
    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }
    const validation = BulkDeleteSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      )
    }

    const { names } = validation.data
    const results = {
      total: names.length,
      deleted: 0,
      failed: 0,
      success: [] as string[],
      errors: [] as Array<{ name: string; error: string }>
    }

    // Delete each template
    for (const name of names) {
      try {
        const response = await fetchWithTimeout(
          `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${encodeURIComponent(name)}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`
            },
            timeoutMs: 8000,
          }
        )

        const data = await safeJson<any>(response)

        if (response.ok && data.success) {
          results.deleted++
          results.success.push(name)
        } else {
          results.failed++
          results.errors.push({
            name,
            error: data?.error?.message || 'Erro desconhecido'
          })
        }
      } catch (error) {
        results.failed++
        results.errors.push({
          name,
          error: error instanceof Error ? error.message : 'Erro de conexão'
        })
      }
    }

    return NextResponse.json(results)

  } catch (error) {
    console.error('Bulk delete error:', error)
    return NextResponse.json(
      { error: 'Falha ao deletar templates' },
      { status: 500 }
    )
  }
}

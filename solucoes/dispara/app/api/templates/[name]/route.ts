import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import { fetchWithTimeout, safeJson } from '@/lib/server-http'
import { ensureHeaderMediaPreviewUrl } from '@/lib/whatsapp/template-media-preview'

// GET /api/templates/[name] - Buscar template específico
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const url = new URL(request.url)
    const forcePreview =
      url.searchParams.get('refresh_preview') === '1' || url.searchParams.get('force_preview') === '1'
    const { name } = await params
    const credentials = await getWhatsAppCredentials()
    
    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas.' }, 
        { status: 401 }
      )
    }

    // Buscar template específico pelo nome
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,language,category,parameter_format,components,last_updated_time,quality_score,rejected_reason`,
      {
        headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
        timeoutMs: 8000,
      }
    )

    if (!response.ok) {
      const error = await safeJson<any>(response)
      return NextResponse.json(
        { error: error?.error?.message || 'Template não encontrado' },
        { status: response.status }
      )
    }

    const data = await safeJson<any>(response)
    
    if (!data.data || data.data.length === 0) {
      return NextResponse.json(
        { error: 'Template não encontrado' },
        { status: 404 }
      )
    }

    const template = data.data[0]
    const bodyComponent = template.components?.find((c: { type: string }) => c.type === 'BODY')
    const headerComponent = template.components?.find((c: { type: string }) => c.type === 'HEADER')
    const footerComponent = template.components?.find((c: { type: string }) => c.type === 'FOOTER')
    const buttonsComponent = template.components?.find((c: { type: string }) => c.type === 'BUTTONS')

    const previewResult = await ensureHeaderMediaPreviewUrl({
      templateName: template.name,
      components: template.components || [],
      accessToken: credentials.accessToken,
      force: forcePreview,
      logger: (message, meta) => console.warn(message, meta || ''),
    })

    return NextResponse.json({
      id: template.name,
      metaTemplateId: template.id || null,
      name: template.name,
      category: template.category,
      language: template.language,
      status: template.status,
      content: bodyComponent?.text || '',
      header: headerComponent?.text || headerComponent?.format || null,
      footer: footerComponent?.text || null,
      buttons: buttonsComponent?.buttons || [],
      components: template.components,
      headerMediaPreviewUrl: previewResult?.url || null,
      headerMediaPreviewExpiresAt: previewResult?.expiresAt || null,
      qualityScore: template.quality_score?.score || null,
      rejectedReason: template.rejected_reason || null,
      lastUpdated: template.last_updated_time
    })

  } catch (error) {
    console.error('Get Template Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}

// DELETE /api/templates/[name] - Deletar template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const credentials = await getWhatsAppCredentials()
    
    if (!credentials?.businessAccountId || !credentials?.accessToken) {
      return NextResponse.json(
        { error: 'Credenciais não configuradas.' }, 
        { status: 401 }
      )
    }

    // Deletar template via Meta API
    // A Meta exige que especifiquemos o nome do template
    const response = await fetchWithTimeout(
      `https://graph.facebook.com/v24.0/${credentials.businessAccountId}/message_templates?name=${name}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${credentials.accessToken}` },
        timeoutMs: 8000,
      }
    )

    const result = await safeJson<any>(response)

    if (!response.ok) {
      console.error('Meta Delete Error:', result)
      
      let errorMessage = result?.error?.message || 'Erro ao deletar template'

      // Traduzir erros comuns
      if (result?.error?.code === 100) {
        // Erro 100 pode ter diferentes causas - verificar a mensagem
        const msg = String(result?.error?.message || '').toLowerCase()
        if (msg.includes('permission') || msg.includes('business')) {
          errorMessage = 'Sem permissão para deletar. O token precisa da permissão whatsapp_business_management com acesso admin ao WABA.'
        } else {
          errorMessage = 'Template não encontrado ou já foi deletado.'
        }
      } else if (result?.error?.code === 190) {
        errorMessage = 'Token de acesso inválido ou expirado.'
      }
      
      return NextResponse.json(
        { error: errorMessage, metaError: result?.error },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Template "${name}" deletado com sucesso!`
    })

  } catch (error) {
    console.error('Delete Template Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    )
  }
}

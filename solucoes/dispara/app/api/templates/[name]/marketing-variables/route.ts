import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/templates/[name]/marketing-variables
 *
 * Busca marketing_variables de um template que foi gerado via estratégia BYPASS.
 * Usado para pré-preencher campos de variáveis na criação de campanha.
 *
 * Fluxo:
 * 1. Template BYPASS é gerado com sample_variables (para Meta) e marketing_variables (para envio)
 * 2. Template é submetido à Meta usando sample_variables
 * 3. Meta aprova o template (texto neutro)
 * 4. Ao criar campanha, sistema busca marketing_variables para pré-preencher
 * 5. Cliente recebe a mensagem com conteúdo promocional nas variáveis
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const resolvedParams = await params
  const templateName = resolvedParams.name

  if (!templateName) {
    return NextResponse.json(
      { error: 'Nome do template não fornecido' },
      { status: 400 }
    )
  }

  try {
    // Busca template_project_item pelo nome do template
    // Prioriza itens com marketing_variables preenchido
    const { data: items, error } = await supabase
      .from('template_project_items')
      .select(`
        id,
        name,
        marketing_variables,
        sample_variables,
        project_id,
        template_projects!inner (
          strategy
        )
      `)
      .eq('name', templateName)
      .not('marketing_variables', 'is', null)
      .limit(1)

    if (error) {
      console.error('[marketing-variables] Supabase error:', error)
      return NextResponse.json({ marketing_variables: null })
    }

    if (!items || items.length === 0) {
      // Template não tem marketing_variables - não é BYPASS ou não foi gerado por IA
      return NextResponse.json({ marketing_variables: null })
    }

    const item = items[0]
    const strategy = (item.template_projects as any)?.strategy

    // Retorna marketing_variables se for estratégia BYPASS
    if (strategy === 'bypass' && item.marketing_variables) {
      return NextResponse.json({
        marketing_variables: item.marketing_variables,
        strategy: 'bypass',
        source: 'template_project_item'
      })
    }

    return NextResponse.json({ marketing_variables: null })
  } catch (error) {
    console.error('[marketing-variables] Error:', error)
    return NextResponse.json({ marketing_variables: null })
  }
}

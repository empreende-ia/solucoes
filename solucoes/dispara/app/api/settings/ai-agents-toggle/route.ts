import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const SETTING_KEY = 'ai_agents_global_enabled'

/**
 * GET /api/settings/ai-agents-toggle
 * Retorna o estado do toggle global de agentes IA
 */
export async function GET() {
  try {
    const adminClient = supabase.admin
    if (!adminClient) {
      return NextResponse.json(
        { error: 'Supabase admin not configured' },
        { status: 500 }
      )
    }

    const { data, error } = await adminClient
      .from('settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (setting não existe ainda)
      console.error('[AI Agents Toggle] Error fetching:', error)
      throw error
    }

    // Default: habilitado se não existir
    const enabled = data?.value !== 'false'

    return NextResponse.json({ enabled })
  } catch (error) {
    console.error('[AI Agents Toggle] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch AI agents toggle' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/settings/ai-agents-toggle
 * Atualiza o estado do toggle global de agentes IA
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enabled } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'enabled must be a boolean' },
        { status: 400 }
      )
    }

    const adminClient = supabase.admin
    if (!adminClient) {
      return NextResponse.json(
        { error: 'Supabase admin not configured' },
        { status: 500 }
      )
    }

    const { error } = await adminClient
      .from('settings')
      .upsert({
        key: SETTING_KEY,
        value: enabled.toString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (error) {
      console.error('[AI Agents Toggle] Error saving:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      enabled,
      message: enabled
        ? 'Agentes IA habilitados globalmente'
        : 'Agentes IA desabilitados globalmente'
    })
  } catch (error) {
    console.error('[AI Agents Toggle] POST error:', error)
    return NextResponse.json(
      { error: 'Failed to save AI agents toggle' },
      { status: 500 }
    )
  }
}

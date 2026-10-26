import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const KEYS = {
  onboardingCompleted: 'onboarding_completed',
  permanentTokenConfirmed: 'permanent_token_confirmed',
}

/**
 * Busca setting diretamente do Supabase (sem cache Redis)
 * Isso garante que sempre retorna o valor mais recente
 */
async function getSettingDirect(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single()
  
  if (error || !data) return null
  return data.value
}

/**
 * GET /api/settings/onboarding
 * Retorna o status do onboarding (completo + token permanente)
 * SEMPRE busca direto do banco - sem cache
 */
export async function GET() {
  try {
    const [onboardingCompleted, permanentTokenConfirmed] = await Promise.all([
      getSettingDirect(KEYS.onboardingCompleted),
      getSettingDirect(KEYS.permanentTokenConfirmed),
    ])

    const response = NextResponse.json({
      onboardingCompleted: onboardingCompleted === 'true',
      permanentTokenConfirmed: permanentTokenConfirmed === 'true',
    })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response
  } catch (error) {
    console.error('Erro ao buscar settings de onboarding:', error)
    const response = NextResponse.json(
      { error: 'Erro ao buscar configurações' },
      { status: 500 }
    )
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response
  }
}

/**
 * Salva setting diretamente no Supabase
 */
async function setSettingDirect(key: string, value: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: now }, { onConflict: 'key' })
  
  if (error) {
    throw error
  }
}

/**
 * POST /api/settings/onboarding
 * Salva configurações do onboarding
 * Body: { onboardingCompleted?: boolean, permanentTokenConfirmed?: boolean }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { onboardingCompleted, permanentTokenConfirmed } = body

    const updates: Promise<void>[] = []

    if (typeof onboardingCompleted === 'boolean') {
      updates.push(setSettingDirect(KEYS.onboardingCompleted, onboardingCompleted ? 'true' : 'false'))
    }

    if (typeof permanentTokenConfirmed === 'boolean') {
      updates.push(setSettingDirect(KEYS.permanentTokenConfirmed, permanentTokenConfirmed ? 'true' : 'false'))
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo válido fornecido' },
        { status: 400 }
      )
    }

    await Promise.all(updates)

    return NextResponse.json({
      success: true,
      onboardingCompleted: typeof onboardingCompleted === 'boolean' ? onboardingCompleted : undefined,
      permanentTokenConfirmed: typeof permanentTokenConfirmed === 'boolean' ? permanentTokenConfirmed : undefined,
    })
  } catch (error) {
    console.error('Erro ao salvar settings de onboarding:', error)
    return NextResponse.json(
      { error: 'Erro ao salvar configurações' },
      { status: 500 }
    )
  }
}

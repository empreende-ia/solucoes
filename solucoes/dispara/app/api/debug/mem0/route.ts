import { NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

export const runtime = 'nodejs'

const mask = (value: string | null) => {
  if (!value) return null
  if (value.length <= 6) return `${value.slice(0, 2)}••••`
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}

export async function GET() {
  try {
    const supabaseConfigured = isSupabaseConfigured()
    const envMem0Key = process.env.MEM0_API_KEY || null

    if (!supabaseConfigured) {
      return NextResponse.json({
        ok: false,
        error: 'Supabase não configurado no runtime',
        supabaseConfigured,
        envMem0KeyPresent: !!envMem0Key,
        envMem0KeyPreview: mask(envMem0Key),
      }, { status: 200 })
    }

    const [enabledRaw, apiKey] = await Promise.all([
      settingsDb.get('mem0_enabled'),
      settingsDb.get('mem0_api_key'),
    ])

    const enabled = enabledRaw === 'true'
    const hasApiKey = !!apiKey

    return NextResponse.json({
      ok: true,
      supabaseConfigured,
      settings: {
        mem0_enabled: enabledRaw,
        mem0_api_key_present: hasApiKey,
        mem0_api_key_preview: mask(apiKey),
      },
      runtime: {
        envMem0KeyPresent: !!envMem0Key,
        envMem0KeyPreview: mask(envMem0Key),
      },
      effective: {
        enabled,
        hasApiKey: hasApiKey || !!envMem0Key,
      },
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro ao auditar Mem0',
    }, { status: 500 })
  }
}

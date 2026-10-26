/**
 * Helicone Settings API
 *
 * GET - Returns current Helicone configuration
 * POST - Saves Helicone API key and enabled status
 */

import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const SETTINGS_KEYS = {
  enabled: 'helicone_enabled',
  apiKey: 'helicone_api_key',
} as const

// =============================================================================
// GET - Get Helicone configuration
// =============================================================================

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'Supabase não configurado',
      }, { status: 400 })
    }

    const [enabledRaw, apiKey] = await Promise.all([
      settingsDb.get(SETTINGS_KEYS.enabled),
      settingsDb.get(SETTINGS_KEYS.apiKey),
    ])

    const enabled = enabledRaw === 'true'
    const hasApiKey = Boolean(apiKey && apiKey.length > 0)

    return NextResponse.json({
      ok: true,
      config: {
        enabled,
        hasApiKey,
        // Não retorna a key completa por segurança, só os últimos 4 caracteres
        apiKeyPreview: hasApiKey && apiKey ? `sk-helicone-••••${apiKey.slice(-4)}` : null,
      },
    })
  } catch (error) {
    console.error('[helicone settings] GET error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao buscar configurações',
    }, { status: 500 })
  }
}

// =============================================================================
// POST - Save Helicone configuration
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'Supabase não configurado',
      }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { enabled, apiKey } = body

    // Validate
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({
        ok: false,
        error: 'Campo "enabled" deve ser boolean',
      }, { status: 400 })
    }

    // Se habilitando, precisa ter API key
    if (enabled && !apiKey) {
      // Verifica se já tem uma key salva
      const existingKey = await settingsDb.get(SETTINGS_KEYS.apiKey)
      if (!existingKey) {
        return NextResponse.json({
          ok: false,
          error: 'API key do Helicone é obrigatória para habilitar',
        }, { status: 400 })
      }
    }

    // Processa API key
    if (typeof apiKey === 'string') {
      if (apiKey.trim() === '') {
        // String vazia = remover a chave
        await settingsDb.set(SETTINGS_KEYS.apiKey, '')
      } else if (!apiKey.startsWith('sk-helicone-')) {
        return NextResponse.json({
          ok: false,
          error: 'API key deve começar com "sk-helicone-"',
        }, { status: 400 })
      } else {
        // Salva a nova key
        await settingsDb.set(SETTINGS_KEYS.apiKey, apiKey.trim())
      }
    }

    // Salva o status
    await settingsDb.set(SETTINGS_KEYS.enabled, enabled ? 'true' : 'false')

    // Busca config atualizada para retornar
    const updatedKey = await settingsDb.get(SETTINGS_KEYS.apiKey)
    const hasApiKey = Boolean(updatedKey && updatedKey.length > 0)

    return NextResponse.json({
      ok: true,
      message: enabled ? 'Helicone habilitado' : 'Helicone desabilitado',
      config: {
        enabled,
        hasApiKey,
        apiKeyPreview: hasApiKey && updatedKey ? `sk-helicone-••••${updatedKey.slice(-4)}` : null,
      },
    })
  } catch (error) {
    console.error('[helicone settings] POST error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao salvar configurações',
    }, { status: 500 })
  }
}

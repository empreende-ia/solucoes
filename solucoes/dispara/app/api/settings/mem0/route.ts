/**
 * Mem0 Settings API
 *
 * GET - Returns current Mem0 configuration
 * POST - Saves Mem0 API key and enabled status
 *
 * Mem0 é uma camada de memória persistente para conversas.
 * Permite que o agente lembre de interações anteriores com cada contato.
 */

import { NextRequest, NextResponse } from 'next/server'
import { settingsDb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SETTINGS_KEYS = {
  enabled: 'mem0_enabled',
  apiKey: 'mem0_api_key',
} as const

// =============================================================================
// GET - Get Mem0 configuration
// =============================================================================

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: false,
        error: 'Supabase não configurado',
      }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
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
        apiKeyPreview: hasApiKey && apiKey ? `m0-••••${apiKey.slice(-4)}` : null,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[mem0 settings] GET error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao buscar configurações',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

// =============================================================================
// POST - Save Mem0 configuration
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
          error: 'API key do Mem0 é obrigatória para habilitar',
        }, { status: 400 })
      }
    }

    // Processa API key (Mem0 keys começam com "m0-")
    if (typeof apiKey === 'string') {
      if (apiKey.trim() === '') {
        // String vazia = remover a chave
        await settingsDb.set(SETTINGS_KEYS.apiKey, '')
      } else if (!apiKey.startsWith('m0-')) {
        return NextResponse.json({
          ok: false,
          error: 'API key deve começar com "m0-"',
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
      message: enabled ? 'Mem0 habilitado' : 'Mem0 desabilitado',
      config: {
        enabled,
        hasApiKey,
        apiKeyPreview: hasApiKey && updatedKey ? `m0-••••${updatedKey.slice(-4)}` : null,
      },
    })
  } catch (error) {
    console.error('[mem0 settings] POST error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao salvar configurações',
    }, { status: 500 })
  }
}

/**
 * Mem0 Memories API - Gerencia memórias de um contato específico
 *
 * GET  - Lista todas as memórias do contato + dados do perfil Dispara
 * DELETE - Apaga todas as memórias (LGPD - direito ao esquecimento)
 *
 * @param phone - Número de telefone do contato (E.164)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAllUserMemories, deleteUserMemories, isMem0EnabledAsync } from '@/lib/ai/mem0-client'
import { contactDb } from '@/lib/supabase-db'

interface RouteParams {
  params: Promise<{ phone: string }>
}

// =============================================================================
// GET - Lista todas as memórias do contato
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { phone } = await params

    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Phone é obrigatório' }, { status: 400 })
    }

    // Busca dados do perfil do Dispara (em paralelo com memórias)
    const [contact, mem0Enabled] = await Promise.all([
      contactDb.getByPhone(phone).catch(() => null),
      isMem0EnabledAsync(),
    ])

    // Monta perfil do contato (dados do Dispara)
    const profile = contact ? {
      name: contact.name || null,
      email: contact.email || null,
      status: contact.status,
      tags: contact.tags || [],
      customFields: contact.custom_fields || {},
      createdAt: contact.createdAt || null,
      lastActive: contact.lastActive || null,
    } : null

    // Se Mem0 não está habilitado, retorna só o perfil
    if (!mem0Enabled) {
      return NextResponse.json({
        ok: true,
        profile,
        memories: [],
        count: 0,
        mem0Enabled: false,
      })
    }

    const result = await getAllUserMemories(phone)

    return NextResponse.json({
      ok: true,
      profile,
      memories: result.memories,
      count: result.count,
      mem0Enabled: true,
    })
  } catch (error) {
    console.error('[mem0 memories] GET error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao buscar memórias',
    }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Apaga todas as memórias do contato (LGPD)
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { phone } = await params

    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Phone é obrigatório' }, { status: 400 })
    }

    const enabled = await isMem0EnabledAsync()
    if (!enabled) {
      return NextResponse.json({
        ok: false,
        error: 'Mem0 não está habilitado',
      }, { status: 400 })
    }

    const result = await deleteUserMemories(phone)

    if (!result.success) {
      return NextResponse.json({
        ok: false,
        error: 'Falha ao deletar memórias',
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: `${result.deletedCount} memória(s) deletada(s)`,
      deletedCount: result.deletedCount,
    })
  } catch (error) {
    console.error('[mem0 memories] DELETE error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao deletar memórias',
    }, { status: 500 })
  }
}

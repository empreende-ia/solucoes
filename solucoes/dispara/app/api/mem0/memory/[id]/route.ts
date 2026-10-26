/**
 * Mem0 Single Memory API - Gerencia uma memória específica
 *
 * DELETE - Apaga uma memória específica por ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { deleteMemoryById, isMem0EnabledAsync } from '@/lib/ai/mem0-client'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID é obrigatório' }, { status: 400 })
    }

    const enabled = await isMem0EnabledAsync()
    if (!enabled) {
      return NextResponse.json({
        ok: false,
        error: 'Mem0 não está habilitado',
      }, { status: 400 })
    }

    const success = await deleteMemoryById(id)

    if (!success) {
      return NextResponse.json({
        ok: false,
        error: 'Falha ao deletar memória',
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: 'Memória deletada',
    })
  } catch (error) {
    console.error('[mem0 memory] DELETE error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Falha ao deletar memória',
    }, { status: 500 })
  }
}

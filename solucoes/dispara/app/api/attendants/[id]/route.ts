import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { clearAttendantAuthCache } from '@/lib/attendant-auth';
import { OWNER_KINDS, requirePrincipal } from '@/lib/principal';
import type { AttendantToken, UpdateAttendantTokenDTO } from '@/types';

// CRUD de tokens de atendente: só o dono (política default 'session' no proxy;
// a checagem aqui é defesa em profundidade).
//
// Revogação: PATCH/DELETE chamam clearAttendantAuthCache(), mas isso só limpa a
// cópia do cache que vive no bundle das ROTAS (ex.: /api/attendants/validate).
// O proxy roda em outro bundle/função, com o próprio cache: lá o principal antigo
// (permissões, ativo) ainda pode valer por até CACHE_TTL_MS de lib/attendant-auth.ts
// (5s), por instância. Desativar também apaga as push subscriptions do token.

interface RouteParams {
  params: Promise<{ id: string }>;
}

// =============================================================================
// GET - Buscar token específico
// =============================================================================

export async function GET(request: Request, { params }: RouteParams) {
  const denied = requirePrincipal(request, OWNER_KINDS);
  if (denied) return denied;

  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('attendant_tokens')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Token não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data as AttendantToken);
  } catch (error) {
    console.error('[API] Erro inesperado:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH - Atualizar token
// =============================================================================

export async function PATCH(request: Request, { params }: RouteParams) {
  const denied = requirePrincipal(request, OWNER_KINDS);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body: UpdateAttendantTokenDTO = await request.json();

    // Preparar dados para atualização
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json(
          { error: 'Nome não pode ser vazio' },
          { status: 400 }
        );
      }
      updateData.name = body.name.trim();
    }

    if (body.permissions !== undefined) {
      updateData.permissions = body.permissions;
    }

    if (body.is_active !== undefined) {
      updateData.is_active = body.is_active;
    }

    if (body.expires_at !== undefined) {
      updateData.expires_at = body.expires_at;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'Nenhum campo para atualizar' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('attendant_tokens')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    // Permissões/ativo/expiração mudaram: não servir o principal antigo do cache
    // deste bundle (o cache do proxy expira sozinho em até CACHE_TTL_MS)
    clearAttendantAuthCache();

    if (error) {
      console.error('[API] Erro ao atualizar token:', error);
      return NextResponse.json(
        { error: 'Erro ao atualizar token' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Token não encontrado' },
        { status: 404 }
      );
    }

    // Desativado: o aparelho do atendente para de receber push (nome do contato e
    // prévia da mensagem). O envio também ignora tokens inativos/expirados.
    if (updateData.is_active === false) {
      const { error: pushError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('attendant_token_id', id);
      if (pushError) {
        console.error('[API] Erro ao remover push do atendente desativado:', pushError);
      }
    }

    return NextResponse.json(data as AttendantToken);
  } catch (error) {
    console.error('[API] Erro inesperado:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE - Remover token
// =============================================================================

export async function DELETE(request: Request, { params }: RouteParams) {
  const denied = requirePrincipal(request, OWNER_KINDS);
  if (denied) return denied;

  try {
    const { id } = await params;

    const { error } = await supabase
      .from('attendant_tokens')
      .delete()
      .eq('id', id);

    // Token removido: as rotas deste bundle param de aceitá-lo já; o proxy, em até
    // CACHE_TTL_MS. As push subscriptions do token caem em cascata (FK ON DELETE CASCADE).
    clearAttendantAuthCache();

    if (error) {
      console.error('[API] Erro ao deletar token:', error);
      return NextResponse.json(
        { error: 'Erro ao remover token' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Erro inesperado:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

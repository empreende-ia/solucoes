import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
});

interface SupabaseProject {
  id: string;
  name: string;
  ref: string;
  region: string;
  status: string;
  createdAt: string;
}

/**
 * Lista projetos Supabase do usuário usando o Personal Access Token.
 *
 * POST /api/installer/supabase-projects
 * Body: { accessToken: string }
 */
export async function POST(request: NextRequest) {
  // Verificar se installer está habilitado
  if (process.env.INSTALLER_ENABLED === 'false') {
    return NextResponse.json({ error: 'Installer desabilitado' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        { status: 400 }
      );
    }

    const { accessToken } = parsed.data;

    // Chamar Supabase Management API para listar projetos
    const response = await fetch('https://api.supabase.com/v1/projects', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Token inválido ou expirado. Gere um novo token em supabase.com/dashboard/account/tokens' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Erro ao acessar Supabase API: ${response.status}` },
        { status: response.status }
      );
    }

    const projects = await response.json();

    // Mapear para formato simplificado
    const formatted: SupabaseProject[] = projects.map((p: {
      id: string;
      name: string;
      region: string;
      status: string;
      created_at: string;
    }) => ({
      id: p.id,
      name: p.name,
      ref: p.id, // O id é o project ref
      region: p.region,
      status: p.status,
      createdAt: p.created_at,
    }));

    // Ordenar por data de criação (mais recentes primeiro)
    formatted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      ok: true,
      projects: formatted,
    });
  } catch (error) {
    console.error('[supabase-projects] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

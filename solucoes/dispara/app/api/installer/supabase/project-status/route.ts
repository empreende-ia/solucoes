import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
  projectRef: z.string().min(1, 'Project ref é obrigatório'),
});

/**
 * Verifica o status de um projeto Supabase.
 *
 * POST /api/installer/supabase/project-status
 * Body: { accessToken, projectRef }
 *
 * Usado para polling até o projeto estar ACTIVE_HEALTHY.
 * Status possíveis: COMING_UP, ACTIVE_HEALTHY, INACTIVE, PAUSED, etc.
 */
export async function POST(request: NextRequest) {
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

    const { accessToken, projectRef } = parsed.data;

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Projeto não encontrado' },
          { status: 404 }
        );
      }
      if (res.status === 401) {
        return NextResponse.json(
          { error: 'Token inválido ou expirado' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Erro ao verificar projeto: ${res.status}` },
        { status: res.status }
      );
    }

    const project = await res.json();

    // ACTIVE_HEALTHY ou ACTIVE significa pronto
    const isReady = project.status === 'ACTIVE_HEALTHY' || project.status === 'ACTIVE';

    return NextResponse.json({
      success: true,
      status: project.status,
      isReady,
      project: {
        id: project.id,
        name: project.name,
        region: project.region,
        status: project.status,
        url: `https://${project.id}.supabase.co`,
      },
    });
  } catch (error) {
    console.error('[supabase/project-status] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

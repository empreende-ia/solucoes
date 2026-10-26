import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
  projectRef: z.string().min(1, 'Project ref é obrigatório'),
});

/**
 * Pausa um projeto Supabase.
 * Usado para liberar slot quando o limite de 2 projetos free é atingido.
 *
 * POST /api/installer/supabase/pause-project
 * Body: { accessToken, projectRef }
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

    console.log('[supabase/pause-project] Pausando projeto:', projectRef);

    const res = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/pause`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      let errorMessage = `Erro ao pausar projeto: ${res.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorMessage;
      } catch {
        if (errorText) errorMessage = errorText;
      }

      console.error('[supabase/pause-project] Erro:', errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: res.status });
    }

    console.log('[supabase/pause-project] Projeto pausado com sucesso:', projectRef);

    return NextResponse.json({
      ok: true,
      message: 'Projeto pausado com sucesso',
    });
  } catch (error) {
    console.error('[supabase/pause-project] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

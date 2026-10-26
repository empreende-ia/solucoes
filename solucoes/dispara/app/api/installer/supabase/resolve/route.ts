import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
  projectRef: z.string().min(1, 'Project ref é obrigatório'),
});

interface ApiKey {
  name: string;
  api_key: string;
}

/**
 * Resolve as chaves de API de um projeto Supabase.
 *
 * POST /api/installer/supabase/resolve
 * Body: { accessToken, projectRef }
 *
 * Retorna:
 * - publishableKey (anon key) - para client-side
 * - secretKey (service_role) - para server-side
 * - projectUrl - URL base do projeto
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

    // Buscar API keys do projeto
    const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!keysRes.ok) {
      if (keysRes.status === 404) {
        return NextResponse.json(
          { error: 'Projeto não encontrado ou ainda não está pronto' },
          { status: 404 }
        );
      }
      if (keysRes.status === 401) {
        return NextResponse.json(
          { error: 'Token inválido ou expirado' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Erro ao obter chaves: ${keysRes.status}` },
        { status: keysRes.status }
      );
    }

    const keys: ApiKey[] = await keysRes.json();

    // Encontrar as chaves
    const anonKey = keys.find((k) => k.name === 'anon' || k.name === 'anon key');
    const serviceKey = keys.find((k) => k.name === 'service_role' || k.name === 'service_role key');

    if (!anonKey || !serviceKey) {
      return NextResponse.json(
        { error: 'Chaves não encontradas. Projeto pode ainda estar sendo criado.' },
        { status: 404 }
      );
    }

    const projectUrl = `https://${projectRef}.supabase.co`;

    return NextResponse.json({
      success: true,
      projectUrl,
      publishableKey: anonKey.api_key,
      secretKey: serviceKey.api_key,
    });
  } catch (error) {
    console.error('[supabase/resolve] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

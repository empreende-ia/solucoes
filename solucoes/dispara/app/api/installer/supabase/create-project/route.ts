import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
  // IMPORTANTE: A API do Supabase usa organization_slug, não organization_id
  organizationSlug: z.string().min(1, 'Organization slug é obrigatório'),
  name: z.string().min(2, 'Nome do projeto é obrigatório').max(64),
  dbPass: z.string().min(12, 'Senha do banco deve ter no mínimo 12 caracteres'),
  regionSmartGroup: z.enum(['americas', 'emea', 'apac']).default('americas'),
});

/**
 * Cria um novo projeto Supabase.
 *
 * Igual ao CRM: usa organization_slug (não organization_id).
 *
 * POST /api/installer/supabase/create-project
 * Body: { accessToken, organizationSlug, name, dbPass, regionSmartGroup }
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

    const { accessToken, organizationSlug, name, dbPass, regionSmartGroup } = parsed.data;

    // Criar projeto via Supabase Management API
    // Igual ao CRM: usa organization_slug e region_selection
    const createRes = await fetch('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_slug: organizationSlug, // <-- CORRETO: slug, não id
        name,
        db_pass: dbPass,
        region_selection: {
          type: 'smartGroup',
          code: regionSmartGroup,
        },
      }),
    });

    if (!createRes.ok) {
      const errorData = await createRes.json().catch(() => ({}));
      const errorMsg = String(errorData.message || '').toLowerCase();

      console.log('[create-project] Erro da API:', { status: createRes.status, errorMsg, errorData });

      // Nome já existe
      if (createRes.status === 409 || errorMsg.includes('already exists')) {
        return NextResponse.json(
          { error: 'Nome de projeto já existe', code: 'NAME_EXISTS' },
          { status: 409 }
        );
      }

      // Limite de projetos atingido
      if (
        errorMsg.includes('limit') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('maximum') ||
        errorMsg.includes('2 project')
      ) {
        return NextResponse.json(
          {
            error: 'Limite de projetos free atingido. Pause um projeto existente ou use uma organização paga.',
            code: 'LIMIT_REACHED',
          },
          { status: 403 }
        );
      }

      if (createRes.status === 401) {
        return NextResponse.json(
          { error: 'Token inválido ou expirado' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: errorData.message || `Erro ao criar projeto: ${createRes.status}` },
        { status: createRes.status }
      );
    }

    const project = await createRes.json();

    return NextResponse.json({
      ok: true,
      project: {
        id: project.id,             // Este é o projectRef
        ref: project.ref || project.id,
        name: project.name,
        region: project.region,
        status: project.status,
        organizationId: project.organization_id,
        // URL base do projeto
        url: `https://${project.ref || project.id}.supabase.co`,
      },
    });
  } catch (error) {
    console.error('[supabase/create-project] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

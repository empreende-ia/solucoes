import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
});

interface SupabaseOrganization {
  id: string;
  slug: string;
  name: string;
}

interface SupabaseProject {
  id: string;
  ref?: string;
  name: string;
  organization_id: string;
  status: string;
  region?: string;
}

/**
 * Busca detalhes de uma organização específica para obter o plano real.
 */
async function getOrganizationDetails(
  accessToken: string,
  orgSlug: string
): Promise<{ plan: string | null }> {
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/organizations/${encodeURIComponent(orgSlug)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) return { plan: null };

    const data = await res.json();
    return { plan: typeof data.plan === 'string' ? data.plan.toLowerCase() : null };
  } catch {
    return { plan: null };
  }
}

/**
 * Preflight check para criação de projeto Supabase.
 *
 * Retorna informações completas sobre:
 * - Organizações com plano e contagem de projetos
 * - Projetos ativos (para UI de pause)
 * - Se o limite global free foi atingido
 * - Sugestão de melhor org para criar projeto
 *
 * POST /api/installer/supabase/preflight
 * Body: { accessToken: string }
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

    const { accessToken } = parsed.data;

    // 1. Listar organizações
    const orgsRes = await fetch('https://api.supabase.com/v1/organizations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!orgsRes.ok) {
      if (orgsRes.status === 401) {
        return NextResponse.json(
          { error: 'Token inválido ou expirado' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Erro ao acessar Supabase API: ${orgsRes.status}` },
        { status: orgsRes.status }
      );
    }

    const orgs: SupabaseOrganization[] = await orgsRes.json();

    // 2. Listar todos os projetos
    const projectsRes = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    let allProjects: SupabaseProject[] = [];
    if (projectsRes.ok) {
      allProjects = await projectsRes.json();
    }

    // 3. Enriquecer organizações com plano real e projetos ativos
    const enrichedOrgs = await Promise.all(
      orgs.map(async (org) => {
        // Busca o plano real
        const details = await getOrganizationDetails(accessToken, org.slug);
        const plan = details.plan || 'free';

        // Filtra projetos desta org
        const orgProjects = allProjects.filter((p) => p.organization_id === org.id);

        // Projetos ativos (status começa com ACTIVE)
        const activeProjects = orgProjects
          .filter((p) => (p.status || '').toUpperCase().startsWith('ACTIVE'))
          .map((p) => ({
            ref: p.ref || p.id,
            name: p.name,
            status: p.status,
            region: p.region,
            orgSlug: org.slug,
            orgName: org.name,
          }));

        return {
          slug: org.slug,
          name: org.name,
          id: org.id,
          plan,
          activeCount: activeProjects.length,
          activeProjects,
        };
      })
    );

    // 4. Calcular limite global free
    const freeOrgs = enrichedOrgs.filter((o) => o.plan === 'free');
    const freeGlobalActiveCount = freeOrgs.reduce((sum, o) => sum + o.activeCount, 0);
    const freeGlobalLimitHit = freeGlobalActiveCount >= 2;

    // 5. Sugerir melhor org para criar projeto
    // Prioridade: paga > free com slot > null
    const suggestedOrg =
      enrichedOrgs.find((o) => o.plan !== 'free') ||
      enrichedOrgs.find((o) => o.plan === 'free' && o.activeCount < 2 && !freeGlobalLimitHit) ||
      null;

    // 6. Lista flat de todos os projetos ativos em orgs FREE (para UI de pause)
    const allFreeActiveProjects = enrichedOrgs
      .filter((o) => o.plan === 'free')
      .flatMap((o) => o.activeProjects);

    console.log('[supabase/preflight] Result:', {
      orgsCount: enrichedOrgs.length,
      freeGlobalActiveCount,
      freeGlobalLimitHit,
      suggestedOrg: suggestedOrg?.slug,
      freeActiveProjects: allFreeActiveProjects.length,
    });

    return NextResponse.json({
      ok: true,
      organizations: enrichedOrgs,
      freeGlobalActiveCount,
      freeGlobalLimitHit,
      suggestedOrganizationSlug: suggestedOrg?.slug || null,
      allFreeActiveProjects,
    });
  } catch (error) {
    console.error('[supabase/preflight] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

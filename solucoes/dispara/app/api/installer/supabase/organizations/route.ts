import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
  accessToken: z.string().min(1, 'Access token é obrigatório'),
});

interface SupabaseOrganization {
  id: string;
  slug: string;
  name: string;
  billing_email: string | null;
  subscription_id?: string;
  plan?: string;
}

interface SupabaseOrganizationDetails {
  id?: string;
  name?: string;
  plan?: string;
}

interface SupabaseProject {
  id: string;
  organization_id: string;
  status: string;
}

/**
 * Busca detalhes de uma organização específica para obter o plano real.
 * Igual ao CRM: usa GET /v1/organizations/{slug}
 */
async function getOrganizationDetails(
  accessToken: string,
  orgSlug: string
): Promise<{ plan: string | null; error?: string }> {
  try {
    const res = await fetch(`https://api.supabase.com/v1/organizations/${encodeURIComponent(orgSlug)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      return { plan: null, error: `Erro ${res.status}` };
    }

    const data: SupabaseOrganizationDetails = await res.json();
    return { plan: typeof data.plan === 'string' ? data.plan.toLowerCase() : null };
  } catch (err) {
    return { plan: null, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}

/**
 * Lista organizações Supabase do usuário usando o Personal Access Token.
 *
 * Igual ao CRM:
 * 1. Lista todas as organizações
 * 2. Busca o plano REAL de cada uma via /v1/organizations/{slug}
 * 3. Conta projetos ativos por organização
 * 4. Ordena: pagas primeiro, depois free com slot
 *
 * POST /api/installer/supabase/organizations
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
          { error: 'Token inválido ou expirado. Gere um novo token em supabase.com/dashboard/account/tokens' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: `Erro ao acessar Supabase API: ${orgsRes.status}` },
        { status: orgsRes.status }
      );
    }

    const orgs: SupabaseOrganization[] = await orgsRes.json();

    // 2. Listar todos os projetos para contar por organização
    const projectsRes = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    let projectCountByOrg: Record<string, number> = {};
    if (projectsRes.ok) {
      const projects: SupabaseProject[] = await projectsRes.json();
      // Contar apenas projetos ATIVOS
      projects.forEach((p) => {
        const status = (p.status || '').toUpperCase();
        if (status.startsWith('ACTIVE')) {
          projectCountByOrg[p.organization_id] = (projectCountByOrg[p.organization_id] || 0) + 1;
        }
      });
    }

    // 3. Enriquecer organizações com plano REAL e contagem
    // Igual ao CRM: busca detalhes de cada org para obter o plano real
    const enrichedOrgs = await Promise.all(
      orgs.map(async (org) => {
        // Busca o plano real via /v1/organizations/{slug}
        const details = await getOrganizationDetails(accessToken, org.slug);
        const realPlan = details.plan || 'free';
        const isPaid = realPlan !== 'free';
        const activeCount = projectCountByOrg[org.id] || 0;

        return {
          id: org.id,
          slug: org.slug,
          name: org.name,
          plan: realPlan,
          activeProjectCount: activeCount,
          // Free tier: máximo 2 projetos ativos globalmente
          // Paid: sem limite
          hasSlot: isPaid || activeCount < 2,
        };
      })
    );

    // 4. Calcular limite global free (igual ao CRM)
    const freeOrgs = enrichedOrgs.filter((o) => o.plan === 'free');
    const freeGlobalActiveCount = freeOrgs.reduce((sum, o) => sum + o.activeProjectCount, 0);
    const freeGlobalLimitHit = freeGlobalActiveCount >= 2;

    // Atualizar hasSlot considerando limite global free
    // Se o limite global de 2 projetos free foi atingido, nenhuma org free tem slot
    const finalOrgs = enrichedOrgs.map((org) => ({
      ...org,
      hasSlot: org.plan !== 'free' || (!freeGlobalLimitHit && org.activeProjectCount < 2),
    }));

    // 5. Ordenar: pagas primeiro, depois free com slot
    finalOrgs.sort((a, b) => {
      // Pagas primeiro
      if (a.plan !== 'free' && b.plan === 'free') return -1;
      if (a.plan === 'free' && b.plan !== 'free') return 1;
      // Entre as free, quem tem slot primeiro
      if (a.hasSlot && !b.hasSlot) return -1;
      if (!a.hasSlot && b.hasSlot) return 1;
      return 0;
    });

    console.log('[supabase/organizations] Organizações encontradas:', finalOrgs.map(o => ({
      name: o.name,
      plan: o.plan,
      activeCount: o.activeProjectCount,
      hasSlot: o.hasSlot,
    })));
    console.log('[supabase/organizations] Limite global free:', { freeGlobalActiveCount, freeGlobalLimitHit });

    return NextResponse.json({
      success: true,
      organizations: finalOrgs,
      freeGlobalActiveCount,
      freeGlobalLimitHit,
    });
  } catch (error) {
    console.error('[supabase/organizations] Erro:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/installer/bootstrap
 *
 * Valida token Vercel e descobre o projeto automaticamente.
 * Usado no step 2 do wizard de instalação.
 */
export async function POST(req: NextRequest) {
  // Installer desabilitado após a instalação (mesma trava das demais rotas do installer).
  if (process.env.INSTALLER_ENABLED === 'false') {
    return NextResponse.json({ error: 'Installer desabilitado' }, { status: 403 });
  }

  try {
    const { token } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token é obrigatório' },
        { status: 400 }
      );
    }

    // 1. Validar token listando projetos
    const projectsRes = await fetch('https://api.vercel.com/v9/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!projectsRes.ok) {
      const errorData = await projectsRes.json().catch(() => ({}));

      if (projectsRes.status === 401 || projectsRes.status === 403) {
        return NextResponse.json(
          { error: 'Token inválido ou sem permissões' },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: errorData.error?.message || 'Erro ao validar token' },
        { status: projectsRes.status }
      );
    }

    const projectsData = await projectsRes.json();
    const projects = projectsData.projects || [];

    // 2. Tentar detectar projeto Dispara
    // Prioridade: nome contém "dispara", ou primeiro projeto encontrado
    let detectedProject = projects.find((p: { name: string }) =>
      p.name.toLowerCase().includes('dispara')
    );

    // Se não encontrou por nome, pega o primeiro
    if (!detectedProject && projects.length > 0) {
      detectedProject = projects[0];
    }

    // 3. Se encontrou projeto, buscar mais detalhes
    if (detectedProject) {
      const projectDetails = await fetch(
        `https://api.vercel.com/v9/projects/${detectedProject.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (projectDetails.ok) {
        const details = await projectDetails.json();
        return NextResponse.json({
          success: true,
          project: {
            id: details.id,
            name: details.name,
            teamId: details.teamId || null,
            framework: details.framework || null,
            nodeVersion: details.nodeVersion || null,
          },
          totalProjects: projects.length,
        });
      }
    }

    // Token válido mas sem projetos
    return NextResponse.json({
      success: true,
      project: null,
      totalProjects: projects.length,
      message: 'Token válido, mas nenhum projeto encontrado',
    });

  } catch (error) {
    console.error('[installer/bootstrap] Erro:', error);
    return NextResponse.json(
      { error: 'Erro interno ao validar token' },
      { status: 500 }
    );
  }
}

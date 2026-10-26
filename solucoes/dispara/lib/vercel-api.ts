/**
 * Vercel API Client
 * 
 * Used for managing environment variables and deployments
 * during the setup wizard
 */

const VERCEL_API_BASE = 'https://api.vercel.com'

export interface VercelProject {
  id: string
  name: string
  accountId: string
  alias?: { domain: string }[]  // Custom domains
  targets?: {
    production?: {
      alias?: string[]
    }
  }
}

export interface VercelDeployment {
  uid: string
  id?: string
  name: string
  url: string
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED'
  readyState: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED'
}

export interface VercelEnvVar {
  key: string
  value: string
  type: 'encrypted' | 'plain' | 'secret'
  target: ('production' | 'preview' | 'development')[]
}

export interface VercelApiResult<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Validate a Vercel token
 */
export async function validateToken(token: string): Promise<VercelApiResult<{ userId: string }>> {
  try {
    const response = await fetch(`${VERCEL_API_BASE}/v2/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Token inválido' }
    }

    const data = await response.json()
    return { success: true, data: { userId: data.user.id } }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao validar token' }
  }
}

/**
 * Find project by domain (current hostname)
 * Uses the domains API which is more reliable for custom domains
 */
export async function findProjectByDomain(
  token: string,
  domain: string
): Promise<VercelApiResult<VercelProject>> {
  try {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '')
    console.log('[findProjectByDomain] Searching for domain:', normalizedDomain)

    // STRATEGY 1: Try to get project directly by domain using Vercel's domain API
    // This is the most reliable method for custom domains
    const domainResponse = await fetch(`${VERCEL_API_BASE}/v6/domains/${normalizedDomain}/config`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (domainResponse.ok) {
      const domainData = await domainResponse.json()
      console.log('[findProjectByDomain] Domain API response:', domainData)
      
      // If we got configuredBy (project ID), fetch that project
      if (domainData.configuredBy) {
        const projectResult = await getProject(token, domainData.configuredBy)
        if (projectResult.success && projectResult.data) {
          console.log('[findProjectByDomain] Found project by domain config:', projectResult.data.name)
          return projectResult
        }
      }
    }

    // STRATEGY 2: List all projects and check aliases
    const response = await fetch(`${VERCEL_API_BASE}/v9/projects`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Erro ao buscar projetos' }
    }

    const data = await response.json()
    const projects: VercelProject[] = data.projects || []

    console.log('[findProjectByDomain] Found projects:', projects.map(p => p.name))
    
    // Check custom domains/aliases
    for (const project of projects) {
      const projectAliases = project.alias?.map(a => a.domain.toLowerCase()) || []
      const targetAliases = project.targets?.production?.alias?.map(a => a.toLowerCase()) || []
      const allAliases = [...projectAliases, ...targetAliases]
      
      console.log(`[findProjectByDomain] Project ${project.name} aliases:`, allAliases)
      
      if (allAliases.includes(normalizedDomain)) {
        console.log(`[findProjectByDomain] MATCH by alias! Project: ${project.name}`)
        return { success: true, data: project }
      }
    }

    // STRATEGY 3: Check if domain is exactly project-name.vercel.app
    for (const project of projects) {
      const vercelDomain = `${project.name.toLowerCase()}.vercel.app`
      if (normalizedDomain === vercelDomain) {
        console.log(`[findProjectByDomain] MATCH by vercel.app! Project: ${project.name}`)
        return { success: true, data: project }
      }
    }

    // STRATEGY 4: For each project, fetch its domains explicitly
    console.log('[findProjectByDomain] Checking project domains explicitly...')
    for (const project of projects) {
      const domainsResponse = await fetch(`${VERCEL_API_BASE}/v9/projects/${project.id}/domains`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      
      if (domainsResponse.ok) {
        const domainsData = await domainsResponse.json()
        const domains = domainsData.domains?.map((d: { name: string }) => d.name.toLowerCase()) || []
        
        console.log(`[findProjectByDomain] Project ${project.name} domains:`, domains)
        
        if (domains.includes(normalizedDomain)) {
          console.log(`[findProjectByDomain] MATCH by project domains! Project: ${project.name}`)
          return { success: true, data: project }
        }
      }
    }

    // STRATEGY 5: Fallback for localhost only
    if (normalizedDomain === 'localhost' || normalizedDomain.includes('localhost:')) {
      if (projects.length > 0) {
        console.log('[findProjectByDomain] Fallback to first project for localhost')
        return { success: true, data: projects[0] }
      }
    }

    return { success: false, error: 'Projeto não encontrado para este domínio' }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao buscar projeto' }
  }
}

/**
 * Get project by ID
 */
export async function getProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelApiResult<VercelProject>> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v9/projects/${projectId}`)
    if (teamId) url.searchParams.set('teamId', teamId)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Projeto não encontrado' }
    }

    const project = await response.json()
    return { success: true, data: project }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao buscar projeto' }
  }
}

/**
 * Get all environment variables for a project
 */
export async function getEnvVars(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelApiResult<VercelEnvVar[]>> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v9/projects/${projectId}/env`)
    if (teamId) url.searchParams.set('teamId', teamId)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Erro ao buscar variáveis' }
    }

    const data = await response.json()
    return { success: true, data: data.envs || [] }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao buscar variáveis' }
  }
}

/**
 * Create or update an environment variable
 */
export async function upsertEnvVar(
  token: string,
  projectId: string,
  envVar: { key: string; value: string },
  teamId?: string
): Promise<VercelApiResult<void>> {
  try {
    // First, try to find existing env var
    const existingResult = await getEnvVars(token, projectId, teamId)
    const existing = existingResult.data?.find(e => e.key === envVar.key)

    const url = new URL(`${VERCEL_API_BASE}/v10/projects/${projectId}/env`)
    if (teamId) url.searchParams.set('teamId', teamId)

    if (existing) {
      // Update existing - need to use the env var ID
      const getUrl = new URL(`${VERCEL_API_BASE}/v9/projects/${projectId}/env`)
      if (teamId) getUrl.searchParams.set('teamId', teamId)
      
      const listResponse = await fetch(getUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const listData = await listResponse.json()
      const envWithId = listData.envs?.find((e: { key: string }) => e.key === envVar.key)
      
      if (envWithId) {
        const patchUrl = new URL(`${VERCEL_API_BASE}/v9/projects/${projectId}/env/${envWithId.id}`)
        if (teamId) patchUrl.searchParams.set('teamId', teamId)
        
        const response = await fetch(patchUrl.toString(), {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            value: envVar.value,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          return { success: false, error: error.error?.message || 'Erro ao atualizar variável' }
        }
      }
    } else {
      // Create new
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: envVar.key,
          value: envVar.value,
          type: 'encrypted',
          target: ['production', 'preview', 'development'],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error?.message || 'Erro ao criar variável' }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao salvar variável' }
  }
}

/**
 * Set multiple environment variables at once
 */
export async function setEnvVars(
  token: string,
  projectId: string,
  envVars: { key: string; value: string }[],
  teamId?: string
): Promise<VercelApiResult<{ saved: number; errors: string[] }>> {
  const errors: string[] = []
  let saved = 0

  for (const envVar of envVars) {
    const result = await upsertEnvVar(token, projectId, envVar, teamId)
    if (result.success) {
      saved++
    } else {
      errors.push(`${envVar.key}: ${result.error}`)
    }
  }

  return {
    success: errors.length === 0,
    data: { saved, errors },
    error: errors.length > 0 ? errors.join(', ') : undefined,
  }
}

/**
 * Trigger a new deployment
 */
export async function triggerDeployment(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelApiResult<VercelDeployment>> {
  try {
    // Get the project to find the git repo
    const projectResult = await getProject(token, projectId, teamId)
    if (!projectResult.success || !projectResult.data) {
      return { success: false, error: 'Projeto não encontrado' }
    }

    const url = new URL(`${VERCEL_API_BASE}/v13/deployments`)
    if (teamId) url.searchParams.set('teamId', teamId)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectResult.data.name,
        project: projectId,
        target: 'production',
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, error: error.error?.message || 'Erro ao criar deployment' }
    }

    const deployment = await response.json()
    return { success: true, data: deployment }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao criar deployment' }
  }
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(
  token: string,
  deploymentId: string,
  teamId?: string
): Promise<VercelApiResult<VercelDeployment>> {
  try {
    const url = new URL(`${VERCEL_API_BASE}/v13/deployments/${deploymentId}`)
    if (teamId) url.searchParams.set('teamId', teamId)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Deployment não encontrado' }
    }

    const deployment = await response.json()
    return { success: true, data: deployment }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao buscar status' }
  }
}

/**
 * Redeploy the latest deployment (simpler than creating new)
 */
export async function redeployLatest(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelApiResult<VercelDeployment>> {
  try {
    // Get latest deployment
    const url = new URL(`${VERCEL_API_BASE}/v6/deployments`)
    url.searchParams.set('projectId', projectId)
    url.searchParams.set('limit', '1')
    url.searchParams.set('target', 'production')
    if (teamId) url.searchParams.set('teamId', teamId)

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return { success: false, error: 'Erro ao buscar deployment' }
    }

    const data = await response.json()
    const latestDeployment = data.deployments?.[0]

    if (!latestDeployment) {
      return { success: false, error: 'Nenhum deployment encontrado' }
    }

    // Redeploy
    const redeployUrl = new URL(`${VERCEL_API_BASE}/v13/deployments`)
    if (teamId) redeployUrl.searchParams.set('teamId', teamId)

    const redeployResponse = await fetch(redeployUrl.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deploymentId: latestDeployment.uid,
        name: latestDeployment.name,
        target: 'production',
      }),
    })

    if (!redeployResponse.ok) {
      const error = await redeployResponse.json()
      return { success: false, error: error.error?.message || 'Erro ao fazer redeploy' }
    }

    const deployment = await redeployResponse.json()
    return { success: true, data: deployment }
  } catch (error) {
    console.error('Vercel API error:', error)
    return { success: false, error: 'Erro ao fazer redeploy' }
  }
}

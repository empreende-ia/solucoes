import { NextResponse } from 'next/server'

/**
 * Returns Vercel deployment information
 * Used to dynamically build URLs to Vercel dashboard
 */
export async function GET() {
  // Vercel automatically injects these environment variables
  // See: https://vercel.com/docs/projects/environment-variables/system-environment-variables
  
  const info = {
    // Project identification
    projectId: process.env.VERCEL_PROJECT_ID || null,
    
    // Team/scope (for building dashboard URLs)
    teamId: process.env.VERCEL_TEAM_ID || null,
    
    // URLs
    url: process.env.VERCEL_URL || null,
    productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
    
    // Git info
    gitRepoSlug: process.env.VERCEL_GIT_REPO_SLUG || null,
    gitRepoOwner: process.env.VERCEL_GIT_REPO_OWNER || null,
    
    // Environment
    env: process.env.VERCEL_ENV || 'development',
    
    // Build the Vercel dashboard URL dynamically
    // Format: https://vercel.com/{team}/{project}
    dashboardUrl: buildDashboardUrl(),
    storesUrl: buildStoresUrl(),
  }

  return NextResponse.json(info)
}

function buildDashboardUrl(): string | null {
  const teamId = process.env.VERCEL_TEAM_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  
  // If we have team and project, we can build the URL
  // But Vercel uses slugs in URLs, not IDs...
  // The best approach is to use VERCEL_URL and extract project name
  
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) {
    // URL format: {project}-{hash}-{team}.vercel.app
    // Example: zapflow-nextjs-abc123-thaleslarays-projects.vercel.app
    const match = vercelUrl.match(/^([^-]+(?:-[^-]+)*?)-[a-z0-9]+-([^.]+)\.vercel\.app$/)
    if (match) {
      const [, projectSlug, teamSlug] = match
      return `https://vercel.com/${teamSlug}/${projectSlug}`
    }
  }
  
  // Fallback: use production URL
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prodUrl) {
    // Production URL format: {project}.vercel.app or custom domain
    // Can't reliably extract team from this
  }
  
  return null
}

function buildStoresUrl(): string | null {
  const dashboardUrl = buildDashboardUrl()
  if (dashboardUrl) {
    return `${dashboardUrl}/stores`
  }
  return null
}

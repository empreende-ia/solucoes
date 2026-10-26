import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { supabase } from '@/lib/supabase'

function safeUrlHost(raw: string | undefined): { host: string | null; projectRef: string | null } {
  try {
    if (!raw) return { host: null, projectRef: null }
    const u = new URL(raw)
    const host = u.host
    const projectRef = host.split('.')[0] || null
    return { host, projectRef }
  } catch {
    return { host: null, projectRef: null }
  }
}

function normalizeError(err: unknown): { message: string } | null {
  if (!err) return null
  if (err instanceof Error) return { message: err.message }
  if (typeof err === 'string') return { message: err }
  if (typeof err === 'object') {
    const anyErr = err as any
    const msg = typeof anyErr.message === 'string' ? anyErr.message : null
    if (msg) return { message: msg }
  }
  return { message: 'Erro desconhecido' }
}

async function probeTable(table: string) {
  try {
    const { error } = await supabase.from(table).select('*').limit(1)
    if (error) return { ok: false, error: { message: error.message } }
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: normalizeError(e) }
  }
}

/**
 * GET /api/debug/supabase-tables
 * Endpoint simples de diagnóstico para ambientes de dev.
 */
export async function GET() {
  const urlInfo = safeUrlHost(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasSecretKey = !!process.env.SUPABASE_SECRET_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const hasPublishableKey = !!(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const flows = await probeTable('flows')
  const flowSubmissions = await probeTable('flow_submissions')
  const settings = await probeTable('settings')

  return NextResponse.json({
    env: {
      supabaseUrlHost: urlInfo.host,
      projectRefGuess: urlInfo.projectRef,
      hasSecretKey,
      hasPublishableKey,
    },
    tables: {
      flows,
      flow_submissions: flowSubmissions,
      settings,
    },
  })
}

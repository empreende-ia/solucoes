/**
 * Debug endpoint para verificar logs de AI e diagnosticar problemas
 * GET /api/debug/ai-logs?conversation_id=xxx&limit=10
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Debug endpoint only available in development' },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversation_id')
  const limit = parseInt(url.searchParams.get('limit') || '10')

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  // Get AI logs
  let logsQuery = supabase
    .from('ai_agent_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (conversationId) {
    logsQuery = logsQuery.eq('conversation_id', conversationId)
  }

  const { data: logs, error: logsError } = await logsQuery

  // Get recent conversations
  const { data: conversations, error: convError } = await supabase
    .from('inbox_conversations')
    .select('id, phone, mode, status, ai_agent_id, automation_paused_until, automation_paused_by, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5)

  // Get active agents
  const { data: agents, error: agentsError } = await supabase
    .from('ai_agents')
    .select('id, name, is_active, is_default, model')
    .eq('is_active', true)

  // Check global AI enabled setting
  const { data: globalSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'ai_agents_global_enabled')
    .single()

  return NextResponse.json({
    logs: logs || [],
    logsError: logsError?.message,
    conversations: conversations || [],
    conversationsError: convError?.message,
    activeAgents: agents || [],
    agentsError: agentsError?.message,
    globalAIEnabled: globalSetting?.value !== 'false',
    timestamp: new Date().toISOString(),
  })
}

'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase-server'
import { hasOwnerPrincipal } from '@/lib/server-principal'
import type { InboxConversation, InboxLabel, InboxQuickReply } from '@/types'

export interface InboxInitialData {
  conversations: InboxConversation[]
  labels: InboxLabel[]
  quickReplies: InboxQuickReply[]
  totalUnread: number
}

/**
 * Busca dados iniciais do inbox no servidor (RSC).
 * Carrega conversas, labels e quick replies em paralelo.
 * Usa cache() para deduplicação per-request.
 * Sem principal de dono devolve null (o client busca pelas APIs).
 */
export const getInboxInitialData = cache(async (): Promise<InboxInitialData | null> => {
  // Defesa em profundidade: sem principal de dono (ex.: modo degradado com banco
  // fora), não consulta o banco — a página renderiza só o shell.
  if (!(await hasOwnerPrincipal())) return null

  const supabase = await createClient()

  // Buscar tudo em paralelo
  const [conversationsResult, labelsResult, quickRepliesResult] = await Promise.all([
    // Conversas recentes (últimas 50)
    supabase
      .from('inbox_conversations')
      .select(`
        *,
        contact:contacts(id, name, phone, email, tags),
        labels:inbox_conversation_labels(
          label:inbox_labels(id, name, color)
        )
      `)
      .order('last_message_at', { ascending: false })
      .limit(50),

    // Labels
    supabase
      .from('inbox_labels')
      .select('*')
      .order('name'),

    // Quick Replies
    supabase
      .from('inbox_quick_replies')
      .select('*')
      .order('shortcut')
  ])

  // Mapear conversas - manter snake_case do Supabase
  const conversations: InboxConversation[] = (conversationsResult.data || []).map((conv: any) => ({
    ...conv,
    labels: (conv.labels || [])
      .map((l: any) => l.label)
      .filter(Boolean)
  }))

  // Contar não lidos
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  return {
    conversations,
    labels: (labelsResult.data || []) as InboxLabel[],
    quickReplies: (quickRepliesResult.data || []) as InboxQuickReply[],
    totalUnread
  }
})

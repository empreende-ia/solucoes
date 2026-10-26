import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  api,
  INBOX_PAGE_SIZE,
  toInboxConversation,
  toInboxMessage,
  recomputeWaiting,
  readConversationHandling,
  type InboxConversation,
  type InboxMessage,
} from '@/services/api';
import {
  DBMessage,
  DBConversation,
  MessageDirection,
  MessageType
} from '@/types';
import { toast } from 'sonner';

/** Ordena por atividade mais recente — a lista precisa reordenar sozinha. */
function sortByActivity(list: InboxConversation[]): InboxConversation[] {
  return [...list].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function useConversations() {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(true);

  // Track processed message IDs to prevent duplicates across re-renders
  const processedMessageIds = useRef(new Set<string>());

  // Track conversation IDs being fetched to prevent duplicate fetches
  const fetchingConversationIds = useRef(new Set<string>());

  // Polling interval ref for fallback mechanism
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Espelho do estado para callbacks que não devem se recriar a cada mensagem
  const conversationsRef = useRef<InboxConversation[]>([]);
  conversationsRef.current = conversations;

  // Conversas com uma página de histórico já em voo
  const loadingOlderIds = useRef(new Set<string>());

  // Fetch a single conversation and add it to state
  const fetchAndAddConversation = useCallback(async (conversationId: string) => {
    // Prevent duplicate fetches
    if (fetchingConversationIds.current.has(conversationId)) {
      console.log('[Realtime] Already fetching conversation:', conversationId);
      return;
    }

    fetchingConversationIds.current.add(conversationId);
    console.log('[Realtime] Fetching new conversation:', conversationId);

    try {
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`*, contact:contacts(*)`)
        .eq('id', conversationId)
        .maybeSingle();

      if (convError || !convData) {
        console.error('[Realtime] Error fetching conversation:', convError);
        return;
      }

      // Mesma receita da lista: as mais RECENTES, devolvidas em ordem cronológica.
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INBOX_PAGE_SIZE + 1);

      if (msgError) {
        console.error('[Realtime] Error fetching messages:', msgError);
      }

      const descending = (messages || []) as unknown as DBMessage[];
      const hasMore = descending.length > INBOX_PAGE_SIZE;
      const page = hasMore ? descending.slice(0, INBOX_PAGE_SIZE) : descending;

      const uiConversation = toInboxConversation(
        convData as unknown as DBConversation,
        [...page].reverse(),
        hasMore
      );

      // Add new conversation to state (at top, sorted by recency)
      setConversations(prev => {
        // Check if already added by another event
        if (prev.some(c => c.id === uiConversation.id)) {
          console.log('[Realtime] Conversation already in state, skipping add');
          return prev;
        }
        return sortByActivity([uiConversation, ...prev]);
      });

      // Mark messages as processed
      page.forEach(m => processedMessageIds.current.add(m.id));

    } catch (err) {
      console.error('[Realtime] Error in fetchAndAddConversation:', err);
    } finally {
      fetchingConversationIds.current.delete(conversationId);
    }
  }, []);

  // Initial fetch
  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchConversations();

      // Reset processed IDs on fresh fetch and populate with existing messages
      processedMessageIds.current.clear();
      data.forEach(conv => {
        conv.messages.forEach(msg => {
          processedMessageIds.current.add(msg.id);
        });
      });

      setConversations(sortByActivity(data));
    } catch (err) {
      console.error('[useConversations] Error fetching:', err);
      setError('Erro ao carregar conversas');
      toast.error('Erro ao carregar conversas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    fetchConversations();

    console.log('[Realtime] Setting up real-time subscriptions...');

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const newMessage = payload.new as DBMessage;

          // Early duplicate check using processed IDs set
          if (processedMessageIds.current.has(newMessage.id)) {
            return;
          }

          setConversations(prev => {
            // Check if conversation exists in our state
            const conversationExists = prev.some(c => c.id === newMessage.conversation_id);

            if (!conversationExists) {
              // Message from a new conversation - fetch it asynchronously
              fetchAndAddConversation(newMessage.conversation_id);
              return prev; // Return prev, async fetch will update state
            }

            const next = prev.map(conv => {
              if (conv.id !== newMessage.conversation_id) return conv;

              const uiMessage = toInboxMessage(newMessage);

              // Check if message already exists by ID
              if (conv.messages.some(m => m.id === uiMessage.id)) {
                return conv;
              }

              // Check if message already exists by whatsapp_message_id (dedupe)
              if (newMessage.whatsapp_message_id) {
                const existsByWAId = conv.messages.some(m =>
                  m.whatsappMessageId === newMessage.whatsapp_message_id
                );
                if (existsByWAId) return conv;
              }

              // Check for temp message with same content and fromType (optimistic)
              const tempMessageIndex = conv.messages.findIndex(m =>
                m.id.startsWith('temp-') &&
                m.content === uiMessage.content &&
                m.fromType === uiMessage.fromType
              );

              if (tempMessageIndex !== -1) {
                const updatedMessages = [...conv.messages];
                updatedMessages[tempMessageIndex] = uiMessage;
                processedMessageIds.current.add(uiMessage.id);

                return recomputeWaiting({
                  ...conv,
                  messages: updatedMessages,
                  lastMessage: newMessage.content || '',
                  lastMessageTime: 'Agora',
                  lastMessageAt: newMessage.sent_at
                });
              }

              processedMessageIds.current.add(uiMessage.id);

              return recomputeWaiting({
                ...conv,
                messages: [...conv.messages, uiMessage],
                lastMessage: newMessage.content || '',
                lastMessageTime: 'Agora',
                lastMessageAt: newMessage.sent_at,
                // Increment unread if it's from user
                unreadCount: newMessage.from_type === 'user'
                  ? conv.unreadCount + 1
                  : conv.unreadCount
              });
            });

            // Mensagem nova reordena a lista: a conversa mais quente sobe.
            return sortByActivity(next);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          const updatedMessage = payload.new as DBMessage;

          setConversations(prev => {
            return prev.map(conv => {
              if (conv.id !== updatedMessage.conversation_id) return conv;
              return recomputeWaiting({
                ...conv,
                messages: conv.messages.map(msg =>
                  msg.id === updatedMessage.id ? toInboxMessage(updatedMessage) : msg
                )
              });
            });
          });
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Messages channel status:', status);
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
          // Clear polling if realtime reconnects
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Error connecting to messages channel:', err);
          setRealtimeConnected(false);
          // Start polling fallback
          if (!pollingIntervalRef.current) {
            pollingIntervalRef.current = setInterval(() => {
              fetchConversations();
            }, 10000);
          }
          // Also attempt immediate fetch
          setTimeout(() => fetchConversations(), 2000);
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Connection timed out');
          setRealtimeConnected(false);
          // Start polling fallback
          if (!pollingIntervalRef.current) {
            pollingIntervalRef.current = setInterval(() => {
              fetchConversations();
            }, 10000);
          }
          setTimeout(() => fetchConversations(), 3000);
        }
      });

    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          const newConv = payload.new as any;

          // Check if already in state
          setConversations(prev => {
            if (prev.some(c => c.id === newConv.id)) {
              return prev;
            }
            // Not in state - fetch it
            fetchAndAddConversation(newConv.id);
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations'
        },
        (payload) => {
          const updated = payload.new as any;
          setConversations(prev => {
            return prev.map(conv => {
              if (conv.id !== updated.id) return conv;
              // A transferência escrita pela agente chega por aqui: sem ler o
              // metadata, o operador seria chamado sem saber o motivo.
              const { handoff, takeover } = readConversationHandling(updated.metadata);
              return recomputeWaiting({
                ...conv,
                status: updated.status,
                isActive: updated.is_active,
                assignedTeam: updated.assigned_team,
                assignedUserId: updated.assigned_user_id ?? conv.assignedUserId,
                lastMessageAt: updated.last_message_at || conv.lastMessageAt,
                handoff,
                takeover
              });
            });
          });
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Conversations channel status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Error connecting to conversations channel:', err);
          // Don't duplicate polling - messages channel handles it
        }
      });

    // Cleanup
    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
      // Clear polling interval on cleanup
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchConversations, fetchAndAddConversation]);

  // Send message
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    if (!content.trim()) return;

    // Optimistic update with temporary ID
    const tempId = `temp-${Date.now()}`;
    const now = new Date();
    const tempMessage: InboxMessage = {
      id: tempId,
      content,
      timestamp: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      direction: MessageDirection.OUTGOING,
      type: MessageType.TEXT,
      status: 'sent',
      fromType: 'human',
      mediaUrl: null,
      mediaProxyId: null,
      whatsappMessageId: null,
      sentAt: now.toISOString(),
      sendError: null
    };

    setConversations(prev => sortByActivity(prev.map(conv => {
      if (conv.id !== conversationId) return conv;
      return recomputeWaiting({
        ...conv,
        messages: [...conv.messages, tempMessage],
        lastMessage: content,
        lastMessageTime: 'Agora',
        lastMessageAt: tempMessage.sentAt
      });
    })));

    try {
      // The realtime handler will detect and replace the temp message automatically
      await api.sendMessage(conversationId, content);
    } catch (err) {
      console.error('[useConversations] Error sending message:', err);
      toast.error('Não foi possível enviar a mensagem.');

      // Remove optimistic message on error
      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id !== conversationId) return conv;
          return recomputeWaiting({
            ...conv,
            messages: conv.messages.filter(m => m.id !== tempId)
          });
        });
      });
    }
  }, []);

  /** Nome de quem opera, para registrar quem assumiu a conversa. */
  const resolveOperatorName = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return null;
      const meta = (user.user_metadata || {}) as Record<string, any>;
      const named = meta.full_name || meta.name;
      if (typeof named === 'string' && named.trim()) return named.trim();
      return user.email ? user.email.split('@')[0] : null;
    } catch {
      return null;
    }
  }, []);

  // Update conversation status
  const updateStatus = useCallback(async (
    conversationId: string,
    status: 'lara' | 'human' | 'paused'
  ) => {
    const operatorName = status === 'human' ? await resolveOperatorName() : null;

    try {
      const takeover = await api.setConversationHandling(conversationId, status, operatorName);

      setConversations(prev => {
        return prev.map(conv => {
          if (conv.id !== conversationId) return conv;
          return recomputeWaiting({ ...conv, status, takeover });
        });
      });

      const statusLabels = {
        lara: 'Conversa devolvida à agente.',
        human: 'Você assumiu esta conversa. A agente não responde aqui.',
        paused: 'Conversa pausada. Ninguém responde automaticamente.'
      };
      toast.success(statusLabels[status]);
    } catch (err) {
      console.error('[useConversations] Error updating status:', err);
      toast.error('Não foi possível trocar quem responde.');
    }
  }, [resolveOperatorName]);

  // Mark messages as read
  const markAsRead = useCallback(async (conversationId: string) => {
    // Optimistic UI update
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unreadCount: 0 };
        }
        return conv;
      });
    });

    // Persist to database
    try {
      await api.markMessagesAsRead(conversationId);
    } catch (err) {
      console.error('[useConversations] Error marking messages as read:', err);
      // Don't revert UI on error (better UX)
    }
  }, []);

  /** Carrega o bloco anterior do histórico da conversa. */
  const loadOlderMessages = useCallback(async (conversationId: string) => {
    if (loadingOlderIds.current.has(conversationId)) return;

    const target = conversationsRef.current.find(c => c.id === conversationId);
    if (!target || !target.hasMoreMessages || !target.oldestLoadedAt) return;

    const anchor = target.oldestLoadedAt;
    loadingOlderIds.current.add(conversationId);
    setConversations(prev => prev.map(conv => (
      conv.id === conversationId ? { ...conv, loadingOlder: true } : conv
    )));

    try {
      const { messages, hasMore } = await api.fetchOlderMessages(conversationId, anchor);
      messages.forEach(m => processedMessageIds.current.add(m.id));

      setConversations(prev => prev.map(conv => {
        if (conv.id !== conversationId) return conv;
        const known = new Set(conv.messages.map(m => m.id));
        // A pagina vem por sent_at <= ancora, entao repete o que ja esta na
        // tela quando duas mensagens dividem o mesmo segundo. Descarta por id.
        const older = messages.filter(m => !known.has(m.id));
        return recomputeWaiting({
          ...conv,
          messages: [...older, ...conv.messages],
          // Se a pagina inteira ja era conhecida, a ancora nao anda: insistir
          // devolveria sempre o mesmo bloco. Encerra em vez de girar em falso.
          hasMoreMessages: older.length === 0 ? false : hasMore,
          oldestLoadedAt: older[0]?.sentAt ?? conv.oldestLoadedAt,
          loadingOlder: false
        });
      }));
    } catch (err) {
      console.error('[useConversations] Error loading older messages:', err);
      toast.error('Não foi possível carregar as mensagens anteriores.');
      setConversations(prev => prev.map(conv => (
        conv.id === conversationId ? { ...conv, loadingOlder: false } : conv
      )));
    } finally {
      loadingOlderIds.current.delete(conversationId);
    }
  }, []);

  /** Reenfileira uma mensagem recusada pelo canal. */
  const resendMessage = useCallback(async (conversationId: string, messageId: string) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id !== conversationId) return conv;
      return {
        ...conv,
        messages: conv.messages.map(m => (
          m.id === messageId ? { ...m, status: 'sent' as const, sendError: null } : m
        ))
      };
    }));

    try {
      await api.resendMessage(messageId);
      toast.success('Mensagem reenviada para a fila.');
    } catch (err) {
      console.error('[useConversations] Error resending message:', err);
      const detail = err instanceof Error ? err.message : '';
      toast.error(detail || 'Não foi possível reenviar a mensagem.');
      setConversations(prev => prev.map(conv => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          messages: conv.messages.map(m => (
            m.id === messageId ? { ...m, status: 'failed' as const } : m
          ))
        };
      }));
    }
  }, []);

  // Assign conversation (and sync with deal)
  const assignConversation = useCallback(async (conversationId: string, userId: string | null) => {
    const conv = conversationsRef.current.find(c => c.id === conversationId);
    if (!conv) return;

    // Optimistic UI update
    setConversations(prev => {
      return prev.map(c => {
        if (c.id === conversationId) {
          return { ...c, assignedUserId: userId };
        }
        return c;
      });
    });

    // Persist to database
    try {
      await api.assignConversation(conversationId, userId, conv.contactId);
    } catch (err) {
      console.error('[useConversations] Error assigning conversation:', err);
      // Revert on error
      setConversations(prev => {
        return prev.map(c => {
          if (c.id === conversationId) {
            return { ...c, assignedUserId: conv.assignedUserId };
          }
          return c;
        });
      });
    }
  }, []);

  return {
    conversations,
    loading,
    error,
    realtimeConnected,
    sendMessage,
    updateStatus,
    markAsRead,
    assignConversation,
    loadOlderMessages,
    resendMessage,
    refetch: fetchConversations
  };
}

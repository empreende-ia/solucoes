import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  AlertCircle, Search, MoreVertical, Phone, Paperclip, Send, Check, CheckCheck,
  Smile, Play, Loader2, MessageSquare, Info, X, Mail,
  Bot, User, Pause, Brain, Plus, FileText, Clock, ArrowLeft, RotateCcw,
  ChevronUp, WifiOff
} from 'lucide-react';
import { MessageDirection, MessageType, ConversationStatus, TagDefinition } from '../types';
import { zernioMediaUrl } from '@/lib/mediaProxy';
import { Button } from './Button';
import { useConversations } from '../hooks/useConversations';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { api, type InboxConversation, type InboxMessage } from '@/services/api';
import { TagSelector } from './TagSelector';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import './ChatInterface.css';

/** Acima disso a espera fica marcada como atrasada na lista. */
const WAIT_ALERT_MINUTES = 15;

function minutesSince(iso: string, now: number): number {
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 60000));
}

/** "agora", "12min", "3h", "2d" — a espera precisa ser lida em 2 segundos. */
function formatElapsed(iso: string, now: number): string {
  const mins = minutesSince(iso, now);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Separador de dia real: "Hoje", "Ontem" ou a data. */
function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/** Conversa que depende de gente: transferida e ainda sem resposta humana. */
function isWaitingForHuman(chat: InboxConversation): boolean {
  return chat.status === 'human' && (chat.unansweredSince !== null || !chat.takeover);
}

const ChatInterface: React.FC = () => {
  const {
    conversations,
    loading,
    realtimeConnected,
    sendMessage,
    updateStatus,
    markAsRead,
    assignConversation,
    loadOlderMessages,
    resendMessage
  } = useConversations();
  const { sdrName, companyName } = useCompanySettings();
  const assistantName = sdrName || 'Lara';
  const workspaceName = companyName || 'Minha empresa';
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [showProfileInfo, setShowProfileInfo] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageMatchIds, setMessageMatchIds] = useState<Set<string>>(new Set());
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [resendingId, setResendingId] = useState<string | null>(null);
  const openedByOperator = useRef(false);
  // O ?conversation= da URL vale uma vez. Sem isso, cada mensagem que chega
  // muda `conversations`, o efeito roda de novo e joga o operador de volta na
  // conversa do link — ele nao consegue abrir nenhuma outra.
  const urlParamApplied = useRef(false);
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [notesValue, setNotesValue] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  
  // Audio player state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const [audioProgress, setAudioProgress] = useState<Record<string, number>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  
  const activeChat = conversations.find(c => c.id === selectedChatId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Format audio time helper
  const formatAudioTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load tag definitions and team members
  useEffect(() => {
    api.fetchTagDefinitions().then(setAvailableTags).catch(err => {
      console.error('Error loading tags:', err);
      toast.error('Erro ao carregar tags');
    });

    api.fetchTeam().then(setTeamMembers).catch(err => {
      console.error('Error loading team members:', err);
    });
  }, []);

  // Auto-select first conversation or from URL param.
  // No celular a lista É a tela: abrir sozinho prendia o operador na primeira
  // conversa da fila, sem caminho de volta.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const conversationParam = urlParams.get('conversation');

    if (
      conversationParam
      && !urlParamApplied.current
      && conversations.some(c => c.id === conversationParam)
    ) {
      urlParamApplied.current = true;
      openedByOperator.current = true;
      setSelectedChatId(conversationParam);
      return;
    }

    const isNarrow = typeof window !== 'undefined'
      && window.matchMedia('(max-width: 767px)').matches;

    if (!isNarrow && conversations.length > 0 && !selectedChatId) {
      setSelectedChatId(conversations[0].id);
    }
  }, [conversations, selectedChatId]);

  // Marcar como lida SÓ quando o operador abre a conversa. No auto-select isso
  // zerava o contador de não lidas de quem ninguém tinha aberto.
  useEffect(() => {
    if (!selectedChatId || !openedByOperator.current) return;
    if ((activeChat?.unreadCount ?? 0) > 0) {
      markAsRead(selectedChatId);
    }
  }, [selectedChatId, activeChat?.unreadCount, markAsRead]);

  const openConversation = useCallback((conversationId: string) => {
    openedByOperator.current = true;
    setSelectedChatId(conversationId);
  }, []);

  // O tempo de espera precisa andar sozinho na tela
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Busca por conteúdo de mensagem no banco (nome e telefone filtram local)
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      setMessageMatchIds(new Set());
      setIsSearchingMessages(false);
      return;
    }

    let cancelled = false;
    setIsSearchingMessages(true);
    const timer = setTimeout(() => {
      api.searchConversationsByMessage(term)
        .then(ids => {
          if (!cancelled) setMessageMatchIds(new Set(ids));
        })
        .catch(err => {
          console.error('Error searching messages:', err);
          if (!cancelled) setMessageMatchIds(new Set());
        })
        .finally(() => {
          if (!cancelled) setIsSearchingMessages(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Sync notes value with active chat
  useEffect(() => {
    if (activeChat) {
      setNotesValue(activeChat.notes || '');
    }
  }, [activeChat?.id]);

  // Handle notes save on blur
  const handleNotesBlur = async () => {
    if (!activeChat || notesValue === (activeChat.notes || '')) return;
    
    setIsSavingNotes(true);
    try {
      await api.updateContactNotes(activeChat.contactId, notesValue);
      toast.success('Notas salvas');
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Erro ao salvar notas');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeChat) {
      scrollToBottom();
    }
  }, [activeChat?.id, selectedChatId]); 

  // Só a chegada de mensagem NOVA rola até o fim. Carregar o histórico
  // anterior não pode arrancar o operador de onde ele está lendo.
  const lastMessageId = activeChat?.messages[activeChat.messages.length - 1]?.id;
  useEffect(() => {
    scrollToBottom();
  }, [lastMessageId]);

  const handleToggleTag = async (tagKey: string) => {
    if (!activeChat) return;
    
    const currentTags = activeChat.tags || [];
    const newTags = currentTags.includes(tagKey)
      ? currentTags.filter(t => t !== tagKey)
      : [...currentTags, tagKey];
    
    try {
      await api.updateContactTags(activeChat.contactId, newTags);
      toast.success('Tag atualizada');
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error('Erro ao atualizar tag');
    }
  };

  const handleCreateTag = async (tag: { key: string; label: string; color: string; category: string }) => {
    try {
      const newTag = await api.createTagDefinition(tag);
      setAvailableTags(prev => [...prev, newTag]);
      toast.success('Tag criada com sucesso');
      
      // Adicionar a tag ao contato automaticamente
      if (activeChat) {
        await handleToggleTag(tag.key);
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      toast.error('Erro ao criar tag');
    }
  };

  const canOperatorSend = activeChat ? activeChat.status !== 'lara' : false;

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    // A agente responde esta conversa: enviar por cima daria duas vozes
    // diferentes da mesma empresa na frente do lead.
    if (!canOperatorSend) {
      toast.error(`Assuma a conversa para responder. Hoje quem responde é ${assistantName}.`);
      return;
    }

    const content = inputText.trim();
    setInputText('');

    await sendMessage(activeChat.id, content);
  };

  const handleStatusChange = async (status: ConversationStatus) => {
    if (!activeChat) return;
    await updateStatus(activeChat.id, status);
  };

  const handleResend = async (message: InboxMessage) => {
    if (!activeChat) return;
    setResendingId(message.id);
    try {
      await resendMessage(activeChat.id, message.id);
    } finally {
      setResendingId(null);
    }
  };

  const searchTerm = searchQuery.trim().toLowerCase();

  const filteredConversations = useMemo(() => {
    if (!searchTerm) return conversations;
    const digits = searchTerm.replace(/\D/g, '');
    return conversations.filter(chat => (
      chat.contactName.toLowerCase().includes(searchTerm)
      || (digits.length >= 3 && chat.contactPhone.replace(/\D/g, '').includes(digits))
      || chat.lastMessage.toLowerCase().includes(searchTerm)
      || chat.messages.some(msg => msg.content.toLowerCase().includes(searchTerm))
      || messageMatchIds.has(chat.id)
    ));
  }, [conversations, searchTerm, messageMatchIds]);

  // Faixa de quem espera gente, da espera mais longa para a mais curta.
  const waitingQueue = useMemo(() => (
    filteredConversations
      .filter(isWaitingForHuman)
      .sort((a, b) => {
        const left = a.waitingSince ? new Date(a.waitingSince).getTime() : Infinity;
        const right = b.waitingSince ? new Date(b.waitingSince).getTime() : Infinity;
        return left - right;
      })
  ), [filteredConversations]);

  const otherConversations = useMemo(() => (
    filteredConversations.filter(chat => !isWaitingForHuman(chat))
  ), [filteredConversations]);

  const renderStatusBadge = (status: ConversationStatus) => {
    const config = {
      lara: { label: assistantName, icon: Bot },
      human: { label: 'Humano', icon: User },
      paused: { label: 'Pausado', icon: Pause }
    };
    const { label, icon: Icon } = config[status];
    return (
      <span className={`eia-meta-chip chat-status is-${status}`}>
        <Icon aria-hidden="true" />
        {label}
      </span>
    );
  };

  const renderConversationRow = (chat: InboxConversation) => {
    const waiting = isWaitingForHuman(chat);
    const waitAnchor = waiting ? chat.waitingSince : chat.unansweredSince;
    const waitMinutes = waitAnchor ? minutesSince(waitAnchor, now) : 0;
    const isOverdue = waitAnchor !== null && waitMinutes >= WAIT_ALERT_MINUTES;
    const lastMsg = chat.messages[chat.messages.length - 1];

    return (
      <div
        key={chat.id}
        role="button"
        tabIndex={0}
        onClick={() => openConversation(chat.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openConversation(chat.id);
          }
        }}
        className={`chat-conversation-row ${selectedChatId === chat.id ? 'is-active' : ''} ${waiting ? 'is-waiting' : ''}`}
      >
        <div>
          <div className="w-12 h-12 rounded-full p-0.5 bg-muted">
            <img
              src={chat.contactAvatar}
              alt={chat.contactName}
              className="w-full h-full rounded-full object-cover border border-border"
            />
          </div>
        </div>

        <div className="ml-3 flex-1 min-w-0">
          <div className="flex justify-between items-baseline mb-1 gap-2">
            <h3 className={`text-sm font-semibold truncate ${selectedChatId === chat.id ? 'text-foreground' : 'text-muted-foreground'}`}>
              {chat.contactName}
            </h3>
            <span className="text-[10px] text-muted-foreground font-medium shrink-0">{chat.lastMessageTime}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {lastMsg?.type === MessageType.IMAGE ? 'Imagem' :
             lastMsg?.type === MessageType.AUDIO ? 'Áudio' :
             chat.lastMessage || 'Sem mensagens'}
          </p>

          <div className="flex items-center mt-2 gap-1.5 flex-wrap">
            {renderStatusBadge(chat.status)}
            {waitAnchor && (
              <span
                className={`chat-wait-chip ${isOverdue ? 'is-overdue' : ''}`}
                title={`Sem resposta desde ${formatDateTime(waitAnchor)}`}
              >
                <Clock aria-hidden="true" />
                aguarda {formatElapsed(waitAnchor, now)}
              </span>
            )}
            {chat.channel === 'instagram' && (
              <span className="eia-pill border border-border bg-secondary text-muted-foreground">
                Instagram
              </span>
            )}
            {chat.tags.slice(0, 1).map(tag => (
              <span key={tag} className="eia-pill border border-border bg-secondary text-muted-foreground">
                {tag}
              </span>
            ))}
            {chat.unreadCount > 0 && (
              <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-semibold px-1.5 h-4 min-w-[1rem] flex items-center justify-center rounded-full shadow-sm">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMessageContent = (msg: InboxMessage) => {
    // Mídia da Zernia exige proxy autenticado; media_url direto tem prioridade
    const mediaSrc = msg.mediaUrl ?? (msg.mediaProxyId ? zernioMediaUrl(msg.mediaProxyId) : null);
    // Rótulos "[vídeo recebido]" etc. são placeholder, não legenda
    const caption = /^\[.+\]$/.test(msg.content.trim()) ? null : msg.content;

    if (msg.type === MessageType.IMAGE) {
      if (!mediaSrc) {
        return <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">Imagem indisponível</p>;
      }
      return (
        <div className="mb-1 group relative">
          <img
            src={mediaSrc}
            alt="Anexo"
            className="rounded-lg max-w-full h-auto max-h-72 object-cover border border-border/50 shadow-sm"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/300x200/141414/FFFFFF?text=Erro+Imagem';
            }}
          />
          {caption && <p className="mt-1 leading-relaxed whitespace-pre-wrap">{caption}</p>}
        </div>
      );
    }

    if (msg.type === MessageType.VIDEO) {
      if (!mediaSrc) {
        return <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">Vídeo indisponível</p>;
      }
      return (
        <div className="mb-1">
          <video
            src={mediaSrc}
            controls
            preload="metadata"
            className="rounded-lg max-w-full h-auto max-h-72 border border-border/50 shadow-sm bg-black/40"
          />
          {caption && <p className="mt-1 leading-relaxed whitespace-pre-wrap">{caption}</p>}
        </div>
      );
    }

    if (msg.type === MessageType.DOCUMENT) {
      if (!mediaSrc) {
        return <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">Arquivo indisponível</p>;
      }
      return (
        <div className="mb-1">
          <a
            href={mediaSrc}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              msg.direction === MessageDirection.OUTGOING
                ? 'border-primary-foreground/30 hover:bg-primary-foreground/10'
                : 'border-border hover:bg-muted'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="underline underline-offset-2">Abrir arquivo</span>
          </a>
          {caption && <p className="mt-1 leading-relaxed whitespace-pre-wrap">{caption}</p>}
        </div>
      );
    }

    if (msg.type === MessageType.AUDIO) {
      const isPlaying = playingAudioId === msg.id;
      const duration = audioDurations[msg.id] || 0;
      const progress = audioProgress[msg.id] || 0;
      
      const togglePlay = () => {
        const audio = audioRefs.current[msg.id];
        if (!audio) return;
        
        if (isPlaying) {
          audio.pause();
          setPlayingAudioId(null);
        } else {
          // Pause all other audios
          Object.values(audioRefs.current).forEach(a => a.pause());
          audio.play();
          setPlayingAudioId(msg.id);
        }
      };

      return (
        <div className="flex items-center gap-3 min-w-[220px] py-1">
          {/* Hidden audio element */}
          {mediaSrc && (
            <audio
              ref={el => { if (el) audioRefs.current[msg.id] = el; }}
              src={mediaSrc}
              onLoadedMetadata={(e) => {
                const audio = e.currentTarget;
                setAudioDurations(prev => ({ ...prev, [msg.id]: audio.duration }));
              }}
              onTimeUpdate={(e) => {
                const audio = e.currentTarget;
                setAudioProgress(prev => ({ ...prev, [msg.id]: audio.currentTime }));
              }}
              onEnded={() => setPlayingAudioId(null)}
            />
          )}
          
          {/* Play/Pause button */}
          <button 
            onClick={togglePlay}
            disabled={!mediaSrc}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all shadow-sm ${
              msg.direction === MessageDirection.OUTGOING
                ? 'bg-primary-foreground text-primary hover:bg-primary-foreground/90 disabled:opacity-50'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
            )}
          </button>
          
          {/* Progress bar and duration */}
          <div className="flex-1 flex flex-col gap-1 justify-center h-9">
            <div 
              className={`h-1.5 rounded-full overflow-hidden cursor-pointer ${
                msg.direction === MessageDirection.OUTGOING ? 'bg-primary-foreground/30' : 'bg-muted-foreground/30'
              }`}
              onClick={(e) => {
                const audio = audioRefs.current[msg.id];
                if (!audio || !duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                audio.currentTime = percent * duration;
              }}
            >
              <div 
                className={`h-full rounded-full transition-all ${
                  msg.direction === MessageDirection.OUTGOING ? 'bg-primary-foreground' : 'bg-primary'
                }`}
                style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
              />
            </div>
            <span className={`text-[10px] font-medium ${
              msg.direction === MessageDirection.OUTGOING ? 'text-primary-foreground/80' : 'text-muted-foreground'
            }`}>
              {formatAudioTime(progress)} / {formatAudioTime(duration)}
            </span>
          </div>
        </div>
      );
    }

    return <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

  if (loading) {
    return (
      <div className="chat-loading" role="status" aria-live="polite">
        <span className="chat-loading-icon">
          <Loader2 className="animate-spin" aria-hidden="true" />
        </span>
        <p>Sincronizando conversas…</p>
      </div>
    );
  }

  return (
    <div className={`chat-shell ${activeChat ? 'has-active-chat' : 'is-empty'}`}>

      {/* Left Sidebar: Chat List */}
      <aside className="chat-list-panel" aria-label="Lista de conversas">
        {/* Search Header */}
        <div className="chat-list-header">
          <p className="eia-eyebrow">Atendimento</p>
          <h2>Conversas</h2>
          <label className="chat-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Buscar por nome, telefone ou mensagem</span>
            <input
              type="text"
              placeholder="Nome, telefone ou mensagem"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {isSearchingMessages && (
              <Loader2 className="chat-search-spinner animate-spin" aria-hidden="true" />
            )}
            {searchQuery && !isSearchingMessages && (
              <button
                type="button"
                className="chat-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpar busca"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          {!realtimeConnected && (
            <p className="chat-connection-note">
              <WifiOff aria-hidden="true" />
              Sem tempo real. Atualizando a cada 10s.
            </p>
          )}
        </div>

        {/* Conversation List */}
        <div className="chat-conversation-list custom-scrollbar">
          {conversations.length === 0 ? (
            <div className="chat-list-empty">
              <span className="chat-list-empty-icon">
                <MessageSquare aria-hidden="true" />
              </span>
              <p>Nenhuma conversa por aqui.</p>
              <small>Conecte o canal para que as mensagens do WhatsApp cheguem nesta fila.</small>
              <Button variant="outline" onClick={() => { window.location.href = '/settings'; }}>
                Conectar canal
              </Button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="chat-list-empty">
              <span className="chat-list-empty-icon">
                <Search aria-hidden="true" />
              </span>
              <p>Nada encontrado para "{searchQuery.trim()}".</p>
              <small>A busca cobre nome, telefone e o conteúdo das mensagens.</small>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Limpar busca
              </Button>
            </div>
          ) : (
            <>
              {waitingQueue.length > 0 && (
                <section className="chat-queue-band" aria-label="Conversas esperando atendimento humano">
                  <header className="chat-list-section-head is-waiting">
                    <span className="eia-eyebrow">Esperando você</span>
                    <span className="chat-list-section-count">{waitingQueue.length}</span>
                  </header>
                  {waitingQueue.map(renderConversationRow)}
                </section>
              )}

              {otherConversations.length > 0 && (
                <section aria-label="Demais conversas">
                  {waitingQueue.length > 0 && (
                    <header className="chat-list-section-head">
                      <span className="eia-eyebrow">Em andamento</span>
                      <span className="chat-list-section-count">{otherConversations.length}</span>
                    </header>
                  )}
                  {otherConversations.map(renderConversationRow)}
                </section>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Right Area: Chat Window & Profile */}
      {activeChat ? (
        /* Palco da conversa um degrau abaixo do canvas: o balão recebido é
           branco, e branco sobre branco não existe. É o papel dos tokens
           de "stage" no DS (chat, overlay, empty state). */
        <div className="chat-workspace">
          {/* Main Chat Content */}
          <div className="flex-1 flex flex-col min-w-0 relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

            {/* Chat Header */}
            <div className="chat-conversation-header">
              <button
                type="button"
                className="chat-back-button"
                onClick={() => setSelectedChatId(null)}
                aria-label="Voltar para a fila"
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <div
                className="flex items-center cursor-pointer hover:bg-accent/50 p-1.5 -ml-1.5 rounded-lg transition-colors pr-3"
                onClick={() => setShowProfileInfo(!showProfileInfo)}
              >
                <div>
                  <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-9 h-9 rounded-full ring-2 ring-border" />
                </div>
                <div className="ml-3">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {activeChat.contactName}
                    {renderStatusBadge(activeChat.status)}
                    {activeChat.channel === 'instagram' && (
                      <span className="eia-pill border border-border bg-secondary text-muted-foreground">
                        Instagram
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-primary font-medium">
                    {activeChat.contactPhone || (activeChat.channel === 'instagram' ? 'DM do Instagram' : '')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Status control buttons */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-muted-foreground hover:text-foreground ${activeChat.status === 'lara' ? 'bg-primary/10 text-primary' : ''}`}
                  onClick={() => handleStatusChange('lara')}
                  title={`Devolver à ${assistantName}`}
                >
                  <Bot className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-muted-foreground hover:text-foreground ${activeChat.status === 'human' ? 'bg-primary/10 text-primary' : ''}`}
                  onClick={() => handleStatusChange('human')}
                  title="Assumir a conversa"
                >
                  <User className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-muted-foreground hover:text-foreground ${activeChat.status === 'paused' ? 'bg-accent text-foreground' : ''}`}
                  onClick={() => handleStatusChange('paused')}
                  title="Pausar: ninguém responde automaticamente"
                >
                  <Pause className="w-5 h-5" />
                </Button>
                <div className="h-6 w-px bg-border mx-1"></div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`text-muted-foreground hover:text-foreground ${showProfileInfo ? 'bg-accent text-primary' : ''}`}
                  onClick={() => setShowProfileInfo(!showProfileInfo)} 
                  title="Ver Informações"
                >
                  <Info className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  disabled
                  title="Em breve: Mais opções"
                  className="text-muted-foreground cursor-not-allowed opacity-50"
                >
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar relative z-0">
              {activeChat.hasMoreMessages && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadOlderMessages(activeChat.id)}
                    disabled={activeChat.loadingOlder}
                  >
                    {activeChat.loadingOlder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                    Carregar anteriores
                  </Button>
                </div>
              )}

              {activeChat.status === 'human' && activeChat.handoff && (
                <div className="chat-handoff-card">
                  <p className="eia-eyebrow">Transferida pela agente</p>
                  <p className="chat-handoff-reason">{activeChat.handoff.reason || 'Sem motivo registrado.'}</p>
                  {activeChat.handoff.summary && (
                    <p className="chat-handoff-summary">{activeChat.handoff.summary}</p>
                  )}
                  <p className="chat-handoff-meta">
                    {activeChat.handoff.requestedAt
                      ? `Pedido em ${formatDateTime(activeChat.handoff.requestedAt)}.`
                      : 'Sem horário registrado.'}
                    {activeChat.takeover?.at
                      ? ` Assumida por ${activeChat.takeover.byName || 'um operador'} em ${formatDateTime(activeChat.takeover.at)}.`
                      : ' Ainda sem ninguém no atendimento.'}
                  </p>
                </div>
              )}

              {activeChat.messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="w-16 h-16 mb-4 text-faint" />
                  <p className="text-sm">Nenhuma mensagem ainda.</p>
                  <p className="text-xs mt-1 text-faint">Escreva abaixo para começar o atendimento.</p>
                </div>
              ) : (
                <>
                  {activeChat.messages.map((msg, index) => {
                    const isOutgoing = msg.direction === MessageDirection.OUTGOING;
                    const previous = activeChat.messages[index - 1];
                    const showDay = !previous || formatDayLabel(previous.sentAt) !== formatDayLabel(msg.sentAt);

                    return (
                      <React.Fragment key={msg.id}>
                        {showDay && (
                          <div className="flex justify-center my-6">
                            <span className="chat-day-divider">{formatDayLabel(msg.sentAt)}</span>
                          </div>
                        )}
                        <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                          <div className={`flex flex-col max-w-[75%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-5 py-3 rounded-2xl shadow-sm relative text-sm leading-relaxed ${
                                isOutgoing
                                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                  : 'bg-card text-card-foreground rounded-tl-sm border border-border'
                              }`}
                            >
                              {renderMessageContent(msg)}
                            </div>

                            <div className="flex items-center mt-1.5 gap-1.5 text-faint px-1">
                              {isOutgoing && msg.fromType === 'lara' && (
                                <Bot className="w-3 h-3 text-primary" />
                              )}
                              {isOutgoing && msg.fromType === 'human' && (
                                <User className="w-3 h-3 text-muted-foreground" />
                              )}
                              <span
                                className="text-[10px] text-muted-foreground font-medium"
                                title={formatDateTime(msg.sentAt)}
                              >
                                {msg.timestamp}
                              </span>
                              {isOutgoing && (
                                msg.status === 'failed' ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive"><AlertCircle className="w-3.5 h-3.5" />Não entregue</span> :
                                msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-primary" /> :
                                msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" /> :
                                <Check className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>

                            {isOutgoing && msg.status === 'failed' && (
                              <div className="chat-failed-card">
                                <p>{msg.sendError || 'O canal recusou a mensagem e não informou o motivo.'}</p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResend(msg)}
                                  disabled={resendingId === msg.id}
                                >
                                  {resendingId === msg.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-4 h-4" />
                                  )}
                                  Reenviar
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-card/90 border-t border-border backdrop-blur-sm z-10">
              {/* Quem responde esta conversa, e o que isso significa. */}
              <div
                className={`chat-handling-bar ${activeChat.status === 'lara' && inputText.trim() ? 'is-blocking' : ''}`}
                role="status"
              >
                <div className="chat-handling-copy">
                  {activeChat.status === 'lara' ? (
                    <>
                      <Bot aria-hidden="true" />
                      <span>
                        <strong>{assistantName} responde esta conversa.</strong>{' '}
                        Assuma para responder você. A partir daí a agente para de responder aqui.
                      </span>
                    </>
                  ) : activeChat.status === 'human' ? (
                    <>
                      <User aria-hidden="true" />
                      <span>
                        {activeChat.takeover?.at ? (
                          <>
                            <strong>
                              {activeChat.takeover.byName
                                ? `${activeChat.takeover.byName} assumiu esta conversa.`
                                : 'Esta conversa foi assumida.'}
                            </strong>{' '}
                            Desde {formatDateTime(activeChat.takeover.at)}. {assistantName} não responde aqui.
                          </>
                        ) : (
                          <>
                            <strong>Esperando atendimento humano.</strong>{' '}
                            {assistantName} não responde aqui e ninguém assumiu ainda.
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <Pause aria-hidden="true" />
                      <span>
                        <strong>Conversa pausada.</strong>{' '}
                        Ninguém responde automaticamente. Você ainda pode escrever.
                      </span>
                    </>
                  )}
                </div>

                <div className="chat-handling-actions">
                  {/* Transferida pela agente e ainda sem dono: assumir aqui é o
                      que registra quem entrou no atendimento. */}
                  {(activeChat.status !== 'human' || !activeChat.takeover) && (
                    <Button size="sm" onClick={() => handleStatusChange('human')}>
                      Assumir conversa
                    </Button>
                  )}
                  {activeChat.status !== 'lara' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange('lara')}>
                      Devolver à {assistantName}
                    </Button>
                  )}
                </div>
              </div>

              <form onSubmit={handleSendMessage} className="flex items-end gap-3 max-w-4xl mx-auto">
                <div className="flex items-center gap-1">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    disabled
                    title="Em breve: Emoji picker"
                    className="text-muted-foreground rounded-full cursor-not-allowed opacity-50"
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon"
                    disabled
                    title="Em breve: Enviar anexos"
                    className="text-muted-foreground rounded-full cursor-not-allowed opacity-50"
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                </div>
                
                <div className="flex-1 bg-secondary rounded-2xl border border-input focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-ring/50 transition-all shadow-inner">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={canOperatorSend ? 'Escreva sua mensagem.' : `Assuma a conversa para responder no lugar de ${assistantName}.`}
                    className="w-full bg-transparent border-none p-3.5 max-h-32 min-h-[48px] text-sm text-foreground focus:ring-0 resize-none outline-none placeholder:text-muted-foreground"
                    rows={1}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!inputText.trim() || !canOperatorSend}
                  title={canOperatorSend ? 'Enviar mensagem' : `Assuma a conversa para responder no lugar de ${assistantName}`}
                  className={`rounded-full w-12 h-12 p-0 transition-all ${
                    inputText.trim() && canOperatorSend
                      ? 'shadow-sm hover:scale-105 active:scale-95'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </Button>
              </form>
            </div>
          </div>

          {/* Right Profile Sidebar (CRM View) */}
          <div 
            className={`${showProfileInfo ? 'w-80 border-l border-border opacity-100' : 'w-0 opacity-0 border-none'} transition-all duration-300 ease-in-out bg-card/95 flex-shrink-0 flex flex-col overflow-hidden`}
          >
            <div className="w-80 h-full flex flex-col">
              {/* Header */}
              <div className="h-16 flex items-center justify-between px-6 border-b border-border flex-shrink-0">
                <span className="font-semibold text-foreground">Informações do Lead</span>
                <button
                  onClick={() => setShowProfileInfo(false)}
                  className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {/* Identity */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full p-1 bg-primary shadow-sm mb-4">
                    <img src={activeChat.contactAvatar} alt={activeChat.contactName} className="w-full h-full rounded-full object-cover border-2 border-card" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-1">{activeChat.contactName}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {activeChat.clientMemory.lead_profile.lead_stage === 'new' ? 'Novo Lead' : 
                     activeChat.clientMemory.lead_profile.lead_stage === 'qualified' ? 'Lead Qualificado' :
                     activeChat.clientMemory.lead_profile.lead_stage}
                  </p>
                </div>

                {/* Details List */}
                <div className="space-y-4">
                  <h4 className="eia-eyebrow text-muted-foreground">Dados de Contato</h4>

                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Telefone</span>
                      <span className="text-foreground font-medium">{activeChat.contactPhone}</span>
                    </div>
                  </div>

                  {activeChat.contactEmail && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 text-muted-foreground">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">Email</span>
                        <span className="text-foreground font-medium">{activeChat.contactEmail}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-border/50 w-full"></div>

                {/* AI Memory Section */}
                <div className="space-y-4">
                  <h4 className="eia-eyebrow text-muted-foreground flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Memória do(a) {assistantName}
                  </h4>

                  {activeChat.clientMemory.lead_profile.interests.length > 0 && (
                    <div className="p-3 rounded-lg bg-secondary border border-border/50">
                      <span className="text-xs text-muted-foreground">Interesses</span>
                      <p className="text-sm text-foreground mt-1">
                        {activeChat.clientMemory.lead_profile.interests.join(', ')}
                      </p>
                    </div>
                  )}

                  {activeChat.clientMemory.sales_intelligence.pain_points.length > 0 && (
                    <div className="p-3 rounded-lg bg-secondary border border-border/50">
                      <span className="text-xs text-muted-foreground">Dores Identificadas</span>
                      <p className="text-sm text-foreground mt-1">
                        {activeChat.clientMemory.sales_intelligence.pain_points.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-secondary border border-border/50">
                    <span className="text-xs text-muted-foreground">Próxima Ação Sugerida</span>
                    <p className="text-sm text-foreground mt-1">
                      {activeChat.clientMemory.sales_intelligence.next_best_action === 'qualify' ? 'Qualificar lead' :
                       activeChat.clientMemory.sales_intelligence.next_best_action === 'demo' ? 'Agendar demonstração' :
                       activeChat.clientMemory.sales_intelligence.next_best_action}
                    </p>
                  </div>

                  <div className="text-xs text-muted-foreground text-center">
                    Total de conversas: {activeChat.clientMemory.interaction_summary.total_conversations}
                  </div>
                </div>

                <div className="h-px bg-border/50 w-full"></div>

                {/* Assigned User */}
                <div className="space-y-3">
                  <h4 className="eia-eyebrow text-muted-foreground flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Responsável
                  </h4>
                  <select
                    value={activeChat.assignedUserId || ''}
                    onChange={(e) => {
                      const userId = e.target.value || null;
                      assignConversation(activeChat.id, userId);
                      toast.success('Conversa atribuída. Deal atualizado automaticamente.');
                    }}
                    className="w-full bg-secondary border border-input rounded-lg p-3 text-sm text-foreground focus:ring-1 focus:ring-ring/50 focus:border-ring/50 outline-none transition-all"
                  >
                    <option value="">Não atribuído</option>
                    {teamMembers.map(member => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="h-px bg-border/50 w-full"></div>

                {/* Tags */}
                <div className="space-y-3">
                  <h4 className="eia-eyebrow text-muted-foreground flex items-center justify-between">
                    Tags
                    <Popover open={isTagSelectorOpen} onOpenChange={setIsTagSelectorOpen}>
                      <PopoverTrigger asChild>
                        <button className="text-primary hover:text-primary/80 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0 bg-popover border-border" align="end">
                        <TagSelector 
                          availableTags={availableTags}
                          selectedTags={activeChat.tags || []}
                          onToggleTag={handleToggleTag}
                          onCreateTag={handleCreateTag}
                        />
                      </PopoverContent>
                    </Popover>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {activeChat.tags && activeChat.tags.length > 0 ? (
                      activeChat.tags.map(tagKey => {
                        const tagDef = availableTags.find(t => t.key === tagKey);
                        return (
                          <span 
                            key={tagKey}
                            style={{
                              backgroundColor: tagDef?.color ? `${tagDef.color}20` : 'hsl(var(--primary) / 0.1)',
                              borderColor: tagDef?.color || 'hsl(var(--primary) / 0.2)'
                            }}
                            className="eia-pill border gap-1.5 group hover:brightness-110 transition-all"
                          >
                            <span className="text-foreground">{tagDef?.label || tagKey}</span>
                            <button
                              onClick={() => handleToggleTag(tagKey)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma tag adicionada</p>
                    )}
                  </div>
                </div>

                {/* Notes Area */}
                <div className="space-y-3">
                  <h4 className="eia-eyebrow text-muted-foreground flex items-center gap-2">
                    Notas Internas
                    {isSavingNotes && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  </h4>
                  <textarea
                    className="w-full bg-secondary border border-input rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring/50 focus:border-ring/50 outline-none resize-none transition-all"
                    rows={4}
                    placeholder="Adicione observações sobre este lead..."
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    onBlur={handleNotesBlur}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <section className="chat-empty-stage">
          <div className="chat-empty-card eia-tile eia-tile--atmos">
            <span className="chat-empty-icon">
              <MessageSquare aria-hidden="true" />
            </span>
            <p className="eia-eyebrow">Central de atendimento</p>
            <h2>{workspaceName} Workspace</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {conversations.length === 0
                ? 'Aguardando novas conversas. Configure o webhook do WhatsApp para começar a receber mensagens.'
                : 'Selecione uma conversa ao lado para iniciar o atendimento inteligente.'}
            </p>
            <div className="chat-empty-meta">
              <span>
                <Bot aria-hidden="true" />
                {assistantName} operando
              </span>
              <span>{conversations.length} conversas</span>
            </div>
            <Button onClick={() => { window.location.href = '/settings'; }}>
              Configurar WhatsApp
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default ChatInterface;

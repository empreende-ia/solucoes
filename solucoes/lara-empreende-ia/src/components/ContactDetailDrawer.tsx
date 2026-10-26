import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AtSign,
  Ban,
  Brain,
  CalendarClock,
  Check,
  Instagram,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Target,
  X,
} from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { Button } from './Button';
import { TagSelector } from './TagSelector';
import { api } from '../services/api';
import { TagDefinition } from '../types';
import {
  ContactDetail,
  fetchContactDetail,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelative,
  updateContactName,
} from '../services/contactDetail';

interface ContactDetailDrawerProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Avisa a lista que algo mudou (nome, tags, bloqueio) para ela recarregar. */
  onContactChanged?: () => void;
}

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  children,
  action,
}) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-2 text-muted-foreground">
      <span aria-hidden="true" className="[&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <h3 className="eia-eyebrow">{children}</h3>
    </div>
    {action}
  </div>
);

const Field: React.FC<{ label: string; value: string; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="min-w-0">
    <dt className="eia-eyebrow">{label}</dt>
    <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
      {icon ? (
        <span aria-hidden="true" className="text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{value}</span>
    </dd>
  </div>
);

const EmptyState: React.FC<{ message: string; hint: string; action?: React.ReactNode }> = ({ message, hint, action }) => (
  <div className="rounded-lg border border-dashed border-border bg-background/40 px-4 py-5 text-center">
    <p className="text-sm font-medium text-foreground">{message}</p>
    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
  </div>
);

export const ContactDetailDrawer: React.FC<ContactDetailDrawerProps> = ({
  contactId,
  open,
  onOpenChange,
  onContactChanged,
}) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagDefinition[]>([]);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);

  // Abrir dois contatos em sequência pode devolver as respostas fora de ordem.
  // Só a última ficha pedida pode escrever na tela.
  const requestId = useRef(0);

  const load = useCallback(async (id: string) => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchContactDetail(id);
      if (current !== requestId.current) return;
      setDetail(data);
      setNameDraft(data.contact.name ?? '');
    } catch (error) {
      if (current !== requestId.current) return;
      console.error('Erro ao carregar a ficha do contato', error);
      setDetail(null);
      setLoadError('Não foi possível carregar a ficha deste contato.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !contactId) return;
    setIsEditingName(false);
    setDetail(null);
    void load(contactId);
  }, [open, contactId, load]);

  useEffect(() => {
    if (!open || availableTags.length > 0) return;
    api
      .fetchTagDefinitions()
      .then(tags => setAvailableTags(tags as TagDefinition[]))
      .catch(error => console.error('Erro ao carregar as tags disponíveis', error));
  }, [open, availableTags.length]);

  const contact = detail?.contact ?? null;
  const openDeal = useMemo(() => detail?.deals.find(deal => deal.outcome === 'aberto') ?? detail?.deals[0] ?? null, [detail]);
  const conversation = detail?.conversations[0] ?? null;

  // A consulta vem em data decrescente. Sem reordenar, a próxima reunião era a
  // última da lista — e sumia quando havia mais de quatro compromissos futuros.
  const upcomingAppointments = useMemo(
    () =>
      (detail?.appointments ?? [])
        .filter(item => !item.isPast)
        .slice()
        .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
        .slice(0, 4),
    [detail],
  );
  const pastAppointments = useMemo(
    () => (detail?.appointments ?? []).filter(item => item.isPast).slice(0, 3),
    [detail],
  );

  const handleSaveName = async () => {
    if (!contact) return;
    setSavingName(true);
    try {
      await updateContactName(contact.id, nameDraft);
      setDetail(current =>
        current
          ? {
              ...current,
              contact: {
                ...current.contact,
                name: nameDraft.trim() || null,
                displayName: nameDraft.trim() || current.contact.callName || current.contact.phone || 'Contato sem nome',
              },
            }
          : current,
      );
      setIsEditingName(false);
      onContactChanged?.();
      toast.success('Nome atualizado.');
    } catch {
      toast.error('Não foi possível salvar o nome.');
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleTag = async (tagKey: string) => {
    if (!contact) return;
    const current = contact.tags;
    const next = current.includes(tagKey) ? current.filter(tag => tag !== tagKey) : [...current, tagKey];

    setDetail(state => (state ? { ...state, contact: { ...state.contact, tags: next } } : state));
    try {
      await api.updateContactTags(contact.id, next);
      onContactChanged?.();
    } catch {
      setDetail(state => (state ? { ...state, contact: { ...state.contact, tags: current } } : state));
      toast.error('Não foi possível atualizar as tags.');
    }
  };

  const handleCreateTag = async (tag: { key: string; label: string; color: string; category: string }) => {
    try {
      const created = await api.createTagDefinition(tag);
      setAvailableTags(previous => [...previous, created as TagDefinition]);
      await handleToggleTag(created.key);
      toast.success('Tag criada.');
    } catch {
      toast.error('Não foi possível criar a tag.');
    }
  };

  const handleToggleBlock = async () => {
    if (!contact) return;
    const blocking = !contact.isBlocked;
    setTogglingBlock(true);
    try {
      await api.toggleContactBlock(contact.id, blocking, blocking ? 'Bloqueado pela equipe na ficha do contato.' : undefined);
      setDetail(state =>
        state
          ? {
              ...state,
              contact: {
                ...state.contact,
                isBlocked: blocking,
                blockedAt: blocking ? new Date().toISOString() : null,
                blockedReason: blocking ? 'Bloqueado pela equipe na ficha do contato.' : null,
              },
            }
          : state,
      );
      onContactChanged?.();
      toast.success(blocking ? 'Contato bloqueado na base.' : 'Contato desbloqueado.');
    } catch {
      toast.error('Não foi possível alterar o bloqueio.');
    } finally {
      setTogglingBlock(false);
    }
  };

  const handleOpenConversation = () => {
    if (!conversation) return;
    onOpenChange(false);
    navigate(`/chat?conversation=${conversation.id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-6 pb-5 pr-14 pt-6 text-left">
          <p className="eia-eyebrow">Ficha do contato</p>
          <SheetTitle className="sr-only">
            {contact ? `Ficha de ${contact.displayName}` : 'Ficha do contato'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Dados, memória da Lara, negócio, agendamentos e últimas mensagens deste contato.
          </SheetDescription>

          {contact ? (
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {contact.displayName.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  {isEditingName ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={nameDraft}
                        onChange={event => setNameDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void handleSaveName();
                          if (event.key === 'Escape') setIsEditingName(false);
                        }}
                        placeholder="Nome do contato"
                        className="h-9 w-56"
                        autoFocus
                      />
                      <Button size="sm" variant="primary" onClick={handleSaveName} disabled={savingName}>
                        {savingName ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)} disabled={savingName}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(contact.name ?? '');
                        setIsEditingName(true);
                      }}
                      className="max-w-full truncate rounded-md text-left text-xl font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Editar nome"
                    >
                      {contact.displayName}
                    </button>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{contact.phone || 'Sem telefone'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Última atividade {formatRelative(contact.lastActivity, 'sem registro')}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleOpenConversation}
                  disabled={!conversation}
                  title={conversation ? 'Abrir a conversa no Chat' : 'Este contato ainda não tem conversa'}
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Abrir conversa
                </Button>
                <Button
                  size="sm"
                  variant={contact.isBlocked ? 'outline' : 'danger'}
                  onClick={handleToggleBlock}
                  disabled={togglingBlock}
                >
                  {togglingBlock ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Ban className="h-4 w-4" aria-hidden="true" />
                  )}
                  {contact.isBlocked ? 'Desbloquear contato' : 'Bloquear contato'}
                </Button>
              </div>
            </div>
          ) : null}

          {contact?.isBlocked ? (
            <p className="mt-3 text-xs text-destructive">
              Contato bloqueado em {formatDate(contact.blockedAt, 'data não registrada')}. O bloqueio marca o contato para
              a equipe e não interrompe, por si só, a resposta automática.
            </p>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-4 px-6 py-6">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Carregando a ficha do contato.</span>
            </div>
          ) : loadError ? (
            <EmptyState
              message={loadError}
              hint="Pode ser uma falha de rede ou de permissão neste workspace."
              action={
                <Button size="sm" variant="outline" onClick={() => contactId && load(contactId)}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Tentar de novo
                </Button>
              }
            />
          ) : contact ? (
            <>
              {/* Dados e canais */}
              <section className="eia-card p-5">
                <SectionTitle icon={<Phone />}>Dados e canais</SectionTitle>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Telefone" value={contact.phone || 'Não informado'} icon={<Phone />} />
                  <Field label="E-mail" value={contact.email || 'Não informado'} icon={<Mail />} />
                  <Field
                    label="Instagram"
                    value={contact.instagramUsername ? `@${contact.instagramUsername}` : 'Não conectado'}
                    icon={<Instagram />}
                  />
                  <Field
                    label="Canal ativo"
                    value={conversation ? `${conversation.channelLabel} · ${conversation.statusLabel}` : 'Sem conversa aberta'}
                    icon={<AtSign />}
                  />
                  <Field label="Primeiro contato" value={formatDate(contact.firstContact)} />
                  <Field label="Última atividade" value={formatDateTime(contact.lastActivity)} />
                </dl>
                {contact.notes ? (
                  <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{contact.notes}</p>
                ) : null}
              </section>

              {/* Tags */}
              <section className="eia-card p-5">
                <SectionTitle
                  icon={<Target />}
                  action={
                    <Popover open={isTagPopoverOpen} onOpenChange={setIsTagPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Adicionar tag
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 border-border bg-popover p-0" align="end">
                        <TagSelector
                          availableTags={availableTags}
                          selectedTags={contact.tags}
                          onToggleTag={handleToggleTag}
                          onCreateTag={handleCreateTag}
                        />
                      </PopoverContent>
                    </Popover>
                  }
                >
                  Tags
                </SectionTitle>

                {contact.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {contact.tags.map(tagKey => {
                      const definition = availableTags.find(tag => tag.key === tagKey);
                      return (
                        <span key={tagKey} className="eia-pill group gap-1.5 border border-border bg-secondary">
                          <span className="text-foreground">{definition?.label || tagKey}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleTag(tagKey)}
                            title="Remover tag"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    message="Nenhuma tag neste contato."
                    hint="As tags separam quem já foi qualificado de quem ainda está em conversa."
                    action={
                      <Button size="sm" variant="outline" onClick={() => setIsTagPopoverOpen(true)}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Adicionar tag
                      </Button>
                    }
                  />
                )}
              </section>

              {/* Negócio */}
              <section className="eia-card p-5">
                <SectionTitle icon={<Target />}>Negócio</SectionTitle>
                {openDeal ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{openDeal.title}</p>
                      <p className="eia-num text-lg font-semibold text-foreground">{formatCurrency(openDeal.value)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="eia-pill border border-border bg-secondary text-foreground">
                        {openDeal.stageTitle || 'Sem etapa'}
                      </span>
                      <span className="eia-pill border border-border bg-secondary text-muted-foreground">
                        {openDeal.outcome === 'ganho'
                          ? `Ganho em ${formatDate(openDeal.wonAt)}`
                          : openDeal.outcome === 'perdido'
                            ? `Perdido em ${formatDate(openDeal.lostAt)}`
                            : 'Em aberto'}
                      </span>
                      <span className="eia-pill border border-border bg-secondary text-muted-foreground">
                        {openDeal.ownerName ? `Dono: ${openDeal.ownerName}` : 'Sem responsável'}
                      </span>
                    </div>
                    {openDeal.lostReason ? (
                      <p className="text-xs text-muted-foreground">Motivo da perda: {openDeal.lostReason}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Atualizado em {formatDateTime(openDeal.updatedAt ?? openDeal.createdAt)}
                    </p>
                    {detail.deals.length > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        Este contato tem mais {detail.deals.length - 1}{' '}
                        {detail.deals.length - 1 === 1 ? 'negócio' : 'negócios'} no pipeline.
                      </p>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate('/pipeline'); }}>
                      Ver no pipeline
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    message="Nenhum negócio para este contato."
                    hint="Crie o negócio no pipeline para acompanhar etapa, valor e responsável."
                    action={
                      <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate('/pipeline'); }}>
                        Abrir pipeline
                      </Button>
                    }
                  />
                )}
              </section>

              {/* Agendamentos */}
              <section className="eia-card p-5">
                <SectionTitle icon={<CalendarClock />}>Agendamentos</SectionTitle>
                {upcomingAppointments.length + pastAppointments.length > 0 ? (
                  <ul className="space-y-2">
                    {[...upcomingAppointments, ...pastAppointments].map(appointment => (
                      <li
                        key={appointment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{appointment.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(appointment.startsAt ?? appointment.date, 'Data não registrada')}
                            {appointment.time ? ` às ${appointment.time}` : ''}
                            {appointment.duration ? ` · ${appointment.duration} min` : ''}
                          </p>
                        </div>
                        <span className="eia-pill border border-border bg-secondary text-muted-foreground">
                          {appointment.isPast ? appointment.statusLabel : formatRelative(appointment.startsAt, 'sem data')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    message="Nenhuma reunião com este contato."
                    hint="A Lara marca sozinha quando o lead aceita, e a equipe pode marcar pela agenda."
                    action={
                      <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate('/scheduling'); }}>
                        Abrir agenda
                      </Button>
                    }
                  />
                )}
              </section>

              {/* Memória da Lara */}
              <section className="eia-card p-5">
                <SectionTitle icon={<Brain />}>Memória da Lara</SectionTitle>
                {detail.memory.length > 0 ? (
                  <div className="space-y-4">
                    {detail.memory.map(block => (
                      <div key={block.key}>
                        <p className="mb-2 text-xs font-semibold text-foreground">{block.title}</p>
                        <dl className="space-y-1.5">
                          {block.entries.map(entry => (
                            <div key={`${block.key}-${entry.label}`} className="flex flex-wrap gap-x-2 text-sm">
                              <dt className="text-muted-foreground">{entry.label}:</dt>
                              <dd className="min-w-0 flex-1 text-foreground">
                                {entry.value}
                                {entry.note ? (
                                  <span className="ml-2 text-xs text-muted-foreground">({entry.note})</span>
                                ) : null}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                    {detail.memoryUpdatedAt ? (
                      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                        Atualizada em {formatDateTime(detail.memoryUpdatedAt)}.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <EmptyState
                    message="A Lara ainda não registrou nada deste contato."
                    hint="A memória é preenchida a cada conversa: dores, interesses, orçamento e próxima ação."
                    action={
                      conversation ? (
                        <Button size="sm" variant="outline" onClick={handleOpenConversation}>
                          <MessageSquare className="h-4 w-4" aria-hidden="true" />
                          Abrir conversa
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </section>

              {/* Últimas mensagens */}
              <section className="eia-card p-5">
                <SectionTitle
                  icon={<MessageSquare />}
                  action={
                    conversation ? (
                      <Button size="sm" variant="outline" onClick={handleOpenConversation}>
                        Abrir no chat
                      </Button>
                    ) : undefined
                  }
                >
                  Últimas mensagens
                </SectionTitle>
                {detail.messages.length > 0 ? (
                  <ul className="space-y-3">
                    {detail.messages.map(message => (
                      <li key={message.id} className="rounded-lg border border-border bg-background/40 px-4 py-3">
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{message.authorLabel}</span>
                          <span>{formatDateTime(message.sentAt, 'sem horário')}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-foreground">
                          {message.content || (message.mediaType ? `Mídia enviada (${message.mediaType}).` : 'Mensagem sem texto.')}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    message="Nenhuma mensagem trocada com este contato."
                    hint="Assim que a primeira mensagem chegar pelo WhatsApp ou pelo Instagram, ela aparece aqui."
                  />
                )}
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactDetailDrawer;

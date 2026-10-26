import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Mail, Phone, Instagram, Users, RefreshCw, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import ContactDetailDrawer from './ContactDetailDrawer';
import {
  ContactListItem,
  ContactStatus,
  fetchContactList,
  formatDate,
  formatRelative,
} from '../services/contactDetail';

const LIST_LIMIT = 200;

type StatusFilter = 'all' | ContactStatus;

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'lead', label: 'Leads' },
  { id: 'customer', label: 'Clientes' },
  { id: 'churned', label: 'Bloqueados' },
];

const statusClass = (status: ContactStatus): string => {
  switch (status) {
    case 'customer':
      return 'is-customer';
    case 'churned':
      return 'is-churned';
    default:
      return 'is-lead';
  }
};

const Contacts: React.FC = () => {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const navigate = useNavigate();
  // Cada busca ganha um número. Só a resposta da última pintada na tela conta:
  // sem isso, uma consulta lenta de duas teclas atrás sobrescreve o resultado certo.
  const requestId = useRef(0);

  const loadContacts = useCallback(async (search: string) => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchContactList({ search, limit: LIST_LIMIT });
      if (current !== requestId.current) return;
      setContacts(data);
    } catch (error) {
      if (current !== requestId.current) return;
      console.error('Erro ao carregar contatos', error);
      setContacts([]);
      setLoadError('Não foi possível carregar os contatos.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  // Busca resolvida no banco, com um respiro entre as teclas.
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(searchTerm.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    void loadContacts(appliedSearch);
  }, [appliedSearch, loadContacts]);

  const visibleContacts = useMemo(
    () => (statusFilter === 'all' ? contacts : contacts.filter(contact => contact.status === statusFilter)),
    [contacts, statusFilter],
  );

  const openContact = (contactId: string) => {
    setSelectedContactId(contactId);
    setIsDrawerOpen(true);
  };

  const hitLimit = contacts.length >= LIST_LIMIT;

  return (
    <div className="operation-page">
      <div className="operation-container">
        <header className="operation-header">
          <div>
            <p className="eia-eyebrow">Relacionamento</p>
            <h1>Contatos.</h1>
            <p>Cada contato reúne a conversa, o negócio e a agenda em uma ficha só.</p>
          </div>
          <Button variant="outline" onClick={() => loadContacts(appliedSearch)} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Atualizar lista
          </Button>
        </header>

        <div className="operation-toolbar">
          <label className="operation-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Buscar contatos</span>
            <input
              type="text"
              placeholder="Buscar por nome, telefone, e-mail ou Instagram"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por situação">
            {FILTERS.map(filter => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id)}
                aria-pressed={statusFilter === filter.id}
                className={`eia-pill border transition-colors ${
                  statusFilter === filter.id
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="eia-table-wrap operation-table">
          {loading ? (
            <div className="flex h-80 flex-col items-center justify-center">
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Carregando a base de contatos.</span>
            </div>
          ) : loadError ? (
            <div className="operation-empty">
              <span className="operation-empty-icon">
                <Users aria-hidden="true" />
              </span>
              <p>{loadError}</p>
              <small>Pode ser uma falha de rede ou de permissão neste workspace.</small>
              <Button variant="outline" onClick={() => loadContacts(appliedSearch)}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Tentar de novo
              </Button>
            </div>
          ) : visibleContacts.length === 0 ? (
            <div className="operation-empty">
              <span className="operation-empty-icon">
                <Users aria-hidden="true" />
              </span>
              {appliedSearch ? (
                <>
                  <p>Nenhum contato para essa busca.</p>
                  <small>A busca percorre toda a base por nome, telefone, e-mail e Instagram.</small>
                  <Button variant="outline" onClick={() => setSearchTerm('')}>
                    Limpar busca
                  </Button>
                </>
              ) : statusFilter !== 'all' ? (
                <>
                  <p>Nenhum contato nesta situação.</p>
                  <small>Troque o filtro para ver a base inteira.</small>
                  <Button variant="outline" onClick={() => setStatusFilter('all')}>
                    Ver todos
                  </Button>
                </>
              ) : (
                <>
                  <p>Ainda não há contatos na base.</p>
                  <small>
                    Um contato nasce quando alguém escreve para o canal conectado. Conecte o WhatsApp ou o Instagram para
                    começar a receber.
                  </small>
                  <Button variant="primary" onClick={() => navigate('/settings?tab=channels')}>
                    Conectar canal
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="eia-table">
                <thead>
                  <tr>
                    <th className="px-6 py-4">Nome / Telefone</th>
                    <th className="px-6 py-4">Situação</th>
                    <th className="px-6 py-4">Canais</th>
                    <th className="px-6 py-4">Última interação</th>
                    <th className="px-6 py-4 text-right">Ficha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {visibleContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="group cursor-pointer transition-colors hover:bg-accent/40"
                      onClick={() => openContact(contact.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                            {contact.displayName.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openContact(contact.id);
                              }}
                              className="max-w-full truncate rounded-md text-left font-semibold text-foreground transition-colors group-hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {contact.displayName}
                            </button>
                            <div className="text-xs text-muted-foreground">{contact.phone || 'Sem telefone'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`eia-meta-chip contact-status ${statusClass(contact.status)}`}>
                          {contact.statusLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {contact.hasWhatsapp && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                              {contact.phone || 'WhatsApp'}
                            </div>
                          )}
                          {contact.instagramUsername && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Instagram className="h-3.5 w-3.5" aria-hidden="true" />
                              @{contact.instagramUsername}
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                              {contact.email}
                            </div>
                          )}
                          {!contact.hasWhatsapp && !contact.instagramUsername && !contact.email && (
                            <span className="text-xs text-muted-foreground">Sem canal registrado</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-muted-foreground">{formatDate(contact.lastActivity, 'Sem registro')}</span>
                        <div className="text-[10px] text-muted-foreground">
                          {formatRelative(contact.lastActivity, 'sem registro')} · {contact.channelLabel}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3"
                          onClick={(event) => {
                            event.stopPropagation();
                            openContact(contact.id);
                          }}
                        >
                          Abrir ficha
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !loadError && hitLimit && (
          <p className="mt-3 text-xs text-muted-foreground">
            {appliedSearch
              ? `A busca encontrou pelo menos ${LIST_LIMIT} contatos e a lista mostra só os mais recentes. Escreva mais um pedaço do nome ou do telefone para estreitar.`
              : `Mostrando os ${LIST_LIMIT} contatos mais recentes. Para achar alguém antigo, use a busca: ela consulta a base inteira.`}
          </p>
        )}
      </div>

      <ContactDetailDrawer
        contactId={selectedContactId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onContactChanged={() => loadContacts(appliedSearch)}
      />
    </div>
  );
};

export default Contacts;

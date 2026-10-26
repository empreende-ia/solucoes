import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, MoreHorizontal, DollarSign, Loader2, CalendarClock, Tag, X,
  Building, User, Calendar, ArrowRight, CheckCircle2, Circle,
  FileText, Phone, Mail, Paperclip, Send, CheckSquare, Clock, Trash2, Settings, Brain, MessageSquare, Bot,
  Columns3, Pencil, SlidersHorizontal
} from 'lucide-react';
import { Button } from './Button';
import './Kanban.css';
import { api } from '../services/api';
import { DealActivity, TeamMember, KanbanColumn } from '../types';
import {
  EMPTY_PIPELINE_FILTERS,
  PERIOD_OPTIONS,
  PRIORITY_OPTIONS,
  PipelineDeal,
  collectTags,
  countActiveFilters,
  deleteDealById,
  fetchPipelineDeals,
  filterDeals,
  formatCurrencyBRL,
  formatDateOnly,
  formatShortDate,
  priorityLabel,
  readFiltersFromParams,
  summarizeDeals,
  writeFiltersToParams,
  type PipelineFilters,
} from '../services/pipeline';
import { supabase } from '../integrations/supabase/client';
import { CreateDealModal, EditDealModal } from './CreateDealModal';
import { LostReasonModal } from './LostReasonModal';
import { PipelineSettingsModal } from './PipelineSettingsModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';

const Kanban: React.FC = () => {
  const { sdrName } = useCompanySettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [stages, setStages] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);
  const [activeTab, setActiveTab] = useState<'note' | 'activity' | 'email'>('note');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<PipelineDeal | null>(null);
  const [dealPendingDelete, setDealPendingDelete] = useState<PipelineDeal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState(false);
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(true);
  const [updatingOwner, setUpdatingOwner] = useState(false);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDescription, setNewActivityDescription] = useState('');
  const [conversationMessages, setConversationMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const dragItem = useRef<string | null>(null);

  const filters = useMemo(() => readFiltersFromParams(searchParams), [searchParams]);
  const activeFilterCount = countActiveFilters(filters);

  const updateFilters = (patch: Partial<PipelineFilters>) => {
    setSearchParams(writeFiltersToParams({ ...filters, ...patch }, searchParams), { replace: true });
  };

  const clearFilters = () => {
    setSearchParams(writeFiltersToParams(EMPTY_PIPELINE_FILTERS, searchParams), { replace: true });
  };

  const reloadDeals = async () => {
    const data = await fetchPipelineDeals();
    setDeals(data);
    setSelectedDeal((current) => (current ? data.find((deal) => deal.id === current.id) ?? null : null));
    return data;
  };

  const handleDealCreated = async () => {
    try {
      await reloadDeals();
    } catch (error) {
      console.error('Erro ao recarregar pipeline', error);
    }
  };

  useEffect(() => {
    const loadStages = async () => {
      try {
        const data = await api.fetchPipelineStages();
        setStages(data);
      } catch (error) {
        console.error("Erro ao carregar etapas", error);
      }
    };
    loadStages();

    const loadPipeline = async () => {
      try {
        const data = await fetchPipelineDeals();
        setDeals(data);
      } catch (error) {
        console.error("Erro ao carregar pipeline", error);
        toast.error("Não foi possível carregar o pipeline");
      } finally {
        setLoading(false);
      }
    };
    loadPipeline();

    // Load team members
    const loadTeamMembers = async () => {
      try {
        const members = await api.fetchTeam();
        setTeamMembers(members.filter(member => member.status !== 'disabled'));
      } catch (error) {
        console.error("Erro ao carregar membros da equipe", error);
        toast.error("Não foi possível carregar os proprietários");
      } finally {
        setLoadingTeamMembers(false);
      }
    };
    loadTeamMembers();

    // Real-time subscription for deals and stages
    const dealsChannel = supabase
      .channel('deals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals'
        },
        async () => {
          try {
            const data = await fetchPipelineDeals();
            setDeals(data);
            setSelectedDeal((current) => (
              current ? data.find((deal) => deal.id === current.id) ?? null : null
            ));
          } catch (error) {
            console.error('Erro ao sincronizar pipeline', error);
          }
        }
      )
      .subscribe();

    const stagesChannel = supabase
      .channel('pipeline-stages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_stages'
        },
        async () => {
          const data = await api.fetchPipelineStages();
          setStages(data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(stagesChannel);
    };
  }, []);

  // Load activities when deal is selected
  useEffect(() => {
    if (selectedDeal) {
      loadActivities();
    }
  }, [selectedDeal?.id]);

  // Load conversation messages when deal is selected
  useEffect(() => {
    if (selectedDeal?.conversationId) {
      loadConversationMessages();
    } else {
      setConversationMessages([]);
    }
  }, [selectedDeal?.conversationId]);

  const loadConversationMessages = async () => {
    if (!selectedDeal?.conversationId) return;
    setLoadingMessages(true);
    try {
      const messages = await api.fetchConversationMessages(selectedDeal.conversationId, 15);
      setConversationMessages(messages);
    } catch (error) {
      console.error("Erro ao carregar mensagens", error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadActivities = async () => {
    if (!selectedDeal) return;
    setLoadingActivities(true);
    try {
      const data = await api.fetchDealActivities(selectedDeal.id);
      setActivities(data);
    } catch (error) {
      console.error("Erro ao carregar atividades", error);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleMarkWon = async () => {
    if (!selectedDeal) return;
    try {
      await api.markDealWon(selectedDeal.id);
      toast.success("Deal marcado como ganho. Parabéns pelo fechamento.");
      setSelectedDeal(null);
    } catch (error) {
      console.error("Erro ao marcar deal como ganho", error);
      toast.error("Não foi possível marcar como ganho");
    }
  };

  const handleMarkLost = async (reason: string) => {
    if (!selectedDeal) return;
    try {
      await api.markDealLost(selectedDeal.id, reason);
      toast.success("Deal marcado como perdido. Motivo registrado.");
      setSelectedDeal(null);
    } catch (error) {
      console.error("Erro ao marcar deal como perdido", error);
      toast.error("Não foi possível marcar como perdido");
    }
  };

  const handleOwnerChange = async (ownerId: string) => {
    if (!selectedDeal || updatingOwner || ownerId === selectedDeal.ownerId) return;

    const previousDeal = selectedDeal;
    const member = teamMembers.find(m => m.id === ownerId);
    if (!member) {
      toast.error("Proprietário inválido");
      return;
    }

    const updatedDeal = {
      ...selectedDeal,
      ownerId,
      ownerName: member.name,
      ownerAvatar: member.avatar,
    };

    setUpdatingOwner(true);
    setSelectedDeal(updatedDeal);
    setDeals(currentDeals => currentDeals.map(deal => (
      deal.id === updatedDeal.id ? updatedDeal : deal
    )));

    try {
      await api.updateDealOwner(selectedDeal.id, ownerId);
      toast.success("Proprietário atualizado");
    } catch (error) {
      console.error("Erro ao atualizar proprietário", error);
      setSelectedDeal(previousDeal);
      setDeals(currentDeals => currentDeals.map(deal => (
        deal.id === previousDeal.id ? previousDeal : deal
      )));
      toast.error("Não foi possível atualizar proprietário");
    } finally {
      setUpdatingOwner(false);
    }
  };

  const handleCreateActivity = async () => {
    if (!selectedDeal || !newActivityTitle.trim()) return;
    try {
      await api.createDealActivity({
        dealId: selectedDeal.id,
        type: activeTab === 'activity' ? 'call' : activeTab === 'email' ? 'email' : 'note',
        title: newActivityTitle,
        description: newActivityDescription,
      });
      setNewActivityTitle('');
      setNewActivityDescription('');
      loadActivities();
      toast.success("Atividade criada");
    } catch (error) {
      console.error("Erro ao criar atividade", error);
      toast.error("Não foi possível criar atividade");
    }
  };

  const handleToggleActivityComplete = async (activityId: string, isCompleted: boolean) => {
    try {
      await api.updateDealActivity(activityId, { isCompleted: !isCompleted });
      loadActivities();
    } catch (error) {
      console.error("Erro ao atualizar atividade", error);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      await api.deleteDealActivity(activityId);
      loadActivities();
      toast.success("Atividade excluída");
    } catch (error) {
      console.error("Erro ao excluir atividade", error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const onDragStart = (e: React.DragEvent, dealId: string) => {
    dragItem.current = dealId;
    e.dataTransfer.effectAllowed = "move";
    (e.target as HTMLElement).style.opacity = '0.5';
  };

  const onDragEnd = (e: React.DragEvent) => {
    dragItem.current = null;
    (e.target as HTMLElement).style.opacity = '1';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    const dealId = dragItem.current;
    if (!dealId) return;

    // Optimistic update
    const updatedDeals = deals.map(deal => {
      if (deal.id === dealId) {
        return { ...deal, stageId: targetStageId };
      }
      return deal;
    });
    setDeals(updatedDeals);

    // Persist to database
    try {
      await api.moveDealStage(dealId, targetStageId);
    } catch (error) {
      console.error('Error moving deal:', error);
      toast.error("Não foi possível mover o deal");
      // Revert on error
      try {
        await reloadDeals();
      } catch (reloadError) {
        console.error('Erro ao recarregar pipeline', reloadError);
      }
    }
  };

  const filteredDeals = useMemo(() => filterDeals(deals, filters), [deals, filters]);
  const tagOptions = useMemo(() => collectTags(deals), [deals]);
  const boardSummary = useMemo(() => summarizeDeals(filteredDeals), [filteredDeals]);

  const ownerNameById = useMemo(() => {
    const map = new Map<string, string>();
    teamMembers.forEach(member => map.set(member.id, member.name));
    return map;
  }, [teamMembers]);

  const handleEditDeal = (deal: PipelineDeal) => {
    setOpenCardMenu(null);
    setEditingDeal(deal);
  };

  const handleAskDelete = (deal: PipelineDeal) => {
    setOpenCardMenu(null);
    setDealPendingDelete(deal);
  };

  const handleConfirmDelete = async () => {
    if (!dealPendingDelete) return;
    const dealId = dealPendingDelete.id;

    setDeletingDeal(true);
    try {
      await deleteDealById(dealId);
      setDeals(current => current.filter(deal => deal.id !== dealId));
      setSelectedDeal(current => (current?.id === dealId ? null : current));
      setDealPendingDelete(null);
      toast.success("Deal excluído.");
    } catch (error) {
      console.error('Erro ao excluir deal', error);
      toast.error("Não foi possível excluir o deal");
    } finally {
      setDeletingDeal(false);
    }
  };

  const handleDealUpdated = async () => {
    setEditingDeal(null);
    try {
      await reloadDeals();
    } catch (error) {
      console.error('Erro ao recarregar pipeline', error);
    }
  };

  const getPriorityClass = (priority: string) => {
      switch(priority) {
          case 'high': return 'is-high';
          case 'medium': return 'is-medium';
          default: return 'is-low';
      }
  };

  if (loading) {
    return (
      <div className="pipeline-loading" role="status" aria-live="polite">
        <span className="pipeline-loading-icon">
          <Loader2 className="animate-spin" aria-hidden="true" />
        </span>
        <p>Organizando seu pipeline…</p>
      </div>
    );
  }

  return (
    <div className="pipeline-page">
      <div className="pipeline-container">
      {/* Header */}
      <header className="pipeline-header">
        <div>
          <p className="eia-eyebrow">Operação comercial</p>
          <h1>Pipeline comercial.</h1>
          <p>Movimente oportunidades e acompanhe o fluxo de receita em um só lugar.</p>
        </div>
        <div className="pipeline-actions">
          <label className="pipeline-search">
             <Search aria-hidden="true" />
             <span className="sr-only">Buscar oportunidade</span>
             <input
                type="text"
                placeholder="Buscar por título, empresa ou contato"
                value={filters.search}
                onChange={(e) => updateFilters({ search: e.target.value })}
             />
          </label>
          <Button
            variant="outline"
            onClick={() => setIsSettingsModalOpen(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Configurar
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo deal
          </Button>
        </div>
      </header>

      {/* Filtros do quadro, refletidos na URL */}
      {stages.length > 0 && deals.length > 0 && (
        <section className="pipeline-filters" aria-label="Filtros do pipeline">
          <div className="pipeline-filters-legend eia-eyebrow">
            <SlidersHorizontal aria-hidden="true" />
            <span>Filtros</span>
          </div>

          <div className="pipeline-filters-controls">
            <div className="pipeline-filter">
              <span className="pipeline-filter-label">Responsável</span>
              <Select
                value={filters.owner}
                onValueChange={(value) => updateFilters({ owner: value })}
              >
                <SelectTrigger className="h-9 text-xs" aria-label="Filtrar por responsável">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os responsáveis</SelectItem>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pipeline-filter">
              <span className="pipeline-filter-label">Tag</span>
              <Select
                value={filters.tag}
                onValueChange={(value) => updateFilters({ tag: value })}
              >
                <SelectTrigger className="h-9 text-xs" aria-label="Filtrar por tag">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as tags</SelectItem>
                  {tagOptions.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pipeline-filter">
              <span className="pipeline-filter-label">Prioridade</span>
              <Select
                value={filters.priority}
                onValueChange={(value) => updateFilters({ priority: value as PipelineFilters['priority'] })}
              >
                <SelectTrigger className="h-9 text-xs" aria-label="Filtrar por prioridade">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="pipeline-filter">
              <span className="pipeline-filter-label">Período</span>
              <Select
                value={filters.period}
                onValueChange={(value) => updateFilters({ period: value as PipelineFilters['period'] })}
              >
                <SelectTrigger className="h-9 text-xs" aria-label="Filtrar por período de criação">
                  <SelectValue placeholder="Todo o período" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pipeline-filters-summary">
            <span>
              {boardSummary.count === deals.length
                ? `${boardSummary.count} ${boardSummary.count === 1 ? 'deal' : 'deals'}`
                : `${boardSummary.count} de ${deals.length} deals`}
              {' · '}
              <strong>{formatCurrencyBRL(boardSummary.total)}</strong>
            </span>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
        </section>
      )}

      {/* Board Scroll Container */}
      <section
        className={`pipeline-board ${stages.length === 0 || deals.length === 0 || filteredDeals.length === 0 ? 'is-empty' : ''}`}
        aria-label="Etapas do pipeline"
      >
        {stages.length === 0 ? (
          <div className="pipeline-empty eia-tile eia-tile--atmos">
            <span className="pipeline-empty-icon">
              <Columns3 aria-hidden="true" />
            </span>
            <p className="eia-eyebrow">Seu fluxo começa aqui</p>
            <h2>Crie as etapas da sua operação.</h2>
            <p>
              Defina o caminho comercial da primeira conversa ao fechamento. Depois,
              seus deals poderão avançar pelo quadro.
            </p>
            <div className="pipeline-empty-actions">
              <Button onClick={() => setIsSettingsModalOpen(true)}>
                <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                Configurar etapas
              </Button>
              <Button variant="outline" onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                Criar primeiro deal
              </Button>
            </div>
          </div>
        ) : deals.length === 0 ? (
          <div className="pipeline-empty eia-tile eia-tile--atmos">
            <span className="pipeline-empty-icon">
              <Columns3 aria-hidden="true" />
            </span>
            <p className="eia-eyebrow">Quadro ainda sem deals</p>
            <h2>Os deals nascem das conversas.</h2>
            <p>
              Cada contato novo atendido pelo(a) {sdrName} entra aqui como um card na primeira
              etapa, com o histórico da conversa junto. Enquanto o primeiro lead não chega, crie
              um deal manualmente para percorrer o fluxo.
            </p>
            <div className="pipeline-empty-actions">
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                Criar deal
              </Button>
              <Button variant="outline" onClick={() => setIsSettingsModalOpen(true)}>
                <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                Revisar etapas
              </Button>
            </div>
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="pipeline-empty eia-tile eia-tile--atmos">
            <span className="pipeline-empty-icon">
              <SlidersHorizontal aria-hidden="true" />
            </span>
            <p className="eia-eyebrow">Filtro sem resultado</p>
            <h2>Nenhum deal atende a esses filtros.</h2>
            <p>
              O quadro tem {deals.length} {deals.length === 1 ? 'deal' : 'deals'}, mas nenhum
              deles combina com o que está selecionado agora. Ajuste um filtro ou volte a ver
              o quadro inteiro.
            </p>
            <div className="pipeline-empty-actions">
              <Button onClick={clearFilters}>
                Limpar filtros
              </Button>
              <Button variant="outline" onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                Novo deal
              </Button>
            </div>
          </div>
        ) : (
        <div className="pipeline-board-track">
          {stages.map((column) => {
            const columnDeals = filteredDeals.filter(d => d.stageId === column.id);
            const totalValue = columnDeals.reduce((acc, curr) => acc + curr.value, 0);
            const isWonColumn = column.title === 'Ganho';
            const isLostColumn = column.title === 'Perdido';

            return (
              <div 
                key={column.id}
                className={`pipeline-column ${isWonColumn ? 'is-won' : ''} ${isLostColumn ? 'is-lost' : ''}`}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className="pipeline-column-header">
                  <div className="pipeline-column-title">
                    <h3>
                      {column.isAiManaged && (
                        <span className="pipeline-ai-marker" title="Gerenciado pela IA">
                          <Bot aria-hidden="true" />
                        </span>
                      )}
                      {column.title}
                    </h3>
                    <span className="eia-meta-chip eia-meta-chip--mono">
                      {columnDeals.length} {columnDeals.length === 1 ? 'deal' : 'deals'}
                    </span>
                  </div>
                  <div className="pipeline-column-total">
                     <span>Total da etapa</span>
                     <strong>{formatCurrency(totalValue)}</strong>
                  </div>
                </div>

                {/* Column Body */}
                <div className="pipeline-column-body custom-scrollbar">
                  {columnDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, deal.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => setSelectedDeal(deal)}
                      className="pipeline-deal group"
                    >
                      <div className="pipeline-deal-top">
                        <span className={`pipeline-priority ${getPriorityClass(deal.priority)}`}>
                           {deal.priority === 'high' ? 'Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>
                        <Popover
                          open={openCardMenu === deal.id}
                          onOpenChange={(isOpen) => setOpenCardMenu(isOpen ? deal.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              className="pipeline-deal-more"
                              aria-label={`Ações do deal ${deal.title}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="pipeline-card-menu w-48 p-1"
                            /* O conteúdo é portalizado, mas continua filho deste card na
                               árvore React: sem parar aqui, o clique do menu também dispara
                               o onClick do card e abre o drawer por baixo do modal. */
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button type="button" onClick={() => handleEditDeal(deal)}>
                              <Pencil aria-hidden="true" />
                              Editar deal
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpenCardMenu(null); setSelectedDeal(deal); }}
                            >
                              <ArrowRight aria-hidden="true" />
                              Abrir detalhes
                            </button>
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => handleAskDelete(deal)}
                            >
                              <Trash2 aria-hidden="true" />
                              Excluir deal
                            </button>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <h4>{deal.title}</h4>
                      <p className="pipeline-deal-company">{deal.company}</p>

                      <div className="pipeline-deal-tags">
                         {deal.tags.map(tag => (
                             <span key={tag} className="eia-meta-chip">
                                <Tag aria-hidden="true" /> {tag}
                             </span>
                         ))}
                      </div>

                      <div className="pipeline-deal-footer">
                         <div className="pipeline-deal-value">
                            <DollarSign aria-hidden="true" />
                            {formatCurrency(deal.value)}
                         </div>
                         <div className="pipeline-deal-meta">
                            {deal.dueDate && (
                                <div title="Data de previsão">
                                    <CalendarClock aria-hidden="true" />
                                    {formatShortDate(deal.dueDate)}
                                </div>
                            )}
                            {deal.ownerAvatar && <img src={deal.ownerAvatar} alt={deal.ownerName || 'Responsável'} />}
                         </div>
                      </div>
                    </div>
                  ))}
                  {columnDeals.length === 0 && (
                    <div className="pipeline-column-empty">
                      <span>Nenhuma oportunidade</span>
                      <small>Arraste um deal para esta etapa.</small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </section>

      {/* Pipedrive-style Side Drawer */}
      {/* Backdrop */}
      {selectedDeal && (
        <div 
            className="eia-dialog-overlay fixed inset-0 z-40 transition-opacity"
            aria-hidden="true"
            onClick={() => setSelectedDeal(null)}
        />
      )}

      {/* Drawer */}
      <aside
        aria-label="Detalhes da oportunidade"
        aria-hidden={!selectedDeal}
        className={`pipeline-drawer ${selectedDeal ? 'is-open' : ''}`}
      >
        {selectedDeal && (
            <>
                {/* 1. Header & Stage Progress */}
                <div className="flex-shrink-0 bg-card border-b border-border">
                    {/* Top Bar */}
                    <div className="p-6 pb-4 flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-semibold text-foreground mb-1">{selectedDeal.title}</h2>
                            <div className="flex items-center gap-2 text-muted-foreground text-sm flex-wrap">
                            <span className="font-semibold text-foreground">{formatCurrency(selectedDeal.value)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="flex items-center gap-1"><Building className="w-3 h-3" /> {selectedDeal.company}</span>
                                <span aria-hidden="true">·</span>
                                <Select
                                  value={selectedDeal.ownerId || undefined}
                                  onValueChange={handleOwnerChange}
                                  disabled={loadingTeamMembers || updatingOwner || teamMembers.length === 0}
                                >
                                  <SelectTrigger
                                    className="pipeline-owner-select w-[180px] h-7 text-xs bg-secondary border-input"
                                    aria-label="Selecionar proprietário"
                                  >
                                    {updatingOwner ? (
                                      <Loader2 className="w-3 h-3 shrink-0 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <User className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    )}
                                    <SelectValue
                                      placeholder={loadingTeamMembers ? 'Carregando...' : teamMembers.length === 0 ? 'Nenhum disponível' : 'Selecione proprietário'}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teamMembers.map(member => (
                                      <SelectItem key={member.id} value={member.id}>
                                        {member.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleMarkWon}>
                              <CheckCircle2 className="w-4 h-4 mr-2" aria-hidden="true" />
                              Ganho
                            </Button>
                            <Button variant="danger" onClick={() => setIsLostModalOpen(true)}>
                              Perdido
                            </Button>
                            <button 
                                onClick={() => setSelectedDeal(null)} 
                                className="p-2 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Pipeline Visual Progress */}
                    <div className="px-6 pb-6 overflow-x-auto">
                        <div className="flex items-center gap-1 w-full min-w-max">
                            {stages.map((col, idx) => {
                                const currentStageIndex = stages.findIndex(c => c.id === selectedDeal.stageId);
                                const isCompleted = idx < currentStageIndex;
                                const isActive = idx === currentStageIndex;
                                
                                return (
                                    <div 
                                        key={col.id} 
                                        className={`flex-1 h-8 flex items-center justify-center px-2 relative cursor-pointer group transition-all first:rounded-l-md last:rounded-r-md 
                                            ${isCompleted ? 'bg-primary/10 text-foreground hover:bg-primary/15' :
                                              isActive ? 'bg-primary text-primary-foreground shadow-sm' :
                                              'bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground'}
                                        `}
                                        onClick={async () => {
                                            const isGanhoColumn = col.title === 'Ganho';
                                            const isPerdidoColumn = col.title === 'Perdido';
                                            
                                            if (isGanhoColumn) {
                                                try {
                                                    await api.markDealWon(selectedDeal.id);
                                                    toast.success("Deal marcado como ganho.");
                                                    // Update local state
                                                    setDeals(deals.map(d => d.id === selectedDeal.id ? {...d, stageId: col.id, wonAt: new Date().toISOString()} : d));
                                                    setSelectedDeal({...selectedDeal, stageId: col.id});
                                                } catch (error) {
                                                    console.error('Error marking deal as won:', error);
                                                    toast.error("Erro ao marcar como ganho");
                                                }
                                            } else if (isPerdidoColumn) {
                                                setIsLostModalOpen(true);
                                            } else {
                                                // Optimistic update for UI feel
                                                setDeals(deals.map(d => d.id === selectedDeal.id ? {...d, stageId: col.id} : d));
                                                setSelectedDeal({...selectedDeal, stageId: col.id});
                                                
                                                // Persist to database
                                                try {
                                                    await api.moveDealStage(selectedDeal.id, col.id);
                                                } catch (error) {
                                                    console.error('Error moving deal:', error);
                                                }
                                            }
                                        }}
                                    >
                                        <span className="text-xs font-semibold whitespace-nowrap z-10">{col.title}</span>
                                        {/* Arrow shape via clip-path could go here, simplified with simple blocks for now */}
                                        {idx !== stages.length - 1 && (
                                            <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-border z-20"></div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* 2. Content Area */}
                <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">

                    {/* Deal record */}
                    <div className="p-6 border-b border-border bg-card">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <h4 className="eia-eyebrow text-muted-foreground flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Dados do deal
                            </h4>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleEditDeal(selectedDeal)}>
                                    <Pencil className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                                    Editar
                                </Button>
                                <Button variant="danger" size="sm" onClick={() => handleAskDelete(selectedDeal)}>
                                    <Trash2 className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                                    Excluir
                                </Button>
                            </div>
                        </div>

                        <dl className="pipeline-record">
                            <div>
                                <dt>Empresa</dt>
                                <dd>{selectedDeal.company || 'Não informada'}</dd>
                            </div>
                            <div>
                                <dt>Valor</dt>
                                <dd>{formatCurrency(selectedDeal.value)}</dd>
                            </div>
                            <div>
                                <dt>Prioridade</dt>
                                <dd>{priorityLabel(selectedDeal.priority)}</dd>
                            </div>
                            <div>
                                <dt>Data prevista</dt>
                                <dd>{formatDateOnly(selectedDeal.dueDate)}</dd>
                            </div>
                            <div>
                                <dt>Responsável</dt>
                                <dd>
                                    {selectedDeal.ownerName
                                        || (selectedDeal.ownerId ? ownerNameById.get(selectedDeal.ownerId) : null)
                                        || 'Sem responsável'}
                                </dd>
                            </div>
                            <div>
                                <dt>Criado em</dt>
                                <dd>{formatDateOnly(selectedDeal.createdAt)}</dd>
                            </div>
                        </dl>

                        {selectedDeal.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-4">
                                {selectedDeal.tags.map(tag => (
                                    <span key={tag} className="eia-meta-chip">
                                        <Tag aria-hidden="true" /> {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="mt-4">
                            <p className="text-xs text-muted-foreground">Observações</p>
                            <p className="text-sm text-foreground mt-1 whitespace-pre-line">
                                {selectedDeal.notes?.trim()
                                    ? selectedDeal.notes
                                    : 'Sem observações registradas. Use Editar para deixar o contexto que o time precisa antes de ligar.'}
                            </p>
                        </div>

                        {selectedDeal.lostReason && (
                            <div className="mt-4">
                                <p className="text-xs text-muted-foreground">Motivo da perda</p>
                                <p className="text-sm text-destructive mt-1">{selectedDeal.lostReason}</p>
                            </div>
                        )}
                    </div>

                    {/* Action Composer */}
                    <div className="p-6 border-b border-border bg-card">
                        <div className="flex gap-4 mb-4">
                            <button 
                                onClick={() => setActiveTab('note')}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'note' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <div className={`p-2 rounded-full ${activeTab === 'note' ? 'bg-primary/10' : 'bg-secondary'}`}>
                                    <FileText className="w-4 h-4" />
                                </div>
                                Nota
                            </button>
                            <button 
                                onClick={() => setActiveTab('activity')}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'activity' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <div className={`p-2 rounded-full ${activeTab === 'activity' ? 'bg-primary/10' : 'bg-secondary'}`}>
                                    <Calendar className="w-4 h-4" />
                                </div>
                                Atividade
                            </button>
                            <button 
                                onClick={() => setActiveTab('email')}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'email' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <div className={`p-2 rounded-full ${activeTab === 'email' ? 'bg-primary/10' : 'bg-secondary'}`}>
                                    <Mail className="w-4 h-4" />
                                </div>
                                Email
                            </button>
                        </div>

                        <div className="bg-card border border-border rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-ring transition-all shadow-inner">
                            <input 
                                type="text"
                                className="w-full bg-transparent p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none border-b border-border"
                                placeholder="Título da atividade"
                                value={newActivityTitle}
                                onChange={(e) => setNewActivityTitle(e.target.value)}
                            />
                            <textarea 
                                className="w-full bg-transparent p-4 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[80px]"
                                placeholder={
                                    activeTab === 'note' ? "Escreva uma nota..." :
                                    activeTab === 'activity' ? "Descreva a atividade..." :
                                    "Escreva o corpo do email..."
                                }
                                value={newActivityDescription}
                                onChange={(e) => setNewActivityDescription(e.target.value)}
                            />
                            <div className="px-3 py-2 bg-secondary border-t border-border flex justify-between items-center">
                                <div className="flex gap-2">
                                    <button className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition-colors"><Paperclip className="w-4 h-4" /></button>
                                </div>
                                <Button size="sm" className="h-8" onClick={handleCreateActivity} disabled={!newActivityTitle.trim()}>
                                    Salvar
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Activities Timeline */}
                    <div className="p-6">
                        <h4 className="eia-eyebrow text-muted-foreground mb-6 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" /> Atividades ({activities.length})
                        </h4>
                        
                        {loadingActivities ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : activities.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            Nenhuma atividade registrada
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {activities.map(activity => {
                              const activityIcon = activity.type === 'call' ? Phone :
                                                   activity.type === 'email' ? Mail :
                                                   activity.type === 'meeting' ? Calendar :
                                                   activity.type === 'task' ? CheckSquare :
                                                   FileText;
                              const activityColor = activity.type === 'call' ? 'text-primary bg-primary/10' :
                                                    activity.type === 'email' ? 'text-primary bg-primary/10' :
                                                    activity.type === 'meeting' ? 'text-primary bg-primary/10' :
                                                    activity.type === 'task' ? 'text-primary bg-primary/10' :
                                                    'text-muted-foreground bg-muted';
                              const ActivityIcon = activityIcon;
                              
                              return (
                                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-all group">
                                  <button 
                                    onClick={() => handleToggleActivityComplete(activity.id, activity.isCompleted)}
                                    className="mt-0.5 text-muted-foreground hover:text-success transition-colors"
                                  >
                                    {activity.isCompleted ? (
                                      <CheckCircle2 className="w-5 h-5 text-success" />
                                    ) : (
                                      <Circle className="w-5 h-5" />
                                    )}
                                  </button>
                                  <div className={`p-1.5 rounded ${activityColor}`}>
                                    <ActivityIcon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1">
                                    <p className={`text-sm font-medium transition-colors ${activity.isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                      {activity.title}
                                    </p>
                                    {activity.description && (
                                      <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      {new Date(activity.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      {activity.createdByName && ` • ${activity.createdByName}`}
                                    </p>
                                  </div>
                                  <button 
                                    onClick={() => handleDeleteActivity(activity.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </div>

                    {/* Lara Insights Section */}
                    {selectedDeal.clientMemory && (
                      <div className="p-6 border-t border-border">
                        <h4 className="eia-eyebrow text-muted-foreground mb-4 flex items-center gap-2">
                          <Brain className="w-4 h-4 text-primary" /> Insights do(a) {sdrName}
                        </h4>
                        
                        <div className="space-y-3">
                          {/* Qualification Score */}
                          <div className="p-3 rounded-lg bg-card border border-border">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-muted-foreground">Score de Qualificação</span>
                              <span className="text-sm font-semibold text-primary">
                                {selectedDeal.clientMemory.lead_profile.qualification_score || 0}%
                              </span>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-1.5">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all"
                                style={{ width: `${selectedDeal.clientMemory.lead_profile.qualification_score || 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Next Best Action */}
                          <div className="p-3 rounded-lg bg-card border border-border">
                            <span className="text-xs text-muted-foreground">Próxima Ação Sugerida</span>
                            <p className="text-sm text-primary mt-1 font-medium">
                              {selectedDeal.clientMemory.sales_intelligence.next_best_action === 'qualify' ? 'Qualificar lead' :
                               selectedDeal.clientMemory.sales_intelligence.next_best_action === 'demo' ? 'Agendar demonstração' :
                               selectedDeal.clientMemory.sales_intelligence.next_best_action === 'follow_up' ? 'Fazer follow-up' :
                               selectedDeal.clientMemory.sales_intelligence.next_best_action}
                            </p>
                          </div>

                          {/* Interests */}
                          {selectedDeal.clientMemory.lead_profile.interests.length > 0 && (
                            <div className="p-3 rounded-lg bg-card border border-border">
                              <span className="text-xs text-muted-foreground">Interesses</span>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedDeal.clientMemory.lead_profile.interests.map((interest, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-md border border-primary/20">
                                    {interest}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Pain Points */}
                          {selectedDeal.clientMemory.sales_intelligence.pain_points.length > 0 && (
                            <div className="p-3 rounded-lg bg-card border border-border">
                              <span className="text-xs text-muted-foreground">Dores Identificadas</span>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedDeal.clientMemory.sales_intelligence.pain_points.map((pain, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-md border border-border">
                                    {pain}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Budget & Timeline */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-card border border-border">
                              <span className="text-xs text-muted-foreground">Orçamento</span>
                              <p className="text-sm text-foreground mt-1 font-medium">
                                {selectedDeal.clientMemory.sales_intelligence.budget_indication === 'unknown' ? 'Não informado' : selectedDeal.clientMemory.sales_intelligence.budget_indication}
                              </p>
                            </div>
                            <div className="p-3 rounded-lg bg-card border border-border">
                              <span className="text-xs text-muted-foreground">Timeline</span>
                              <p className="text-sm text-foreground mt-1 font-medium">
                                {selectedDeal.clientMemory.sales_intelligence.decision_timeline === 'unknown' ? 'Não definido' : selectedDeal.clientMemory.sales_intelligence.decision_timeline}
                              </p>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* Histórico de Conversa */}
                    {selectedDeal.conversationId && (
                      <div className="p-6 border-t border-border">
                        <h4 className="eia-eyebrow text-muted-foreground mb-4 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-primary" />
                          Últimas Mensagens ({conversationMessages.length})
                        </h4>
                        
                        {loadingMessages ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          </div>
                        ) : conversationMessages.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            Nenhuma mensagem encontrada
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {conversationMessages.map(msg => (
                              <div 
                                key={msg.id}
                                className={`p-2 rounded-lg text-sm ${
                                  msg.from_type === 'user'
                                    ? 'bg-secondary text-foreground ml-0 mr-8'
                                    : msg.from_type === 'lara'
                                      ? 'bg-primary/10 text-foreground ml-8 mr-0'
                                      : 'bg-primary/20 text-foreground ml-8 mr-0'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                                  <span className="font-medium">
                                    {msg.from_type === 'user' ? 'Lead' : msg.from_type === 'lara' ? sdrName : 'Humano'}
                                  </span>
                                  <span>•</span>
                                  <span>{new Date(msg.sent_at).toLocaleString('pt-BR', { 
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                                  })}</span>
                                </div>
                                <p className="leading-relaxed line-clamp-3">{msg.content || '[mídia]'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <Button
                          className="w-full mt-3"
                          onClick={() => window.location.href = `/chat?conversation=${selectedDeal.conversationId}`}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Ver conversa completa
                        </Button>
                      </div>
                    )}
                </div>
            </>
        )}
      </aside>

      {/* Modal para criar novo deal */}
      <CreateDealModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onDealCreated={handleDealCreated}
      />
      
      {/* Modal de edição do deal */}
      <EditDealModal
        open={editingDeal !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setEditingDeal(null); }}
        deal={editingDeal}
        onDealUpdated={handleDealUpdated}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={dealPendingDelete !== null}
        onOpenChange={(isOpen) => { if (!isOpen && !deletingDeal) setDealPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este deal.</AlertDialogTitle>
            <AlertDialogDescription>
              {dealPendingDelete
                ? `"${dealPendingDelete.title}" sai do quadro junto com as atividades registradas nele. O contato, as mensagens e os agendamentos continuam no sistema. Esta ação não pode ser desfeita.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDeal}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingDeal}
              onClick={(event) => { event.preventDefault(); handleConfirmDelete(); }}
            >
              {deletingDeal ? 'Excluindo...' : 'Excluir deal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de motivo de perda */}
      <LostReasonModal
        open={isLostModalOpen}
        onOpenChange={setIsLostModalOpen}
        onConfirm={handleMarkLost}
        dealTitle={selectedDeal?.title || ''}
      />

      {/* Modal de configuração de etapas */}
      <PipelineSettingsModal 
        open={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={async () => {
          const data = await api.fetchPipelineStages();
          setStages(data);
        }}
      />
      </div>
    </div>
  );
};

export default Kanban;

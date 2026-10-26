import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, BriefcaseBusiness, FilterX, Plus, RefreshCw, Search, Settings2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Textarea } from '@/components/ds/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ds/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ds/dialog';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/foundation/EmptyState';
import { LoadingState } from '@/components/foundation/LoadingState';
import { StatStrip } from '@/components/foundation/StatStrip';
import { StatusChip } from '@/components/foundation/StatusChip';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import { useOrg } from '@/hooks/useOrg';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import type { Deal, DealDraft, DealStatus } from '@/lib/deal-types';
import { DEAL_STATUS_LABELS, filterDeals, formatDealCurrency, nextDealActions, parseDealValue, summarizeDeals, validateDealMove } from '@/lib/deal-logic';
import { DealBoard } from '@/components/pipeline/DealBoard';
import { DealDetail } from '@/components/pipeline/DealDetail';
import { DealForm } from '@/components/pipeline/DealForm';
import { allRows, errorMessage, loadPipelineReferences, pipelineDb } from '@/components/pipeline/data';

export default function Pipeline() {
  const { orgId } = useOrg();
  return <div className="h-full min-h-0" data-product-tour="pipeline">{orgId ? <PipelineContent key={orgId} orgId={orgId} /> : <PageScaffold title="Pipeline"><EmptyState icon={BriefcaseBusiness} title="Organização indisponível" description="Entre em uma organização para consultar as oportunidades." /></PageScaffold>}</div>;
}

function PipelineContent({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const { canWrite, canManage, loading: permissionsLoading } = useCrmPermissions();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<'create' | Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [deleteDeal, setDeleteDeal] = useState<Deal | null>(null);
  const [loss, setLoss] = useState<{ deal: Deal; stageId: string; reason: string; error: string } | null>(null);
  const references = useQuery({ queryKey: ['crm', orgId, 'pipeline-references'], queryFn: () => loadPipelineReferences(orgId) });
  const dealQuery = useQuery({ queryKey: ['crm', orgId, 'deals'], queryFn: () => allRows((from, to) => pipelineDb.from('deals').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).order('id').range(from, to).returns<Deal[]>()) });
  const actions = useQuery({ queryKey: ['crm', orgId, 'deal-actions'], queryFn: () => allRows((from, to) => pipelineDb.from('activities').select('id,org_id,deal_id,title,type,due_date,completed_at,user_id').eq('org_id', orgId).in('type', ['task', 'call', 'email', 'meeting']).not('deal_id', 'is', null).is('completed_at', null).order('id').range(from, to)) });
  const refs = references.data;
  const pipelines = refs?.pipelines ?? [];
  const pipelineId = params.get('pipeline') || pipelines.find(pipeline => pipeline.is_default)?.id || pipelines[0]?.id || '';
  const pipeline = pipelines.find(item => item.id === pipelineId);
  const stages = useMemo(() => (refs?.stages ?? []).filter(stage => stage.pipeline_id === pipelineId).sort((a, b) => a.order - b.order), [refs?.stages, pipelineId]);
  const ownerId = params.get('owner') || 'all';
  const status = ['open', 'won', 'lost', 'all'].includes(params.get('status') ?? '') ? params.get('status')! : 'open';
  const search = params.get('q') || '';
  const allDeals = useMemo(() => dealQuery.data ?? [], [dealQuery.data]);
  const deals = useMemo(() => filterDeals(allDeals, { pipelineId, ownerId, status, search }), [allDeals, pipelineId, ownerId, status, search]);
  const summary = summarizeDeals(deals, pipeline?.currency ?? 'BRL', stages);
  const nextActions = useMemo(() => nextDealActions(actions.data ?? []), [actions.data]);
  const selectedId = params.get('deal');
  const selected = allDeals.find(deal => deal.id === selectedId);
  const selectedPipeline = pipelines.find(item => item.id === (typeof form === 'object' && form ? form.pipeline_id : pipelineId));
  const activeFilters = ownerId !== 'all' || status !== 'open' || !!search;
  const isLoading = references.isPending || dealQuery.isPending || actions.isPending || permissionsLoading;
  const loadError = references.error || dealQuery.error || actions.error;
  useEffect(() => {
    if (params.get('create') !== '1' || isLoading) return;
    if (canWrite && pipeline && stages.length) setForm('create');
    else toast.error(canWrite ? 'Configure um pipeline com etapas para criar uma oportunidade.' : 'Seu papel permite somente leitura.');
    setParams(previous => { const next = new URLSearchParams(previous); next.delete('create'); return next; }, { replace: true });
  }, [params, isLoading, canWrite, pipeline, stages.length, setParams]);

  const updateParams = (changes: Record<string, string | null>, replace = false) => setParams(previous => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    return next;
  }, { replace });
  const clearFilters = () => updateParams({ owner: null, status: null, q: null });
  const openDeal = (deal: Deal) => updateParams({ deal: deal.id });
  const closeDeal = () => updateParams({ deal: null });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm'] });
  const requireWrite = () => { if (!canWrite) throw new Error('Você não tem permissão para editar oportunidades.'); };

  const saveDeal = async (draft: DealDraft) => {
    requireWrite();
    const fields = {
      title: draft.title.trim(), value: parseDealValue(draft.value)!, currency: draft.currency,
      owner_id: draft.owner_id || null, contact_id: draft.contact_id || null, company_id: draft.company_id || null,
      close_date: draft.close_date || null, probability: draft.status === 'won' ? 100 : draft.status === 'lost' ? 0 : Number(draft.probability),
      lost_reason: draft.status === 'lost' ? draft.lost_reason.trim() : null,
    };
    if (typeof form === 'object' && form) {
      const { data, error } = await pipelineDb.from('deals').update(fields).eq('id', form.id).eq('org_id', orgId).eq('updated_at', form.updated_at).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A oportunidade mudou ou está indisponível. Feche a edição, atualize o quadro e tente novamente. Seus campos continuam aqui.');
      toast.success('Oportunidade atualizada.');
    } else {
      const { data, error } = await pipelineDb.from('deals').insert({ ...fields, org_id: orgId, pipeline_id: draft.pipeline_id, stage_id: draft.stage_id, status: draft.status }).select('id').single();
      if (error) throw error;
      updateParams({ deal: data.id, status: draft.status });
      toast.success('Oportunidade criada. Combine a próxima ação no detalhe.');
    }
    await refresh();
  };

  const performMove = async (deal: Deal, stageId: string, newStatus: DealStatus = deal.status, reason = deal.lost_reason ?? '') => {
    requireWrite();
    const validation = validateDealMove(deal, refs?.stages.find(stage => stage.id === stageId), newStatus, reason);
    if (validation) throw new Error(validation);
    const { error } = await pipelineDb.rpc('move_deal', { p_deal_id: deal.id, p_stage_id: stageId, p_status: newStatus, p_lost_reason: newStatus === 'lost' ? reason.trim() : null });
    if (error) throw error;
    await refresh();
  };

  const move = async (deal: Deal, stageId: string, newStatus: DealStatus = deal.status) => {
    if (busy || !canWrite) return;
    if (newStatus === 'lost' && deal.status !== 'lost') { setLoss({ deal, stageId, reason: '', error: '' }); return; }
    setBusy(true); setOperationError('');
    try { await performMove(deal, stageId, newStatus); toast.success(newStatus !== deal.status ? `Oportunidade ${DEAL_STATUS_LABELS[newStatus].toLowerCase()}.` : 'Etapa atualizada.'); }
    catch (error) { setOperationError(errorMessage(error)); toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const confirmLoss = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loss || busy) return;
    setBusy(true);
    try { await performMove(loss.deal, loss.stageId, 'lost', loss.reason); setLoss(null); toast.success('Perda registrada com o motivo.'); }
    catch (error) { setLoss(current => current && ({ ...current, error: errorMessage(error) })); }
    finally { setBusy(false); }
  };

  const removeDeal = async () => {
    if (!deleteDeal || busy || !canManage) return;
    setBusy(true); setOperationError('');
    try {
      const { data, error } = await pipelineDb.from('deals').delete().eq('id', deleteDeal.id).eq('org_id', orgId).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('A oportunidade não está disponível para exclusão.');
      if (selectedId === deleteDeal.id) closeDeal();
      setDeleteDeal(null); await refresh(); toast.success('Oportunidade excluída.');
    } catch (error) { setOperationError(errorMessage(error)); toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const createAction = async (draft: { title: string; due_date: string; user_id: string }) => {
    requireWrite();
    if (!selected) throw new Error('Oportunidade indisponível.');
    const { error } = await pipelineDb.from('activities').insert({ org_id: orgId, deal_id: selected.id, contact_id: selected.contact_id, company_id: selected.company_id, title: draft.title.trim(), type: 'task', due_date: new Date(draft.due_date).toISOString(), user_id: draft.user_id, created_by: user?.id });
    if (error) throw error;
    await refresh(); toast.success('Próxima ação combinada. Ela também está em Hoje e Atividades.');
  };

  return <PageScaffold title="Pipeline" meta={<StatusChip>{deals.length} oportunidades</StatusChip>} actions={canWrite && <Button size="sm" data-tour="pipeline-create" disabled={!pipeline || !stages.length || busy || isLoading} title={!stages.length ? 'Configure as etapas do pipeline primeiro.' : undefined} onClick={() => setForm('create')}><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Nova oportunidade</span><span className="sr-only sm:hidden">Nova oportunidade</span></Button>} toolbar={<div className="flex w-full flex-wrap items-center gap-2">
    <Select value={pipelineId} onValueChange={value => updateParams({ pipeline: value })} disabled={!pipelines.length}><SelectTrigger className="w-full sm:w-[205px]" data-tour={pipelines.length ? 'pipeline-selector' : undefined} aria-label="Pipeline selecionado"><SelectValue placeholder="Selecione um pipeline" /></SelectTrigger><SelectContent>{pipelines.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
    <div className="relative min-w-[150px] flex-1 sm:max-w-[260px]"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar oportunidade por nome" value={search} onChange={event => updateParams({ q: event.target.value }, true)} placeholder="Buscar oportunidade" className="pl-9" /></div>
    <Select value={ownerId} onValueChange={value => updateParams({ owner: value === 'all' ? null : value })}><SelectTrigger className="w-[160px]" aria-label="Filtrar responsável"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos responsáveis</SelectItem><SelectItem value="unassigned">Sem responsável</SelectItem>{refs?.people.map(person => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>
    <Select value={status} onValueChange={value => updateParams({ status: value === 'open' ? null : value })}><SelectTrigger className="w-[135px]" aria-label="Filtrar situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas situações</SelectItem>{Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
    {activeFilters && <Button size="sm" variant="ghost" onClick={clearFilters}><FilterX className="mr-1.5 h-4 w-4" />Limpar filtros</Button>}
    <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={isLoading} aria-label="Atualizar pipeline"><RefreshCw className="h-4 w-4" /></Button>
  </div>}>
    {isLoading ? <LoadingState label="Carregando oportunidades…" /> : loadError ? <EmptyState icon={AlertCircle} title="Não foi possível carregar o pipeline" description={errorMessage(loadError)} action={<Button onClick={() => void refresh()}>Tentar novamente</Button>} /> : !pipeline ? <EmptyState icon={BriefcaseBusiness} title={pipelines.length ? 'Pipeline indisponível' : 'Seu primeiro pipeline começa aqui'} description={pipelines.length ? 'O pipeline do link não existe ou você não tem acesso.' : 'Configure as etapas comerciais para organizar suas oportunidades.'} action={pipelines.length ? <Button onClick={() => updateParams({ pipeline: null })}>Ver pipeline padrão</Button> : canManage ? <Button asChild><Link to="/settings?tab=pipelines"><Settings2 className="mr-2 h-4 w-4" />Configurar pipeline</Link></Button> : undefined} /> : !stages.length ? <EmptyState icon={BriefcaseBusiness} title="Este pipeline ainda não tem etapas" description="Adicione etapas nas configurações para começar a criar oportunidades." action={canManage && <Button asChild><Link to="/settings?tab=pipelines">Configurar etapas</Link></Button>} /> : <div className="space-y-5">
      <div><h2 className="text-lg font-semibold tracking-tight">Cada conversa, um próximo passo.</h2><p className="mt-1 text-sm text-muted-foreground">Acompanhe o valor, o responsável e o tempo de cada oportunidade nas etapas de {pipeline.name}.</p></div>
      {!canWrite && <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">Acesso de leitura. Seu papel permite consultar o pipeline; a edição depende de permissão do administrador.</p>}
      {operationError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{operationError}</div>}
      <div data-tour="pipeline-summary"><StatStrip stats={[{ label: 'Em aberto no filtro', value: summary.openCount, icon: BriefcaseBusiness, hint: 'Oportunidades ainda em negociação' }, { label: 'Valor em aberto', value: formatDealCurrency(summary.openValue, pipeline.currency), icon: TrendingUp, hint: `Somente valores em ${pipeline.currency}` }, { label: 'Previsão ponderada', value: formatDealCurrency(summary.weightedValue, pipeline.currency), hint: 'Em aberto × probabilidade; não é receita' }, { label: 'Valor ganho no filtro', value: formatDealCurrency(summary.wonValue, pipeline.currency), icon: ArrowUpRight, hint: 'Negócios ganhos; não comprova recebimento' }]} /></div>
      {summary.foreignCurrencyCount > 0 && <p className="text-sm text-muted-foreground">{summary.foreignCurrencyCount} oportunidades usam outra moeda e não entram nos totais em {pipeline.currency}.</p>}
      {!deals.length && <EmptyState icon={Search} title={activeFilters ? 'Nenhuma oportunidade com esses filtros' : 'Pronto para a primeira oportunidade'} description={activeFilters ? 'Experimente outro responsável, situação ou termo de busca.' : 'Registre uma negociação, defina o responsável e combine a próxima ação.'} action={activeFilters ? <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button> : canWrite ? <Button onClick={() => setForm('create')}>Criar oportunidade</Button> : undefined} className="py-6" />}
      <DealBoard deals={deals} stages={stages} people={refs?.people ?? []} nextActions={nextActions} currency={pipeline.currency} canWrite={canWrite} busy={busy} onOpen={openDeal} onMove={(deal, stage, state) => void move(deal, stage, state)} />
      <p className="text-xs text-muted-foreground">{canWrite ? 'Arraste pela alça ou use o menu de cada oportunidade para mover. A situação de ganho ou perda é definida separadamente da etapa.' : 'Abra uma oportunidade para consultar seus vínculos, ações e movimentações.'}</p>
    </div>}
    {selectedId && !isLoading && !loadError && !form && (selected ? <DealDetail key={selected.id} deal={selected} stages={refs?.stages ?? []} people={refs?.people ?? []} contacts={refs?.contacts ?? []} companies={refs?.companies ?? []} activities={(actions.data ?? []).filter(activity => activity.deal_id === selected.id)} canWrite={canWrite} canManage={canManage} busy={busy} onClose={closeDeal} onEdit={() => setForm(selected)} onDelete={() => setDeleteDeal(selected)} onMove={(deal, stage, state) => void move(deal, stage, state)} onCreateAction={createAction} /> : <SidePanel open title="Oportunidade indisponível" description="O registro foi removido ou você não tem acesso nesta organização." onOpenChange={open => !open && closeDeal()}><Button variant="outline" onClick={closeDeal}>Voltar ao pipeline</Button></SidePanel>)}
    {form && selectedPipeline && <DealForm key={form === 'create' ? 'new' : form.id} deal={form === 'create' ? undefined : form} pipeline={selectedPipeline} stages={(refs?.stages ?? []).filter(stage => stage.pipeline_id === selectedPipeline.id)} people={refs?.people ?? []} contacts={refs?.contacts ?? []} companies={refs?.companies ?? []} onSave={saveDeal} onClose={() => setForm(null)} />}
    <ConfirmDialog open={!!deleteDeal} onOpenChange={open => !open && setDeleteDeal(null)} title="Excluir oportunidade?" description={<>A oportunidade “{deleteDeal?.title}” será excluída. Para encerrar uma negociação preservando seu histórico comercial, marque-a como perdida.</>} confirmLabel="Excluir oportunidade" loading={busy} onConfirm={removeDeal} />
    <Dialog open={!!loss} onOpenChange={open => !open && !busy && setLoss(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Registrar perda</DialogTitle><DialogDescription>Conte por que “{loss?.deal.title}” não avançou. O motivo ajuda a melhorar as próximas negociações.</DialogDescription></DialogHeader><form id="deal-loss-form" onSubmit={confirmLoss} className="space-y-3"><Label htmlFor="deal-loss-reason">Motivo da perda *</Label><Textarea id="deal-loss-reason" value={loss?.reason ?? ''} onChange={event => setLoss(current => current && ({ ...current, reason: event.target.value, error: '' }))} maxLength={2000} autoFocus disabled={busy} />{loss?.error && <p role="alert" className="text-sm text-destructive">{loss.error}</p>}</form><DialogFooter><Button variant="ghost" onClick={() => setLoss(null)} disabled={busy}>Cancelar</Button><Button type="submit" form="deal-loss-form" disabled={busy}>{busy ? 'Salvando…' : 'Registrar perda'}</Button></DialogFooter></DialogContent></Dialog>
  </PageScaffold>;
}

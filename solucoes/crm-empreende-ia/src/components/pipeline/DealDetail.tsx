import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarClock, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ds/select';
import { SidePanel } from '@/components/foundation/SidePanel';
import { StatusChip } from '@/components/foundation/StatusChip';
import { LoadingState } from '@/components/foundation/LoadingState';
import { DEAL_STATUS_LABELS, daysInStage, formatDealCurrency } from '@/lib/deal-logic';
import type { Deal, DealActivity, DealCompany, DealContact, DealPerson, DealStage, DealStatus } from '@/lib/deal-types';
import { allRows, errorMessage, pipelineDb } from './data';
import { DealMoveMenu } from './DealBoard';

export function DealDetail({ deal, stages, contacts, companies, people, activities, canWrite, canManage, busy, onClose, onEdit, onDelete, onMove, onCreateAction }: {
  deal: Deal; stages: DealStage[]; contacts: DealContact[]; companies: DealCompany[]; people: DealPerson[]; activities: DealActivity[];
  canWrite: boolean; canManage: boolean; busy: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void;
  onMove: (deal: Deal, stageId: string, status?: DealStatus) => void;
  onCreateAction: (draft: { title: string; due_date: string; user_id: string }) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [actionDraft, setActionDraft] = useState({ title: '', due_date: '', user_id: deal.owner_id ?? '' });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const history = useQuery({
    queryKey: ['crm', deal.org_id, 'deal-history', deal.id],
    queryFn: () => allRows((from, to) => pipelineDb.from('deal_stage_history').select('*').eq('org_id', deal.org_id).eq('deal_id', deal.id).order('created_at', { ascending: false }).order('id').range(from, to)),
  });
  const owner = people.find(person => person.id === deal.owner_id);
  const contact = contacts.find(person => person.id === deal.contact_id);
  const company = companies.find(item => item.id === deal.company_id);
  const stageName = (id: string | null) => stages.find(stage => stage.id === id)?.name ?? (id ? 'Etapa removida ou indisponível' : 'Criação');
  const createAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionBusy || !canWrite) return;
    if (!actionDraft.title.trim() || !actionDraft.due_date || !Number.isFinite(Date.parse(actionDraft.due_date)) || !actionDraft.user_id) { setActionError('Preencha a ação, um prazo válido e o responsável.'); return; }
    setActionBusy(true); setActionError('');
    try { await onCreateAction(actionDraft); setActionDraft({ title: '', due_date: '', user_id: deal.owner_id ?? '' }); setAdding(false); }
    catch (error) { setActionError(errorMessage(error)); }
    finally { setActionBusy(false); }
  };
  const pending = activities.filter(activity => !activity.completed_at).sort((a, b) => (a.due_date ? Date.parse(a.due_date) : Infinity) - (b.due_date ? Date.parse(b.due_date) : Infinity));
  return <SidePanel open onOpenChange={open => !open && !actionBusy && onClose()} title={deal.title} kicker="Oportunidade" description={`${stageName(deal.stage_id)} · ${daysInStage(deal.stage_entered_at) ?? '—'} dias nesta etapa`} width="lg" footer={<>{canManage && <Button variant="ghost" className="mr-auto text-destructive" onClick={onDelete} disabled={busy || actionBusy}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>}<Button variant="outline" onClick={onClose} disabled={actionBusy}>Fechar</Button>{canWrite && <Button onClick={onEdit} disabled={busy || actionBusy}><Pencil className="mr-2 h-4 w-4" />Editar</Button>}</>}>
    <div className="space-y-6">
      {!canWrite && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Seu papel permite consultar as oportunidades. Solicite a um administrador acesso para editar.</p>}
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">Valor da oportunidade</p><p className="text-2xl font-semibold tabular-nums">{formatDealCurrency(deal.value, deal.currency)}</p></div><div className="flex items-center gap-2"><StatusChip tone={deal.status === 'won' ? 'success' : deal.status === 'lost' ? 'danger' : 'neutral'}>{DEAL_STATUS_LABELS[deal.status]}</StatusChip><DealMoveMenu deal={deal} stages={stages.filter(stage => stage.pipeline_id === deal.pipeline_id)} canWrite={canWrite} busy={busy || actionBusy} onMove={onMove} /></div></div>
      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/20 p-4 text-sm sm:grid-cols-2">
        <div><dt className="mb-1 text-xs text-muted-foreground">Responsável</dt><dd className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-muted-foreground" />{owner?.full_name ?? (deal.owner_id ? 'Indisponível' : 'Não definido')}</dd></div>
        <div><dt className="mb-1 text-xs text-muted-foreground">Previsão de fechamento</dt><dd>{deal.close_date ? new Date(`${deal.close_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Não definida'}</dd></div>
        <div><dt className="mb-1 text-xs text-muted-foreground">Contato</dt><dd>{contact ? <Link className="underline underline-offset-4" to={`/contacts?contact=${encodeURIComponent(contact.id)}`}>{contact.full_name}</Link> : deal.contact_id ? 'Contato indisponível' : 'Não vinculado'}</dd></div>
        <div><dt className="mb-1 text-xs text-muted-foreground">Empresa</dt><dd>{company ? <Link className="underline underline-offset-4" to={`/companies?company=${encodeURIComponent(company.id)}`}>{company.name}</Link> : deal.company_id ? 'Empresa indisponível' : 'Não vinculada'}</dd></div>
        <div><dt className="mb-1 text-xs text-muted-foreground">Probabilidade</dt><dd>{deal.probability ?? 0}%</dd></div>
        <div><dt className="mb-1 text-xs text-muted-foreground">Criada em</dt><dd>{new Date(deal.created_at).toLocaleDateString('pt-BR')}</dd></div>
      </dl>
      {deal.status === 'lost' && <div className="rounded-lg border border-destructive/25 p-3"><h3 className="text-sm font-semibold">Motivo da perda</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{deal.lost_reason || 'Motivo não registrado.'}</p></div>}
      <section aria-label="Próximas ações"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Próximas ações</h3>{canWrite && !adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" />Combinar ação</Button>}</div>
        {adding && <form onSubmit={createAction} className="mb-4 space-y-3 rounded-xl border border-border bg-muted/20 p-4"><div className="space-y-1.5"><Label htmlFor="deal-action-title">O que precisa acontecer? *</Label><Input id="deal-action-title" value={actionDraft.title} onChange={event => setActionDraft(value => ({ ...value, title: event.target.value }))} disabled={actionBusy} maxLength={180} autoFocus /></div><div className="space-y-1.5"><Label htmlFor="deal-action-due">Prazo *</Label><Input id="deal-action-due" type="datetime-local" value={actionDraft.due_date} onChange={event => setActionDraft(value => ({ ...value, due_date: event.target.value }))} disabled={actionBusy} /></div><div className="space-y-1.5"><Label htmlFor="deal-action-owner">Responsável *</Label><Select value={actionDraft.user_id || 'none'} onValueChange={value => setActionDraft(current => ({ ...current, user_id: value === 'none' ? '' : value }))} disabled={actionBusy}><SelectTrigger id="deal-action-owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{people.map(person => <SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select></div>{actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={actionBusy} onClick={() => setAdding(false)}>Cancelar</Button><Button type="submit" disabled={actionBusy}>{actionBusy ? 'Salvando…' : 'Salvar ação'}</Button></div></form>}
        {pending.length ? <ul className="divide-y divide-border rounded-lg border border-border">{pending.map(activity => <li key={activity.id}><Link to={`/activities?activity=${encodeURIComponent(activity.id)}`} className="flex gap-3 rounded-lg p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span><span className="block text-sm font-medium">{activity.title}</span><span className="mt-1 block text-xs text-muted-foreground">{activity.due_date ? new Date(activity.due_date).toLocaleString('pt-BR') : 'Sem prazo'} · {people.find(person => person.id === activity.user_id)?.full_name ?? 'Sem responsável'}</span></span></Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhuma ação pendente. Combine um próximo passo para manter o relacionamento em movimento.</p>}
      </section>
      <section aria-label="Histórico de movimentações"><h3 className="mb-3 text-sm font-semibold">Histórico de movimentações</h3>{history.isPending ? <LoadingState label="Carregando histórico…" /> : history.isError ? <div role="alert" className="text-sm text-destructive"><p>Não foi possível carregar o histórico.</p><Button variant="outline" size="sm" className="mt-2" onClick={() => void history.refetch()}>Tentar novamente</Button></div> : history.data?.length ? <ol className="space-y-4 border-l border-border pl-4">{history.data.map(event => <li key={event.id} className="text-sm"><p>{stageName(event.from_stage_id)} <span aria-hidden>→</span> {stageName(event.to_stage_id)}{event.from_status !== event.to_status && <span className="mt-0.5 block text-xs">{event.from_status ? DEAL_STATUS_LABELS[event.from_status as DealStatus] : 'Nova'} → {DEAL_STATUS_LABELS[event.to_status as DealStatus]}</span>}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString('pt-BR')} · {people.find(person => person.id === event.changed_by)?.full_name ?? 'Sistema ou usuário indisponível'}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}</section>
    </div>
  </SidePanel>;
}

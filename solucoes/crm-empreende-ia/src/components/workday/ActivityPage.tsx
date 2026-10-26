import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckSquare, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/hooks/useOrg';
import { useCrmSnapshot } from '@/hooks/useCrmSnapshot';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from '@/components/ds/select';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { EmptyState } from '@/components/foundation/EmptyState';
import { ACTIVITY_LABELS, normalizeSearch } from '@/lib/contact-model';
import { compareActivities, matchesDate, uniqueActivities, type Activity, type ActivityDateFilter } from '@/lib/activity-logic';
import { ActivityDialog } from './ActivityDialog';
import { ActivityDetail } from './ActivityDetail';
import { ActivityList } from './ActivityList';
import { useLocalClock } from './useLocalClock';
import { ReadOnlyActivityDialog } from './ReadOnlyActivityDialog';
import { WorkdayState } from './WorkdayState';
const DATE_LABELS: Record<ActivityDateFilter, string> = { all: 'Qualquer data', today: 'Hoje', overdue: 'Vencidas', upcoming: 'Próximos dias', 'no-date': 'Sem data' };
export function ActivityPage({ mode = 'activities' }: { mode?: 'activities' | 'tasks' }) {
  const { loading: authLoading, user } = useAuth(); const { orgId } = useOrg(); const permissions = useCrmPermissions(); const snapshot = useCrmSnapshot();
  const now = useLocalClock(); const [params, setParams] = useSearchParams(); const [editing, setEditing] = useState<Activity | null>(null); const [pagination, setPagination] = useState({ signature: '', page: 0 });
  const search = (params.get('q') ?? '').slice(0, 300), status = ['all', 'pending', 'completed'].includes(params.get('status') ?? '') ? params.get('status')! : 'pending';
  const date = Object.keys(DATE_LABELS).includes(params.get('date') ?? '') ? params.get('date') as ActivityDateFilter : 'all';
  const owner = ['mine', 'unassigned'].includes(params.get('owner') ?? '') ? params.get('owner')! : 'all';
  const type = mode === 'tasks' ? 'task' : ACTIVITY_LABELS[params.get('type') ?? ''] ? params.get('type')! : 'all';
  const selectedId = params.get('activity'), creating = params.get('action') === 'new'; const data = snapshot.data;
  const signature = `${mode}:${orgId}:${search}:${status}:${date}:${owner}:${type}`;
  const rows = useMemo(() => uniqueActivities(data?.activities ?? []).filter(a => {
    if (type !== 'all' && a.type !== type || owner === 'mine' && a.user_id !== user?.id || owner === 'unassigned' && !!a.user_id) return false;
    if (status === 'pending' && (a.completed_at || a.type === 'note') || status === 'completed' && !a.completed_at) return false;
    return matchesDate(a, date, now) && normalizeSearch([a.title, a.body].filter(Boolean).join(' ')).includes(normalizeSearch(search));
  }).sort(compareActivities), [data?.activities, type, owner, user?.id, status, date, search, now]);
  const page = Math.min(pagination.signature === signature ? pagination.page : 0, Math.max(0, Math.ceil(rows.length / 25) - 1));
  const loading = authLoading || permissions.loading || !!orgId && snapshot.isPending; const ready = !loading && !!orgId && !snapshot.isError && !!data;
  const update = (key: string, value: string) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  const open = (activity: Activity) => setParams(previous => { const next = new URLSearchParams(previous); next.set('activity', activity.id); return next; });
  const close = () => update('activity', ''); const closeEditor = () => { setEditing(null); if (creating) update('action', ''); };
  const reset = () => setParams(previous => { const next = new URLSearchParams(previous); ['q', 'status', 'date', 'owner', 'type'].forEach(key => next.delete(key)); return next; }, { replace: true });
  const hasFilters = !!search || date !== 'all' || owner !== 'all' || status !== 'pending' || mode === 'activities' && type !== 'all';
  return <div className="h-full" data-product-tour={mode}><PageScaffold title={mode === 'tasks' ? 'Tarefas' : 'Atividades'} actions={permissions.canWrite && <Button size="sm" data-tour={`${mode}-create`} onClick={() => update('action', 'new')}><Plus className="mr-1 h-4 w-4" /><span className="hidden sm:inline">{mode === 'tasks' ? 'Nova tarefa' : 'Nova atividade'}</span><span className="sr-only sm:hidden">Criar</span></Button>}>
    <div className="space-y-5"><div><h2 className="text-lg font-semibold">{mode === 'tasks' ? 'Cada tarefa com um próximo passo' : 'O trabalho conectado ao relacionamento'}</h2><p className="mt-1 text-sm text-muted-foreground">{mode === 'tasks' ? 'Priorize prazos, atribua responsáveis e acompanhe as conclusões.' : 'Registre tarefas, ligações, reuniões, e-mails e notas no mesmo histórico.'}</p></div>
    <div data-tour={`${mode}-filters`} className="space-y-3"><div className="flex flex-wrap gap-3"><div className="relative min-w-0 flex-1 basis-56"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} maxLength={300} aria-label="Pesquisar título ou detalhes" placeholder="Pesquisar título ou detalhes" onChange={e => update('q', e.target.value)} /></div><Select value={status} onValueChange={v => update('status', v)}><SelectTrigger className="w-40" aria-label="Situação das atividades"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendentes</SelectItem><SelectItem value="completed">Concluídas / notas</SelectItem><SelectItem value="all">Todas</SelectItem></SelectContent></Select><Select value={owner} onValueChange={v => update('owner', v)}><SelectTrigger className="w-44" aria-label="Responsável pelas atividades"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toda a organização</SelectItem><SelectItem value="mine">Minhas atividades</SelectItem><SelectItem value="unassigned">Sem responsável</SelectItem></SelectContent></Select>{mode === 'activities' && <Select value={type} onValueChange={v => setParams(previous => { const next = new URLSearchParams(previous); next.set('type', v); if (v === 'note') next.set('status', 'all'); return next; }, { replace: true })}><SelectTrigger className="w-36" aria-label="Tipo de atividade"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{Object.entries(ACTIVITY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>}</div><div className="flex flex-wrap gap-2">{Object.entries(DATE_LABELS).map(([key, label]) => <Button size="sm" key={key} variant={date === key ? 'default' : 'outline'} aria-pressed={date === key} onClick={() => update('date', key)}>{label}</Button>)}{hasFilters && <Button variant="ghost" size="sm" onClick={reset}><X className="mr-1 h-3 w-3" />Limpar filtros</Button>}</div></div>
    <WorkdayState loading={loading} orgId={orgId} error={snapshot.isError} retry={() => void snapshot.refetch()} />
    {ready && <div data-tour={`${mode}-list`}>{!rows.length ? <EmptyState icon={mode === 'tasks' ? CheckSquare : CalendarClock} title={hasFilters ? 'Nenhuma atividade nestes filtros' : 'Nenhuma atividade pendente'} description={hasFilters ? 'Ajuste os filtros para ampliar os resultados.' : 'Crie um próximo passo ou consulte as atividades concluídas.'} action={hasFilters ? <Button variant="outline" onClick={reset}>Limpar filtros</Button> : permissions.canWrite ? <Button onClick={() => update('action', 'new')}>Criar atividade</Button> : undefined} /> : <><ActivityList activities={rows.slice(page * 25, page * 25 + 25)} data={data} onOpen={open} onEdit={setEditing} tourPrefix={mode} /><div className="mt-3 flex flex-wrap justify-between gap-2"><p className="text-xs text-muted-foreground" role="status">{page * 25 + 1}–{Math.min(page * 25 + 25, rows.length)} de {rows.length} atividades</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPagination({ signature, page: page - 1 })}><ChevronLeft className="mr-1 h-3 w-3" />Anterior</Button><Button size="sm" variant="outline" disabled={page * 25 + 25 >= rows.length} onClick={() => setPagination({ signature, page: page + 1 })}>Próxima<ChevronRight className="ml-1 h-3 w-3" /></Button></div></div></>}</div>}
    </div></PageScaffold>{ready && selectedId && <ActivityDetail key={selectedId} activity={data.activities.find(a => a.id === selectedId)} data={data} onClose={close} onEdit={setEditing} />}{ready && (creating || editing) && permissions.canWrite && <ActivityDialog key={editing?.id ?? 'new'} data={data} activity={editing ?? undefined} defaults={{ type: 'task' }} onClose={closeEditor} onSaved={id => { setEditing(null); setParams(previous => { const next = new URLSearchParams(previous); next.delete('action'); next.set('activity', id); return next; }, { replace: true }); }} />}
    {ready && creating && !permissions.canWrite && <ReadOnlyActivityDialog onClose={closeEditor} />}
  </div>;
}

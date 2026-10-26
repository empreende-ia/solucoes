import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Bookmark, Building2, ChevronLeft, ChevronRight, Columns3, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/hooks/useOrg';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { useSavedViews } from '@/hooks/useSavedViews';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from '@/components/ds/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ds/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ds/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { EmptyState } from '@/components/foundation/EmptyState';
import { LoadingState } from '@/components/foundation/LoadingState';
import { applyDirectoryView, DEFAULT_COLUMNS, directoryView, displayDate, normalizeSearch, recordName, relatedData, withRecord, type Company, type Contact, type DirectoryColumn, type DirectoryKind, type DirectoryScope, type DirectorySort, type DirectoryView } from '@/lib/contact-model';
import { useRelationshipData } from './useRelationshipData';
import { RecordEditor } from './RecordEditor';
import { Relationship360 } from './Relationship360';

const COLUMN_LABELS: Record<DirectoryColumn, string> = { email: 'E-mail', phone: 'Telefone', company: 'Empresa', industry: 'Segmento', owner: 'Responsável', 'next-action': 'Próxima ação' };
const SCOPE_LABELS: Record<DirectoryScope, string> = { all: 'Todos', mine: 'Minha carteira', unassigned: 'Sem responsável', 'no-action': 'Sem próxima ação' };
const PAGE_SIZE = 25;

export function DirectoryPage({ kind }: { kind: DirectoryKind }) {
  const { user, loading: authLoading } = useAuth(); const { orgId } = useOrg(); const permissions = useCrmPermissions();
  const query = useRelationshipData(); const saved = useSavedViews(kind); const [params, setParams] = useSearchParams();
  const view = directoryView(params, kind); const selectedId = params.get(kind === 'contacts' ? 'contact' : 'company');
  const createOpen = params.get('action') === 'new'; const [editId, setEditId] = useState<string | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false); const [viewName, setViewName] = useState('');
  const [pagination, setPagination] = useState({ signature: '', page: 0 }); const signature = `${kind}:${orgId}:${view.q}:${view.scope}:${view.sort}`;
  const page = pagination.signature === signature ? pagination.page : 0;
  const label = kind === 'contacts' ? 'Contatos' : 'Empresas'; const Icon = kind === 'contacts' ? Users : Building2;
  const data = query.data;
  const collection = useMemo(() => data ? kind === 'contacts' ? data.contacts : data.companies : [], [data, kind]);
  const selected = collection.find(record => record.id === selectedId);
  const edited = collection.find(record => record.id === editId);
  const columns = view.columns.filter(c => kind === 'contacts' ? c !== 'industry' : !['email', 'company'].includes(c));
  const availableColumns: DirectoryColumn[] = kind === 'contacts' ? ['email', 'phone', 'company', 'owner', 'next-action'] : ['industry', 'phone', 'owner', 'next-action'];
  const relationMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof relatedData>>();
    if (data) for (const record of kind === 'contacts' ? data.contacts : data.companies) map.set(record.id, relatedData(kind, record.id, data));
    return map;
  }, [data, kind]);
  const filtered = useMemo(() => {
    const term = normalizeSearch(view.q);
    return collection.filter(record => {
      if (view.scope === 'mine' && record.owner_id !== user?.id || view.scope === 'unassigned' && record.owner_id || view.scope === 'no-action' && relationMap.get(record.id)?.next) return false;
      const searchFields = 'first_name' in record ? [recordName(record), record.email, record.phone, data?.companies.find(c => c.id === record.company_id)?.name] : [record.name, record.industry, record.website, record.phone];
      return !term || normalizeSearch(searchFields.filter(Boolean).join(' ')).includes(term);
    }).sort((a, b) => {
      if (view.sort === 'updated') return Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.id.localeCompare(b.id);
      if (view.sort === 'next-action') { const dueA = relationMap.get(a.id)?.next?.due_date, dueB = relationMap.get(b.id)?.next?.due_date; const delta = (dueA ? Date.parse(dueA) : Infinity) - (dueB ? Date.parse(dueB) : Infinity); if (Number.isFinite(delta) && delta !== 0) return delta; if (dueA && !dueB) return -1; if (!dueA && dueB) return 1; }
      return recordName(a).localeCompare(recordName(b), 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
    });
  }, [collection, data?.companies, view.q, view.scope, view.sort, user?.id, relationMap]);
  const effectivePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const visible = filtered.slice(effectivePage * PAGE_SIZE, (effectivePage + 1) * PAGE_SIZE);
  const hasFilters = !!view.q || view.scope !== 'all';
  const updateView = (next: Partial<DirectoryView>) => setParams(previous => applyDirectoryView(previous, { ...view, ...next }), { replace: true });
  const openRecord = (id: string | null) => setParams(previous => withRecord(previous, kind, id));
  const closeEditor = () => { setEditId(null); if (createOpen) setParams(previous => { const next = new URLSearchParams(previous); next.delete('action'); return next; }, { replace: true }); };
  const create = () => setParams(previous => { const next = new URLSearchParams(previous); next.set('action', 'new'); return next; });
  const clear = () => updateView({ q: '', scope: 'all' });
  function cell(record: Contact | Company, column: DirectoryColumn) {
    if (column === 'owner') return data?.members.find(m => m.id === record.owner_id)?.name || (record.owner_id ? 'Responsável indisponível' : 'Sem responsável');
    if (column === 'next-action') { const next = relationMap.get(record.id)?.next; return next ? <div className="max-w-56"><span className="block truncate">{next.title}</span><span className={`text-xs ${Date.parse(next.due_date!) < Date.now() ? 'text-destructive' : 'text-muted-foreground'}`}>{displayDate(next.due_date)}</span></div> : <span className="text-muted-foreground">Sem próxima ação</span>; }
    if (column === 'company') return 'company_id' in record ? data?.companies.find(c => c.id === record.company_id)?.name || '—' : '—';
    if (column === 'email') return 'email' in record ? record.email || '—' : '—';
    if (column === 'industry') return 'industry' in record ? record.industry || '—' : '—';
    return record.phone || '—';
  }
  const loading = authLoading || permissions.loading || (!!orgId && query.isPending);
  return <div className="h-full min-w-0" data-product-tour={kind}><PageScaffold title={label} meta={data ? <span className="text-xs text-muted-foreground">{collection.length} cadastros</span> : undefined} actions={permissions.canWrite && <Button data-tour={`${kind}-create`} size="sm" onClick={create}><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">{kind === 'contacts' ? 'Novo contato' : 'Nova empresa'}</span><span className="sr-only sm:hidden">{kind === 'contacts' ? 'Novo contato' : 'Nova empresa'}</span></Button>}>
    <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{kind === 'contacts' ? 'Relacionamentos que movem o negócio' : 'Sua rede de empresas'}</h2><p className="mt-1 text-sm text-muted-foreground">{kind === 'contacts' ? 'Encontre pessoas, acompanhe o contexto e defina o próximo passo.' : 'Conecte pessoas, oportunidades e histórico em uma mesma ficha.'}</p></div><div data-tour={`${kind}-views`} className="flex flex-wrap gap-2"><Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><Bookmark className="mr-1.5 h-3.5 w-3.5" />Visões salvas{saved.views.length ? ` (${saved.views.length})` : ''}</Button></PopoverTrigger><PopoverContent align="end" className="w-72 space-y-3"><p className="text-xs text-muted-foreground">Salvas neste navegador, para seu usuário e organização.</p>{saved.views.length ? saved.views.map(item => <div className="flex gap-1" key={item.id}><Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" onClick={() => updateView(item.view)}><span className="truncate">{item.name}</span></Button><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Excluir visão ${item.name}`} onClick={() => saved.remove(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>) : <p className="text-sm">Salve filtros, ordenação e colunas usados na sua rotina.</p>}<Button className="w-full" size="sm" onClick={() => { setViewName(''); setSaveViewOpen(true); }}>Salvar visão atual</Button>{saved.error && <p role="alert" className="text-xs text-destructive">{saved.error}</p>}</PopoverContent></Popover></div></div>
    <div className="flex flex-wrap gap-3"><div data-tour={`${kind}-search`} className="relative min-w-0 flex-1 basis-64"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={kind === 'contacts' ? 'Pesquisar por nome, e-mail, telefone ou empresa' : 'Pesquisar por empresa, segmento, site ou telefone'} maxLength={300} value={view.q} onChange={e => updateView({ q: e.target.value })} className="pl-9" placeholder={kind === 'contacts' ? 'Nome, e-mail, telefone ou empresa' : 'Empresa, segmento, site ou telefone'} /></div><Select value={view.sort} onValueChange={v => updateView({ sort: v as DirectorySort })}><SelectTrigger aria-label="Ordenar cadastros" className="w-36 sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">Nome: A–Z</SelectItem><SelectItem value="updated">Atualizados primeiro</SelectItem><SelectItem value="next-action">Prazo da próxima ação</SelectItem></SelectContent></Select><Popover><PopoverTrigger asChild><Button variant="outline" aria-label="Escolher colunas"><Columns3 className="mr-1.5 h-4 w-4" />Colunas</Button></PopoverTrigger><PopoverContent align="end" className="w-56 space-y-3"><p className="text-xs text-muted-foreground">Nome permanece sempre visível.</p>{availableColumns.map(column => <label key={column} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={columns.includes(column)} onCheckedChange={checked => updateView({ columns: checked ? [...columns, column] : columns.filter(c => c !== column) })} />{COLUMN_LABELS[column]}</label>)}<Button variant="ghost" size="sm" onClick={() => updateView({ columns: DEFAULT_COLUMNS[kind] })}>Restaurar colunas</Button></PopoverContent></Popover></div>
    <div data-tour={`${kind}-filters`} className="flex flex-wrap items-center gap-2"><div className="w-full sm:hidden"><Select value={view.scope} onValueChange={v => updateView({ scope: v as DirectoryScope })}><SelectTrigger aria-label="Filtrar carteira"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(SCOPE_LABELS).map(([scope, title]) => <SelectItem key={scope} value={scope}>{title}</SelectItem>)}</SelectContent></Select></div>{Object.entries(SCOPE_LABELS).map(([scope, title]) => <Button className="hidden sm:inline-flex" key={scope} size="sm" variant={view.scope === scope ? 'default' : 'outline'} aria-pressed={view.scope === scope} onClick={() => updateView({ scope: scope as DirectoryScope })}>{title}</Button>)}{hasFilters && <Button size="sm" variant="ghost" onClick={clear}><X className="mr-1 h-3.5 w-3.5" />Limpar filtros</Button>}</div>
    <div data-tour={`${kind}-list`}>
      {loading ? <LoadingState label={`Carregando ${label.toLocaleLowerCase()}…`} /> : !orgId ? <EmptyState icon={AlertCircle} title="Organização indisponível" description="Seu usuário precisa estar vinculado a uma organização para consultar estes dados." /> : query.isError ? <EmptyState icon={AlertCircle} title="Não foi possível carregar os cadastros" description="Verifique a conexão ou solicite ao administrador a revisão de seu acesso. Os filtros atuais foram mantidos." action={<Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>} /> : !filtered.length ? <EmptyState icon={Icon} title={hasFilters ? 'Nenhum cadastro corresponde aos filtros' : kind === 'contacts' ? 'Cadastre seu primeiro contato' : 'Cadastre sua primeira empresa'} description={hasFilters ? 'Ajuste a pesquisa ou limpe os filtros para ampliar os resultados.' : 'Organize as informações do relacionamento e mantenha os próximos passos à vista.'} action={hasFilters ? <Button variant="outline" onClick={clear}>Limpar filtros</Button> : permissions.canWrite ? <Button onClick={create}>{kind === 'contacts' ? 'Criar contato' : 'Criar empresa'}</Button> : <p className="text-xs text-muted-foreground">Seu papel permite apenas consulta. Peça a um editor para criar um cadastro.</p>} /> : <>
        <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead className="min-w-48">{kind === 'contacts' ? 'Contato' : 'Empresa'}</TableHead>{columns.map(column => <TableHead key={column} className="min-w-36">{COLUMN_LABELS[column]}</TableHead>)}</TableRow></TableHeader><TableBody>{visible.map(record => <TableRow key={record.id}><TableCell><button className="max-w-64 text-left text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openRecord(record.id)}><span className="block break-words">{recordName(record)}</span></button></TableCell>{columns.map(column => <TableCell key={column} className="text-sm">{cell(record, column)}</TableCell>)}</TableRow>)}</TableBody></Table></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-muted-foreground">{effectivePage * PAGE_SIZE + 1}–{Math.min((effectivePage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}{hasFilters ? ` · ${collection.length} no total` : ''}{query.isFetching ? ' · Atualizando…' : ''}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={effectivePage === 0} onClick={() => setPagination({ signature, page: effectivePage - 1 })}><ChevronLeft className="mr-1 h-3.5 w-3.5" />Anterior</Button><Button variant="outline" size="sm" disabled={(effectivePage + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPagination({ signature, page: effectivePage + 1 })}>Próxima<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>
      </>}
    </div></div>
  </PageScaffold>
  {data && selectedId && !loading && !query.isError && <Relationship360 key={`${kind}:${selectedId}`} kind={kind} record={selected} data={data} onClose={() => openRecord(null)} onEdit={() => setEditId(selectedId)} />}
  {data && (createOpen || edited) && permissions.canWrite && <RecordEditor key={edited?.id ?? `${kind}:new`} kind={kind} record={edited} data={data} onClose={closeEditor} onSaved={id => { setEditId(null); setParams(previous => { const next = withRecord(previous, kind, id); next.delete('action'); return next; }, { replace: true }); }} />}
  {createOpen && !permissions.canWrite && !permissions.loading && <Dialog open onOpenChange={open => { if (!open) closeEditor(); }}><DialogContent><DialogHeader><DialogTitle>Acesso somente para consulta</DialogTitle><DialogDescription>Seu papel não permite criar cadastros. Peça a um administrador para revisar suas permissões.</DialogDescription></DialogHeader><DialogFooter><Button onClick={closeEditor}>Voltar à lista</Button></DialogFooter></DialogContent></Dialog>}
  <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Salvar visão atual</DialogTitle><DialogDescription>Guarde pesquisa, filtros, ordenação e colunas neste navegador. Usar um nome existente atualiza aquela visão.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (saved.save(viewName, view)) setSaveViewOpen(false); }}><div className="space-y-1.5"><Label htmlFor="saved-view-name">Nome da visão</Label><Input id="saved-view-name" autoFocus required maxLength={60} value={viewName} onChange={e => setViewName(e.target.value)} placeholder="Ex.: Contatos sem próxima ação" /></div>{saved.error && <p role="alert" className="text-sm text-destructive">{saved.error}</p>}<DialogFooter><Button type="button" variant="ghost" onClick={() => setSaveViewOpen(false)}>Cancelar</Button><Button type="submit">Salvar visão</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}

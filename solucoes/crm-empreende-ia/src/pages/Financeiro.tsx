import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CalendarClock, FilterX, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useOrg } from '@/hooks/useOrg';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ds/select';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/foundation/EmptyState';
import { LoadingState } from '@/components/foundation/LoadingState';
import { StatStrip } from '@/components/foundation/StatStrip';
import { StatusChip } from '@/components/foundation/StatusChip';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import { PaymentForm } from '@/components/operations/PaymentForm';
import { allRows, errorMessage, loadOperationReferences } from '@/components/operations/data';
import { filterPayments, PAYMENT_LABELS, paymentState, summarizePayments, type Payment, type PaymentDraft } from '@/lib/operation-logic';
import { formatDealCurrency, parseDealValue } from '@/lib/deal-logic';

export default function Financeiro() { const { orgId } = useOrg(); return <div className="h-full" data-product-tour="financeiro">{orgId ? <FinanceContent key={orgId} orgId={orgId} /> : <PageScaffold title="Financeiro"><EmptyState icon={Wallet} title="Organização indisponível" description="Entre em uma organização para consultar seus lançamentos." /></PageScaffold>}</div>; }
function FinanceContent({ orgId }: { orgId: string }) {
  const { canWrite, canManage, loading: permissionsLoading } = useCrmPermissions();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<Payment | 'create' | null>(null);
  const [removing, setRemoving] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const payments = useQuery({ queryKey: ['crm', orgId, 'payments'], queryFn: () => allRows((from, to) => crmDb.from('payments').select('*').eq('org_id', orgId).order('due_date').order('id').range(from, to)) });
  const references = useQuery({ queryKey: ['crm', orgId, 'operation-references'], queryFn: () => loadOperationReferences(orgId) });
  const filter = { from: params.get('from') || '', to: params.get('to') || '', status: params.get('status') || 'all', search: params.get('q') || '', currency: 'BRL' };
  const invalidRange = !!filter.from && !!filter.to && filter.from > filter.to;
  const filtered = invalidRange ? [] : filterPayments(payments.data ?? [], filter);
  const summary = summarizePayments(filtered);
  const selected = payments.data?.find(payment => payment.id === params.get('payment'));
  const loading = payments.isPending || references.isPending || permissionsLoading;
  const error = payments.error || references.error;
  const changeParams = (key: string, value: string, replace = false) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; }, { replace });
  const clearFilters = () => setParams(previous => { const next = new URLSearchParams(previous); ['from', 'to', 'status', 'q'].forEach(key => next.delete(key)); return next; });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm'] });
  const closeSelected = () => changeParams('payment', '');
  useEffect(() => { if (params.get('create') !== '1' || loading) return; if (canWrite) setForm('create'); else toast.error('Seu papel permite somente leitura.'); setParams(previous => { const next = new URLSearchParams(previous); next.delete('create'); return next; }, { replace: true }); }, [params, loading, canWrite, setParams]);
  const save = async (draft: PaymentDraft) => {
    if (!canWrite) throw new Error('Você não tem permissão para editar lançamentos.');
    const fields = { description: draft.description.trim(), amount: parseDealValue(draft.amount)!, currency: 'BRL', status: draft.status, due_date: draft.due_date, paid_at: draft.status === 'paid' ? new Date(draft.paid_at).toISOString() : null, contact_id: draft.contact_id || null, company_id: draft.company_id || null, deal_id: draft.deal_id || null };
    if (form && form !== 'create') {
      const { data, error } = await crmDb.from('payments').update(fields).eq('org_id', orgId).eq('id', form.id).eq('updated_at', form.updated_at).select('id').maybeSingle();
      if (error) throw error; if (!data) throw new Error('O lançamento mudou ou está indisponível. Atualize a lista antes de editar novamente.');
    } else {
      const { data, error } = await crmDb.from('payments').insert({ ...fields, org_id: orgId }).select('id').single();
      if (error) throw error; changeParams('payment', data.id);
    }
    await refresh(); toast.success('Lançamento salvo.');
  };
  const remove = async () => {
    if (!removing || busy || !canManage) return;
    setBusy(true); setDeleteError('');
    try { const { data, error } = await crmDb.from('payments').delete().eq('id', removing.id).eq('org_id', orgId).select('id'); if (error) throw error; if (!data?.length) throw new Error('Lançamento indisponível para exclusão.'); closeSelected(); setRemoving(null); await refresh(); toast.success('Lançamento excluído.'); } catch (error) { setDeleteError(errorMessage(error)); } finally { setBusy(false); }
  };
  const labels = { ...PAYMENT_LABELS, overdue: 'Vencido' };
  return <PageScaffold title="Financeiro" meta={<StatusChip>{filtered.length} lançamentos</StatusChip>} actions={canWrite && <Button size="sm" data-tour="finance-create" onClick={() => setForm('create')} disabled={loading || !!error}><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Novo lançamento</span><span className="sr-only sm:hidden">Novo lançamento</span></Button>} toolbar={<div className="flex w-full flex-wrap items-end gap-2" data-tour="finance-filters"><div className="min-w-[160px] flex-1 sm:max-w-xs"><Label htmlFor="finance-search" className="sr-only">Buscar lançamento</Label><Input id="finance-search" value={filter.search} onChange={event => changeParams('q', event.target.value, true)} placeholder="Buscar descrição" /></div><Select value={filter.status} onValueChange={value => changeParams('status', value === 'all' ? '' : value)}><SelectTrigger className="w-[140px]" aria-label="Filtrar situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas situações</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{value === 'pending' ? 'A vencer / hoje' : label}</SelectItem>)}</SelectContent></Select><div><Label htmlFor="finance-from" className="text-[10px]">Vencimento de</Label><Input id="finance-from" type="date" value={filter.from} onChange={event => changeParams('from', event.target.value)} className="w-[145px]" /></div><div><Label htmlFor="finance-to" className="text-[10px]">Até</Label><Input id="finance-to" type="date" value={filter.to} onChange={event => changeParams('to', event.target.value)} className="w-[145px]" /></div>{(filter.from || filter.to || filter.search || filter.status !== 'all') && <Button variant="ghost" size="sm" onClick={clearFilters}><FilterX className="mr-1.5 h-4 w-4" />Limpar</Button>}<Button variant="ghost" size="icon" aria-label="Atualizar lançamentos" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button></div>}>
    {loading ? <LoadingState label="Carregando lançamentos…" /> : error ? <EmptyState icon={AlertCircle} title="Não foi possível carregar o financeiro" description={errorMessage(error)} action={<Button onClick={() => void refresh()}>Tentar novamente</Button>} /> : <div className="space-y-5">
      <div><h2 className="text-lg font-semibold">Recebimentos com contexto.</h2><p className="mt-1 text-sm text-muted-foreground">Todos os valores em reais. O período filtra a data de vencimento de cada lançamento.</p></div>
      {!canWrite && <p className="text-sm text-muted-foreground">Acesso de leitura. Edição disponível para membros autorizados.</p>}
      {invalidRange && <p role="alert" className="text-sm text-destructive">A data inicial deve ser anterior ou igual à data final.</p>}
      <div data-tour="finance-summary"><StatStrip stats={[{ label: 'Recebido no filtro', value: formatDealCurrency(summary.paid), icon: Wallet, hint: 'Lançamentos com recebimento registrado' }, { label: 'Vencido', value: formatDealCurrency(summary.overdue), icon: CalendarClock, hint: 'Pendentes com vencimento anterior a hoje' }, { label: 'A vencer / hoje', value: formatDealCurrency(summary.pending), hint: 'Pendentes de hoje em diante' }, { label: 'Cancelado', value: formatDealCurrency(summary.cancelled), hint: 'Fora dos valores a receber' }]} /></div>
      <div data-tour="finance-list">{filtered.length ? <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{filtered.map(payment => <button key={payment.id} type="button" onClick={() => changeParams('payment', payment.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{payment.description}</span><span className="mt-1 block text-xs text-muted-foreground">Vencimento {new Date(`${payment.due_date}T12:00:00`).toLocaleDateString('pt-BR')}{payment.paid_at ? ` · Recebido ${new Date(payment.paid_at).toLocaleDateString('pt-BR')}` : ''}</span></span><span className="text-sm font-semibold tabular-nums">{formatDealCurrency(payment.amount)}</span><StatusChip tone={payment.status === 'paid' ? 'success' : paymentState(payment) === 'overdue' ? 'danger' : 'neutral'}>{labels[paymentState(payment)] ?? payment.status}</StatusChip></button>)}</div> : <EmptyState icon={Wallet} title="Nenhum lançamento neste recorte" description="Ajuste os filtros ou registre o primeiro compromisso financeiro." action={canWrite && <Button onClick={() => setForm('create')}>Novo lançamento</Button>} />}</div>
    </div>}
    {params.get('payment') && !loading && !error && !form && <SidePanel open title={selected?.description ?? 'Lançamento indisponível'} description={selected ? 'Detalhes do lançamento financeiro' : 'O registro foi removido ou você não tem acesso.'} onOpenChange={open => !open && closeSelected()} footer={selected && <>{canManage && <Button variant="ghost" className="mr-auto text-destructive" onClick={() => { setDeleteError(''); setRemoving(selected); }}><Trash2 className="mr-1.5 h-4 w-4" />Excluir</Button>}<Button variant="outline" onClick={closeSelected}>Fechar</Button>{canWrite && <Button onClick={() => setForm(selected)}>Editar</Button>}</>}>
      {selected && <div className="space-y-5"><p className="text-3xl font-semibold tabular-nums">{formatDealCurrency(selected.amount)}</p><StatusChip tone={selected.status === 'paid' ? 'success' : paymentState(selected) === 'overdue' ? 'danger' : 'neutral'}>{labels[paymentState(selected)]}</StatusChip><dl className="space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Vencimento</dt><dd>{new Date(`${selected.due_date}T12:00:00`).toLocaleDateString('pt-BR')}</dd></div><div><dt className="text-xs text-muted-foreground">Recebimento</dt><dd>{selected.paid_at ? new Date(selected.paid_at).toLocaleString('pt-BR') : 'Não registrado'}</dd></div></dl><div className="flex flex-col gap-3 text-sm">{selected.deal_id && <Link className="underline underline-offset-4" to={`/pipeline?deal=${selected.deal_id}`}>{references.data?.deals.find(deal => deal.id === selected.deal_id)?.title ?? 'Abrir oportunidade'}</Link>}{selected.contact_id && <Link className="underline underline-offset-4" to={`/contacts?contact=${selected.contact_id}`}>Abrir contato vinculado</Link>}{selected.company_id && <Link className="underline underline-offset-4" to={`/companies?company=${selected.company_id}`}>Abrir empresa vinculada</Link>}</div></div>}
    </SidePanel>}
    {form && references.data && <PaymentForm key={form === 'create' ? 'new' : form.id} payment={form === 'create' ? undefined : form} references={references.data} onSave={save} onClose={() => setForm(null)} />}
    <ConfirmDialog open={!!removing} onOpenChange={open => !open && setRemoving(null)} title="Excluir lançamento?" description={<>“{removing?.description}” será removido. Para manter o registro, prefira alterar a situação para Cancelado.{deleteError && <span className="mt-2 block text-destructive" role="alert">{deleteError}</span>}</>} confirmLabel="Excluir lançamento" loading={busy} onConfirm={remove} />
  </PageScaffold>;
}

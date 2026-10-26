import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, CircleHelp, FileText, Handshake, Pencil, Plus, Trash2, Undo2, UserRound } from 'lucide-react';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useOrg } from '@/hooks/useOrg';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { Button } from '@/components/ds/button';
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from '@/components/ds/select';
import { EmptyState } from '@/components/foundation/EmptyState';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ACTIVITY_LABELS, CONTACT_STATUS_LABELS, contactName, displayDate, recordName, relatedData, relationshipError, safeWebsite, type Company, type Contact, type DirectoryKind, type RelationshipActivity, type RelationshipData } from '@/lib/contact-model';
import { ActivityEditor } from './ActivityEditor';
import { toast } from 'sonner';

interface Props { kind: DirectoryKind; record?: Contact | Company; data: RelationshipData; onClose: () => void; onEdit: () => void }
export function Relationship360({ kind, record, data, onClose, onEdit }: Props) {
  const { orgId } = useOrg(); const { canWrite, canManage } = useCrmPermissions(); const cache = useQueryClient();
  const [activityEditor, setActivityEditor] = useState<{ activity?: RelationshipActivity; initialType?: string } | null>(null);
  const [timelineFilter, setTimelineFilter] = useState('all'); const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const related = useMemo(() => relatedData(kind, record?.id ?? '', data), [kind, record?.id, data]);
  const owner = data.members.find(m => m.id === record?.owner_id);
  const visible = related.activities.filter(a => timelineFilter === 'all' || timelineFilter === 'pending' && !a.completed_at && a.type !== 'note' || timelineFilter === 'completed' && !!a.completed_at && a.type !== 'note' || a.type === timelineFilter)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id));
  const linkedHistory = related.activities.length > 0 || related.deals.length > 0 || kind === 'companies' && related.contacts.length > 0;
  async function toggleActivity(activity: RelationshipActivity) {
    if (!orgId || !canWrite || busy) return; setBusy(activity.id); setError(null);
    try { const result = await crmDb.from('activities').update({ completed_at: activity.completed_at ? null : new Date().toISOString() }).eq('org_id', orgId).eq('id', activity.id).select('id').single();
      if (result.error) throw result.error; await cache.invalidateQueries({ queryKey: ['crm'] }); toast.success(activity.completed_at ? 'Atividade reaberta' : 'Atividade concluída');
    } catch (cause) { setError(relationshipError(cause)); } finally { setBusy(null); }
  }
  async function remove() {
    if (!orgId || !record || !canManage || linkedHistory || busy) return; setBusy('delete'); setError(null);
    try { const result = await crmDb.from(kind).delete().eq('org_id', orgId).eq('id', record.id).select('id').single(); if (result.error) throw result.error;
      await cache.invalidateQueries({ queryKey: ['crm'] }); toast.success('Cadastro excluído'); onClose();
    } catch (cause) { setError(relationshipError(cause)); setDeleteOpen(false); } finally { setBusy(null); }
  }
  const contact = record && 'first_name' in record ? record : null;
  const company = record && 'name' in record ? record : null;
  const companyLink = contact?.company_id ? data.companies.find(c => c.id === contact.company_id) : null;
  const website = safeWebsite(company?.website ?? null);
  return <><SidePanel open onOpenChange={open => { if (!open && !busy) onClose(); }} title={record ? recordName(record) : 'Cadastro indisponível'} description="Relacionamento 360 · histórico e próximos passos" kicker={kind === 'contacts' ? 'Contato' : 'Empresa'} width="lg">
    {!record ? <EmptyState icon={CircleHelp} title="Cadastro não encontrado ou sem acesso" description="O link pode estar incorreto, o registro pode ter sido removido ou seu acesso pode ter mudado." action={<Button variant="outline" onClick={onClose}>Voltar à lista</Button>} /> : <div className="space-y-6">
      <section data-tour="360-summary" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-muted-foreground" /><span>{owner?.name || owner?.email || (record.owner_id ? 'Responsável indisponível' : 'Sem responsável')}</span></div>{canWrite && <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" />Editar cadastro</Button>}</div>
        <dl className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-2">
          {contact && <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd className="mt-1 break-all">{contact.email ? <a className="text-primary hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> : 'Não informado'}</dd></div>}
          <div><dt className="text-xs text-muted-foreground">Telefone</dt><dd className="mt-1">{record.phone ? <a href={`tel:${record.phone.replace(/[^+\d]/g, '')}`} className="text-primary hover:underline">{record.phone}</a> : 'Não informado'}</dd></div>
          {contact && <><div><dt className="text-xs text-muted-foreground">Empresa</dt><dd className="mt-1">{companyLink ? <Link className="text-primary hover:underline" to={`/companies?company=${companyLink.id}`}>{companyLink.name}</Link> : 'Sem empresa'}</dd></div><div><dt className="text-xs text-muted-foreground">Relacionamento</dt><dd className="mt-1">{CONTACT_STATUS_LABELS[contact.status ?? ''] ?? contact.status ?? 'Não informado'}</dd></div></>}
          {company && <><div><dt className="text-xs text-muted-foreground">Segmento</dt><dd className="mt-1">{company.industry || 'Não informado'}</dd></div><div><dt className="text-xs text-muted-foreground">Site</dt><dd className="mt-1 break-all">{website ? <a href={website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{company.website}</a> : 'Não informado'}</dd></div></>}
          <div><dt className="text-xs text-muted-foreground">Criado em</dt><dd className="mt-1">{displayDate(record.created_at)}</dd></div>
        </dl>{!canWrite && <p className="text-xs text-muted-foreground">Seu papel permite consultar o histórico. Um editor pode atualizar o cadastro e as atividades.</p>}
      </section>
      <section data-tour="360-next-action" className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4" />Próxima ação</h2>{canWrite && <Button size="sm" variant="outline" onClick={() => setActivityEditor({})}><Plus className="mr-1 h-3.5 w-3.5" />Criar ação</Button>}</div>
        {related.next ? <><p className="text-sm font-medium">{related.next.title}</p><p className={`mt-1 text-xs ${Date.parse(related.next.due_date!) < Date.now() ? 'text-destructive' : 'text-muted-foreground'}`}>{Date.parse(related.next.due_date!) < Date.now() ? 'Vencida · ' : ''}{displayDate(related.next.due_date)} · {data.members.find(m => m.id === related.next?.user_id)?.name || 'Sem responsável'}</p>{canWrite && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!!busy} onClick={() => void toggleActivity(related.next!)}><Check className="mr-1 h-3.5 w-3.5" />{busy === related.next.id ? 'Salvando…' : 'Concluir'}</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setActivityEditor({ activity: related.next! })}>Reagendar</Button></div>}</> : <p className="text-sm text-muted-foreground">Sem próxima ação com prazo. Defina um retorno para manter o relacionamento em movimento.</p>}
        <p className="mt-3 text-[11px] text-muted-foreground">Atividade pendente com o menor prazo entre os vínculos desta ficha. Notas não contam como próxima ação.</p>
      </section>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      <section data-tour="360-timeline" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Histórico de relacionamento</h2>{canWrite && <Button variant="outline" size="sm" onClick={() => setActivityEditor({ initialType: 'note' })}><FileText className="mr-1 h-3.5 w-3.5" />Registrar nota</Button>}</div><Select value={timelineFilter} onValueChange={setTimelineFilter}><SelectTrigger aria-label="Filtrar histórico" className="w-full sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo o histórico</SelectItem><SelectItem value="pending">Ações pendentes</SelectItem><SelectItem value="completed">Ações concluídas</SelectItem><SelectItem value="note">Notas</SelectItem><SelectItem value="meeting">Reuniões</SelectItem></SelectContent></Select>
        {visible.length ? <ol className="divide-y rounded-xl border">{visible.map(activity => <li key={activity.id} id={`activity-${activity.id}`} className="space-y-2 p-4"><div className="flex flex-wrap justify-between gap-2"><span className="text-[11px] font-medium text-muted-foreground">{ACTIVITY_LABELS[activity.type] ?? 'Atividade'} · {activity.type === 'note' ? 'Registrada' : activity.completed_at ? 'Concluída' : 'Pendente'}</span><time className="text-[11px] text-muted-foreground">{displayDate(activity.created_at)}</time></div><h3 className="text-sm font-medium">{activity.title}</h3>{activity.body && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{activity.body}</p>}<p className="text-xs text-muted-foreground">{activity.type !== 'note' && `${displayDate(activity.due_date)} · `}{data.members.find(m => m.id === activity.user_id)?.name || 'Sem responsável'}</p>{canWrite && <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setActivityEditor({ activity })}><Pencil className="mr-1 h-3 w-3" />Editar</Button>{activity.type !== 'note' && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void toggleActivity(activity)}>{activity.completed_at ? <Undo2 className="mr-1 h-3 w-3" /> : <Check className="mr-1 h-3 w-3" />}{busy === activity.id ? 'Salvando…' : activity.completed_at ? 'Reabrir' : 'Concluir'}</Button>}</div>}</li>)}</ol> : <EmptyState icon={FileText} title={related.activities.length ? 'Nenhuma atividade neste filtro' : 'O histórico começa aqui'} description={related.activities.length ? 'Escolha outro filtro para ver as demais atividades.' : 'Registre uma nota, reunião ou próximo passo neste relacionamento.'} />}
      </section>
      <section data-tour="360-deals" className="space-y-3"><h2 className="text-sm font-semibold">Oportunidades · {related.deals.length}</h2>{related.deals.length ? <ul className="divide-y rounded-xl border">{related.deals.map(deal => <li key={deal.id}><Link to={`/pipeline?deal=${deal.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40"><span className="min-w-0"><span className="block truncate text-sm font-medium">{deal.title}</span><span className="text-xs text-muted-foreground">{({ open: 'Em aberto', won: 'Ganha', lost: 'Perdida' } as Record<string, string>)[deal.status ?? ''] ?? deal.status ?? 'Sem situação'}</span></span><span className="shrink-0 text-sm tabular-nums">{deal.value === null ? 'Sem valor' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: /^[A-Z]{3}$/.test(deal.currency ?? '') ? deal.currency! : 'BRL' }).format(deal.value)}</span></Link></li>)}</ul> : <EmptyState icon={Handshake} title="Nenhuma oportunidade vinculada" description="Vincule uma oportunidade a este relacionamento no pipeline." action={<Button asChild size="sm" variant="outline"><Link to="/pipeline">Abrir pipeline</Link></Button>} />}</section>
      {kind === 'companies' && <section className="space-y-3"><h2 className="text-sm font-semibold">Pessoas da empresa · {related.contacts.length}</h2>{related.contacts.length ? <ul className="divide-y rounded-xl border">{related.contacts.map(c => <li key={c.id}><Link className="block p-3 text-sm text-primary hover:bg-muted/40" to={`/contacts?contact=${c.id}`}>{contactName(c)}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum contato vinculado a esta empresa.</p>}</section>}
      {canManage && <div className="border-t pt-4"><Button variant="ghost" className="text-destructive" size="sm" disabled={linkedHistory || !!busy} onClick={() => setDeleteOpen(true)}><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir cadastro</Button>{linkedHistory && <p className="mt-1 text-xs text-muted-foreground">A exclusão está indisponível porque existem contatos, atividades ou oportunidades vinculadas. Preserve este histórico.</p>}</div>}
    </div>}
  </SidePanel>{record && activityEditor && <ActivityEditor key={activityEditor.activity?.id ?? activityEditor.initialType ?? 'new'} kind={kind} recordId={record.id} ownerId={record.owner_id} data={data} {...activityEditor} onClose={() => setActivityEditor(null)} />}
  <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Excluir este cadastro?" description="Esta ação remove permanentemente o cadastro. Você só pode excluir registros sem vínculos comerciais." confirmLabel="Excluir cadastro" onConfirm={remove} loading={busy === 'delete'} />
  </>;
}

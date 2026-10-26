import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useOrg } from '@/hooks/useOrg';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { PageScaffold } from '@/components/shell/PageScaffold';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Textarea } from '@/components/ds/textarea';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/foundation/EmptyState';
import { LoadingState } from '@/components/foundation/LoadingState';
import { Panel, PanelBody } from '@/components/foundation/Panel';
import { StatusChip } from '@/components/foundation/StatusChip';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import { TemplateForm, type TemplateDraft } from '@/components/operations/TemplateForm';
import { allRows, errorMessage } from '@/components/operations/data';
import { normalizeSearch, type Template } from '@/lib/operation-logic';

export default function Templates() { const { orgId } = useOrg(); return orgId ? <TemplatesContent key={orgId} orgId={orgId} /> : <PageScaffold title="Modelos"><EmptyState icon={FileText} title="Organização indisponível" description="Entre em uma organização para consultar os modelos." /></PageScaffold>; }
function TemplatesContent({ orgId }: { orgId: string }) {
  const { canWrite, canManage, loading: permissionsLoading } = useCrmPermissions(); const queryClient = useQueryClient(); const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<Template | 'create' | null>(null); const [removing, setRemoving] = useState<Template | null>(null); const [busy, setBusy] = useState(false); const [deleteError, setDeleteError] = useState('');
  const query = useQuery({ queryKey: ['crm', orgId, 'templates'], queryFn: () => allRows((from, to) => crmDb.from('email_templates').select('*').eq('org_id', orgId).order('name').order('id').range(from, to)) });
  const search = params.get('q') || ''; const selected = query.data?.find(template => template.id === params.get('template'));
  const filtered = (query.data ?? []).filter(template => normalizeSearch(`${template.name} ${template.subject} ${template.body}`).includes(normalizeSearch(search)));
  const update = (key: string, value: string, replace = false) => setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; }, { replace });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm'] });
  const copy = async (template: Template) => { try { if (!navigator.clipboard) throw new Error('Copie o texto selecionando-o no detalhe do modelo.'); await navigator.clipboard.writeText([template.subject, template.body].filter(Boolean).join('\n\n')); toast.success('Rascunho copiado. Revise e personalize antes de usar.'); } catch { update('template', template.id); toast.error('Não foi possível copiar automaticamente. Selecione o texto no detalhe e use Copiar.'); } };
  const save = async (draft: TemplateDraft) => {
    if (!canWrite) throw new Error('Você não tem permissão para editar modelos.');
    const fields = { name: draft.name.trim(), subject: draft.subject.trim(), body: draft.body.trim() };
    if (form && form !== 'create') { const { data, error } = await crmDb.from('email_templates').update(fields).eq('id', form.id).eq('org_id', orgId).eq('updated_at', form.updated_at).select('id').maybeSingle(); if (error) throw error; if (!data) throw new Error('O modelo mudou ou está indisponível. Atualize a lista e tente novamente.'); }
    else { const { data, error } = await crmDb.from('email_templates').insert({ ...fields, org_id: orgId }).select('id').single(); if (error) throw error; update('template', data.id); }
    await refresh(); toast.success('Modelo salvo.');
  };
  const remove = async () => { if (!removing || busy || !canManage) return; setBusy(true); setDeleteError(''); try { const { data, error } = await crmDb.from('email_templates').delete().eq('org_id', orgId).eq('id', removing.id).select('id'); if (error) throw error; if (!data?.length) throw new Error('Modelo indisponível para exclusão.'); setRemoving(null); update('template', ''); await refresh(); toast.success('Modelo excluído.'); } catch (error) { setDeleteError(errorMessage(error)); } finally { setBusy(false); } };
  return <PageScaffold title="Modelos" meta={<StatusChip>{filtered.length} rascunhos</StatusChip>} actions={canWrite && <Button size="sm" onClick={() => setForm('create')} disabled={query.isPending}><Plus className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Novo modelo</span><span className="sr-only sm:hidden">Novo modelo</span></Button>} toolbar={<Input className="max-w-md" value={search} onChange={event => update('q', event.target.value, true)} aria-label="Buscar modelo por nome, assunto ou texto" placeholder="Buscar por nome, assunto ou texto" />}>
    {query.isPending || permissionsLoading ? <LoadingState label="Carregando modelos…" /> : query.isError ? <EmptyState icon={AlertCircle} title="Não foi possível carregar os modelos" description={errorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>Tentar novamente</Button>} /> : <div className="space-y-5"><div><h2 className="text-lg font-semibold">Boas conversas merecem um ponto de partida.</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Rascunhos compartilhados com a equipe para copiar e personalizar. O envio externo ainda não está conectado.</p></div>{!canWrite && <p className="text-sm text-muted-foreground">Você pode consultar e copiar. A edição depende de permissão.</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(template => <Panel key={template.id}><PanelBody className="flex h-full flex-col gap-3"><button type="button" onClick={() => update('template', template.id)} className="rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block text-sm font-semibold">{template.name}</span>{template.subject && <span className="mt-1 block text-xs text-muted-foreground">{template.subject}</span>}</button><p className="line-clamp-4 flex-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{template.body}</p><p className="text-[11px] text-muted-foreground">Atualizado {new Date(template.updated_at).toLocaleDateString('pt-BR')}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void copy(template)}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar texto</Button>{canWrite && <Button variant="ghost" size="sm" onClick={() => setForm(template)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>}</div></PanelBody></Panel>)}</div>{!filtered.length && <EmptyState icon={FileText} title={search ? 'Nenhum modelo com esse termo' : 'Sua biblioteca começa com um rascunho'} description="Salve textos que a equipe usa no acompanhamento comercial." action={search ? <Button variant="outline" onClick={() => update('q', '')}>Limpar busca</Button> : canWrite ? <Button onClick={() => setForm('create')}>Criar modelo</Button> : undefined} />}</div>}
    {params.get('template') && !query.isPending && !query.isError && !form && <SidePanel open title={selected?.name ?? 'Modelo indisponível'} description={selected ? 'Rascunho reutilizável. Revise antes de usar.' : 'O registro foi removido ou você não tem acesso.'} width="lg" onOpenChange={open => !open && update('template', '')} footer={selected && <>{canManage && <Button className="mr-auto text-destructive" variant="ghost" onClick={() => { setDeleteError(''); setRemoving(selected); }}><Trash2 className="mr-1.5 h-4 w-4" />Excluir</Button>}{canWrite && <Button variant="outline" onClick={() => setForm(selected)}>Editar</Button>}<Button onClick={() => void copy(selected)}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button></>}>
      {selected && <div className="space-y-4"><div className="space-y-1.5"><Label htmlFor="template-view-subject">Assunto</Label><Input id="template-view-subject" readOnly value={selected.subject} /></div><div className="space-y-1.5"><Label htmlFor="template-view-body">Texto</Label><Textarea id="template-view-body" readOnly value={selected.body} rows={16} onFocus={event => event.target.select()} /></div></div>}
    </SidePanel>}
    {form && <TemplateForm key={form === 'create' ? 'new' : form.id} template={form === 'create' ? undefined : form} onClose={() => setForm(null)} onSave={save} />}
    <ConfirmDialog open={!!removing} onOpenChange={open => !open && setRemoving(null)} title="Excluir modelo?" description={<>“{removing?.name}” será removido da biblioteca da organização.{deleteError && <span role="alert" className="mt-2 block text-destructive">{deleteError}</span>}</>} confirmLabel="Excluir modelo" loading={busy} onConfirm={remove} />
  </PageScaffold>;
}

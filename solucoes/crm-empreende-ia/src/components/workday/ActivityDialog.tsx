import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useOrg } from '@/hooks/useOrg';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Textarea } from '@/components/ds/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ds/dialog';
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from '@/components/ds/select';
import { ACTIVITY_LABELS, contactName, localDateTime, relationshipError, type RelationshipData } from '@/lib/contact-model';
import { rescheduledEnd, type Activity } from '@/lib/activity-logic';
import { toast } from 'sonner';
export interface ActivityDefaults { title?: string; body?: string; type?: string; contact_id?: string | null; company_id?: string | null; deal_id?: string | null; user_id?: string | null; due_date?: string | null }
interface Props { data: RelationshipData; activity?: Activity; defaults?: ActivityDefaults; onClose: () => void; onSaved?: (id: string) => void }
export function ActivityDialog({ data, activity: initialActivity, defaults = {}, onClose, onSaved }: Props) {
  const { orgId } = useOrg(); const { user } = useAuth(); const { canWrite } = useCrmPermissions(); const cache = useQueryClient();
  // The form and its version must stay together when a background query refreshes.
  const [activity] = useState(initialActivity);
  const [type, setType] = useState(activity?.type ?? defaults.type ?? 'task'), [title, setTitle] = useState(activity?.title ?? defaults.title ?? ''), [body, setBody] = useState(activity?.body ?? defaults.body ?? '');
  const [date, setDate] = useState(localDateTime(activity?.due_date ?? defaults.due_date ?? null));
  const [end, setEnd] = useState(() => localDateTime(activity?.end_date ?? (['meeting', 'call'].includes(activity?.type ?? defaults.type ?? '') && (activity?.due_date ?? defaults.due_date) ? rescheduledEnd({ due_date: null, end_date: null }, (activity?.due_date ?? defaults.due_date)!) : null)));
  const [owner, setOwner] = useState(activity ? activity.user_id ?? '' : defaults.user_id ?? user?.id ?? '');
  const [contact, setContact] = useState(activity?.contact_id ?? defaults.contact_id ?? ''), [company, setCompany] = useState(activity?.company_id ?? defaults.company_id ?? ''), [deal, setDeal] = useState(activity?.deal_id ?? defaults.deal_id ?? '');
  const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const appointment = type === 'meeting' || type === 'call';
  function changeStart(value: string) {
    if (appointment && value && Number.isFinite(new Date(value).getTime())) setEnd(localDateTime(rescheduledEnd({ due_date: date ? new Date(date).toISOString() : null, end_date: end ? new Date(end).toISOString() : null }, new Date(value).toISOString())));
    setDate(value);
  }
  function changeType(value: string) { setType(value); if (['meeting', 'call'].includes(value) && date && !end) setEnd(localDateTime(rescheduledEnd({ due_date: null, end_date: null }, new Date(date).toISOString()))); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!orgId || !user || !canWrite || saving) return;
    if (!title.trim()) { setError('Informe um título para esta atividade.'); return; }
    if (type !== 'note' && date && !Number.isFinite(new Date(date).getTime()) || appointment && (!date || !end || !Number.isFinite(new Date(end).getTime()) || new Date(end).getTime() <= new Date(date).getTime())) { setError('Informe um início válido e um término posterior ao início para o compromisso.'); return; }
    setSaving(true); setError(null);
    try {
      const payload = { org_id: orgId, title: title.trim(), body: body.trim() || null, type, user_id: owner || null,
        due_date: type === 'note' || !date ? null : new Date(date).toISOString(), end_date: appointment && end ? new Date(end).toISOString() : null,
        ...(!activity ? { completed_at: type === 'note' ? new Date().toISOString() : null }
          : type === 'note' && activity.type !== 'note' ? { completed_at: new Date().toISOString() }
            : type !== 'note' && activity.type === 'note' ? { completed_at: null } : {}),
        contact_id: contact || null, company_id: company || null, deal_id: deal || null };
      const result = activity ? await crmDb.from('activities').update(payload).eq('org_id', orgId).eq('id', activity.id).eq('updated_at', activity.updated_at).select('id').maybeSingle()
        : await crmDb.from('activities').insert({ ...payload, created_by: user.id }).select('id').single();
      if (result.error) throw result.error;
      if (!result.data) {
        setError('Esta atividade mudou ou não está mais disponível. Seu preenchimento foi preservado; copie suas alterações e reabra a atividade para revisar os dados atuais.');
        await cache.invalidateQueries({ queryKey: ['crm'] });
        return;
      }
      await cache.invalidateQueries({ queryKey: ['crm'] }); toast.success(activity ? 'Atividade atualizada' : type === 'note' ? 'Nota registrada' : 'Atividade criada'); if (onSaved) onSaved(result.data.id); else onClose();
    } catch (cause) { setError(relationshipError(cause)); } finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>{activity ? 'Editar atividade' : type === 'note' ? 'Registrar nota' : 'Nova atividade'}</DialogTitle><DialogDescription>Uma atividade pode se conectar a pessoas, empresas e oportunidades. Campos com * são obrigatórios.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
    <div className="space-y-1.5"><Label htmlFor="workday-activity-type">Tipo</Label><Select value={type} onValueChange={changeType}><SelectTrigger id="workday-activity-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACTIVITY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1.5"><Label htmlFor="workday-activity-title">Título *</Label><Input id="workday-activity-title" autoFocus required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'note' ? 'Ex.: Contexto da conversa' : 'Ex.: Retornar sobre a proposta'} /></div>
    <div className="space-y-1.5"><Label htmlFor="workday-activity-body">Detalhes</Label><Textarea id="workday-activity-body" rows={3} maxLength={10000} value={body} onChange={e => setBody(e.target.value)} /></div>
    {type !== 'note' && <div className="space-y-2"><div className={appointment ? 'grid gap-3 sm:grid-cols-2' : ''}><div className="space-y-1.5"><Label htmlFor="workday-activity-date">{appointment ? 'Início *' : 'Prazo'}</Label><Input id="workday-activity-date" type="datetime-local" required={appointment} value={date} onChange={e => changeStart(e.target.value)} /></div>{appointment && <div className="space-y-1.5"><Label htmlFor="workday-activity-end">Término *</Label><Input id="workday-activity-end" type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)} /></div>}</div><p className="text-xs text-muted-foreground">Horário local deste dispositivo.{!appointment && ' Sem prazo, a atividade aparece em “Sem data” e não conta como próxima ação.'}{appointment && date && end && new Date(end) > new Date(date) ? ` Duração: ${Math.round((new Date(end).getTime() - new Date(date).getTime()) / 60000)} min.` : ''}</p></div>}
    <div className="space-y-1.5"><Label htmlFor="workday-activity-owner">Responsável</Label><Select value={owner || 'none'} onValueChange={v => setOwner(v === 'none' ? '' : v)}><SelectTrigger id="workday-activity-owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{data.members.map(m => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}</SelectContent></Select></div>
    <fieldset className="space-y-3 rounded-lg border p-3"><legend className="px-1 text-xs font-semibold">Vínculos</legend><div className="space-y-1.5"><Label htmlFor="workday-activity-contact">Contato</Label><Select value={contact || 'none'} onValueChange={v => setContact(v === 'none' ? '' : v)}><SelectTrigger id="workday-activity-contact"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem contato</SelectItem>{data.contacts.map(c => <SelectItem key={c.id} value={c.id}>{contactName(c)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="workday-activity-company">Empresa</Label><Select value={company || 'none'} onValueChange={v => setCompany(v === 'none' ? '' : v)}><SelectTrigger id="workday-activity-company"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem empresa</SelectItem>{data.companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="workday-activity-deal">Oportunidade</Label><Select value={deal || 'none'} onValueChange={v => setDeal(v === 'none' ? '' : v)}><SelectTrigger id="workday-activity-deal"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem oportunidade</SelectItem>{data.deals.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select></div></fieldset>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {!canWrite && <p className="text-xs text-muted-foreground">Seu papel permite somente consulta.</p>}
    <DialogFooter><Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving || !canWrite}>{saving ? 'Salvando…' : 'Salvar atividade'}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

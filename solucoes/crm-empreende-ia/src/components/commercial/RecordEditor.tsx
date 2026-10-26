import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { crmDb } from '@/integrations/supabase/crm-client';
import { useOrg } from '@/hooks/useOrg';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmPermissions } from '@/hooks/useCrmPermissions';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ds/dialog';
import { Select, SelectTrigger, SelectContent, SelectValue, SelectItem } from '@/components/ds/select';
import { CONTACT_STATUS_LABELS, relationshipError, safeWebsite, type Company, type Contact, type DirectoryKind, type RelationshipData } from '@/lib/contact-model';
import { toast } from 'sonner';

interface Props { kind: DirectoryKind; record?: Contact | Company; data: RelationshipData; onClose: () => void; onSaved: (id: string) => void }
export function RecordEditor({ kind, record, data, onClose, onSaved }: Props) {
  const { orgId } = useOrg(); const { user } = useAuth(); const { canWrite } = useCrmPermissions(); const cache = useQueryClient();
  const contact = record && 'first_name' in record ? record : undefined;
  const company = record && 'name' in record ? record : undefined;
  const [form, setForm] = useState({ first_name: contact?.first_name ?? '', last_name: contact?.last_name ?? '', email: contact?.email ?? '', phone: record?.phone ?? '', company_id: contact?.company_id ?? '', owner_id: record ? record.owner_id ?? '' : user?.id ?? '', status: contact?.status ?? 'lead', name: company?.name ?? '', industry: company?.industry ?? '', website: company?.website ?? '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const change = (key: keyof typeof form, value: string) => setForm(v => ({ ...v, [key]: value }));
  const nullable = (value: string) => value.trim() || null;
  async function save(event: FormEvent) {
    event.preventDefault(); if (!orgId || !user || !canWrite || saving) return;
    if (!(kind === 'contacts' ? form.first_name : form.name).trim()) { setError('Informe um nome para este cadastro.'); return; }
    if (kind === 'companies' && form.website && !safeWebsite(form.website)) { setError('Informe um site válido com protocolo HTTP ou HTTPS.'); return; }
    setSaving(true); setError(null);
    try {
      const common = { org_id: orgId, phone: nullable(form.phone), owner_id: nullable(form.owner_id) };
      const request = kind === 'contacts' ? (() => {
        const payload = { ...common, first_name: form.first_name.trim(), last_name: nullable(form.last_name), email: nullable(form.email), company_id: nullable(form.company_id), status: form.status };
        return record ? crmDb.from('contacts').update(payload).eq('org_id', orgId).eq('id', record.id).select('id').single() : crmDb.from('contacts').insert(payload).select('id').single();
      })() : (() => {
        const payload = { ...common, name: form.name.trim(), industry: nullable(form.industry), website: form.website ? safeWebsite(form.website) : null };
        return record ? crmDb.from('companies').update(payload).eq('org_id', orgId).eq('id', record.id).select('id').single() : crmDb.from('companies').insert(payload).select('id').single();
      })();
      const result = await request; if (result.error) throw result.error;
      await cache.invalidateQueries({ queryKey: ['crm'] }); toast.success(record ? 'Cadastro atualizado' : 'Cadastro criado'); onSaved(result.data.id);
    } catch (cause) { setError(relationshipError(cause)); } finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>{record ? 'Editar' : 'Novo'} {kind === 'contacts' ? 'contato' : 'cadastro de empresa'}</DialogTitle><DialogDescription>Dados de relacionamento da sua organização. Campos com * são obrigatórios.</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      {kind === 'contacts' ? <><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="record-first">Nome *</Label><Input id="record-first" required maxLength={100} autoFocus value={form.first_name} onChange={e => change('first_name', e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="record-last">Sobrenome</Label><Input id="record-last" maxLength={150} value={form.last_name} onChange={e => change('last_name', e.target.value)} /></div></div><div className="space-y-1.5"><Label htmlFor="record-email">E-mail</Label><Input id="record-email" type="email" maxLength={254} value={form.email} onChange={e => change('email', e.target.value)} /></div></> : <><div className="space-y-1.5"><Label htmlFor="record-name">Nome da empresa *</Label><Input id="record-name" required maxLength={200} autoFocus value={form.name} onChange={e => change('name', e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="record-industry">Segmento</Label><Input id="record-industry" maxLength={150} value={form.industry} onChange={e => change('industry', e.target.value)} placeholder="Ex.: tecnologia, educação, serviços" /></div><div className="space-y-1.5"><Label htmlFor="record-website">Site</Label><Input id="record-website" inputMode="url" maxLength={500} value={form.website} onChange={e => change('website', e.target.value)} placeholder="https://empresa.com.br" /></div></>}
      <div className="space-y-1.5"><Label htmlFor="record-phone">Telefone</Label><Input id="record-phone" type="tel" maxLength={40} value={form.phone} onChange={e => change('phone', e.target.value)} /></div>
      {kind === 'contacts' && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="record-company">Empresa</Label><Select value={form.company_id || 'none'} onValueChange={v => change('company_id', v === 'none' ? '' : v)}><SelectTrigger id="record-company"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem empresa</SelectItem>{data.companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="record-status">Relacionamento</Label><Select value={form.status} onValueChange={v => change('status', v)}><SelectTrigger id="record-status"><SelectValue /></SelectTrigger><SelectContent>{!Object.keys(CONTACT_STATUS_LABELS).includes(form.status) && <SelectItem value={form.status}>{form.status}</SelectItem>}{Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>}
      <div className="space-y-1.5"><Label htmlFor="record-owner">Responsável</Label><Select value={form.owner_id || 'none'} onValueChange={v => change('owner_id', v === 'none' ? '' : v)}><SelectTrigger id="record-owner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{data.members.map(m => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}</SelectContent></Select></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {!canWrite && <p className="text-sm text-muted-foreground">Seu papel permite apenas consulta.</p>}
      <DialogFooter><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button><Button disabled={saving || !canWrite} type="submit">{saving ? 'Salvando…' : 'Salvar cadastro'}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

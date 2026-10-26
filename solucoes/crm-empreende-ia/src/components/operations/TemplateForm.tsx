import { useState } from 'react';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Textarea } from '@/components/ds/textarea';
import { Label } from '@/components/ui/label';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import type { Template } from '@/lib/operation-logic';
import { errorMessage } from './data';
export type TemplateDraft = { name: string; subject: string; body: string };
export function TemplateForm({ template, onClose, onSave }: { template?: Template; onClose: () => void; onSave: (draft: TemplateDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<TemplateDraft>({ name: template?.name ?? '', subject: template?.subject ?? '', body: template?.body ?? '' });
  const [initial] = useState(() => JSON.stringify(draft));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [discard, setDiscard] = useState(false);
  const change = (key: keyof TemplateDraft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const close = () => { if (busy) return; if (initial !== JSON.stringify(draft)) setDiscard(true); else onClose(); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; if (!draft.name.trim() || !draft.body.trim()) { setError('Preencha o nome e o texto do modelo.'); return; } setBusy(true); setError(''); try { await onSave(draft); onClose(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } };
  return <><SidePanel open onOpenChange={open => !open && close()} title={template ? 'Editar modelo' : 'Novo modelo'} description="Guarde um rascunho para reutilizar em suas conversas." width="lg" footer={<><Button variant="ghost" disabled={busy} onClick={close}>Cancelar</Button><Button type="submit" form="template-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar modelo'}</Button></>}><form id="template-form" onSubmit={save} className="space-y-4" noValidate>{error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}<div className="space-y-1.5"><Label htmlFor="template-name">Nome do modelo *</Label><Input id="template-name" value={draft.name} onChange={event => change('name', event.target.value)} maxLength={120} disabled={busy} autoFocus placeholder="Ex.: Retorno após proposta" /></div><div className="space-y-1.5"><Label htmlFor="template-subject">Assunto (opcional)</Label><Input id="template-subject" value={draft.subject} onChange={event => change('subject', event.target.value)} maxLength={180} disabled={busy} /></div><div className="space-y-1.5"><Label htmlFor="template-body">Texto do rascunho *</Label><Textarea id="template-body" value={draft.body} onChange={event => change('body', event.target.value)} rows={12} maxLength={20000} disabled={busy} placeholder="Escreva o texto que sua equipe poderá revisar e reutilizar." /></div><p className="text-xs text-muted-foreground">O modelo é copiado como texto. Personalize os nomes, condições e demais informações antes de usá-lo. O envio externo ainda não está conectado.</p></form></SidePanel><ConfirmDialog open={discard} onOpenChange={setDiscard} title="Descartar alterações?" description="O texto ainda não salvo será descartado." confirmLabel="Descartar" onConfirm={onClose} /></>;
}

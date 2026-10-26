import { useState } from 'react';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ds/select';
import { Label } from '@/components/ui/label';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import { AUTOMATION_TRIGGER_LABELS, validateAutomation, type Automation } from '@/lib/operation-logic';
import { errorMessage } from './data';
export type AutomationDraft = { name: string; trigger_type: string; task_title: string; due_days: string };
export function AutomationForm({ automation, onClose, onSave }: { automation?: Automation; onClose: () => void; onSave: (draft: AutomationDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<AutomationDraft>({ name: automation?.name ?? '', trigger_type: automation?.trigger_type ?? 'deal_created', task_title: automation?.task_title ?? '', due_days: String(automation?.due_days ?? 1) });
  const [initial] = useState(() => JSON.stringify(draft));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [discard, setDiscard] = useState(false);
  const change = (key: keyof AutomationDraft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const close = () => { if (busy) return; if (JSON.stringify(draft) !== initial) setDiscard(true); else onClose(); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; const validation = validateAutomation(draft); if (validation) { setError(validation); return; } setBusy(true); setError(''); try { await onSave(draft); onClose(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); } };
  return <><SidePanel open onOpenChange={open => !open && close()} title={automation ? 'Editar automação' : 'Nova automação'} description="Transforme eventos comerciais em tarefas para a equipe." footer={<><Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button><Button type="submit" form="automation-form" disabled={busy}>{busy ? 'Salvando…' : automation?.is_active ? 'Salvar e pausar' : 'Salvar rascunho'}</Button></>}>
    <form id="automation-form" onSubmit={save} className="space-y-5" noValidate>{error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      <div className="space-y-1.5"><Label htmlFor="automation-name">Nome *</Label><Input id="automation-name" value={draft.name} onChange={event => change('name', event.target.value)} maxLength={120} disabled={busy} autoFocus placeholder="Ex.: Primeiro retorno" /></div>
      <div className="space-y-1.5"><Label htmlFor="automation-trigger">Quando acontecer *</Label><Select value={draft.trigger_type} onValueChange={value => change('trigger_type', value)} disabled={busy}><SelectTrigger id="automation-trigger"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(AUTOMATION_TRIGGER_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>{draft.trigger_type === 'deal_moved' && <p className="text-xs text-muted-foreground">Se a oportunidade também for marcada como ganha na mesma alteração, o gatilho usado é Oportunidade ganha.</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="automation-task">Criar uma tarefa com o título *</Label><Input id="automation-task" value={draft.task_title} onChange={event => change('task_title', event.target.value)} maxLength={180} disabled={busy} placeholder="Ex.: Combinar o próximo passo com o contato" /></div>
      <div className="space-y-1.5"><Label htmlFor="automation-days">Prazo após o evento (dias) *</Label><Input id="automation-days" type="number" min="0" max="365" step="1" value={draft.due_days} onChange={event => change('due_days', event.target.value)} disabled={busy} /><p className="text-xs text-muted-foreground">0 significa no momento do evento. A tarefa recebe o responsável da oportunidade; se ela não tiver responsável, a tarefa ficará sem responsável.</p></div>
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm"><p className="font-semibold">Revisão antes de ativar</p><p className="mt-1 text-muted-foreground">O salvamento mantém a automação pausada. Depois, revise o resumo e confirme a ativação para novos eventos em toda a organização.</p></div>
    </form>
  </SidePanel><ConfirmDialog open={discard} onOpenChange={setDiscard} title="Descartar alterações?" description="O rascunho ainda não salvo será descartado." confirmLabel="Descartar" onConfirm={onClose} /></>;
}

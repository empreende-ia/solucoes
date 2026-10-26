import { useState } from 'react';
import { Button } from '@/components/ds/button';
import { Input } from '@/components/ds/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ds/select';
import { Label } from '@/components/ui/label';
import { SidePanel } from '@/components/foundation/SidePanel';
import { ConfirmDialog } from '@/components/foundation/ConfirmDialog';
import { PAYMENT_LABELS, paymentDraft, validatePayment, type Payment, type PaymentDraft } from '@/lib/operation-logic';
import { errorMessage, type OperationReferences } from './data';

export function PaymentForm({ payment, references, onClose, onSave }: { payment?: Payment; references: OperationReferences; onClose: () => void; onSave: (draft: PaymentDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(() => paymentDraft(payment));
  const [initial] = useState(() => JSON.stringify(paymentDraft(payment)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const change = (key: keyof PaymentDraft, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const close = () => { if (busy) return; if (JSON.stringify(draft) !== initial) setDiscard(true); else onClose(); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; const validation = validatePayment(draft); if (validation) { setError(validation); return; } setBusy(true); setError(''); try { await onSave(draft); onClose(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } };
  return <><SidePanel open onOpenChange={open => !open && close()} title={payment ? 'Editar lançamento' : 'Novo lançamento'} description="Registre um recebimento ou um compromisso financeiro." footer={<><Button variant="ghost" onClick={close} disabled={busy}>Cancelar</Button><Button form="payment-form" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar lançamento'}</Button></>}>
    <form id="payment-form" className="space-y-4" onSubmit={save} noValidate>{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <div className="space-y-1.5"><Label htmlFor="payment-description">Descrição *</Label><Input id="payment-description" value={draft.description} onChange={event => change('description', event.target.value)} maxLength={180} disabled={busy} autoFocus placeholder="Ex.: Parcela do contrato de serviços" /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor="payment-amount">Valor *</Label><Input id="payment-amount" inputMode="decimal" value={draft.amount} onChange={event => change('amount', event.target.value)} disabled={busy} /></div><div className="space-y-1.5"><Label htmlFor="payment-currency">Moeda</Label><Input id="payment-currency" value="BRL · Real" readOnly aria-readonly="true" /></div></div>
      <div className="space-y-1.5"><Label htmlFor="payment-status">Situação</Label><Select value={draft.status} onValueChange={value => change('status', value)} disabled={busy}><SelectTrigger id="payment-status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="payment-due">Vencimento *</Label><Input id="payment-due" type="date" value={draft.due_date} onChange={event => change('due_date', event.target.value)} disabled={busy} /></div>
      {draft.status === 'paid' && <div className="space-y-1.5"><Label htmlFor="payment-paid">Recebido em *</Label><Input id="payment-paid" type="datetime-local" value={draft.paid_at} onChange={event => change('paid_at', event.target.value)} disabled={busy} /></div>}
      <div className="space-y-1.5"><Label htmlFor="payment-deal">Oportunidade</Label><Select value={draft.deal_id || 'none'} onValueChange={value => { const deal = references.deals.find(item => item.id === value); setDraft(current => ({ ...current, deal_id: value === 'none' ? '' : value, ...(deal ? { contact_id: deal.contact_id || '', company_id: deal.company_id || '' } : {}) })); }} disabled={busy}><SelectTrigger id="payment-deal"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem oportunidade vinculada</SelectItem>{references.deals.map(deal => <SelectItem key={deal.id} value={deal.id}>{deal.title}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="payment-contact">Contato</Label><Select value={draft.contact_id || 'none'} onValueChange={value => change('contact_id', value === 'none' ? '' : value)} disabled={busy}><SelectTrigger id="payment-contact"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem contato vinculado</SelectItem>{references.contacts.map(contact => <SelectItem key={contact.id} value={contact.id}>{[contact.first_name, contact.last_name].filter(Boolean).join(' ')}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor="payment-company">Empresa</Label><Select value={draft.company_id || 'none'} onValueChange={value => change('company_id', value === 'none' ? '' : value)} disabled={busy}><SelectTrigger id="payment-company"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem empresa vinculada</SelectItem>{references.companies.map(company => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}</SelectContent></Select></div>
    </form>
  </SidePanel><ConfirmDialog open={discard} onOpenChange={setDiscard} title="Descartar alterações?" description="Os campos ainda não salvos serão descartados." confirmLabel="Descartar" onConfirm={onClose} /></>;
}

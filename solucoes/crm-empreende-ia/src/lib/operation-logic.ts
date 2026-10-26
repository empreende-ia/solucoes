import type { CrmRow } from '@/integrations/supabase/commercial-types';
import { parseDealValue } from './deal-logic';
export type Payment = CrmRow<'payments'>;
export type Automation = CrmRow<'automations'>;
export type Template = CrmRow<'email_templates'>;
export const PAYMENT_LABELS: Record<string, string> = { pending: 'Pendente', paid: 'Recebido', cancelled: 'Cancelado' };
export const AUTOMATION_TRIGGER_LABELS: Record<string, string> = { deal_created: 'Oportunidade criada', deal_won: 'Oportunidade ganha', deal_moved: 'Oportunidade mudou de etapa' };
export function localDateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function normalizeSearch(text: string) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
export function dateInRange(date: string, from = '', to = '') { const day = date.slice(0, 10); return (!from || day >= from) && (!to || day <= to); }
export function paymentState(payment: Pick<Payment, 'status' | 'due_date'>, today = localDateKey()) { return payment.status === 'pending' && payment.due_date < today ? 'overdue' : payment.status; }
export function filterPayments(payments: Payment[], filter: { from: string; to: string; status: string; search: string; currency: string }, today = localDateKey()) {
  const search = normalizeSearch(filter.search);
  return payments.filter(payment => payment.currency === filter.currency && dateInRange(payment.due_date, filter.from, filter.to) && (filter.status === 'all' || paymentState(payment, today) === filter.status) && (!search || normalizeSearch(payment.description).includes(search)));
}
export function summarizePayments(payments: Payment[], today = localDateKey()) {
  const cents = { paid: 0, overdue: 0, pending: 0, cancelled: 0 };
  for (const payment of payments) {
    const state = paymentState(payment, today) as keyof typeof cents;
    if (Object.prototype.hasOwnProperty.call(cents, state)) cents[state] += Math.round(payment.amount * 100);
  }
  return Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, value / 100])) as typeof cents;
}
export type PaymentDraft = { description: string; amount: string; currency: string; status: string; due_date: string; paid_at: string; contact_id: string; company_id: string; deal_id: string };
export function paymentDraft(payment?: Payment): PaymentDraft {
  const datetime = payment?.paid_at ? new Date(payment.paid_at) : null;
  return { description: payment?.description ?? '', amount: String(payment?.amount ?? ''), currency: payment?.currency ?? 'BRL', status: payment?.status ?? 'pending', due_date: payment?.due_date ?? localDateKey(), paid_at: datetime ? `${localDateKey(datetime)}T${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}` : '', contact_id: payment?.contact_id ?? '', company_id: payment?.company_id ?? '', deal_id: payment?.deal_id ?? '' };
}
export function validatePayment(draft: PaymentDraft): string | null {
  if (!draft.description.trim()) return 'Descreva o lançamento.';
  const amount = parseDealValue(draft.amount);
  if (amount === null || amount <= 0) return 'Informe um valor maior que zero, com até duas casas decimais.';
  if (!['pending', 'paid', 'cancelled'].includes(draft.status)) return 'Selecione uma situação válida.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.due_date) || !Number.isFinite(Date.parse(draft.due_date)) || new Date(draft.due_date).toISOString().slice(0, 10) !== draft.due_date) return 'Informe uma data de vencimento válida.';
  if (draft.status === 'paid' && (!draft.paid_at || !Number.isFinite(Date.parse(draft.paid_at)))) return 'Informe quando o valor foi recebido.';
  if (draft.currency !== 'BRL') return 'Os lançamentos deste CRM são registrados em reais (BRL).';
  return null;
}
export function summarizeReport(deals: CrmRow<'deals'>[], stages: CrmRow<'pipeline_stages'>[]) {
  const probability = new Map(stages.map(stage => [stage.id, stage.win_probability]));
  const totals = { open: 0, won: 0, lost: 0, openValue: 0, wonValue: 0, lostValue: 0, forecast: 0 };
  for (const deal of deals) {
    const cents = Math.round(deal.value * 100);
    if (deal.status === 'open') { totals.open += 1; totals.openValue += cents; totals.forecast += cents * Math.max(0, Math.min(100, deal.probability ?? probability.get(deal.stage_id) ?? 0)) / 100; }
    if (deal.status === 'won') { totals.won += 1; totals.wonValue += cents; }
    if (deal.status === 'lost') { totals.lost += 1; totals.lostValue += cents; }
  }
  return { ...totals, openValue: totals.openValue / 100, wonValue: totals.wonValue / 100, lostValue: totals.lostValue / 100, forecast: Math.round(totals.forecast) / 100, winRate: totals.won + totals.lost ? totals.won / (totals.won + totals.lost) * 100 : null };
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function buildCsv(rows: unknown[][]) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'); }
export function downloadCsv(filename: string, rows: unknown[][]) { const url = URL.createObjectURL(new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function validateAutomation(draft: { name: string; trigger_type: string; task_title: string; due_days: string | number }): string | null {
  if (!draft.name.trim() || !draft.task_title.trim()) return 'Preencha o nome da automação e o título da tarefa.';
  if (!Object.prototype.hasOwnProperty.call(AUTOMATION_TRIGGER_LABELS, draft.trigger_type)) return 'Selecione um gatilho válido.';
  if (String(draft.due_days).trim() === '' || !Number.isInteger(Number(draft.due_days)) || Number(draft.due_days) < 0 || Number(draft.due_days) > 365) return 'O prazo deve ser um número inteiro entre 0 e 365 dias.';
  return null;
}

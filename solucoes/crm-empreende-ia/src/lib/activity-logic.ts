import type { CrmRow } from '@/integrations/supabase/commercial-types';
import { contactName, nextAction, relatedData, type RelationshipData } from '@/lib/contact-model';
export type Activity = CrmRow<'activities'>;
export type ActivityDateFilter = 'all' | 'today' | 'overdue' | 'upcoming' | 'no-date';
export function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
export function parseLocalDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number); const date = new Date(year, month - 1, day);
  return dateKey(date) === value ? date : null;
}
export function localDayBounds(date: Date) { return { start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() }; }
export function uniqueActivities(activities: Activity[]) { return [...new Map(activities.map(a => [a.id, a])).values()]; }
export function matchesDate(activity: Pick<Activity, 'due_date'>, filter: ActivityDateFilter, now: Date) {
  const due = activity.due_date ? Date.parse(activity.due_date) : NaN; const { start, end } = localDayBounds(now);
  if (filter === 'all') return true; if (filter === 'no-date') return !Number.isFinite(due);
  if (!Number.isFinite(due)) return false;
  if (filter === 'today') return due >= start && due < end;
  if (filter === 'overdue') return due < now.getTime();
  return due >= end;
}
export function activitySummary(activities: Activity[], now: Date) {
  const all = uniqueActivities(activities); const actions = all.filter(a => a.type !== 'note');
  const pending = actions.filter(a => !a.completed_at);
  return { pending, today: pending.filter(a => matchesDate(a, 'today', now)), overdue: pending.filter(a => matchesDate(a, 'overdue', now)), unscheduled: pending.filter(a => !a.due_date), completedToday: actions.filter(a => a.completed_at && matchesDate({ due_date: a.completed_at }, 'today', now)),
    dayQueue: pending.filter(a => a.due_date && Date.parse(a.due_date) < localDayBounds(now).end).sort(compareActivities),
  };
}
export function compareActivities(a: Activity, b: Activity) { const da = a.due_date ? Date.parse(a.due_date) : Infinity, db = b.due_date ? Date.parse(b.due_date) : Infinity; return (da < db ? -1 : da > db ? 1 : 0) || a.id.localeCompare(b.id); }
export function rescheduledEnd(activity: Pick<Activity, 'due_date' | 'end_date'>, start: string, durationMinutes = 60) {
  const oldStart = activity.due_date ? Date.parse(activity.due_date) : NaN, oldEnd = activity.end_date ? Date.parse(activity.end_date) : NaN;
  const duration = Number.isFinite(oldEnd - oldStart) && oldEnd > oldStart ? oldEnd - oldStart : durationMinutes * 60_000;
  return new Date(Date.parse(start) + duration).toISOString();
}
export function activityLinks(activity: Pick<Activity, 'contact_id' | 'company_id' | 'deal_id'>, data: RelationshipData) {
  const links: { label: string; path: string }[] = [];
  const contact = data.contacts.find(c => c.id === activity.contact_id); if (contact) links.push({ label: contactName(contact), path: `/contacts?contact=${contact.id}` });
  const company = data.companies.find(c => c.id === activity.company_id); if (company) links.push({ label: company.name, path: `/companies?company=${company.id}` });
  const deal = data.deals.find(d => d.id === activity.deal_id); if (deal) links.push({ label: deal.title, path: `/pipeline?deal=${deal.id}` });
  return links;
}
export interface AttentionReason { ruleId: string; label: string; explanation: string; priority: number }
export interface AttentionItem { key: string; title: string; path: string; reasons: AttentionReason[]; priority: number }
/** Rules explain each item; an entity appears once even when several rules match. */
export function attentionQueue(data: RelationshipData & { riskRules: CrmRow<'risk_rules'>[] }, now: Date): AttentionItem[] {
  const items = new Map<string, AttentionItem>();
  function add(key: string, title: string, path: string, rule: CrmRow<'risk_rules'>, explanation: string) {
    const prior = items.get(key); const reason = { ruleId: rule.id, label: rule.name, explanation, priority: rule.priority };
    if (prior) { prior.reasons.push(reason); prior.priority = Math.min(prior.priority, rule.priority); }
    else items.set(key, { key, title, path, reasons: [reason], priority: rule.priority });
  }
  const pending = uniqueActivities(data.activities as Activity[]).filter(a => a.type !== 'note' && !a.completed_at);
  const openDeals = data.deals.filter(d => d.status === 'open');
  for (const rule of data.riskRules.filter(r => r.enabled)) {
    if (rule.type === 'overdue') for (const a of pending.filter(a => a.due_date && Date.parse(a.due_date) < now.getTime())) add(`activity:${a.id}`, a.title, `/activities?activity=${a.id}`, rule, 'Atividade pendente com prazo anterior ao horário atual.');
    if (rule.type === 'no_owner') {
      for (const a of pending.filter(a => !a.user_id)) add(`activity:${a.id}`, a.title, `/activities?activity=${a.id}`, rule, 'Atividade pendente sem responsável definido.');
      for (const c of data.contacts.filter(c => !c.owner_id && c.status !== 'churned')) add(`contact:${c.id}`, contactName(c), `/contacts?contact=${c.id}`, rule, 'Contato ativo sem responsável pelo relacionamento.');
      for (const d of openDeals.filter(d => !d.owner_id)) add(`deal:${d.id}`, d.title, `/pipeline?deal=${d.id}`, rule, 'Oportunidade em aberto sem responsável.');
    }
    if (rule.type === 'no_next_action') {
      for (const c of data.contacts.filter(c => c.status !== 'churned')) if (!relatedData('contacts', c.id, data).next) add(`contact:${c.id}`, contactName(c), `/contacts?contact=${c.id}`, rule, 'Contato ativo sem atividade pendente com prazo, incluindo oportunidades vinculadas.');
      for (const d of openDeals) if (!nextAction(data.activities.filter(a => a.deal_id === d.id))) add(`deal:${d.id}`, d.title, `/pipeline?deal=${d.id}`, rule, 'Oportunidade em aberto sem próxima ação com prazo vinculada diretamente a ela.');
    }
    if (rule.type === 'stale_deal') for (const d of openDeals) {
      const last = Math.max(Date.parse(d.updated_at), ...data.activities.filter(a => a.deal_id === d.id).map(a => Date.parse(a.updated_at)));
      if (now.getTime() - last >= Math.max(0, rule.threshold_days) * 86400_000) add(`deal:${d.id}`, d.title, `/pipeline?deal=${d.id}`, rule, `Oportunidade e atividades vinculadas sem atualização há pelo menos ${rule.threshold_days} dias.`);
    }
  }
  return [...items.values()].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'pt-BR'));
}
export function agendaDays(date: Date, mode: 'day' | 'week') {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (mode === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: mode === 'week' ? 7 : 1 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
export function eventOverlapsDay(activity: Pick<Activity, 'due_date' | 'end_date'>, day: Date) {
  if (!activity.due_date) return false; const start = Date.parse(activity.due_date), end = activity.end_date ? Date.parse(activity.end_date) : start + 1;
  const bounds = localDayBounds(day); return start < bounds.end && end > bounds.start;
}

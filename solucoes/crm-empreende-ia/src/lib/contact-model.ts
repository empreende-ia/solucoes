import type { CrmRow } from '@/integrations/supabase/commercial-types';

export type Contact = CrmRow<'contacts'>;
export type Company = CrmRow<'companies'>;
export type Deal = CrmRow<'deals'>;
export type Member = Pick<CrmRow<'profiles'>, 'id' | 'name' | 'email'>;
export type RelationshipActivity = CrmRow<'activities'>;
export interface RelationshipData {
  contacts: Contact[]; companies: Company[]; deals: Deal[];
  activities: RelationshipActivity[]; members: Member[];
}
export type DirectoryKind = 'contacts' | 'companies';
export type DirectoryScope = 'all' | 'mine' | 'unassigned' | 'no-action';
export type DirectorySort = 'name' | 'updated' | 'next-action';
export const DIRECTORY_COLUMNS = ['email', 'phone', 'company', 'industry', 'owner', 'next-action'] as const;
export type DirectoryColumn = typeof DIRECTORY_COLUMNS[number];
export interface DirectoryView { q: string; scope: DirectoryScope; sort: DirectorySort; columns: DirectoryColumn[] }
export const DEFAULT_COLUMNS: Record<DirectoryKind, DirectoryColumn[]> = {
  contacts: ['email', 'company', 'owner', 'next-action'], companies: ['industry', 'phone', 'owner', 'next-action'],
};
export function contactName(contact: Pick<Contact, 'first_name' | 'last_name' | 'email' | 'phone'>) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || contact.email || contact.phone || 'Contato sem nome';
}
export function recordName(record: Contact | Company) { return 'name' in record ? record.name : contactName(record); }
export function normalizeSearch(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }
export function nextAction(activities: RelationshipActivity[]): RelationshipActivity | null {
  return activities.filter(a => !a.completed_at && a.type !== 'note' && a.due_date && Number.isFinite(Date.parse(a.due_date)))
    .sort((a, b) => Date.parse(a.due_date!) - Date.parse(b.due_date!) || a.id.localeCompare(b.id))[0] ?? null;
}
export function relatedData(kind: DirectoryKind, id: string, data: RelationshipData) {
  const contactIds = new Set(kind === 'companies' ? data.contacts.filter(c => c.company_id === id).map(c => c.id) : [id]);
  const deals = data.deals.filter(d => kind === 'contacts' ? d.contact_id === id : d.company_id === id || !!d.contact_id && contactIds.has(d.contact_id));
  const dealIds = new Set(deals.map(d => d.id));
  const activities = data.activities.filter(a =>
    (kind === 'companies' && a.company_id === id) || !!a.contact_id && contactIds.has(a.contact_id) || !!a.deal_id && dealIds.has(a.deal_id));
  return { deals, activities, next: nextAction(activities), contacts: data.contacts.filter(c => contactIds.has(c.id)) };
}
export function directoryView(params: URLSearchParams, kind: DirectoryKind): DirectoryView {
  const scope = params.get('scope'), sort = params.get('sort');
  const columns = params.get('columns')?.split(',').filter((c): c is DirectoryColumn => DIRECTORY_COLUMNS.includes(c as DirectoryColumn));
  return { q: (params.get('q') ?? '').slice(0, 300),
    scope: ['mine', 'unassigned', 'no-action'].includes(scope ?? '') ? scope as DirectoryScope : 'all',
    sort: ['updated', 'next-action'].includes(sort ?? '') ? sort as DirectorySort : 'name',
    columns: columns ? [...new Set(columns)] : DEFAULT_COLUMNS[kind] };
}
export function applyDirectoryView(params: URLSearchParams, view: DirectoryView) {
  const next = new URLSearchParams(params);
  if (view.q) next.set('q', view.q); else next.delete('q');
  if (view.scope === 'all') next.delete('scope'); else next.set('scope', view.scope);
  if (view.sort === 'name') next.delete('sort'); else next.set('sort', view.sort);
  next.set('columns', view.columns.join(','));
  return next;
}
export function withRecord(params: URLSearchParams, kind: DirectoryKind, id: string | null) {
  const next = new URLSearchParams(params); const key = kind === 'contacts' ? 'contact' : 'company';
  if (id) next.set(key, id); else next.delete(key); return next;
}
export function safeWebsite(value: string | null) {
  if (!value?.trim()) return null;
  try { const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export function relationshipError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '42501') return 'Seu papel não permite esta ação. Peça ao administrador para revisar seu acesso.';
  if (code === '23503') return 'Este cadastro possui vínculos que precisam ser resolvidos antes desta alteração.';
  if (code === '23505') return 'Já existe um cadastro com estes dados. Revise o registro antes de salvar.';
  return 'Não foi possível concluir a operação. Seu preenchimento foi preservado. Verifique a conexão e tente novamente.';
}
export const ACTIVITY_LABELS: Record<string, string> = { task: 'Tarefa', call: 'Ligação', email: 'E-mail', meeting: 'Reunião', note: 'Nota' };
export function displayDate(value: string | null) { if (!value || !Number.isFinite(Date.parse(value))) return 'Sem prazo'; return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
export function localDateTime(value: string | null) { if (!value) return ''; const d = new Date(value); if (!Number.isFinite(d.getTime())) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export const CONTACT_STATUS_LABELS: Record<string, string> = { lead: 'Lead', prospect: 'Em prospecção', customer: 'Cliente', churned: 'Encerrado' };

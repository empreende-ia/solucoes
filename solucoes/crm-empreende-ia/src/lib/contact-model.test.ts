import { describe, expect, it } from 'vitest';
import { applyDirectoryView, directoryView, nextAction, normalizeSearch, relatedData, safeWebsite, withRecord, type RelationshipActivity, type RelationshipData } from './contact-model';
const activity = (id: string, overrides: Partial<RelationshipActivity> = {}): RelationshipActivity => ({ id, org_id: 'org', end_date: null, created_by: null, type: 'task', title: id, body: null, user_id: null, contact_id: null, company_id: null, deal_id: null, due_date: '2026-09-07T10:00:00Z', completed_at: null, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', ...overrides });
describe('próxima ação canônica', () => {
  it('usa o prazo mais antigo pendente, incluindo vencidos; não usa ordem do array, criação, notas, datas inválidas ou concluídas', () => {
    const values = [activity('later'), activity('completed', { due_date: '2026-08-01T10:00:00Z', completed_at: '2026-08-01T11:00:00Z' }), activity('note', { type: 'note', due_date: '2026-07-01T10:00:00Z' }), activity('unscheduled', { due_date: null }), activity('invalid', { due_date: 'invalid' }), activity('overdue', { due_date: '2026-09-01T10:00:00Z' })];
    expect(nextAction(values)?.id).toBe('overdue'); expect(values[0].id).toBe('later');
  });
  it('desempata pelo ID e avança após concluir a ação atual', () => {
    const values = [activity('b'), activity('a')]; expect(nextAction(values)?.id).toBe('a'); values[1].completed_at = new Date().toISOString(); expect(nextAction(values)?.id).toBe('b');
    expect(nextAction([activity('note', { type: 'note' })])).toBeNull();
  });
});
describe('ficha unificada', () => {
  const data = { contacts: [{ id: 'c1', company_id: 'co1' }, { id: 'c2', company_id: 'co2' }], companies: [], members: [], deals: [{ id: 'd1', contact_id: 'c1', company_id: 'co1' }, { id: 'd2', contact_id: 'c2', company_id: 'co2' }], activities: [activity('direct', { contact_id: 'c1' }), activity('deal', { deal_id: 'd1' }), activity('multiple', { contact_id: 'c1', deal_id: 'd1', company_id: 'co1' }), activity('company', { company_id: 'co1' }), activity('outside', { contact_id: 'c2', deal_id: 'd2', company_id: 'co2' })] } as unknown as RelationshipData;
  it('une vínculo direto e oportunidade sem duplicar a mesma atividade', () => {
    const actual = relatedData('contacts', 'c1', data); expect(actual.activities.map(a => a.id)).toEqual(['direct', 'deal', 'multiple']); expect(actual.deals.map(d => d.id)).toEqual(['d1']);
  });
  it('inclui pessoas e oportunidades da empresa, isolando outros relacionamentos', () => {
    const actual = relatedData('companies', 'co1', data); expect(actual.activities.map(a => a.id)).toEqual(['direct', 'deal', 'multiple', 'company']); expect(actual.contacts.map(c => c.id)).toEqual(['c1']);
  });
});
describe('URLs e pesquisa', () => {
  it('abrir/fechar ficha preserva pesquisa, filtros, colunas e contexto alheio', () => {
    const before = new URLSearchParams('q=João&scope=mine&sort=updated&columns=email,owner&source=search');
    const open = withRecord(before, 'contacts', '123'); expect(open.get('contact')).toBe('123'); expect(before.has('contact')).toBe(false);
    expect(withRecord(open, 'contacts', null).toString()).toBe(before.toString());
    expect(directoryView(open, 'contacts')).toEqual({ q: 'João', scope: 'mine', sort: 'updated', columns: ['email', 'owner'] });
  });
  it('restaurar visão não fecha ficha e descarta valores desconhecidos', () => {
    const p = new URLSearchParams('contact=123&scope=hack&sort=hack&columns=email,evil,email');
    const view = directoryView(p, 'contacts'); expect(view).toEqual({ q: '', scope: 'all', sort: 'name', columns: ['email'] });
    expect(applyDirectoryView(p, { ...view, q: 'ACME' }).get('contact')).toBe('123');
  });
  it('pesquisa trata acentos e caracteres de filtros como texto literal', () => {
    expect(normalizeSearch('  João AÇÃO  ')).toBe('joao acao'); expect(normalizeSearch('x),org_id.neq.y')).toBe('x),org_id.neq.y');
  });
  it('não cria links executáveis a partir do site cadastrado', () => {
    expect(safeWebsite('javascript:alert(1)')).toBeNull(); expect(safeWebsite('data:text/html,hello')).toBeNull(); expect(safeWebsite('empresa.com.br')).toBe('https://empresa.com.br/');
  });
});

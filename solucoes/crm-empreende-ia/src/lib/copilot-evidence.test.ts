import { describe, it, expect } from 'vitest';
import type { CrmSnapshot } from '@/hooks/useCrmSnapshot';
import { copilotAnswer } from './copilot-evidence';

const now = new Date('2026-09-06T12:00:00Z');
const old = '2026-08-01T12:00:00Z';
function snapshot(): CrmSnapshot { return { contacts: [], companies: [], deals: [], activities: [], members: [], riskRules: [], pipelines: [], stages: [] }; }
function contact(overrides: Partial<CrmSnapshot['contacts'][number]> = {}): CrmSnapshot['contacts'][number] {
  return { id: 'person-a', org_id: 'org', first_name: 'Ana', last_name: 'Souza', email: null, phone: null, company_id: null, owner_id: null, status: 'lead', job_title: null, source: null, notes: null, created_at: now.toISOString(), updated_at: now.toISOString(), ...overrides };
}
function deal(overrides: Partial<CrmSnapshot['deals'][number]> = {}): CrmSnapshot['deals'][number] {
  return { id: 'deal-a', org_id: 'org', pipeline_id: 'pipeline', stage_id: 'stage', title: 'Projeto Exemplo', status: 'open', owner_id: null, value: 100, currency: 'BRL', contact_id: null, company_id: null, close_date: null, probability: 10, lost_reason: null, stage_entered_at: old, created_at: old, updated_at: old, ...overrides };
}
function rule(type: string, overrides: Partial<CrmSnapshot['riskRules'][number]> = {}): CrmSnapshot['riskRules'][number] {
  return { id: type, org_id: 'org', name: type, type, enabled: true, threshold_days: 7, priority: 1, ...overrides };
}

describe('copilot evidence', () => {
  it('does not equate no rule results with everything resolved', () => {
    const answer = copilotAnswer('O que priorizar hoje?', snapshot(), now);
    expect(answer.summary).toContain('não significa');
    expect(answer.unknown).toHaveLength(2);
  });
  it('links suggestions to concrete records and never changes data', () => {
    const data = snapshot(); data.contacts = [contact()]; data.riskRules = [rule('no_next_action')];
    const before = JSON.stringify(data);
    const answer = copilotAnswer('O que falta nos contatos?', data, now);
    expect(answer.evidence[0].path).toBe('/contacts?contact=person-a');
    expect(answer.evidence[0].suggestion?.contact_id).toBe('person-a');
    expect(answer.evidence[0].suggestion?.body).toContain(answer.evidence[0].fact);
    expect(answer.evidence[0].fact).toContain('sem atividade');
    expect(JSON.stringify(data)).toBe(before);
  });
  it('respects disabled attention rules with eligible records present', () => {
    const data = snapshot(); data.contacts = [contact()]; data.deals = [deal()]; data.riskRules = [rule('no_owner', { enabled: false })];
    expect(copilotAnswer('priorizar', data, now).evidence).toEqual([]);
  });
  it('only lists stale opportunities for the stale preset, using rule IDs even after renaming', () => {
    const data = snapshot();
    data.deals = [deal({ id: 'new', title: 'A newly created deal', updated_at: now.toISOString() }), deal({ id: 'stale', title: 'Old deal' }), deal({ id: 'won', status: 'won' })];
    data.riskRules = [rule('no_owner'), rule('stale_deal', { id: 'renamed-rule', name: 'Retomar negociações' })];
    const answer = copilotAnswer('Quais oportunidades estão paradas?', data, now);
    expect(answer.evidence.map(item => item.id)).toEqual(['deal:stale']);
    expect(answer.evidence[0].fact).toContain('há pelo menos 7 dias');
    expect(answer.evidence[0].path).toBe('/pipeline?deal=stale');
    expect(answer.evidence[0].suggestion?.deal_id).toBe('stale');
  });
  it('filters stale candidates before limiting the results', () => {
    const data = snapshot();
    data.deals = [...Array.from({ length: 7 }, (_, i) => deal({ id: String(i), title: `A new deal ${i}`, updated_at: now.toISOString() })), deal({ id: 'stale', title: 'Z old deal' })];
    data.riskRules = [rule('no_owner'), rule('stale_deal')];
    const answer = copilotAnswer('Oportunidades paradas', data, now);
    expect(answer.evidence.map(item => item.id)).toEqual(['deal:stale']);
    expect(answer.summary).not.toContain('nesta seleção');
  });
  it('considers linked activity updates when checking the configured inactivity threshold', () => {
    const data = snapshot(); data.deals = [deal()]; data.riskRules = [rule('stale_deal')];
    data.activities = [{ id: 'activity', org_id: 'org', title: 'Retorno', body: null, type: 'task', due_date: null, end_date: null, completed_at: null, user_id: null, contact_id: null, company_id: null, deal_id: 'deal-a', created_by: null, created_at: old, updated_at: now.toISOString() }];
    expect(copilotAnswer('Quais oportunidades estão paradas?', data, now).evidence).toEqual([]);
  });
  it.each([{ riskRules: [] }, { riskRules: [rule('stale_deal', { enabled: false })] }])('explains missing or disabled stale criteria instead of using another risk', ({ riskRules }) => {
    const data = snapshot(); data.deals = [deal()]; data.riskRules = [...riskRules, rule('no_owner')];
    const answer = copilotAnswer('Quais oportunidades estão paradas?', data, now);
    expect(answer.evidence).toEqual([]);
    expect(answer.summary).toContain('Não há regra ativa');
  });
  it('finds a contact whose name contains a former command word instead of unrelated attention items', () => {
    const data = snapshot(); data.contacts = [contact({ first_name: 'Contato', last_name: 'Alfa', owner_id: 'member' }), contact({ id: 'other', first_name: 'Beatriz' })]; data.riskRules = [rule('no_owner')];
    const answer = copilotAnswer('Contato Alfa', data, now);
    expect(answer.evidence.map(item => item.id)).toEqual(['contact:person-a']);
    expect(answer.summary).toContain('busca por nome');
    expect(answer.evidence[0].suggestion).toBeUndefined();
  });
  it.each(['Pipeline Órion', 'Oportunidade Expansão', 'Funil Resumo', 'Projeto Parado', 'Prioridades'])('finds opportunity names containing reserved words: %s', title => {
    const data = snapshot(); data.deals = [deal({ title, owner_id: 'member' }), deal({ id: 'other', title: 'Outra negociação' })]; data.riskRules = [rule('no_owner')];
    expect(copilotAnswer(title.toUpperCase(), data, now).evidence.map(item => item.id)).toEqual(['deal:deal-a']);
  });
  it.each(['Empresa desconhecida', 'Contato inexistente', 'Qual será a receita hoje?', 'Quais oportunidades estão paradas há 30 dias?', '   ', 'constructor'])('does not turn unsupported input into a generic answer: %s', question => {
    const data = snapshot(); data.contacts = [contact()]; data.deals = [deal()]; data.riskRules = [rule('no_owner'), rule('stale_deal')];
    const answer = copilotAnswer(question, data, now);
    expect(answer.evidence).toEqual([]);
    expect(answer.summary).toContain('Não encontrei');
    expect(answer.summary).toContain('pergunta de rotina suportada');
    expect(answer.summary).toContain('perguntas sugeridas');
  });
});

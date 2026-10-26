import { describe, expect, it } from 'vitest';
import { daysInStage, dealDraft, filterDeals, nextDealActions, parseDealValue, summarizeDeals, validateDealDraft, validateDealMove } from './deal-logic';
import type { Deal, DealActivity, DealStage } from './deal-types';
import { nextAction, type RelationshipActivity } from './contact-model';

const stages: DealStage[] = [
  { id: 'qualify', org_id: 'org-a', pipeline_id: 'commercial', name: 'Qualificação', order: 0, win_probability: 20, color: null },
  { id: 'proposal', org_id: 'org-a', pipeline_id: 'commercial', name: 'Proposta', order: 1, win_probability: 60, color: null },
  { id: 'other', org_id: 'org-a', pipeline_id: 'other-pipeline', name: 'Outro funil', order: 0, win_probability: 0, color: null },
];
const deal: Deal = { id: 'deal-a', org_id: 'org-a', pipeline_id: 'commercial', stage_id: 'qualify', title: 'Consultoria estratégica', value: 1000, currency: 'BRL', contact_id: null, company_id: null, owner_id: 'person-a', close_date: null, probability: 20, status: 'open', lost_reason: null, stage_entered_at: '2026-09-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' };
const action = (overrides: Partial<DealActivity>): DealActivity => ({ id: 'action-a', org_id: 'org-a', deal_id: 'deal-a', title: 'Retomar proposta', type: 'task', due_date: null, completed_at: null, user_id: 'person-a', ...overrides });

describe('validação de oportunidades', () => {
  it.each([['0', 0], ['1500,25', 1500.25], ['12.5', 12.5], [' 7 ', 7], ['', null], ['-1', null], ['Infinity', null], ['1e6', null], ['1.000,25', null], ['1.234', null]])('interpreta %s sem arredondar ou inferir valor incorreto', (input, expected) => expect(parseDealValue(input)).toBe(expected));
  it('exige valor válido e etapa pertencente ao pipeline, independente do nome', () => {
    const draft = { ...dealDraft(deal), value: '-10', stage_id: 'other' };
    expect(validateDealDraft(draft, stages)).toEqual({ value: expect.any(String), stage_id: expect.any(String) });
    expect(validateDealDraft(dealDraft(deal), stages.map(stage => ({ ...stage, name: 'Etapa renomeada' })))).toEqual({});
  });
  it('exige responsável para ganho e motivo para perda', () => {
    expect(validateDealDraft({ ...dealDraft(deal), status: 'won', owner_id: '' }, stages).owner_id).toBeTruthy();
    expect(validateDealDraft({ ...dealDraft(deal), status: 'lost', lost_reason: '  ' }, stages).lost_reason).toBeTruthy();
    expect(validateDealDraft({ ...dealDraft(deal), status: 'lost', lost_reason: 'Prazo incompatível' }, stages)).toEqual({});
  });
  it('rejeita probabilidades fora do intervalo e datas impossíveis', () => {
    expect(validateDealDraft({ ...dealDraft(deal), probability: '101', close_date: '2026-02-30' }, stages)).toEqual({ probability: expect.any(String), close_date: expect.any(String) });
  });
});

describe('movimentação e filtros comerciais', () => {
  it('não permite mover para outro pipeline ou organização', () => {
    expect(validateDealMove(deal, stages[2], 'open')).toBeTruthy();
    expect(validateDealMove(deal, { ...stages[1], org_id: 'org-b' }, 'open')).toBeTruthy();
    expect(validateDealMove(deal, stages[1], 'open')).toBeNull();
  });
  it('aplica requisitos em ganho/perda e permite reabrir sem motivo', () => {
    expect(validateDealMove({ ...deal, owner_id: null }, stages[0], 'won')).toBeTruthy();
    expect(validateDealMove(deal, stages[0], 'lost')).toBeTruthy();
    expect(validateDealMove(deal, stages[0], 'lost', 'Concorrente escolhido')).toBeNull();
    expect(validateDealMove({ ...deal, status: 'lost' }, stages[0], 'open')).toBeNull();
  });
  it('compõe busca sem acentos, pipeline, responsável e situação', () => {
    const deals = [deal, { ...deal, id: 'b', owner_id: null }, { ...deal, id: 'c', pipeline_id: 'other-pipeline' }, { ...deal, id: 'd', status: 'won' as const }];
    expect(filterDeals(deals, { pipelineId: 'commercial', ownerId: 'unassigned', status: 'open', search: 'ESTRATEGICA' }).map(item => item.id)).toEqual(['b']);
    expect(filterDeals(deals, { pipelineId: 'commercial', ownerId: 'person-a', status: 'all', search: '' }).map(item => item.id)).toEqual(['deal-a', 'd']);
  });
  it('calcula apenas a moeda selecionada e separa ganho de valor em aberto', () => {
    const totals = summarizeDeals([deal, { ...deal, id: 'b', value: 2000, probability: 50 }, { ...deal, id: 'won', value: 3000, status: 'won' }, { ...deal, id: 'lost', value: 4000, status: 'lost' }, { ...deal, id: 'usd', value: 9999, currency: 'USD' }], 'BRL');
    expect(totals).toEqual({ count: 5, openCount: 3, openValue: 3000, weightedValue: 1200, wonValue: 3000, foreignCurrencyCount: 1 });
    expect(summarizeDeals([{ ...deal, value: 0.1 }, { ...deal, value: 0.2 }], 'BRL').openValue).toBe(0.3);
  });
  it('usa a probabilidade da etapa quando a oportunidade não define uma', () => {
    expect(summarizeDeals([{ ...deal, probability: null }], 'BRL', stages).weightedValue).toBe(200);
    expect(summarizeDeals([{ ...deal, probability: 0 }], 'BRL', stages).weightedValue).toBe(0);
  });
  it('mede tempo pela entrada na etapa, sem negativos ou datas inventadas', () => {
    expect(daysInStage(deal.stage_entered_at, new Date('2026-09-06T10:00:00Z'))).toBe(5);
    expect(daysInStage('2026-10-01', new Date('2026-09-01'))).toBe(0);
    expect(daysInStage('invalid')).toBeNull();
  });
});

describe('próxima ação canônica', () => {
  it('prioriza a pendência mais antiga com prazo e exclui concluídas e notas', () => {
    const next = nextDealActions([action({ id: 'no-date' }), action({ id: 'future', due_date: '2026-10-01' }), action({ id: 'overdue', due_date: '2026-08-01' }), action({ id: 'done', due_date: '2026-01-01', completed_at: '2026-01-01' }), action({ id: 'note', type: 'note', due_date: '2025-01-01' }), action({ id: 'unlinked', deal_id: null })]);
    expect(next.size).toBe(1);
    expect(next.get(deal.id)?.id).toBe('overdue');
  });
  it('não apresenta como próxima ação uma tarefa sem prazo válido', () => {
    expect(nextDealActions([action({ id: 'no-date' }), action({ id: 'invalid-date', due_date: 'invalid' })]).size).toBe(0);
    expect(nextDealActions([action({ id: 'invalid-date', due_date: 'invalid' }), action({ id: 'valid', due_date: '2026-10-01' })]).get(deal.id)?.id).toBe('valid');
  });
  it('concorda com a ficha 360 e desempata por ID, independente da ordem recebida', () => {
    const activities: RelationshipActivity[] = [
      action({ id: 'no-date' }), action({ id: 'z', due_date: '2026-10-01' }), action({ id: 'a', due_date: '2026-10-01' }),
    ].map(item => ({ ...item, body: null, company_id: null, contact_id: null, end_date: null, created_by: 'person-a', created_at: '2026-09-01', updated_at: '2026-09-01' }));
    expect(nextDealActions(activities).get(deal.id)?.id).toBe(nextAction(activities)?.id);
    expect(nextDealActions([...activities].reverse()).get(deal.id)?.id).toBe('a');
    expect(nextDealActions([activities[0]]).get(deal.id)?.id ?? null).toBe(nextAction([activities[0]]));
  });
  it('mantém uma próxima ação independente por oportunidade', () => {
    const next = nextDealActions([action({ id: 'a', due_date: '2026-10-01' }), action({ id: 'b', deal_id: 'deal-b', due_date: '2026-09-01' })]);
    expect([...next].map(([id, activity]) => [id, activity.id])).toEqual([['deal-a', 'a'], ['deal-b', 'b']]);
  });
});

import { describe, expect, it } from 'vitest';
import { activitySummary, agendaDays, attentionQueue, dateKey, eventOverlapsDay, localDayBounds, matchesDate, parseLocalDay, rescheduledEnd, uniqueActivities, type Activity } from './activity-logic';
import type { CrmSnapshot } from '@/hooks/useCrmSnapshot';
const local = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();
const row = (id: string, extra: Partial<Activity> = {}): Activity => ({ id, org_id: 'org', type: 'task', title: id, body: null, user_id: 'user', contact_id: null, company_id: null, deal_id: null, due_date: local(6, 10), end_date: null, completed_at: null, created_at: local(1), updated_at: local(1), created_by: 'user', ...extra });
describe('rotina: datas locais e contagem', () => {
  const now = new Date(2026, 8, 6, 12);
  it('inclui meia-noite local e exclui exatamente a próxima meia-noite', () => {
    expect(matchesDate(row('start', { due_date: local(6) }), 'today', now)).toBe(true);
    expect(matchesDate(row('end', { due_date: local(7) }), 'today', now)).toBe(false);
    expect(matchesDate(row('yesterday', { due_date: local(5, 23, 59) }), 'today', now)).toBe(false);
    expect(localDayBounds(now)).toEqual({ start: new Date(2026, 8, 6).getTime(), end: new Date(2026, 8, 7).getTime() });
  });
  it('distingue vencida agora de data futura, sem transformar sem data em vencida', () => {
    expect(matchesDate(row('a'), 'overdue', now)).toBe(true);
    expect(matchesDate(row('a', { due_date: local(6, 13) }), 'overdue', now)).toBe(false);
    expect(matchesDate(row('a', { due_date: null }), 'overdue', now)).toBe(false);
    expect(matchesDate(row('a', { due_date: local(7) }), 'upcoming', now)).toBe(true);
  });
  it('o mesmo ID em vários vínculos conta uma vez; nota não é tarefa; conclusão real entra no dia', () => {
    const shared = row('shared', { contact_id: 'contact', company_id: 'company', deal_id: 'deal' });
    const rows = [shared, shared, row('no-date', { due_date: null }), row('note', { type: 'note' }), row('completed', { completed_at: local(6, 11) }), row('future', { due_date: local(7, 10) })];
    const summary = activitySummary(rows, now); expect(uniqueActivities(rows)).toHaveLength(5); expect(summary.today.map(a => a.id)).toEqual(['shared']); expect(summary.overdue.map(a => a.id)).toEqual(['shared']); expect(summary.dayQueue.map(a => a.id)).toEqual(['shared']); expect(summary.unscheduled.map(a => a.id)).toEqual(['no-date']); expect(summary.completedToday.map(a => a.id)).toEqual(['completed']);
    const completed = activitySummary([{ ...shared, completed_at: local(6, 12) }], now); expect(completed.dayQueue).toHaveLength(0); expect(completed.completedToday).toHaveLength(1);
  });
  it('parse de dia não aplica conversão UTC e rejeita datas impossíveis', () => {
    expect(dateKey(parseLocalDay('2026-09-06')!)).toBe('2026-09-06'); expect(parseLocalDay('2026-02-30')).toBeNull(); expect(parseLocalDay('2026-9-6')).toBeNull();
  });
});
describe('agenda: duração e navegação', () => {
  it('semana de domingo continua começando na segunda anterior, atravessando mês', () => {
    const days = agendaDays(new Date(2026, 8, 6), 'week'); expect(days.map(dateKey)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
  });
  it('reagendamento mantém duração e término posterior ao início', () => {
    const moved = rescheduledEnd({ due_date: local(6, 10), end_date: local(6, 11, 30) }, local(7, 14)); expect(moved).toBe(local(7, 15, 30));
    expect(rescheduledEnd({ due_date: null, end_date: null }, local(7, 14))).toBe(local(7, 15));
  });
  it('evento que termina à meia-noite não aparece no dia seguinte; evento que atravessa aparece', () => {
    const day = new Date(2026, 8, 7);
    expect(eventOverlapsDay({ due_date: local(6, 23), end_date: local(7) }, day)).toBe(false);
    expect(eventOverlapsDay({ due_date: local(6, 23), end_date: local(7, 1) }, day)).toBe(true);
    expect(eventOverlapsDay({ due_date: local(7), end_date: local(7, 1) }, day)).toBe(true);
  });
});
describe('fila de atenção baseada em critérios reais', () => {
  const data = { contacts: [{ id: 'contact', first_name: 'Ana', last_name: null, owner_id: null, status: 'lead' }, { id: 'churned', first_name: 'Encerrado', owner_id: null, status: 'churned' }], companies: [], members: [], pipelines: [], stages: [], deals: [{ id: 'deal', title: 'Oportunidade', status: 'open', owner_id: null, contact_id: 'contact', updated_at: local(1), stage_entered_at: local(1) }], activities: [row('action', { due_date: local(5), user_id: null, contact_id: 'contact', deal_id: 'deal' })], riskRules: [
    { id: 'r1', type: 'overdue', name: 'Vencida', enabled: true, priority: 1, threshold_days: 7 }, { id: 'r2', type: 'no_owner', name: 'Sem responsável', enabled: true, priority: 2, threshold_days: 7 }, { id: 'r3', type: 'no_next_action', name: 'Sem próxima ação', enabled: true, priority: 3, threshold_days: 7 }, { id: 'r4', type: 'stale_deal', name: 'Parada', enabled: true, priority: 3, threshold_days: 3 },
  ] } as unknown as CrmSnapshot;
  it('agrupa múltiplos motivos por ID, exclui encerrados e cita por que o item entra', () => {
    const queue = attentionQueue(data, new Date(2026, 8, 6, 12));
    expect(queue.filter(item => item.key === 'activity:action')).toHaveLength(1); expect(queue[0].reasons.map(r => r.ruleId)).toEqual(['r1', 'r2']); expect(queue[0].priority).toBe(1);
    expect(queue.some(item => item.key === 'contact:churned')).toBe(false);
    expect(queue.find(item => item.key === 'deal:deal')?.reasons.map(r => r.ruleId)).toEqual(['r2', 'r4']);
    expect(queue.find(item => item.key === 'deal:deal')?.reasons[1].explanation).toContain('3 dias');
  });
  it('desativar regra remove motivo; atividade recente evita falso alerta de parada', () => {
    const next = { ...data, activities: data.activities.map(a => ({ ...a, updated_at: local(6, 11) })), riskRules: data.riskRules.map(r => ({ ...r, enabled: r.type === 'stale_deal' })) };
    expect(attentionQueue(next, new Date(2026, 8, 6, 12))).toEqual([]);
  });
});

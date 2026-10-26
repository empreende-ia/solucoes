import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, dateInRange, filterPayments, paymentDraft, paymentState, summarizePayments, summarizeReport, validateAutomation, validatePayment, type Payment } from './operation-logic';
import type { CrmRow } from '@/integrations/supabase/commercial-types';
const payment: Payment = { id: 'payment', org_id: 'org', description: 'Consultoria estratégica', amount: 100, currency: 'BRL', status: 'pending', contact_id: null, company_id: null, deal_id: null, due_date: '2026-09-06', paid_at: null, created_at: '2026-09-01', updated_at: '2026-09-01' };
const deal: CrmRow<'deals'> = { id: 'deal', org_id: 'org', pipeline_id: 'p', stage_id: 's', title: 'Contrato', value: 1000, currency: 'BRL', contact_id: null, company_id: null, owner_id: null, close_date: null, probability: null, status: 'open', lost_reason: null, stage_entered_at: '2026-09-01', created_at: '2026-09-01', updated_at: '2026-09-01' };
const stage: CrmRow<'pipeline_stages'> = { id: 's', org_id: 'org', pipeline_id: 'p', name: 'Proposta', order: 0, color: '#000000', win_probability: 60, created_at: '2026-09-01' };

describe('financeiro comercial', () => {
  it('diferencia vencimento de hoje, vencido, recebido e cancelado', () => {
    expect(paymentState(payment, '2026-09-06')).toBe('pending');
    expect(paymentState(payment, '2026-09-07')).toBe('overdue');
    expect(paymentState({ ...payment, status: 'paid' }, '2026-09-07')).toBe('paid');
    expect(paymentState({ ...payment, status: 'cancelled' }, '2026-09-07')).toBe('cancelled');
  });
  it('não conta cancelados/recebidos como valores a receber e soma centavos sem ruído', () => {
    expect(summarizePayments([payment, { ...payment, amount: 0.1, status: 'paid' }, { ...payment, amount: 0.2, status: 'paid' }, { ...payment, amount: 50, status: 'cancelled' }, { ...payment, amount: 25, due_date: '2026-09-01' }], '2026-09-06')).toEqual({ paid: 0.3, overdue: 25, pending: 100, cancelled: 50 });
  });
  it('aplica recorte por vencimento, busca sem acento, situação e moeda', () => {
    const filter = { from: '2026-09-01', to: '2026-09-06', status: 'overdue', search: 'ESTRATEGICA', currency: 'BRL' };
    expect(filterPayments([payment, { ...payment, id: 'usd', currency: 'USD' }, { ...payment, id: 'outside', due_date: '2026-08-31' }, { ...payment, id: 'paid', status: 'paid' }], filter, '2026-09-07').map(item => item.id)).toEqual(['payment']);
    expect(dateInRange('2026-09-06', '2026-09-06', '2026-09-06')).toBe(true);
  });
  it('exige valor maior que zero e data de recebimento para um lançamento recebido', () => {
    expect(validatePayment(paymentDraft(payment))).toBeNull();
    expect(validatePayment({ ...paymentDraft(payment), amount: '0' })).toMatch(/maior que zero/);
    expect(validatePayment({ ...paymentDraft(payment), status: 'paid' })).toMatch(/quando o valor foi recebido/);
    expect(validatePayment({ ...paymentDraft(payment), status: 'paid', paid_at: '2026-09-06T09:30' })).toBeNull();
  });
  it('rejeita datas impossíveis e moeda fora do contrato BRL', () => {
    expect(validatePayment({ ...paymentDraft(payment), due_date: '2026-02-30' })).toMatch(/vencimento válida/);
    expect(validatePayment({ ...paymentDraft(payment), currency: 'USD' })).toMatch(/reais/);
  });
});

describe('relatórios sem indicadores inventados', () => {
  it('usa probabilidade da etapa somente quando negócio não define uma, preservando zero explícito', () => {
    const result = summarizeReport([deal, { ...deal, id: 'b', probability: 0 }, { ...deal, id: 'c', probability: 40 }, { ...deal, id: 'won', status: 'won', value: 2000 }, { ...deal, id: 'lost', status: 'lost', value: 500 }], [stage]);
    expect(result).toEqual({ open: 3, won: 1, lost: 1, openValue: 3000, wonValue: 2000, lostValue: 500, forecast: 1000, winRate: 50 });
  });
  it('não fabrica uma taxa de ganho quando não há negociações encerradas', () => expect(summarizeReport([deal], [stage]).winRate).toBeNull());
  it('arredonda previsão ponderada uma vez após somar os centavos', () => expect(summarizeReport([{ ...deal, value: 10.05, probability: 33 }, { ...deal, value: 10.05, probability: 33 }], [stage]).forecast).toBe(6.63));
});

describe('exportação CSV', () => {
  it.each(['=HYPERLINK("https://example.com")', '+SUM(A1:A9)', '-42', '@SUM(A1)', '  =1+1', '\t=1+1', '\n=1+1', '\uFEFF=1+1'])('neutraliza fórmula em %s', value => expect(csvCell(value)).toMatch(/^"'/));
  it('preserva separadores, quebras de linha e aspas como texto dentro da célula', () => {
    expect(csvCell('Empresa "A"; filial\nSão Paulo')).toBe('"Empresa ""A""; filial\nSão Paulo"');
    expect(buildCsv([['Nome', 'Valor'], ['Empresa;A', 100]])).toBe('\uFEFF"Nome";"Valor"\r\n"Empresa;A";"100"');
  });
});

describe('automação de tarefas', () => {
  const draft = { name: 'Retorno', trigger_type: 'deal_created', task_title: 'Combinar próximo passo', due_days: '1' };
  it('aceita somente gatilhos implementados e prazos inteiros limitados', () => {
    expect(validateAutomation(draft)).toBeNull();
    expect(validateAutomation({ ...draft, trigger_type: 'send_whatsapp' })).toMatch(/gatilho válido/);
    expect(validateAutomation({ ...draft, due_days: '' })).toMatch(/inteiro/);
    expect(validateAutomation({ ...draft, due_days: 1.5 })).toMatch(/inteiro/);
    expect(validateAutomation({ ...draft, due_days: 366 })).toMatch(/inteiro/);
    expect(validateAutomation({ ...draft, due_days: 0 })).toBeNull();
  });
});

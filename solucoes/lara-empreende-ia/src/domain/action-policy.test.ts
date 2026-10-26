import { describe, expect, it } from 'vitest';

import {
  firstValidScheduleSlot,
  isPastInTimezone,
  validateScheduleRequest as validateSlot,
} from '../../supabase/functions/_shared/action-policy';

// R22 — new Date('...T14:30:00') sem sufixo é UTC no Deno; comparar com o
// relógio real deslocava São Paulo em 3 horas e rejeitava como "passado" um
// agendamento válido nas próximas 3 horas.
describe('isPastInTimezone', () => {
  const now = new Date('2026-08-19T15:00:00Z'); // 12:00 em São Paulo

  it('horário de hoje à tarde em SP não é passado ao meio-dia', () => {
    expect(isPastInTimezone('2026-08-19', '14:30', 'America/Sao_Paulo', now)).toBe(false);
  });

  it('horário de hoje de manhã em SP já passou ao meio-dia', () => {
    expect(isPastInTimezone('2026-08-19', '11:00', 'America/Sao_Paulo', now)).toBe(true);
  });

  it('amanhã nunca é passado; ontem sempre é', () => {
    expect(isPastInTimezone('2026-08-20', '09:00', 'America/Sao_Paulo', now)).toBe(false);
    expect(isPastInTimezone('2026-08-18', '23:59', 'America/Sao_Paulo', now)).toBe(true);
  });

  it('data inválida é tratada como passado (rejeita)', () => {
    expect(isPastInTimezone('não-é-data', '10:00', 'America/Sao_Paulo', now)).toBe(true);
  });
});

// R1 — o cenário de agendamento da avaliação usava um slot inventado (10:00
// fixo, daqui a 2 dias). Qualquer política que não coubesse nele reprovava o
// caso crítico para sempre e bloqueava a publicação. A garantia agora é por
// construção: o slot gerado passa no validador da MESMA política.
describe('firstValidScheduleSlot', () => {
  const now = new Date('2026-08-19T18:00:00Z'); // 15:00 em São Paulo

  function policy(scheduling: Record<string, unknown>) {
    return { actionId: 'appointments', enabled: true, scheduling };
  }

  it('slot gerado passa no validador da própria política, para políticas variadas', () => {
    const policies = [
      policy({ startTime: '11:00', endTime: '18:00' }),
      policy({ startTime: '09:00', endTime: '12:00', allowedWeekdays: [2] }),
      policy({ startTime: '10:00', endTime: '17:00', minimumNoticeHours: 72 }),
      policy({ startTime: '14:00', endTime: '18:00', allowedWeekdays: [1, 3, 5], minimumNoticeHours: 48, timeZone: 'America/Manaus' }),
    ];
    for (const candidate of policies) {
      const slot = firstValidScheduleSlot(candidate, now);
      expect(slot, JSON.stringify(candidate.scheduling)).not.toBeNull();
      expect(validateSlot(slot!, candidate, now).ok, JSON.stringify(candidate.scheduling)).toBe(true);
    }
  });

  it('rodada depois do horário de abertura não devolve slot de hoje no passado', () => {
    // 15:00 locais, expediente 09:00-18:00, antecedência mínima default (2h):
    // o slot de hoje às 09:00 já passou — precisa cair num dia seguinte válido.
    const slot = firstValidScheduleSlot(policy({ startTime: '09:00', endTime: '18:00' }), now);
    expect(slot).not.toBeNull();
    expect(validateSlot(slot!, policy({ startTime: '09:00', endTime: '18:00' }), now).ok).toBe(true);
  });

  it('política impossível devolve null em vez de slot inválido', () => {
    // Expediente de 30 minutos com reunião de 60: nenhum slot cabe, nunca.
    const impossible = policy({ startTime: '09:00', endTime: '09:30', durationMinutes: 60 });
    expect(firstValidScheduleSlot(impossible, now)).toBeNull();
  });
});

import {
  getActionPolicy,
  hasExplicitConfirmation,
  simulationResult,
  validateScheduleRequest,
} from '../../supabase/functions/_shared/action-policy';

const appointmentPolicy = {
  actionId: 'appointments',
  enabled: true,
  scheduling: {
    durationMinutes: 60,
    minimumNoticeHours: 2,
    maximumAdvanceDays: 30,
    timeZone: 'America/Sao_Paulo',
    allowedWeekdays: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '18:00',
  },
};

describe('action policy guards', () => {
  it('só habilita ações presentes na configuração publicada', () => {
    expect(getActionPolicy({ actions: [appointmentPolicy] }, 'appointments')).toBeTruthy();
    expect(getActionPolicy({ actions: [{ ...appointmentPolicy, enabled: false }] }, 'appointments')).toBeNull();
    expect(getActionPolicy({}, 'human_handoff')).toBeNull();
  });

  it('exige uma fala real do lead como confirmação', () => {
    const history = [{ role: 'user', content: 'Pode confirmar para terça às 10h, por favor.' }];
    expect(hasExplicitConfirmation(history, 'confirmar para terça às 10h')).toBe(true);
    expect(hasExplicitConfirmation(history, 'eu confirmo qualquer coisa')).toBe(false);
    expect(hasExplicitConfirmation(history, 'sim')).toBe(false);
  });

  it('rejeita passado, fim de semana e horário fora da política', () => {
    const now = new Date('2026-08-03T12:00:00Z'); // segunda, 09h em São Paulo
    expect(validateScheduleRequest({ date: '2026-08-03', time: '10:00' }, appointmentPolicy, now).code).toBe('minimum_notice');
    expect(validateScheduleRequest({ date: '2026-08-08', time: '10:00' }, appointmentPolicy, now).code).toBe('weekday_not_allowed');
    expect(validateScheduleRequest({ date: '2026-08-04', time: '18:00' }, appointmentPolicy, now).code).toBe('outside_business_hours');
    expect(validateScheduleRequest({ date: '2026-08-04', time: '10:00' }, appointmentPolicy, now)).toEqual({ ok: true });
  });

  it('marca inequivocamente resultados simulados', () => {
    expect(simulationResult('human_handoff', { reason: 'teste' })).toMatchObject({
      success: true,
      simulated: true,
      action: 'human_handoff',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildNylasEventPayload,
  parseNylasEvent,
  wallClockToEpochSeconds,
} from '../../supabase/functions/_shared/nylas-events';

describe('wallClockToEpochSeconds', () => {
  it('converte wall-clock de São Paulo (UTC-3 fixo) para epoch', () => {
    // 2026-08-14 10:00 em São Paulo = 13:00Z.
    expect(wallClockToEpochSeconds('2026-08-14', '10:00', 'America/Sao_Paulo'))
      .toBe(Date.UTC(2026, 7, 14, 13, 0) / 1000);
  });

  it('em UTC o wall-clock é o próprio epoch', () => {
    expect(wallClockToEpochSeconds('2026-01-05', '09:30', 'UTC'))
      .toBe(Date.UTC(2026, 0, 5, 9, 30) / 1000);
  });

  it('rejeita data ou hora malformada', () => {
    expect(() => wallClockToEpochSeconds('', '10:00', 'UTC')).toThrow();
    expect(() => wallClockToEpochSeconds('2026-08-14', 'xx:00', 'UTC')).toThrow();
  });
});

describe('buildNylasEventPayload', () => {
  const base = {
    title: 'Diagnóstico',
    description: 'Reunião criada pela Lara',
    date: '2026-08-14',
    time: '10:00',
    durationMinutes: 45,
    timeZone: 'America/Sao_Paulo',
    participants: [
      { email: 'Lead@Example.com', name: 'Lead' },
      { email: 'lead@example.com' },
      { email: 'time@example.com' },
    ],
    appointmentId: 'apt-1',
    createMeet: true,
    grantProvider: 'google',
  };

  it('monta o evento com timespan no fuso, participantes deduplicados e metadata', () => {
    const payload = buildNylasEventPayload(base);
    expect(payload.when).toEqual({
      start_time: Date.UTC(2026, 7, 14, 13, 0) / 1000,
      end_time: Date.UTC(2026, 7, 14, 13, 45) / 1000,
      start_timezone: 'America/Sao_Paulo',
      end_timezone: 'America/Sao_Paulo',
    });
    expect(payload.participants).toEqual([
      { email: 'lead@example.com', name: 'Lead' },
      { email: 'time@example.com' },
    ]);
    expect(payload.metadata).toEqual({ key1: 'apt-1', lara_appointment_id: 'apt-1' });
    expect(payload.conferencing).toEqual({ provider: 'Google Meet', autocreate: {} });
  });

  it('escolhe a sala pelo provedor do grant e omite quando não há suporte', () => {
    expect(buildNylasEventPayload({ ...base, grantProvider: 'microsoft' }).conferencing)
      .toEqual({ provider: 'Microsoft Teams', autocreate: {} });
    expect(buildNylasEventPayload({ ...base, grantProvider: 'icloud' }).conferencing).toBeUndefined();
    expect(buildNylasEventPayload({ ...base, createMeet: false }).conferencing).toBeUndefined();
  });

  it('omite participants vazio e garante duração mínima de 1 minuto', () => {
    const payload = buildNylasEventPayload({ ...base, participants: [], durationMinutes: 0 });
    expect(payload.participants).toBeUndefined();
    const when = payload.when as { start_time: number; end_time: number };
    expect(when.end_time - when.start_time).toBe(60);
  });
});

describe('parseNylasEvent', () => {
  it('extrai id e link de reunião quando presentes', () => {
    expect(parseNylasEvent({ id: 'evt-1', conferencing: { details: { url: 'https://meet.example' } } }))
      .toEqual({ id: 'evt-1', meetingUrl: 'https://meet.example' });
    expect(parseNylasEvent({ id: 'evt-2' })).toEqual({ id: 'evt-2', meetingUrl: null });
  });

  it('devolve null para formas sem id', () => {
    expect(parseNylasEvent({})).toBeNull();
    expect(parseNylasEvent(null)).toBeNull();
    expect(parseNylasEvent('evt')).toBeNull();
  });
});

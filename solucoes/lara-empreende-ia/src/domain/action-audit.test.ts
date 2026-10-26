import { describe, expect, it } from 'vitest';

import { buildIdempotencyKey } from '../../supabase/functions/_shared/action-audit';

// R5 — a chave antiga era mensagem:ação, sem argumentos. "Pode ser terça 10h
// ou quarta 14h?" fazia a segunda consulta colidir com a primeira e devolver
// o resultado errado ao lead.
describe('buildIdempotencyKey', () => {
  it('a mesma ferramenta com argumentos diferentes gera chaves diferentes', () => {
    const first = buildIdempotencyKey('msg-1', 'check_availability', { date: '2026-08-25', time: '10:00' });
    const second = buildIdempotencyKey('msg-1', 'check_availability', { date: '2026-08-26', time: '14:00' });
    expect(first).not.toBe(second);
  });

  it('o retry idêntico continua colidindo (idempotência preservada)', () => {
    const input = { date: '2026-08-25', time: '10:00', duration: 60 };
    expect(buildIdempotencyKey('msg-1', 'create_appointment', input))
      .toBe(buildIdempotencyKey('msg-1', 'create_appointment', { ...input }));
  });

  it('a ordem das chaves do objeto não muda a chave', () => {
    expect(buildIdempotencyKey('msg-1', 'create_appointment', { time: '10:00', date: '2026-08-25' }))
      .toBe(buildIdempotencyKey('msg-1', 'create_appointment', { date: '2026-08-25', time: '10:00' }));
  });

  it('mensagens diferentes nunca colidem', () => {
    const input = { date: '2026-08-25', time: '10:00' };
    expect(buildIdempotencyKey('msg-1', 'create_appointment', input))
      .not.toBe(buildIdempotencyKey('msg-2', 'create_appointment', input));
  });

  it('argumentos aninhados entram na chave de forma estável', () => {
    const first = buildIdempotencyKey('m', 'a', { meta: { b: 1, a: 2 }, list: [1, 2] });
    const second = buildIdempotencyKey('m', 'a', { list: [1, 2], meta: { a: 2, b: 1 } });
    const third = buildIdempotencyKey('m', 'a', { list: [2, 1], meta: { a: 2, b: 1 } });
    expect(first).toBe(second);
    expect(first).not.toBe(third);
  });
});

import { describe, expect, it } from 'vitest';

import { resolveEmptyReplyFallback } from '../../supabase/functions/_shared/reply-fallback';

// R23 — o fallback de resposta vazia era "Certo! Como posso ajudar?" para
// tudo, inclusive depois de opt-out registrado (reengajar quem pediu para
// parar) e de transferência para humano (a Lara retomando a conversa).
describe('resolveEmptyReplyFallback', () => {
  it('após opt-out registrado, confirma a saída — nunca reengaja', () => {
    const reply = resolveEmptyReplyFallback([{ tool: 'register_opt_out', ok: true }], null);
    expect(reply).toContain('não vai mais receber');
    expect(reply).not.toContain('Como posso ajudar');
  });

  it('após transferência para humano, não retoma a conversa', () => {
    const reply = resolveEmptyReplyFallback([{ tool: 'human_handoff', ok: true }], null);
    expect(reply).toContain('pessoa do nosso time');
    expect(reply).not.toContain('Como posso ajudar');
  });

  it('opt-out vence handoff quando os dois aconteceram', () => {
    const reply = resolveEmptyReplyFallback(
      [{ tool: 'human_handoff', ok: true }, { tool: 'register_opt_out', ok: true }],
      null,
    );
    expect(reply).toContain('não vai mais receber');
  });

  it('agendamento criado confirma com data e hora', () => {
    const reply = resolveEmptyReplyFallback([], { date: '2026-08-25', time: '14:30:00' });
    expect(reply).toContain('25/08/2026');
    expect(reply).toContain('14:30');
  });

  it('ferramenta que FALHOU não muda o fallback', () => {
    const reply = resolveEmptyReplyFallback([{ tool: 'register_opt_out', ok: false }], null);
    expect(reply).toBe('Certo! Como posso ajudar?');
  });

  it('sem efeito colateral nenhum, o genérico continua', () => {
    expect(resolveEmptyReplyFallback([], null)).toBe('Certo! Como posso ajudar?');
  });
});

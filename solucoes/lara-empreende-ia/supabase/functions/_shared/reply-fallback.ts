/**
 * Fallback para resposta vazia do modelo, consciente do que já aconteceu.
 *
 * Quando o modelo devolve texto vazio depois de executar uma ferramenta, o
 * fallback antigo era "Certo! Como posso ajudar?" para tudo — inclusive
 * depois de um opt-out registrado (reengajar quem acabou de pedir para parar)
 * ou de uma transferência para humano (a Lara retomando a conversa que
 * acabou de entregar). O texto de fallback precisa respeitar o efeito
 * colateral mais importante do turno.
 */

export interface FallbackToolEvent {
  tool: string;
  ok: boolean;
}

export interface FallbackAppointment {
  date?: unknown;
  time?: unknown;
  error?: unknown;
}

export function resolveEmptyReplyFallback(
  toolEvents: FallbackToolEvent[],
  appointmentCreated: FallbackAppointment | null,
): string {
  // Opt-out vem antes de tudo: a única resposta aceitável confirma a saída.
  if (toolEvents.some((event) => event.tool === 'register_opt_out' && event.ok)) {
    return 'Entendido, você não vai mais receber mensagens minhas por aqui. Se mudar de ideia, é só mandar uma mensagem.';
  }
  // Transferido para humano: a Lara não retoma a conversa que acabou de entregar.
  if (toolEvents.some((event) => event.tool === 'human_handoff' && event.ok)) {
    return 'Perfeito, já acionei uma pessoa do nosso time para continuar com você por aqui. Só um instante.';
  }
  if (appointmentCreated && !appointmentCreated.error) {
    const brDate = typeof appointmentCreated.date === 'string'
      ? appointmentCreated.date.split('-').reverse().join('/')
      : null;
    const shortTime = typeof appointmentCreated.time === 'string'
      ? appointmentCreated.time.slice(0, 5)
      : null;
    const when = [brDate, shortTime].filter(Boolean).join(' às ');
    return when
      ? `Prontinho! Seu agendamento ficou confirmado para ${when}. Qualquer coisa é só me chamar por aqui.`
      : 'Prontinho! Seu agendamento está confirmado. Qualquer coisa é só me chamar por aqui.';
  }
  return 'Certo! Como posso ajudar?';
}

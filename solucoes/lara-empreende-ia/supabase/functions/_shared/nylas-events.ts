/**
 * Construção pura de eventos para a API Nylas v3 (POST /v3/grants/{id}/events).
 *
 * Preserva a semântica de horário do sistema: appointments.date/time são
 * wall-clock no fuso da integração — a conversão para epoch acontece aqui, e
 * NUNCA antes (validateScheduleRequest compara wall-clock; converter cedo
 * mudaria horários na fronteira de fuso).
 *
 * Idempotência: o Nylas não aceita id de evento escolhido pelo cliente (ao
 * contrário do Google). O retry se apoia em metadata.lara_appointment_id — o
 * chamador busca por metadata_pair antes de criar de novo.
 */

export interface NylasEventInput {
  title: string;
  description: string;
  /** YYYY-MM-DD, wall-clock no fuso da integração. */
  date: string;
  /** HH:MM, wall-clock no fuso da integração. */
  time: string;
  durationMinutes: number;
  timeZone: string;
  participants: Array<{ email: string; name?: string }>;
  appointmentId: string;
  createMeet: boolean;
  /** Provedor do grant no Nylas ('google' | 'microsoft' | ...). */
  grantProvider: string;
}

function timeZoneOffsetMs(epochMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  const reinterpreted = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return reinterpreted - epochMs;
}

/** Converte data+hora wall-clock de um fuso IANA para epoch em segundos. */
export function wallClockToEpochSeconds(date: string, time: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`Data/hora inválida: ${date} ${time}`);
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = timeZoneOffsetMs(utcGuess, timeZone);
  let epochMs = utcGuess - offset;
  // Um reajuste cobre a fronteira de transição de horário do fuso.
  const settledOffset = timeZoneOffsetMs(epochMs, timeZone);
  if (settledOffset !== offset) epochMs = utcGuess - settledOffset;
  return Math.floor(epochMs / 1000);
}

const CONFERENCING_BY_PROVIDER: Record<string, string> = {
  google: 'Google Meet',
  microsoft: 'Microsoft Teams',
};

export function buildNylasEventPayload(input: NylasEventInput): Record<string, unknown> {
  const startTime = wallClockToEpochSeconds(input.date, input.time, input.timeZone);
  const endTime = startTime + Math.max(1, Math.round(input.durationMinutes)) * 60;

  const seenEmails = new Set<string>();
  const participants = input.participants
    .map((participant) => ({ ...participant, email: participant.email.trim().toLowerCase() }))
    .filter((participant) => {
      if (!participant.email || seenEmails.has(participant.email)) return false;
      seenEmails.add(participant.email);
      return true;
    })
    .map((participant) => ({ email: participant.email, ...(participant.name ? { name: participant.name } : {}) }));

  const conferencingProvider = CONFERENCING_BY_PROVIDER[input.grantProvider.toLowerCase()];

  return {
    title: input.title,
    description: input.description,
    when: {
      start_time: startTime,
      end_time: endTime,
      start_timezone: input.timeZone,
      end_timezone: input.timeZone,
    },
    ...(participants.length > 0 ? { participants } : {}),
    // A busca por metadata do Nylas v3 (metadata_pair) só funciona nas chaves
    // reservadas key1..key5 — a key1 é o vínculo pesquisável; o nome legível
    // fica junto para inspeção humana.
    metadata: { key1: input.appointmentId, lara_appointment_id: input.appointmentId },
    // Autocreate só existe para provedores com sala nativa; noutros grants
    // (ex.: iCloud) o campo é omitido e o evento nasce sem link de reunião.
    ...(input.createMeet && conferencingProvider
      ? { conferencing: { provider: conferencingProvider, autocreate: {} } }
      : {}),
  };
}

/** Extrai o essencial de um evento retornado pela API (tolerante a ausências). */
export function parseNylasEvent(value: unknown): { id: string; meetingUrl: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id) return null;
  const conferencing = record.conferencing as Record<string, unknown> | undefined;
  const details = conferencing?.details as Record<string, unknown> | undefined;
  const meetingUrl = typeof details?.url === 'string' && details.url ? details.url : null;
  return { id: record.id, meetingUrl };
}

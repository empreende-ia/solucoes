import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { currentWorkspaceId } from './workspace';
import type { Appointment, AppointmentMetadata } from '../types';

/**
 * Consultas da Agenda que o `api.ts` não cobre: conflito de horário, desfecho
 * da reunião e resolução de responsável.
 *
 * Sobre o status: `appointments.status` é TEXT sem CHECK no banco (migration
 * 20251128205837). O único vocabulário já em uso é 'scheduled' (padrão da
 * coluna e do orquestrador) e 'cancelled' (cancel_appointment, escrito com
 * dois L). Os desfechos abaixo estendem esse vocabulário mantendo a mesma
 * convenção. Não existe enum de status para violar, mas existe uma restrição
 * que importa: `appointments_workspace_no_overlap` (migration
 * 20260801150000_agent_action_governance.sql) é um EXCLUDE gist que barra dois
 * agendamentos sobrepostos NO MESMO WORKSPACE enquanto ambos estiverem
 * 'scheduled'. Ou seja: o banco recusa a escrita mesmo quando o conflito é com
 * outro responsável, e registrar um desfecho libera o horário.
 */

export type AppointmentStatus =
  | 'scheduled'
  | 'completed'
  | 'no_show'
  | 'rescheduled'
  | 'cancelled';

export type AppointmentOutcome = Exclude<AppointmentStatus, 'scheduled'>;

export const APPOINTMENT_OUTCOMES: AppointmentOutcome[] = [
  'completed',
  'no_show',
  'rescheduled',
  'cancelled',
];

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Marcada',
  completed: 'Compareceu',
  no_show: 'Não compareceu',
  rescheduled: 'Remarcou',
  cancelled: 'Cancelou',
};

/** Verbo do botão que registra cada desfecho. No máximo três palavras. */
export const APPOINTMENT_OUTCOME_ACTION: Record<AppointmentOutcome, string> = {
  completed: 'Compareceu',
  no_show: 'Não compareceu',
  rescheduled: 'Remarcou',
  cancelled: 'Cancelou',
};

export type StatusTone = 'neutral' | 'success' | 'alert' | 'destructive';

export const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  scheduled: 'neutral',
  completed: 'success',
  no_show: 'alert',
  rescheduled: 'neutral',
  cancelled: 'destructive',
};

/** Desfechos que contam no denominador da taxa de comparecimento. */
const ATTENDANCE_DENOMINATOR: AppointmentStatus[] = ['completed', 'no_show'];

export interface ScheduleOwner {
  /** `null` representa agendamento sem responsável definido. */
  id: string | null;
  name: string;
  isCurrentUser: boolean;
  count: number;
}

export interface ScheduleMetadata extends AppointmentMetadata {
  /** Quando o desfecho foi registrado, em ISO. */
  outcome_at?: string;
  /** Quem registrou o desfecho. */
  outcome_by?: string;
}

export interface ScheduleEntry extends Omit<Appointment, 'metadata'> {
  status: AppointmentStatus;
  ownerId: string | null;
  ownerName: string;
  isMine: boolean;
  /** Início local do compromisso, já resolvido a partir de date + time. */
  startsAt: Date;
  /** Fim local, calculado com a duração. */
  endsAt: Date;
  metadata?: ScheduleMetadata;
}

export interface ScheduleSnapshot {
  entries: ScheduleEntry[];
  owners: ScheduleOwner[];
  currentUserId: string | null;
  /** Nome de quem está logado, para assinar o desfecho registrado. */
  currentUserName: string | null;
}

// ---------------------------------------------------------------------------
// Datas e horas
// ---------------------------------------------------------------------------

/**
 * Chave YYYY-MM-DD no fuso local.
 *
 * `toISOString()` converte para UTC e, no Brasil, transforma tudo depois das
 * 21h no dia seguinte — o que fazia "hoje" mudar antes da meia-noite.
 */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Postgres devolve TIME como HH:MM:SS; a interface trabalha em HH:MM. */
export function normalizeTime(raw: string | null | undefined): string {
  if (!raw) return '00:00';
  const [hours = '00', minutes = '00'] = String(raw).split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function appointmentEndTime(time: string, duration: number): string {
  return minutesToTime(timeToMinutes(time) + (duration || 60));
}

/** Data local a partir de 'YYYY-MM-DD' e 'HH:MM', sem passar por UTC. */
export function parseLocalDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = normalizeTime(timeStr).split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
}

export function formatDateLabel(dateStr: string): string {
  return dateStr.split('-').reverse().join('/');
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function normalizeAppointmentStatus(raw: string | null | undefined): AppointmentStatus {
  const value = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (value) {
    case 'completed':
    case 'done':
    case 'attended':
    case 'realizada':
      return 'completed';
    case 'no_show':
    case 'noshow':
      return 'no_show';
    case 'rescheduled':
    case 'remarcada':
      return 'rescheduled';
    case 'cancelled':
    case 'canceled':
    case 'cancelada':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

/** Compromisso já encerrado no relógio e ainda sem desfecho registrado. */
export function isPendingClosure(entry: ScheduleEntry, now: Date = new Date()): boolean {
  return entry.status === 'scheduled' && entry.endsAt.getTime() < now.getTime();
}

export interface AttendanceStats {
  /** Reuniões com desfecho de presença registrado (compareceu + não compareceu). */
  closed: number;
  attended: number;
  noShow: number;
  /** Percentual de comparecimento, ou `null` quando nada foi fechado ainda. */
  rate: number | null;
}

export function attendanceStats(entries: ScheduleEntry[]): AttendanceStats {
  const closed = entries.filter(entry => ATTENDANCE_DENOMINATOR.includes(entry.status));
  const attended = closed.filter(entry => entry.status === 'completed').length;
  const noShow = closed.length - attended;
  return {
    closed: closed.length,
    attended,
    noShow,
    rate: closed.length ? Math.round((attended / closed.length) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Responsáveis
// ---------------------------------------------------------------------------

interface OwnerDirectory {
  currentUserId: string | null;
  names: Map<string, string>;
}

let directoryPromise: Promise<OwnerDirectory> | null = null;
let directoryLoadedAt = 0;

/** O nome de um colega muda pouco; recarregar a cada evento de realtime seria desperdício. */
const DIRECTORY_TTL_MS = 5 * 60 * 1000;

/**
 * Nome de cada responsável possível.
 *
 * `profiles` só deixa o dono ler a própria linha, então o nome dos colegas vem
 * de `team_members`, que é legível por qualquer autenticado e guarda o vínculo
 * com `user_id`. Quando o vínculo não existe, o agendamento aparece como
 * "Outro responsável" em vez de exibir um id cru.
 */
async function loadOwnerDirectory(): Promise<OwnerDirectory> {
  const expired = Date.now() - directoryLoadedAt > DIRECTORY_TTL_MS;
  if (!directoryPromise || expired) {
    directoryLoadedAt = Date.now();
    directoryPromise = (async () => {
      const names = new Map<string, string>();

      const { data: auth } = await supabase.auth.getUser();
      const currentUserId = auth?.user?.id ?? null;

      const { data: members } = await supabase
        .from('team_members')
        .select('user_id, name, email')
        .not('user_id', 'is', null);

      (members ?? []).forEach(member => {
        if (member.user_id) names.set(member.user_id, member.name || member.email);
      });

      if (currentUserId && !names.has(currentUserId)) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', currentUserId)
          .maybeSingle();

        const metadataName = (auth?.user?.user_metadata as { full_name?: string } | undefined)?.full_name;
        const fallback = profile?.full_name || metadataName || auth?.user?.email || 'Você';
        names.set(currentUserId, fallback);
      }

      return { currentUserId, names };
    })().catch((error: unknown) => {
      directoryPromise = null;
      directoryLoadedAt = 0;
      throw error;
    });
  }
  return directoryPromise;
}

function resolveOwnerName(directory: OwnerDirectory, ownerId: string | null): string {
  if (!ownerId) return 'Sem responsável';
  return directory.names.get(ownerId) ?? 'Outro responsável';
}

// ---------------------------------------------------------------------------
// Leitura da agenda
// ---------------------------------------------------------------------------

type AppointmentRow = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  type: Appointment['type'];
  description: string | null;
  attendees: string[] | null;
  contact_id: string | null;
  meeting_url: string | null;
  status: string | null;
  user_id: string | null;
  metadata: unknown;
  external_calendar_event_id: string | null;
  calendar_sync_status: string | null;
  calendar_synced_at: string | null;
  calendar_sync_error: string | null;
  contact?: { id: string; name: string | null; phone_number: string | null } | null;
};

function toEntry(row: AppointmentRow, directory: OwnerDirectory): ScheduleEntry {
  const time = normalizeTime(row.time);
  const duration = row.duration || 60;
  const startsAt = parseLocalDateTime(row.date, time);
  const endsAt = new Date(startsAt.getTime() + duration * 60000);

  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time,
    duration,
    type: row.type,
    description: row.description ?? undefined,
    attendees: row.attendees ?? [],
    contact_id: row.contact_id ?? undefined,
    contact: row.contact
      ? {
          id: row.contact.id,
          name: row.contact.name,
          phone_number: row.contact.phone_number ?? '',
        }
      : undefined,
    metadata: (row.metadata as ScheduleMetadata | null) ?? undefined,
    meeting_url: row.meeting_url ?? undefined,
    external_calendar_event_id: row.external_calendar_event_id ?? undefined,
    calendar_sync_status: (row.calendar_sync_status ?? undefined) as Appointment['calendar_sync_status'],
    calendar_synced_at: row.calendar_synced_at ?? undefined,
    calendar_sync_error: row.calendar_sync_error ?? undefined,
    status: normalizeAppointmentStatus(row.status),
    ownerId: row.user_id,
    ownerName: resolveOwnerName(directory, row.user_id),
    isMine: Boolean(row.user_id) && row.user_id === directory.currentUserId,
    startsAt,
    endsAt,
  };
}

const APPOINTMENT_COLUMNS = `
  id, title, date, time, duration, type, description, attendees, contact_id,
  meeting_url, status, user_id, metadata, external_calendar_event_id,
  calendar_sync_status, calendar_synced_at, calendar_sync_error,
  contact:contacts(id, name, phone_number)
`;

/**
 * Agenda completa do workspace, com status normalizado e responsável resolvido.
 *
 * A leitura continua sujeita à policy `appointments_workspace_read`: quem não é
 * membro ativo do workspace não recebe linha nenhuma.
 */
export async function fetchSchedule(): Promise<ScheduleSnapshot> {
  const directory = await loadOwnerDirectory();

  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_COLUMNS)
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (error) {
    console.error('[scheduling] Falha ao carregar a agenda:', error);
    throw error;
  }

  const entries = ((data ?? []) as unknown as AppointmentRow[]).map(row => toEntry(row, directory));
  return {
    entries,
    owners: buildOwners(entries, directory.currentUserId),
    currentUserId: directory.currentUserId,
    currentUserName: directory.currentUserId
      ? directory.names.get(directory.currentUserId) ?? null
      : null,
  };
}

function buildOwners(entries: ScheduleEntry[], currentUserId: string | null): ScheduleOwner[] {
  const byId = new Map<string, ScheduleOwner>();

  entries.forEach(entry => {
    const key = entry.ownerId ?? '';
    const existing = byId.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    byId.set(key, {
      id: entry.ownerId,
      name: entry.ownerName,
      isCurrentUser: entry.ownerId !== null && entry.ownerId === currentUserId,
      count: 1,
    });
  });

  return Array.from(byId.values()).sort((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
    if (a.id === null !== (b.id === null)) return a.id === null ? 1 : -1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

// ---------------------------------------------------------------------------
// Conflito de horário
// ---------------------------------------------------------------------------

export interface ScheduleConflict {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  ownerId: string | null;
  ownerName: string;
  /** Verdadeiro quando o choque é com a agenda do mesmo responsável. */
  sameOwner: boolean;
}

export interface ConflictReport {
  conflicts: ScheduleConflict[];
  sameOwner: ScheduleConflict[];
  otherOwner: ScheduleConflict[];
  /** Primeiro horário do mesmo dia sem sobreposição, ou `null` se não houver. */
  suggestion: string | null;
}

export const EMPTY_CONFLICT_REPORT: ConflictReport = {
  conflicts: [],
  sameOwner: [],
  otherOwner: [],
  suggestion: null,
};

/**
 * Primeira e última hora desenhadas nas visões de semana e de dia.
 *
 * A sugestão de horário livre usa exatamente a mesma faixa: sugerir um horário
 * que a grade não desenha faria o compromisso sumir da tela depois de salvo.
 */
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;

/** Janela em que a sugestão de horário livre procura, e o passo da busca. */
const SUGGESTION_START_MINUTES = GRID_START_HOUR * 60;
const SUGGESTION_END_MINUTES = GRID_END_HOUR * 60;
const SUGGESTION_STEP_MINUTES = 15;

/**
 * Linha da grade em que o compromisso aparece.
 *
 * Um horário fora da faixa desenhada é ancorado na primeira ou na última linha
 * em vez de desaparecer — o contador do cabeçalho conta todos os compromissos
 * do dia e precisa bater com o que está à vista.
 */
export function gridHour(time: string): number {
  const hour = Math.floor(timeToMinutes(time) / 60);
  return Math.min(GRID_END_HOUR, Math.max(GRID_START_HOUR, hour));
}

interface BusyBlock {
  start: number;
  end: number;
}

function overlaps(startA: number, endA: number, block: BusyBlock): boolean {
  return startA < block.end && endA > block.start;
}

/**
 * Compromissos que disputam o mesmo horário.
 *
 * Só linhas 'scheduled' entram, porque é exatamente o recorte da restrição
 * `appointments_workspace_no_overlap`: um horário com desfecho registrado
 * deixa de bloquear a agenda.
 */
export async function checkScheduleConflicts(input: {
  date: string;
  time: string;
  duration: number;
  ownerId?: string | null;
  excludeId?: string | null;
}): Promise<ConflictReport> {
  const { date, time, duration, ownerId = null, excludeId = null } = input;
  if (!date || !time) return EMPTY_CONFLICT_REPORT;

  const [directory, workspaceId] = await Promise.all([loadOwnerDirectory(), currentWorkspaceId()]);

  let query = supabase
    .from('appointments')
    .select('id, title, time, duration, user_id')
    .eq('workspace_id', workspaceId)
    .eq('date', date)
    .eq('status', 'scheduled');

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) {
    console.error('[scheduling] Falha ao verificar conflito de horário:', error);
    throw error;
  }

  const rows = (data ?? []).map(row => {
    const rowTime = normalizeTime(row.time);
    const rowDuration = row.duration || 60;
    return {
      id: row.id,
      title: row.title,
      time: rowTime,
      duration: rowDuration,
      ownerId: row.user_id,
      start: timeToMinutes(rowTime),
      end: timeToMinutes(rowTime) + rowDuration,
    };
  });

  const start = timeToMinutes(time);
  const end = start + (duration || 60);

  const conflicts: ScheduleConflict[] = rows
    .filter(row => overlaps(start, end, row))
    .map(row => ({
      id: row.id,
      title: row.title,
      date,
      time: row.time,
      endTime: minutesToTime(row.end),
      ownerId: row.ownerId,
      ownerName: resolveOwnerName(directory, row.ownerId),
      sameOwner: Boolean(ownerId) && row.ownerId === ownerId,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return {
    conflicts,
    sameOwner: conflicts.filter(conflict => conflict.sameOwner),
    otherOwner: conflicts.filter(conflict => !conflict.sameOwner),
    suggestion: conflicts.length
      ? suggestFreeTime(
          start,
          duration || 60,
          rows.map(row => ({ start: row.start, end: row.end })),
        )
      : null,
  };
}

/**
 * Primeiro horário do dia, a partir do pedido, em que a duração inteira cabe.
 *
 * A busca considera TODOS os compromissos do workspace, não só os do
 * responsável, porque a restrição do banco é por workspace.
 */
export function suggestFreeTime(
  requestedStart: number,
  duration: number,
  busy: BusyBlock[],
): string | null {
  const step = SUGGESTION_STEP_MINUTES;
  const first = Math.max(SUGGESTION_START_MINUTES, Math.ceil(requestedStart / step) * step);

  for (let candidate = first; candidate + duration <= SUGGESTION_END_MINUTES; candidate += step) {
    const clashes = busy.some(block => overlaps(candidate, candidate + duration, block));
    if (!clashes) return minutesToTime(candidate);
  }
  return null;
}

/**
 * Traduz a recusa do banco quando duas pessoas salvam o mesmo horário ao mesmo
 * tempo — a checagem da tela é uma leitura anterior à escrita e não impede a
 * corrida. `23P01` é a violação de EXCLUDE do Postgres.
 */
export function describeScheduleWriteError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23P01') {
    return 'Outro agendamento ocupou esse horário. Escolha um horário livre e salve de novo.';
  }
  const message = (error as { message?: string } | null)?.message;
  if (message && /no_overlap/i.test(message)) {
    return 'Outro agendamento ocupou esse horário. Escolha um horário livre e salve de novo.';
  }
  return 'Não foi possível salvar o agendamento.';
}

// ---------------------------------------------------------------------------
// Desfecho
// ---------------------------------------------------------------------------

/**
 * Registra o que aconteceu depois da reunião.
 *
 * A escrita é direta na tabela, sem passar pelo `api.updateAppointment`, para
 * não disparar uma sincronização de calendário externa a cada clique de
 * desfecho — o que mudou aqui é o registro interno, não o evento do provedor.
 * A policy `appointments_workspace_write` continua exigindo permissão de
 * edição no workspace.
 */
export async function registerAppointmentOutcome(
  entry: Pick<ScheduleEntry, 'id' | 'metadata'>,
  status: AppointmentStatus,
  actorName?: string | null,
): Promise<void> {
  const metadata: ScheduleMetadata = {
    ...(entry.metadata ?? {}),
  };

  if (status === 'scheduled') {
    delete metadata.outcome_at;
    delete metadata.outcome_by;
  } else {
    metadata.outcome_at = new Date().toISOString();
    if (actorName) metadata.outcome_by = actorName;
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status, metadata: metadata as unknown as Json })
    .eq('id', entry.id);

  if (error) {
    console.error('[scheduling] Falha ao registrar desfecho:', error);
    throw error;
  }
}

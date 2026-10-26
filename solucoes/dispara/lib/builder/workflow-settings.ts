// Configurações por workflow, estilo GHL (aba Settings): persistidas em
// workflows.settings (jsonb) e lidas pelo runtime:
//   - allowReentry   → enroll bulk (/enroll) e matcher CampaignReply do webhook
//   - stopOnResponse → webhook cancela waits de Delay quando o contato responde
//   - timeWindow     → executor pausa passos de COMUNICAÇÃO (whatsapp/*) fora da
//                      janela e retoma no próximo slot (como no GHL, não afeta
//                      tags/campos/oportunidades)

export type WorkflowTimeWindow = {
  enabled: boolean;
  /** "HH:MM" 24h no fuso configurado */
  start: string;
  end: string;
  /** dias ativos: 0=domingo … 6=sábado */
  days: number[];
  timezone?: string;
};

export type WorkflowSettings = {
  /** contato pode re-entrar no fluxo após completar (default true) */
  allowReentry?: boolean;
  /** encerra waits de Delay do fluxo quando o contato responde (default false) */
  stopOnResponse?: boolean;
  timeWindow?: WorkflowTimeWindow;
};

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseHm(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return TIME_RE.test(s) ? s : null;
}

/** Sanitiza o jsonb cru vindo do banco/PATCH para o shape conhecido. */
export function parseWorkflowSettings(raw: unknown): WorkflowSettings {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: WorkflowSettings = {};

  if (typeof obj.allowReentry === "boolean") out.allowReentry = obj.allowReentry;
  if (typeof obj.stopOnResponse === "boolean") out.stopOnResponse = obj.stopOnResponse;

  const tw = obj.timeWindow as Record<string, unknown> | undefined;
  if (tw && typeof tw === "object") {
    const start = parseHm(tw.start);
    const end = parseHm(tw.end);
    const days = Array.isArray(tw.days)
      ? tw.days
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    if (start && end) {
      out.timeWindow = {
        enabled: tw.enabled === true,
        start,
        end,
        days: Array.from(new Set(days)).sort(),
        timezone:
          typeof tw.timezone === "string" && tw.timezone.trim()
            ? tw.timezone.trim()
            : DEFAULT_TIMEZONE,
      };
    }
  }

  return out;
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Dia da semana (0-6) e minutos do dia de `date` no fuso `timezone`. */
function localWeekMinute(date: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday")
  );
  const hour = Number(get("hour")) % 24; // "24" à meia-noite em alguns runtimes
  const minute = Number(get("minute"));
  return Math.max(0, dayIndex) * 1440 + hour * 60 + minute;
}

const WEEK_MINUTES = 7 * 1440;

/**
 * Quantos ms faltam até a janela abrir. 0 = dentro da janela agora (ou janela
 * desativada/inválida — comunicação liberada). Janela sem nenhum dia ativo é
 * tratada como desativada (senão o fluxo travaria para sempre).
 */
export function timeWindowDelayMs(
  window: WorkflowTimeWindow | undefined,
  now: Date = new Date()
): number {
  if (!window?.enabled) return 0;
  const days = window.days.length > 0 ? window.days : null;
  if (!days) return 0;

  const startMin = hmToMinutes(window.start);
  const endMin = hmToMinutes(window.end);
  if (endMin <= startMin) return 0; // janela invertida/vazia → não bloquear

  const tz = window.timezone || DEFAULT_TIMEZONE;
  let nowWeekMin: number;
  try {
    nowWeekMin = localWeekMinute(now, tz);
  } catch {
    return 0; // fuso inválido → não bloquear
  }

  // Procura o próximo minuto-da-semana em que a janela está aberta.
  for (let offset = 0; offset < WEEK_MINUTES; offset += 1) {
    const wm = (nowWeekMin + offset) % WEEK_MINUTES;
    const day = Math.floor(wm / 1440);
    const minuteOfDay = wm % 1440;
    if (days.includes(day) && minuteOfDay >= startMin && minuteOfDay < endMin) {
      return offset * 60_000;
    }
  }
  return 0;
}

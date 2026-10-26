import { supabase } from '@/integrations/supabase/client';

/**
 * Placar de entrega da Lara.
 *
 * O dashboard antigo mede volume: conversas com atividade, deals ganhos somados
 * a agendamentos, tempo médio de resposta. Nada ali separa o que a agente fez do
 * que uma pessoa fez na mão, e o que falha na fila — lead sem resposta nenhuma —
 * não aparece.
 *
 * Aqui a leitura vem pronta do banco (RPC `lara_delivery_scoreboard`), agregada
 * por período e já com o período anterior para comparação. Nada de puxar
 * milhares de eventos para calcular percentil no navegador.
 */

// O cliente é tipado a partir do schema gerado, que ainda não conhece esta RPC.
const db = supabase as any;

/** SQLSTATE que a RPC levanta quando quem chama não tem workspace ativo. */
const SEM_WORKSPACE = '42501';

/**
 * Erro da RPC com o código do Postgres preservado.
 *
 * O postgrest-js devolve o erro como objeto simples (`JSON.parse` do corpo),
 * não como instância de `Error`: quem recebesse esse objeto cru e chamasse
 * `String(erro)` leria "[object Object]" e perderia tanto a mensagem quanto o
 * SQLSTATE. Aqui ele vira um Error de verdade, com `code` acessível.
 */
export class ScoreboardError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ScoreboardError';
    this.code = code;
  }
}

/** Diz se o erro é "usuário sem vínculo ativo com um workspace". */
export function isMissingWorkspaceError(error: unknown): boolean {
  if (error instanceof ScoreboardError) return error.code === SEM_WORKSPACE;
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.code === SEM_WORKSPACE) return true;
  return typeof candidate.message === 'string' && candidate.message.includes('vínculo');
}

export interface DeliveryPeriod {
  /** Início da janela, em ISO. */
  inicio: string;
  /** Fim da janela, em ISO. */
  fim: string;
  /** Conversas que receberam ao menos uma mensagem do lead na janela. */
  conversas: number;
  /** Conversas que a Lara respondeu e nas quais nenhum humano escreveu. */
  semHumano: number;
  /** Conversas cujo contato ganhou um agendamento dentro da janela. */
  comAgendamento: number;
  /** Mediana, em segundos, da espera até a primeira resposta da Lara. */
  medianaPrimeiraRespostaSegundos: number | null;
  /** Itens da fila do orquestrador que terminaram em falha. */
  falhasNaFila: number;
}

export interface DeliveryScoreboard {
  /** Tamanho da janela usado na consulta, em dias. */
  dias: number;
  atual: DeliveryPeriod;
  anterior: DeliveryPeriod;
}

interface ScoreboardRow {
  periodo: string;
  inicio: string;
  fim: string;
  conversas: number | null;
  sem_humano: number | null;
  com_agendamento: number | null;
  mediana_primeira_resposta_segundos: number | null;
  falhas_na_fila: number | null;
}

const emptyPeriod = (): DeliveryPeriod => ({
  inicio: '',
  fim: '',
  conversas: 0,
  semHumano: 0,
  comAgendamento: 0,
  medianaPrimeiraRespostaSegundos: null,
  falhasNaFila: 0,
});

const toNumber = (value: number | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPeriod = (row: ScoreboardRow | undefined): DeliveryPeriod => {
  if (!row) return emptyPeriod();
  const mediana = row.mediana_primeira_resposta_segundos;
  return {
    inicio: row.inicio ?? '',
    fim: row.fim ?? '',
    conversas: toNumber(row.conversas),
    semHumano: toNumber(row.sem_humano),
    comAgendamento: toNumber(row.com_agendamento),
    medianaPrimeiraRespostaSegundos:
      mediana === null || mediana === undefined || !Number.isFinite(Number(mediana))
        ? null
        : Number(mediana),
    falhasNaFila: toNumber(row.falhas_na_fila),
  };
};

/**
 * Busca o placar do workspace do usuário logado.
 *
 * A RPC devolve duas linhas — `atual` e `anterior` — para a mesma janela de
 * dias. Erro de permissão (usuário sem vínculo ativo) sobe para quem chamou:
 * silenciar viraria placar zerado, que é pior do que dizer o que houve.
 */
export async function fetchDeliveryScoreboard(days = 7): Promise<DeliveryScoreboard> {
  const { data, error } = await db.rpc('lara_delivery_scoreboard', { _days: days });
  if (error) {
    const raw = error as { message?: unknown; code?: unknown };
    throw new ScoreboardError(
      typeof raw.message === 'string' && raw.message ? raw.message : 'Falha ao carregar o placar.',
      typeof raw.code === 'string' ? raw.code : '',
    );
  }

  const rows = (Array.isArray(data) ? data : []) as ScoreboardRow[];
  return {
    dias: days,
    atual: toPeriod(rows.find((row) => row.periodo === 'atual')),
    anterior: toPeriod(rows.find((row) => row.periodo === 'anterior')),
  };
}

/** Percentual de conversas conduzidas sem nenhuma mensagem humana. */
export function autonomyRate(period: DeliveryPeriod): number | null {
  if (period.conversas <= 0) return null;
  return Math.round((period.semHumano / period.conversas) * 100);
}

/** Percentual de conversas que viraram agendamento. */
export function schedulingRate(period: DeliveryPeriod): number | null {
  if (period.conversas <= 0) return null;
  return Math.round((period.comAgendamento / period.conversas) * 100);
}

/**
 * Duração curta e legível: 42 s, 3 min, 1 h 20 min.
 * Sem casas decimais — a precisão de segundo não muda decisão nenhuma.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export type DeltaDirection = 'up' | 'down' | 'flat' | 'none';

export interface Delta {
  /** Rótulo pronto: +3, -2, ou traço quando não há base de comparação. */
  label: string;
  /** Direção do movimento do número em si, não do julgamento. */
  movement: 'up' | 'down' | 'flat';
  /** Como o movimento deve ser lido: favorável, desfavorável ou neutro. */
  direction: DeltaDirection;
}

/**
 * Variação absoluta contra o período anterior.
 *
 * Números absolutos, não percentuais: com base pequena — e a operação começa
 * pequena — "+200%" descreve duas conversas e engana quem lê. `higherIsBetter`
 * separa o movimento do julgamento: mais falhas de fila é o mesmo movimento
 * para cima, com o sinal contrário.
 */
export function absoluteDelta(current: number, previous: number, higherIsBetter = true): Delta {
  const diff = current - previous;
  if (diff === 0) {
    return { label: 'sem variação', movement: 'flat', direction: 'flat' };
  }
  const movement = diff > 0 ? 'up' : 'down';
  const favorable = higherIsBetter ? diff > 0 : diff < 0;
  return {
    label: `${diff > 0 ? '+' : '−'}${Math.abs(diff)}`,
    movement,
    direction: favorable ? 'up' : 'down',
  };
}

/** Variação de uma duração: menos tempo de espera é sempre melhor. */
export function durationDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null) {
    return { label: 'sem comparação', movement: 'flat', direction: 'none' };
  }
  const diff = current - previous;
  if (Math.abs(diff) < 1) {
    return { label: 'sem variação', movement: 'flat', direction: 'flat' };
  }
  return {
    label: `${diff > 0 ? '+' : '−'}${formatDuration(Math.abs(diff))}`,
    movement: diff > 0 ? 'up' : 'down',
    direction: diff < 0 ? 'up' : 'down',
  };
}

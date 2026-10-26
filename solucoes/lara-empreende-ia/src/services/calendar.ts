import { supabase } from '@/integrations/supabase/client';

export type CalendarProvider = 'nylas';

export interface CalendarStatus {
  provider: CalendarProvider;
  connected: boolean;
  status: 'active' | 'error' | 'disconnected';
  accountEmail: string | null;
  /** Provedor real por trás do grant Nylas ('google' | 'microsoft' | ...). */
  grantProvider?: string | null;
  calendarId: string;
  syncEnabled: boolean;
  createMeet: boolean;
  timeZone: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  /**
   * Esta instalação tem a integração de pé (credenciais + schema). `false`
   * significa que nada que o usuário faça na tela resolve. Só o Nylas informa;
   * no Google legado fica indefinido.
   */
  configured?: boolean;
  /** O que falta quando `configured` é `false`, para a tela ser específica. */
  missingConfig?: string[];
  /**
   * Provedores habilitados na conta Nylas ('google', 'microsoft', 'icloud'…).
   * `null` quando não deu para descobrir — aí a escolha fica com o Nylas.
   */
  providers?: string[] | null;
  /** De onde vieram as credenciais em uso: tela de configurações ou ambiente. */
  credentialsSource?: 'settings' | 'env' | null;
}

/**
 * Identidade da conexão ativa, para comparar antes e depois de uma tentativa
 * de autorização.
 *
 * Reconexão parte de uma conexão que já existe (`connected: true` com
 * `status: 'error'`), então esperar que `connected` fique verdadeiro daria
 * sucesso imediato, antes de a pessoa escolher a conta. O que prova a
 * autorização é a assinatura MUDAR.
 */
export function connectionSignature(status: CalendarStatus | null | undefined): string | null {
  if (!status?.connected) return null;
  return [status.provider, status.status, status.grantProvider ?? '', status.accountEmail ?? ''].join('|');
}

export interface CalendarSyncResult {
  total: number;
  synced: number;
  errors: Array<{ id: string; message: string }>;
}

/**
 * Falha vinda da edge function de agenda, com o código HTTP preservado.
 *
 * A classificação antiga era por regex no texto da mensagem, o que juntava
 * sessão expirada, falta de permissão, function não publicada e erro de
 * servidor na mesma frase. A tela precisa distinguir os quatro: só um deles é
 * culpa do usuário e só um deles tem solução na própria tela.
 */
export class CalendarError extends Error {
  /** Código HTTP da resposta, quando houve resposta. */
  readonly status: number | null;
  /** Mensagem crua do backend, para log e para a linha de detalhe técnico. */
  readonly detail: string | null;

  constructor(message: string, status: number | null, detail: string | null) {
    super(message);
    this.name = 'CalendarError';
    this.status = status;
    this.detail = detail;
  }

  /** Falha da instalação, não do usuário: nada na tela resolve. */
  get isStructural(): boolean {
    return this.status === 404 || (this.status !== null && this.status >= 500);
  }
}

function messageForStatus(status: number | null, detail: string | null): string {
  switch (status) {
    case 401:
      return 'Sua sessão expirou. Entre de novo e repita a operação.';
    case 403:
      return 'Sua conta não tem permissão de administrador para gerenciar a agenda.';
    case 404:
      return 'A função de agenda não está publicada neste ambiente. Isso é configuração do servidor.';
    default:
      if (status !== null && status >= 500) {
        return detail
          ? `O servidor recusou a operação: ${detail}`
          : 'O servidor recusou a operação de agenda.';
      }
      return detail || 'Não foi possível acessar a agenda agora.';
  }
}

const FUNCTION_BY_PROVIDER: Record<CalendarProvider, string> = {
  nylas: 'nylas-calendar',
};


async function invokeProvider<T = unknown>(provider: CalendarProvider, body: Record<string, unknown>): Promise<T> {
  const functionName = FUNCTION_BY_PROVIDER[provider];
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<{ error?: string }> } }).context;
    const status = typeof context?.status === 'number' ? context.status : null;
    let detail: string | null = null;
    try {
      if (context && typeof context.json === 'function') {
        const parsed = await context.json();
        detail = parsed?.error ?? null;
      }
    } catch {
      // A edge function não devolveu corpo JSON.
    }
    console.error(`[calendar] ${functionName} ${body.action} falhou`, status, detail || error.message);
    throw new CalendarError(messageForStatus(status, detail), status, detail || error.message);
  }
  if ((data as { error?: string })?.error) {
    const detail = (data as { error: string }).error;
    console.error(`[calendar] ${functionName} ${body.action} respondeu erro`, detail);
    throw new CalendarError(detail, 200, detail);
  }
  return data as T;
}

// A agenda é sempre o Nylas.


/**
 * Um dos dois campos vem preenchido. Não é união discriminada de propósito: o
 * tsconfig do projeto roda sem `strictNullChecks`, e ali o estreitamento por
 * discriminante não é confiável.
 */
type StatusProbe = { status: CalendarStatus | null; error: CalendarError | null };

async function statusOf(provider: CalendarProvider): Promise<StatusProbe> {
  try {
    const status = await invokeProvider<Omit<CalendarStatus, 'provider'>>(provider, { action: 'status' });
    return { status: { ...status, provider }, error: null };
  } catch (error) {
    const failure = error instanceof CalendarError
      ? error
      : new CalendarError(error instanceof Error ? error.message : 'Falha ao consultar a agenda.', null, null);
    return { status: null, error: failure };
  }
}

/**
 * Status sintético para quando a própria integração está fora do ar. Sem isto
 * a falha vira `null` e a tela desenha um "Não conectada" saudável — foi assim
 * que duas falhas de ambiente ficaram invisíveis por dias.
 */
function unavailableStatus(error: CalendarError): CalendarStatus {
  return {
    provider: 'nylas',
    connected: false,
    status: 'disconnected',
    accountEmail: null,
    grantProvider: null,
    calendarId: 'primary',
    syncEnabled: false,
    createMeet: false,
    timeZone: 'America/Sao_Paulo',
    lastSyncedAt: null,
    lastError: error.detail || error.message,
    configured: false,
    missingConfig: ['função de agenda indisponível'],
    providers: null,
  };
}

export const calendarApi = {
  async status(): Promise<CalendarStatus> {
    const nylas = await statusOf('nylas');
    // O Nylas carrega `configured` e a lista de provedores, então a resposta
    // dele é a certa mesmo quando ninguém conectou nada ainda.
    if (nylas.status) return nylas.status;
    // Erro de sessão ou de permissão é do usuário e sobe como erro. Falha de
    // instalação vira estado visível na tela, não exceção.
    const failure = nylas.error as CalendarError;
    if (!failure.isStructural) throw failure;
    return unavailableStatus(failure);
  },

  /**
   * `provider` pula o seletor do próprio Nylas; `loginHint` reautentica o
   * grant existente em vez de duplicar.
   */
  async connect(options: { provider?: string; loginHint?: string } = {}): Promise<string> {
    const data = await invokeProvider<{ authUrl: string }>('nylas', {
      action: 'connect',
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.loginHint ? { loginHint: options.loginHint } : {}),
    });
    return data.authUrl;
  },

  async updateSettings(settings: {
    syncEnabled?: boolean;
    createMeet?: boolean;
    timeZone?: string;
  }): Promise<void> {
    await invokeProvider('nylas', { action: 'update_settings', ...settings });
  },

  async syncAll(): Promise<CalendarSyncResult> {
    return await invokeProvider<CalendarSyncResult>('nylas', { action: 'sync_all' });
  },

  async syncEvent(appointmentId: string): Promise<{ synced: boolean; reason?: string }> {
    return await invokeProvider('nylas', { action: 'sync_event', appointmentId });
  },

  async deleteEvent(appointmentId: string): Promise<void> {
    await invokeProvider('nylas', { action: 'delete_event', appointmentId });
  },

  /** Salva as credenciais do Nylas. A edge function valida antes de gravar. */
  async saveCredentials(input: { clientId: string; apiKey: string; apiUri?: string }): Promise<void> {
    await invokeProvider('nylas', {
      action: 'save_credentials',
      clientId: input.clientId,
      apiKey: input.apiKey,
      ...(input.apiUri ? { apiUri: input.apiUri } : {}),
    });
  },

  async clearCredentials(): Promise<void> {
    await invokeProvider('nylas', { action: 'clear_credentials' });
  },

  async disconnect(): Promise<void> {
    await invokeProvider('nylas', { action: 'disconnect' });
  },

};

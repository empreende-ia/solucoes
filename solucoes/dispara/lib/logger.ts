/**
 * Structured Logger
 *
 * Provides structured logging with trace IDs and context
 * Ported from NossoFlow
 */

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
  traceId?: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  /**
   * Registra uma mensagem de nível INFO.
   *
   * @param message Mensagem principal do log.
   * @param context Contexto estruturado adicional (evite dados sensíveis).
   * @returns Nada.
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * Registra uma mensagem de nível WARN.
   *
   * @param message Mensagem principal do log.
   * @param context Contexto estruturado adicional (evite dados sensíveis).
   * @returns Nada.
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * Registra uma mensagem de nível ERROR.
   *
   * @param message Mensagem principal do log.
   * @param context Contexto estruturado adicional (evite dados sensíveis).
   * @returns Nada.
   */
  error(message: string, context?: Record<string, unknown>): void;

  /**
   * Registra uma mensagem de nível DEBUG.
   *
   * Observação: pode ser suprimido em produção dependendo da implementação.
   *
   * @param message Mensagem principal do log.
   * @param context Contexto estruturado adicional (evite dados sensíveis).
   * @returns Nada.
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * Retorna todos os logs armazenados em memória.
   *
   * @returns Uma cópia do buffer de logs.
   */
  getLogs(): LogEntry[];

  /**
   * Retorna logs filtrados por nível.
   *
   * @param level Nível do log.
   * @returns Lista de entradas do nível solicitado.
   */
  getLogsByLevel(level: LogEntry['level']): LogEntry[];

  /**
   * Limpa o buffer de logs em memória.
   *
   * @returns Nada.
   */
  clearLogs(): void;

  /**
   * Exporta o buffer de logs como JSON (string).
   *
   * @returns Logs serializados em JSON.
   */
  exportLogs(): string;
}

class StructuredLogger implements Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000; // Keep last 1000 logs in memory

  /**
   * Generates a unique trace ID for request tracking
   */
  private generateTraceId(): string {
    return crypto.randomUUID();
  }

  /**
   * Creates a log entry
   */
  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      level,
      message,
      timestamp: Date.now(),
      traceId: this.generateTraceId(),
      context,
    };
  }

  /**
   * Stores log entry in memory and outputs to console
   */
  private log(entry: LogEntry): void {
    // Add to memory
    this.logs.push(entry);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Output to console
    const timestamp = new Date(entry.timestamp).toISOString();
    const contextStr = entry.context ? JSON.stringify(entry.context) : '';
    const logMessage = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.traceId?.slice(0, 8)}] ${entry.message} ${contextStr}`;

    switch (entry.level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.debug(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }
  }

  /**
   * Logs an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(this.createLogEntry('info', message, context));
  }

  /**
   * Logs a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(this.createLogEntry('warn', message, context));
  }

  /**
   * Logs an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(this.createLogEntry('error', message, context));
  }

  /**
   * Logs a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(this.createLogEntry('debug', message, context));
  }

  /**
   * Gets all stored logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Gets logs filtered by level
   */
  getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Gets logs within a time range
   */
  getLogsByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.logs.filter(
      log => log.timestamp >= startTime && log.timestamp <= endTime
    );
  }

  /**
   * Clears all stored logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Exports logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const logger = new StructuredLogger();

/**
 * Gera um identificador único de rastreio (traceId) para correlacionar eventos.
 *
 * @returns Um UUID em formato string.
 */
export function generateTraceId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Convenience Functions for Common Logging Patterns
// ============================================================================

/**
 * Registra um log estruturado para uma requisição de API.
 *
 * @param method Método HTTP (ex.: GET, POST).
 * @param url URL/rota chamada.
 * @param data Payload opcional (será serializado para JSON quando possível).
 * @returns Nada.
 */
export function logApiRequest(method: string, url: string, data?: unknown): void {
  logger.info('API Request', {
    method,
    url,
    data: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Registra um log estruturado para uma resposta de API.
 *
 * @param method Método HTTP (ex.: GET, POST).
 * @param url URL/rota chamada.
 * @param status Status HTTP retornado.
 * @param data Payload opcional (será serializado para JSON quando possível).
 * @returns Nada.
 */
export function logApiResponse(method: string, url: string, status: number, data?: unknown): void {
  logger.info('API Response', {
    method,
    url,
    status,
    data: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Registra um erro de API com stack trace quando disponível.
 *
 * @param method Método HTTP (ex.: GET, POST).
 * @param url URL/rota chamada.
 * @param error Instância de erro capturada.
 * @returns Nada.
 */
export function logApiError(method: string, url: string, error: Error): void {
  logger.error('API Error', {
    method,
    url,
    error: error.message,
    stack: error.stack,
  });
}

/**
 * Registra um evento de campanha (telemetria de alto nível).
 *
 * @param campaignId ID da campanha.
 * @param event Nome do evento (ex.: "created", "sending", "completed").
 * @param data Dados adicionais do evento.
 * @returns Nada.
 */
export function logCampaignEvent(campaignId: string, event: string, data?: Record<string, unknown>): void {
  logger.info('Campaign Event', {
    campaignId,
    event,
    ...data,
  });
}

/**
 * Registra o resultado de envio de uma mensagem (sucesso/falha).
 *
 * @param phoneNumber Número do destinatário (idealmente já normalizado).
 * @param templateId Identificador do template usado.
 * @param status Resultado do envio.
 * @param error Mensagem/descrição do erro quando `status` for `failed`.
 * @returns Nada.
 */
export function logMessageSend(
  phoneNumber: string,
  templateId: string,
  status: 'success' | 'failed',
  error?: string
): void {
  if (status === 'success') {
    logger.info('Message Sent', {
      phoneNumber,
      templateId,
      status,
    });
  } else {
    logger.error('Message Send Failed', {
      phoneNumber,
      templateId,
      status,
      error,
    });
  }
}

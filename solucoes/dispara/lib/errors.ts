/**
 * Error Handling Utilities
 *
 * Classifies and handles different types of errors
 * Ported from NossoFlow with improvements
 */

import { logger } from './logger';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Categorias de erro suportadas pela aplicação.
 *
 * A UI e a camada de API usam estas categorias para:
 * - Exibir mensagens amigáveis consistentes.
 * - Decidir quando fazer retry automático.
 * - Indicar quando o usuário precisa agir (ex.: atualizar credenciais).
 */
export enum ErrorType {
  // User-fixable errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',

  // External errors (5xx, network)
  SERVER_ERROR = 'SERVER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Application errors
  STORAGE_ERROR = 'STORAGE_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Erro padronizado da aplicação.
 *
 * Use este erro para transportar metadados (tipo, mensagem amigável, contexto)
 * de forma consistente entre camadas (API Routes, serviços, hooks e UI).
 */
export class AppError extends Error {
  /**
   * Cria um erro de aplicação padronizado para toda a base.
   *
   * Este tipo agrega:
   * - Um "tipo" semântico (`ErrorType`) para facilitar classificação e UX.
   * - Mensagem técnica (`message`) para logs/diagnóstico.
   * - Mensagem amigável (`userMessage`) para exibição na interface.
   * - Código HTTP opcional (`statusCode`) e contexto estruturado (`context`).
   *
   * @param type Tipo/classificação do erro.
   * @param message Mensagem técnica (voltada a logs e debug).
   * @param userMessage Mensagem amigável (voltada ao usuário final).
   * @param statusCode Código HTTP associado, quando aplicável.
   * @param context Informações adicionais úteis para diagnóstico (não sensíveis).
   */
  constructor(
    public type: ErrorType,
    public override message: string,
    public userMessage: string,
    public statusCode?: number,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classifica um código de status HTTP em um {@link ErrorType}.
 *
 * Útil para transformar respostas HTTP (4xx/5xx) em categorias semânticas.
 *
 * @param statusCode Código HTTP (por ex. 401, 404, 429, 500).
 * @returns O {@link ErrorType} correspondente ao código.
 */
export function classifyHttpError(statusCode: number): ErrorType {
  if (statusCode === 401) return ErrorType.AUTHENTICATION_ERROR;
  if (statusCode === 403) return ErrorType.AUTHORIZATION_ERROR;
  if (statusCode === 404) return ErrorType.NOT_FOUND_ERROR;
  if (statusCode === 429) return ErrorType.RATE_LIMIT_ERROR;
  if (statusCode >= 400 && statusCode < 500) return ErrorType.VALIDATION_ERROR;
  if (statusCode >= 500) return ErrorType.SERVER_ERROR;

  return ErrorType.UNKNOWN_ERROR;
}

/**
 * Classifica erros vindos de chamadas à API do WhatsApp (Cloud API).
 *
 * A heurística considera:
 * - Falhas de rede (`fetch`), timeout (`AbortError`) e status HTTP.
 * - Códigos específicos retornados pela API do Meta/WhatsApp quando presentes.
 *
 * @param error Erro capturado (qualquer formato: Error, objeto de resposta, etc.).
 * @returns O {@link ErrorType} mais provável para o erro informado.
 */
export function classifyWhatsAppError(error: unknown): ErrorType {
  if (!error) return ErrorType.UNKNOWN_ERROR;

  const err = error as { name?: string; message?: string; response?: { status?: number }; error?: { code?: number } };

  // Network errors
  if (err.name === 'TypeError' && err.message?.includes('fetch')) {
    return ErrorType.NETWORK_ERROR;
  }

  // Timeout errors
  if (err.name === 'AbortError' || err.message?.includes('timeout')) {
    return ErrorType.TIMEOUT_ERROR;
  }

  // HTTP status code errors
  if (err.response?.status) {
    return classifyHttpError(err.response.status);
  }

  // WhatsApp-specific error codes
  if (err.error?.code) {
    const code = err.error.code;
    if (code === 190) return ErrorType.AUTHENTICATION_ERROR;
    if (code === 100) return ErrorType.VALIDATION_ERROR;
    if (code === 4) return ErrorType.RATE_LIMIT_ERROR;
    if (code === 10) return ErrorType.AUTHORIZATION_ERROR;
    if (code === 200) return ErrorType.AUTHORIZATION_ERROR; // Permissions error
  }

  return ErrorType.UNKNOWN_ERROR;
}

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.VALIDATION_ERROR]: 'Dados inválidos. Por favor, verifique as informações e tente novamente.',
  [ErrorType.AUTHENTICATION_ERROR]: 'Credenciais inválidas ou expiradas. Por favor, atualize suas credenciais.',
  [ErrorType.AUTHORIZATION_ERROR]: 'Access Token sem permissões necessárias. Gere um novo token no Meta Business Manager com as permissões: whatsapp_business_management, whatsapp_business_messaging.',
  [ErrorType.NOT_FOUND_ERROR]: 'Recurso não encontrado. Verifique o WABA ID e Phone Number ID.',
  [ErrorType.RATE_LIMIT_ERROR]: 'Limite de taxa excedido. Por favor, aguarde antes de tentar novamente.',
  [ErrorType.SERVER_ERROR]: 'Erro no servidor do WhatsApp. Por favor, tente novamente mais tarde.',
  [ErrorType.NETWORK_ERROR]: 'Erro de conexão. Verifique sua internet e tente novamente.',
  [ErrorType.TIMEOUT_ERROR]: 'A requisição demorou muito para responder. Tente novamente.',
  [ErrorType.STORAGE_ERROR]: 'Erro ao acessar armazenamento local. Verifique se há espaço disponível.',
  [ErrorType.PARSE_ERROR]: 'Erro ao processar dados. Verifique o formato do arquivo.',
  [ErrorType.UNKNOWN_ERROR]: 'Ocorreu um erro inesperado. Por favor, tente novamente.',
};

/**
 * Obtém uma mensagem amigável para exibição ao usuário.
 *
 * Se for um {@link AppError}, prioriza `userMessage` e faz fallback
 * para a tabela de mensagens padrão por {@link ErrorType}.
 *
 * @param error Tipo de erro ou instância de {@link AppError}.
 * @returns Mensagem amigável em pt-BR.
 */
export function getUserErrorMessage(error: ErrorType | AppError): string {
  if (error instanceof AppError) {
    return error.userMessage || ERROR_MESSAGES[error.type];
  }
  return ERROR_MESSAGES[error] || ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR];
}

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Normaliza um erro (geralmente de integração com API) em {@link AppError}.
 *
 * Além de classificar e montar mensagens, registra o erro via `logger`.
 * Quando a API fornece mensagem detalhada (por ex. erros de permissão #200),
 * ela é incorporada à mensagem para o usuário.
 *
 * @param error Erro bruto capturado em `try/catch`.
 * @param context Contexto adicional (ex.: endpoint, campaignId, payload resumido).
 * @returns Um {@link AppError} padronizado e pronto para ser tratado pela UI/API.
 */
export function handleApiError(error: unknown, context?: Record<string, unknown>): AppError {
  const errorType = classifyWhatsAppError(error);
  const err = error as { message?: string; response?: { status?: number }; error?: { message?: string; code?: number } };
  const statusCode = err.response?.status;
  const message = err.message || 'Unknown API error';

  // Extract WhatsApp API error message if available
  let userMessage = getUserErrorMessage(errorType);

  // If WhatsApp API provides a detailed error message, use it
  if (err.error?.message) {
    const apiMessage = err.error.message;

    // Check for specific permission errors (#200)
    if (apiMessage.includes('#200') || apiMessage.includes('permission')) {
      userMessage = 'Erro de permissão (#200): O Access Token não tem permissões para acessar os templates. Verifique no Meta Business Manager se o token possui as permissões: whatsapp_business_management, whatsapp_business_messaging.';
    } else {
      // Use API message with the generic user message
      userMessage = `${getUserErrorMessage(errorType)} Detalhes: ${apiMessage}`;
    }
  }

  const appError = new AppError(errorType, message, userMessage, statusCode, {
    ...context,
    originalError: error,
    apiError: err.error,
  });

  // Log error
  logger.error('API Error', {
    type: errorType,
    message,
    statusCode,
    apiErrorCode: err.error?.code,
    apiErrorMessage: err.error?.message,
    context,
  });

  return appError;
}

/**
 * Normaliza erros de armazenamento (localStorage/cache/etc.) para {@link AppError}.
 *
 * @param error Erro bruto capturado.
 * @param operation Descrição curta da operação (ex.: "save settings", "read cache").
 * @returns {@link AppError} do tipo {@link ErrorType.STORAGE_ERROR}.
 */
export function handleStorageError(error: unknown, operation: string): AppError {
  const err = error as { message?: string };
  const message = `Storage error during ${operation}: ${err.message}`;
  const userMessage = ERROR_MESSAGES[ErrorType.STORAGE_ERROR];

  const appError = new AppError(
    ErrorType.STORAGE_ERROR,
    message,
    userMessage,
    undefined,
    { operation, originalError: error }
  );

  logger.error('Storage Error', {
    operation,
    error: err.message,
  });

  return appError;
}

/**
 * Normaliza erros de parsing (CSV/JSON/etc.) para {@link AppError}.
 *
 * @param error Erro bruto capturado.
 * @param fileType Tipo/descrição do conteúdo (ex.: "CSV", "JSON").
 * @returns {@link AppError} do tipo {@link ErrorType.PARSE_ERROR}.
 */
export function handleParseError(error: unknown, fileType: string): AppError {
  const err = error as { message?: string };
  const message = `Parse error for ${fileType}: ${err.message}`;
  const userMessage = ERROR_MESSAGES[ErrorType.PARSE_ERROR];

  const appError = new AppError(
    ErrorType.PARSE_ERROR,
    message,
    userMessage,
    undefined,
    { fileType, originalError: error }
  );

  logger.error('Parse Error', {
    fileType,
    error: err.message,
  });

  return appError;
}

/**
 * Cria um {@link AppError} de validação para um campo específico.
 *
 * @param field Nome do campo (ex.: "phone", "templateName").
 * @param reason Motivo da falha de validação (mensagem curta).
 * @returns {@link AppError} do tipo {@link ErrorType.VALIDATION_ERROR}.
 */
export function handleValidationError(field: string, reason: string): AppError {
  const message = `Validation error for ${field}: ${reason}`;
  const userMessage = `${field}: ${reason}`;

  const appError = new AppError(
    ErrorType.VALIDATION_ERROR,
    message,
    userMessage,
    undefined,
    { field, reason }
  );

  logger.warn('Validation Error', {
    field,
    reason,
  });

  return appError;
}

// ============================================================================
// Error Recovery Strategies
// ============================================================================

/**
 * Indica se um {@link AppError} é recuperável com retry automático.
 *
 * Em geral, erros de rede/timeout/5xx são retryable.
 *
 * @param error Erro padronizado.
 * @returns `true` se o erro deve ser tentado novamente; caso contrário `false`.
 */
export function isRetryableError(error: AppError): boolean {
  return [
    ErrorType.NETWORK_ERROR,
    ErrorType.TIMEOUT_ERROR,
    ErrorType.SERVER_ERROR,
  ].includes(error.type);
}

/**
 * Calcula o atraso (em ms) para uma tentativa de retry com backoff exponencial.
 *
 * A recomendação do Meta/WhatsApp para backoff é $4^X$ (com X = número da tentativa).
 * Este método aplica o fator ao `baseDelay` e limita o máximo em 60s.
 *
 * @param attemptNumber Número da tentativa (0, 1, 2...).
 * @param baseDelay Delay base em ms (padrão: 1000ms).
 * @returns Delay em milissegundos, limitado a 60000ms.
 */
export function getRetryDelay(attemptNumber: number, baseDelay: number = 1000): number {
  // Exponential backoff: baseDelay * 4^attemptNumber (Meta recommended)
  // Max delay: 60 seconds
  return Math.min(baseDelay * Math.pow(4, attemptNumber), 60000);
}

/**
 * Indica se o erro exige ação do usuário (e não apenas retry).
 *
 * Exemplos: credenciais inválidas, falta de permissão, dados inválidos.
 *
 * @param error Erro padronizado.
 * @returns `true` se precisa de ação do usuário; caso contrário `false`.
 */
export function requiresUserAction(error: AppError): boolean {
  return [
    ErrorType.AUTHENTICATION_ERROR,
    ErrorType.AUTHORIZATION_ERROR,
    ErrorType.VALIDATION_ERROR,
  ].includes(error.type);
}

/**
 * Verifica se um código representa o rate limit por par (destinatário) do WhatsApp (131056).
 *
 * Esse limite ocorre quando a aplicação envia mensagens rápido demais para o mesmo número.
 *
 * @param errorCode Código do erro (string ou number) retornado pela API.
 * @returns `true` se for o erro 131056; caso contrário `false`.
 */
export function isPairRateLimitError(errorCode?: string | number): boolean {
  return errorCode === '131056' || errorCode === 131056;
}

/**
 * Retorna o tempo de espera recomendado para o rate limit por par.
 *
 * Atualmente usa 6 segundos conforme documentação do Meta.
 *
 * @returns Tempo de espera em milissegundos.
 */
export function getPairRateLimitWait(): number {
  return 6000; // 6 seconds per Meta documentation
}

/**
 * Rate Limiter - Token Bucket Algorithm
 *
 * Controls message sending rate to comply with WhatsApp API limits
 * Ported from NossoFlow with improvements
 */

export interface RateLimiter {
  /**
   * Solicita permissão (um "token") para executar uma ação.
   *
   * Caso não haja tokens disponíveis, aguarda até que o bucket seja reabastecido.
   *
   * @returns Uma Promise que resolve quando o token for adquirido.
   */
  acquire(): Promise<void>;

  /**
   * Reseta o limitador, reabastecendo o bucket até a capacidade máxima.
   *
   * @returns Nada.
   */
  reset(): void;

  /**
   * Informa quantos tokens (aproximadamente) estão disponíveis no momento.
   *
   * @returns Quantidade de tokens disponíveis.
   */
  getTokensAvailable(): number;

  /**
   * Interrompe timers/intervalos internos.
   *
   * Deve ser chamado quando o limitador não for mais utilizado para evitar leaks.
   *
   * @returns Nada.
   */
  stop(): void;

  /**
   * Atualiza a taxa de permissões (tokens por segundo).
   *
   * @param messagesPerSecond Nova taxa de mensagens/segundo.
   * @returns Nada.
   */
  updateRate(messagesPerSecond: number): void;
}

export const DEFAULT_RATE_LIMIT = 80; // messages per second
export const MAX_RATE_LIMIT = 1000;
export const MIN_RATE_LIMIT = 1;

export class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;
  private refillInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Cria um limitador de taxa baseado em Token Bucket.
   *
   * A capacidade do bucket e a taxa de refill são configuradas por `messagesPerSecond`.
   *
   * @param messagesPerSecond Limite máximo de mensagens por segundo.
   */
  constructor(messagesPerSecond: number = DEFAULT_RATE_LIMIT) {
    // Validate rate limit
    if (messagesPerSecond < MIN_RATE_LIMIT || messagesPerSecond > MAX_RATE_LIMIT) {
      throw new Error(`Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`);
    }

    this.maxTokens = messagesPerSecond;
    this.tokens = messagesPerSecond;
    this.refillRate = messagesPerSecond;
    this.lastRefill = Date.now();

    // Start refill interval (refill every second)
    this.startRefill();
  }

  /**
   * Starts the token refill interval
   */
  private startRefill(): void {
    this.refillInterval = setInterval(() => {
      const now = Date.now();
      const timePassed = (now - this.lastRefill) / 1000; // seconds
      const tokensToAdd = timePassed * this.refillRate;

      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }, 1000);
  }

  /**
   * Adquire um token (aguarda se não houver tokens disponíveis).
   *
   * @returns Promise que resolve quando o token é adquirido.
   */
  async acquire(): Promise<void> {
    // Wait until we have at least 1 token
    while (this.tokens < 1) {
      await this.sleep(50); // Check every 50ms
    }

    this.tokens -= 1;
  }

  /**
   * Reseta o limitador (reabastece o bucket até o máximo).
   *
   * @returns Nada.
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Retorna o número de tokens disponíveis (arredondado para baixo).
   *
   * @returns Tokens atualmente disponíveis.
   */
  getTokensAvailable(): number {
    return Math.floor(this.tokens);
  }

  /**
   * Interrompe o intervalo de refill.
   *
   * Chame quando terminar de usar o limitador para evitar vazamento de memória.
   *
   * @returns Nada.
   */
  stop(): void {
    if (this.refillInterval) {
      clearInterval(this.refillInterval);
      this.refillInterval = null;
    }
  }

  /**
   * Atualiza o limite de taxa (mensagens por segundo).
   *
   * @param messagesPerSecond Novo limite de mensagens/segundo.
   * @returns Nada.
   */
  updateRate(messagesPerSecond: number): void {
    if (messagesPerSecond < MIN_RATE_LIMIT || messagesPerSecond > MAX_RATE_LIMIT) {
      throw new Error(`Rate limit must be between ${MIN_RATE_LIMIT} and ${MAX_RATE_LIMIT}`);
    }

    // Stop current interval
    this.stop();

    // Update values
    this.maxTokens = messagesPerSecond;
    this.refillRate = messagesPerSecond;
    this.tokens = Math.min(this.tokens, this.maxTokens);

    // Restart refill
    this.startRefill();
  }

  /**
   * Helper to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Cria uma instância de {@link RateLimiter} com algoritmo Token Bucket.
 *
 * @param messagesPerSecond Limite de mensagens por segundo.
 * @returns Instância configurada de {@link RateLimiter}.
 */
export function createRateLimiter(messagesPerSecond: number = DEFAULT_RATE_LIMIT): RateLimiter {
  return new TokenBucketRateLimiter(messagesPerSecond);
}

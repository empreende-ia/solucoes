interface RpcClient {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export class RateLimitError extends Error {
  constructor(message = 'Limite de uso atingido. Aguarde um instante e tente novamente.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export async function consumeRateLimit(
  supabase: RpcClient,
  options: {
    workspaceId: string;
    subjectKey: string;
    operation: string;
    maxRequests: number;
    windowSeconds: number;
  },
): Promise<void> {
  const { data, error } = await supabase.rpc('consume_agent_rate_limit', {
    _workspace_id: options.workspaceId,
    _subject_key: options.subjectKey,
    _operation: options.operation,
    _max_requests: options.maxRequests,
    _window_seconds: options.windowSeconds,
  });
  if (error) {
    console.error('[RateLimit] Failed to consume limit:', error);
    throw new Error('Não foi possível validar o limite de uso. Tente novamente.');
  }
  if (data !== true) throw new RateLimitError();
}

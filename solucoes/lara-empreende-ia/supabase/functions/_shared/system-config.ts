// Auto-configuração portável do projeto (à prova de remix).
// As edge functions recebem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY corretos
// no ambiente de QUALQUER projeto Supabase — este helper replica esses valores
// para o Vault (via RPC ensure_edge_secrets), onde os cron jobs de varredura
// os leem. Assim nenhuma migration precisa hardcodar URL/chave do projeto.
// Chamado por initialize-system (primeiro signup) e lara-orchestrator
// (toda execução) — idempotente e barato: a RPC só escreve quando muda.

export async function ensureEdgeSecrets(supabase: any): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return;

    const { error } = await supabase.rpc('ensure_edge_secrets', {
      p_project_url: url,
      p_service_role_key: serviceKey,
    });
    if (error) console.error('[SystemConfig] ensure_edge_secrets error:', error.message);
  } catch (e) {
    console.error('[SystemConfig] ensure_edge_secrets failed:', e);
  }
}

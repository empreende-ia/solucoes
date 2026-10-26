interface SupabaseQueryClient {
  from: (table: string) => any;
}

export interface PublishedAgentRuntimeConfig {
  workspaceId: string;
  agentId: string;
  versionId: string;
  versionNumber: number;
  checksum: string;
  compilerVersion: string;
  compiledPrompt: string;
  config: Record<string, unknown>;
}

export interface DraftAgentRuntimeConfig {
  workspaceId: string;
  agentId: string;
  draftId: string;
  revision: number;
  config: Record<string, unknown>;
}

/** Por que o runtime não conseguiu atender. Vira error_message na fila e
 *  evento em agent_runtime_events — antes tudo virava um null mudo. */
export type RuntimeResolutionFailure =
  | 'sem_workspace'
  | 'sem_agente'
  | 'sem_versao_publicada';

export type PublishedAgentResolution =
  | { ok: true; config: PublishedAgentRuntimeConfig }
  | { ok: false; reason: RuntimeResolutionFailure; workspaceId: string | null };

export const RESOLUTION_MESSAGES: Record<RuntimeResolutionFailure, string> = {
  sem_workspace:
    'A conversa não está vinculada a nenhum workspace. Verifique o vínculo da conta em Configurações → Equipe.',
  sem_agente:
    'O workspace não tem uma agente ativa. Abra Configurações → Agente para criar a configuração.',
  sem_versao_publicada:
    'Nenhuma versão publicada da agente está disponível. Publique em Configurações → Agente → Testar e publicar.',
};

/** Conversa vista pelo runtime: o lead nunca é usuário do sistema, então
 *  user_id é quase sempre nulo — quem manda é workspace_id. */
export interface ConversationRuntimeRef {
  workspace_id?: string | null;
  user_id?: string | null;
}

export async function userCanEditAgent(
  supabase: SupabaseQueryClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('role', ['admin', 'editor'])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[AgentConfig] Failed to verify edit permission:', error);
    return false;
  }
  return Boolean(data?.id);
}

async function workspaceIdForUser(
  supabase: SupabaseQueryClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[AgentConfig] Failed to resolve workspace membership:', error);
    return null;
  }
  return data?.workspace_id ?? null;
}

/**
 * Resolve o workspace de uma conversa em três tentativas, da mais confiável
 * para a mais frouxa:
 *   1. conversations.workspace_id — preenchido por trigger em toda inserção
 *   2. vínculo do user_id da conversa — histórico anterior ao trigger
 *   3. workspace ativo único — instalação single-tenant, que é o caso do template
 */
export async function resolveConversationWorkspaceId(
  supabase: SupabaseQueryClient,
  conversation: ConversationRuntimeRef | null | undefined,
): Promise<string | null> {
  if (conversation?.workspace_id) return conversation.workspace_id;

  if (conversation?.user_id) {
    const byMembership = await workspaceIdForUser(supabase, conversation.user_id);
    if (byMembership) return byMembership;
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(2);

  if (error) {
    console.error('[AgentConfig] Failed to resolve active workspace:', error);
    return null;
  }
  // Com mais de um workspace ativo, adivinhar seria pior do que falhar.
  if (Array.isArray(data) && data.length === 1) return data[0].id;
  return null;
}

async function fetchPublishedForWorkspace(
  supabase: SupabaseQueryClient,
  workspaceId: string,
): Promise<PublishedAgentResolution> {
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, published_version_id')
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .maybeSingle();

  if (agentError) {
    console.error('[AgentConfig] Failed to resolve workspace agent:', agentError);
    return { ok: false, reason: 'sem_agente', workspaceId };
  }
  if (!agent?.id) return { ok: false, reason: 'sem_agente', workspaceId };
  if (!agent.published_version_id) {
    return { ok: false, reason: 'sem_versao_publicada', workspaceId };
  }

  const { data: version, error: versionError } = await supabase
    .from('agent_versions')
    .select('id, version_number, checksum, compiler_version, compiled_prompt, config')
    .eq('id', agent.published_version_id)
    .eq('agent_id', agent.id)
    .maybeSingle();

  if (versionError) {
    console.error('[AgentConfig] Failed to resolve published agent version:', versionError);
    return { ok: false, reason: 'sem_versao_publicada', workspaceId };
  }
  if (!version?.compiled_prompt) {
    return { ok: false, reason: 'sem_versao_publicada', workspaceId };
  }

  return {
    ok: true,
    config: {
      workspaceId,
      agentId: agent.id,
      versionId: version.id,
      versionNumber: version.version_number,
      checksum: version.checksum,
      compilerVersion: version.compiler_version || 'unknown',
      compiledPrompt: version.compiled_prompt,
      config: version.config ?? {},
    },
  };
}

/**
 * Caminho do runtime de produção. Resolve pelo workspace da CONVERSA — o lead
 * não tem conta, então resolver por user_id fazia toda mensagem real falhar.
 * Devolve o motivo da falha em vez de null, para que a fila e a observabilidade
 * consigam dizer o que aconteceu.
 */
export async function fetchPublishedAgentRuntimeConfigForConversation(
  supabase: SupabaseQueryClient,
  conversation: ConversationRuntimeRef | null | undefined,
): Promise<PublishedAgentResolution> {
  const workspaceId = await resolveConversationWorkspaceId(supabase, conversation);
  if (!workspaceId) return { ok: false, reason: 'sem_workspace', workspaceId: null };
  return await fetchPublishedForWorkspace(supabase, workspaceId);
}

/** Resolve a versão publicada a partir de um USUÁRIO autenticado (health-check,
 *  validações de tela). Para atender lead, use a variante por conversa. */
export async function fetchPublishedAgentRuntimeConfig(
  supabase: SupabaseQueryClient,
  userId: string | null | undefined,
): Promise<PublishedAgentRuntimeConfig | null> {
  if (!userId) return null;
  const workspaceId = await workspaceIdForUser(supabase, userId);
  if (!workspaceId) return null;
  const resolution = await fetchPublishedForWorkspace(supabase, workspaceId);
  return resolution.ok ? resolution.config : null;
}

/** Resolve o rascunho atual para simulação. Nunca deve ser usado no runtime
 * real, que permanece preso à versão publicada. */
export async function fetchAgentDraftRuntimeConfig(
  supabase: SupabaseQueryClient,
  userId: string | null | undefined,
): Promise<DraftAgentRuntimeConfig | null> {
  if (!userId) return null;

  const workspaceId = await workspaceIdForUser(supabase, userId);
  if (!workspaceId) return null;

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id')
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .maybeSingle();
  if (agentError || !agent?.id) return null;

  const { data: draft, error: draftError } = await supabase
    .from('agent_drafts')
    .select('id, revision, config')
    .eq('agent_id', agent.id)
    .maybeSingle();
  if (draftError || !draft?.id) return null;

  return {
    workspaceId,
    agentId: agent.id,
    draftId: draft.id,
    revision: draft.revision,
    config: draft.config ?? {},
  };
}

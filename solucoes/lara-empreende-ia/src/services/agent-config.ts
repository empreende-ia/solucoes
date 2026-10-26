import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { parseAgentConfig, type AgentConfig } from '@/domain/agent-config';

export type WorkspaceMemberRole = 'admin' | 'editor' | 'observer';
export type AgentStatus = 'configuring' | 'active' | 'attention' | 'blocked' | 'archived';

export interface AgentContext {
  workspaceId: string;
  workspaceName: string;
  memberRole: WorkspaceMemberRole;
  canPublish: boolean;
  agentId: string;
  agentName: string;
  agentStatus: AgentStatus;
  publishedVersionId: string | null;
  draftId: string;
  draftConfig: AgentConfig;
  draftRevision: number;
  baseVersionId: string | null;
  draftUpdatedAt: string;
}

export interface AgentDraft {
  id: string;
  workspaceId: string;
  agentId: string;
  config: AgentConfig;
  revision: number;
  baseVersionId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentVersion {
  id: string;
  workspaceId: string;
  agentId: string;
  versionNumber: number;
  config: AgentConfig;
  checksum: string;
  compilerVersion: string;
  label: string | null;
  source: 'manual' | 'onboarding' | 'restoration' | 'migration';
  evaluationRunId: string | null;
  acceptedWarnings: Json[];
  restoredFromVersionId: string | null;
  createdBy: string | null;
  publishedAt: string;
  createdAt: string;
}

interface RawAgentContext {
  workspace_id: string;
  workspace_name: string;
  member_role: WorkspaceMemberRole;
  can_publish: boolean;
  agent_id: string;
  agent_name: string;
  agent_status: AgentStatus;
  published_version_id: string | null;
  draft_id: string;
  draft_config: unknown;
  draft_revision: number;
  base_version_id: string | null;
  draft_updated_at: string;
}

interface RawAgentDraft {
  id: string;
  workspace_id: string;
  agent_id: string;
  config: unknown;
  revision: number;
  base_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RawAgentVersion {
  id: string;
  workspace_id: string;
  agent_id: string;
  version_number: number;
  config: unknown;
  checksum: string;
  compiler_version: string;
  label: string | null;
  source: AgentVersion['source'];
  evaluation_run_id: string | null;
  accepted_warnings: Json[] | null;
  restored_from_version_id: string | null;
  created_by: string | null;
  published_at: string;
  created_at: string;
}

export class AgentDraftConflictError extends Error {
  constructor(message = 'O rascunho foi alterado em outra sessão.') {
    super(message);
    this.name = 'AgentDraftConflictError';
  }
}

export class AgentConfigurationError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly issues: AgentCompilerIssue[] = [],
    public readonly actualRevision?: number,
  ) {
    super(message);
    this.name = 'AgentConfigurationError';
  }
}

export interface AgentCompilerIssue {
  code: string;
  severity: 'warning' | 'blocking';
  field: string;
  message: string;
}

export interface AgentPromptPreview {
  agentId: string;
  draftRevision: number;
  baseVersionId: string | null;
  publishedVersionId: string | null;
  compilerVersion: string;
  artifactChecksum: string;
  prompt: string;
  sections: string[];
  issues: AgentCompilerIssue[];
  hasBlockingIssues: boolean;
}

async function throwAgentFunctionError(error: unknown, fallback: string): Promise<never> {
  const functionError = error as {
    message?: string;
    context?: { json?: () => Promise<unknown> };
  };
  type AgentFunctionErrorDetail = {
    error?: string;
    code?: string;
    issues?: AgentCompilerIssue[];
    actual_revision?: number;
  };
  let detail: AgentFunctionErrorDetail | null = null;

  try {
    if (typeof functionError.context?.json === 'function') {
      detail = await functionError.context.json() as AgentFunctionErrorDetail;
    }
  } catch {
    // Mantém a mensagem da SDK quando a função não devolve um corpo JSON.
  }

  throw new AgentConfigurationError(
    detail?.error || functionError.message || fallback,
    detail?.code,
    Array.isArray(detail?.issues) ? detail.issues : [],
    detail?.actual_revision,
  );
}

// Os tipos do Supabase são gerados a partir do ambiente remoto. A interface
// abaixo mantém a fronteira desta migration tipada até a próxima regeneração.
const agentDb = supabase as unknown as {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  from: (table: string) => any;
};

function throwAgentError(error: { code?: string; message: string } | null): never {
  if (error?.code === '40001') {
    throw new AgentDraftConflictError(error.message);
  }
  throw new Error(error?.message || 'Não foi possível atualizar a configuração da agente.');
}

function mapDraft(row: RawAgentDraft): AgentDraft {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    config: parseAgentConfig(row.config),
    revision: row.revision,
    baseVersionId: row.base_version_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: RawAgentVersion): AgentVersion {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    versionNumber: row.version_number,
    config: parseAgentConfig(row.config),
    checksum: row.checksum,
    compilerVersion: row.compiler_version,
    label: row.label,
    source: row.source,
    evaluationRunId: row.evaluation_run_id,
    acceptedWarnings: row.accepted_warnings ?? [],
    restoredFromVersionId: row.restored_from_version_id,
    createdBy: row.created_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function firstRpcRow<T>(data: unknown): T {
  const row = (Array.isArray(data) ? data[0] : data) as T | null;
  if (!row) throw new Error('O banco não retornou o registro atualizado.');
  return row;
}

export async function getCurrentAgentContext(): Promise<AgentContext | null> {
  const { data, error } = await agentDb.rpc('get_current_agent_context');
  if (error) throwAgentError(error);

  const row = (Array.isArray(data) ? data[0] : data) as RawAgentContext | null;
  if (!row) return null;

  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    memberRole: row.member_role,
    canPublish: row.can_publish,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentStatus: row.agent_status,
    publishedVersionId: row.published_version_id,
    draftId: row.draft_id,
    draftConfig: parseAgentConfig(row.draft_config),
    draftRevision: row.draft_revision,
    baseVersionId: row.base_version_id,
    draftUpdatedAt: row.draft_updated_at,
  };
}

export async function saveAgentDraft(
  agentId: string,
  config: AgentConfig,
  expectedRevision: number,
): Promise<AgentDraft> {
  const validated = parseAgentConfig(config);
  const { data, error } = await agentDb.rpc('save_agent_draft', {
    _agent_id: agentId,
    _config: validated,
    _expected_revision: expectedRevision,
  });
  if (error) throwAgentError(error);
  return mapDraft(firstRpcRow<RawAgentDraft>(data));
}

export async function publishAgentDraft(input: {
  agentId: string;
  expectedRevision: number;
  evaluationRunId?: string | null;
  label?: string | null;
  acceptedWarningCodes?: string[];
  acceptEvaluationWarnings?: boolean;
}): Promise<AgentVersion> {
  const { data, error } = await supabase.functions.invoke('agent-configuration', {
    body: {
      action: 'publish',
      agent_id: input.agentId,
      expected_revision: input.expectedRevision,
      evaluation_run_id: input.evaluationRunId ?? null,
      label: input.label ?? null,
      accepted_warning_codes: input.acceptedWarningCodes ?? [],
      accept_evaluation_warnings: input.acceptEvaluationWarnings === true,
    },
  });
  if (error) await throwAgentFunctionError(error, 'Não foi possível publicar a agente.');
  if (!data?.version) throw new Error(data?.error || 'A publicação não retornou uma versão.');
  return mapVersion(data.version as RawAgentVersion);
}

export async function getAgentCompiledPromptPreview(agentId: string): Promise<AgentPromptPreview> {
  const { data, error } = await supabase.functions.invoke('agent-configuration', {
    body: { action: 'preview', agent_id: agentId },
  });
  if (error) await throwAgentFunctionError(error, 'Não foi possível compilar o rascunho.');
  if (!data?.prompt) throw new Error(data?.error || 'O compilador não retornou um prompt.');

  return {
    agentId: data.agent_id,
    draftRevision: data.draft_revision,
    baseVersionId: data.base_version_id,
    publishedVersionId: data.published_version_id,
    compilerVersion: data.compiler_version,
    artifactChecksum: data.artifact_checksum,
    prompt: data.prompt,
    sections: data.sections ?? [],
    issues: data.issues ?? [],
    hasBlockingIssues: data.has_blocking_issues === true,
  };
}

export async function restoreAgentVersionToDraft(
  agentId: string,
  versionId: string,
  expectedRevision: number,
): Promise<AgentDraft> {
  const { data, error } = await agentDb.rpc('restore_agent_version_to_draft', {
    _agent_id: agentId,
    _version_id: versionId,
    _expected_revision: expectedRevision,
  });
  if (error) throwAgentError(error);
  return mapDraft(firstRpcRow<RawAgentDraft>(data));
}

export async function listAgentVersions(agentId: string): Promise<AgentVersion[]> {
  const { data, error } = await agentDb
    .from('agent_versions')
    .select([
      'id',
      'workspace_id',
      'agent_id',
      'version_number',
      'config',
      'checksum',
      'compiler_version',
      'label',
      'source',
      'evaluation_run_id',
      'accepted_warnings',
      'restored_from_version_id',
      'created_by',
      'published_at',
      'created_at',
    ].join(','))
    .eq('agent_id', agentId)
    .order('version_number', { ascending: false });
  if (error) throwAgentError(error);
  return ((data ?? []) as RawAgentVersion[]).map(mapVersion);
}

import { supabase } from '@/integrations/supabase/client';

/**
 * Convite de acesso ao workspace.
 *
 * O cadastro público do Supabase está desabilitado. A única porta de entrada é
 * a allowlist (public.signup_allowlist), alimentada pela edge function
 * team-invite — que também cria a conta pela Admin API. Nada aqui escreve
 * direto na tabela: a tela nunca tem permissão para isso, e é a função que
 * valida se quem convida é administrador.
 */

export type WorkspaceRole = 'admin' | 'editor' | 'observer';

export const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  observer: 'Atendente',
};

export const WORKSPACE_ROLE_HINT: Record<WorkspaceRole, string> = {
  admin: 'Configura a agente, publica versões e convida outras pessoas.',
  editor: 'Configura a agente e trabalha as conversas.',
  observer: 'Trabalha as conversas e consulta a configuração sem alterar.',
};

export interface AccessInvite {
  email: string;
  name: string | null;
  workspaceRole: WorkspaceRole;
  canPublishAgent: boolean;
  appRole: 'admin' | 'user';
  invitedByName: string | null;
  createdAt: string | null;
  inviteSentAt: string | null;
  claimedAt: string | null;
  accepted: boolean;
}

export interface AccessInviteResult {
  /** convite_enviado: saiu e-mail. link_manual / conta_existente: entregar o link na mão. */
  status: 'convite_enviado' | 'link_manual' | 'conta_existente';
  email: string;
  actionLink: string | null;
  message: string;
}

export interface RevokeInviteResult {
  email: string;
  inviteRemoved: boolean;
  accessesDisabled: number;
}

interface RawInvite {
  email?: string;
  invited_name?: string | null;
  workspace_role?: string | null;
  can_publish_agent?: boolean | null;
  app_role?: string | null;
  invited_by_name?: string | null;
  created_at?: string | null;
  invite_sent_at?: string | null;
  claimed_at?: string | null;
  situacao?: string | null;
}

/**
 * A SDK devolve só "Edge Function returned a non-2xx status code"; a mensagem
 * que o operador precisa ler está no corpo da resposta.
 */
async function readFunctionError(error: unknown, fallback: string): Promise<Error> {
  const functionError = error as { message?: string; context?: { json?: () => Promise<unknown> } };
  try {
    if (typeof functionError.context?.json === 'function') {
      const detail = (await functionError.context.json()) as { error?: string };
      if (detail?.error) return new Error(detail.error);
    }
  } catch {
    // Sem corpo JSON: fica a mensagem da SDK.
  }
  return new Error(functionError.message || fallback);
}

function toWorkspaceRole(value: unknown): WorkspaceRole {
  return value === 'admin' || value === 'editor' || value === 'observer' ? value : 'observer';
}

function mapInvite(raw: RawInvite): AccessInvite {
  return {
    email: String(raw.email ?? ''),
    name: raw.invited_name ?? null,
    workspaceRole: toWorkspaceRole(raw.workspace_role),
    canPublishAgent: raw.can_publish_agent === true,
    appRole: raw.app_role === 'admin' ? 'admin' : 'user',
    invitedByName: raw.invited_by_name ?? null,
    createdAt: raw.created_at ?? null,
    inviteSentAt: raw.invite_sent_at ?? null,
    claimedAt: raw.claimed_at ?? null,
    accepted: raw.situacao === 'aceito' || Boolean(raw.claimed_at),
  };
}

export async function listAccessInvites(): Promise<AccessInvite[]> {
  const { data, error } = await supabase.functions.invoke('team-invite', {
    body: { action: 'list' },
  });
  if (error) throw await readFunctionError(error, 'Não foi possível carregar os convites.');
  const rows = Array.isArray(data?.invites) ? (data.invites as RawInvite[]) : [];
  return rows.map(mapInvite);
}

export async function sendAccessInvite(input: {
  email: string;
  workspaceRole: WorkspaceRole;
  canPublishAgent?: boolean;
  name?: string;
  note?: string;
}): Promise<AccessInviteResult> {
  const { data, error } = await supabase.functions.invoke('team-invite', {
    body: {
      action: 'invite',
      email: input.email,
      workspace_role: input.workspaceRole,
      can_publish_agent: input.canPublishAgent === true,
      name: input.name ?? null,
      note: input.note ?? null,
      // O link volta para esta mesma origem, onde a tela de acesso já sabe
      // tratar o token de definição de senha.
      redirect_to: `${window.location.origin}/auth?recovery=1`,
    },
  });
  if (error) throw await readFunctionError(error, 'Não foi possível enviar o convite.');
  if (!data?.status) throw new Error(data?.error || 'O convite não retornou resultado.');

  return {
    status: data.status,
    email: String(data.email ?? input.email),
    actionLink: data.action_link ?? null,
    message: String(data.mensagem ?? 'Convite registrado.'),
  };
}

export async function revokeAccessInvite(email: string): Promise<RevokeInviteResult> {
  const { data, error } = await supabase.functions.invoke('team-invite', {
    body: { action: 'revoke', email },
  });
  if (error) throw await readFunctionError(error, 'Não foi possível revogar o convite.');
  const revoked = data?.revoked ?? {};
  return {
    email: String(revoked.email ?? email),
    inviteRemoved: revoked.convite_removido === true,
    accessesDisabled: Number(revoked.acessos_desativados ?? 0),
  };
}

/** Papel operacional (team_members) para papel de workspace (workspace_members). */
export function workspaceRoleForTeamRole(role: string): WorkspaceRole {
  if (role === 'admin') return 'admin';
  if (role === 'manager') return 'editor';
  return 'observer';
}

/** O usuário logado é administrador do app? A policy de user_roles deixa cada um ler o próprio papel. */
export async function isCurrentUserAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

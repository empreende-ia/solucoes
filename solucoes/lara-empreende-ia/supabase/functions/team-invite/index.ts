// Convite de acesso da equipe.
//
// O cadastro público está fechado desde 04/09/2026. Esta função é a única porta
// de entrada: um admin autenticado registra o e-mail na allowlist e a conta é
// criada pela Admin API do Supabase. A ordem importa — a linha da allowlist
// entra ANTES da criação da conta, porque o trigger handle_new_user lê a
// allowlist para decidir o papel e chamar ensure_workspace_membership.
//
// Ações: invite | list | revoke.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Envolvido em função para que ServiceClient herde o tipo exato do cliente e as
// chamadas .rpc/.from continuem tipadas nos helpers deste arquivo.
function createServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type WorkspaceRole = 'admin' | 'editor' | 'observer';

const WORKSPACE_ROLES: WorkspaceRole[] = ['admin', 'editor', 'observer'];

// O e-mail da allowlist é a chave primária e é sempre gravado em minúsculas,
// sem espaço nas pontas. Toda comparação no banco assume isso.
function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function readableText(value: unknown, max = 160): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

// O destino do link vem do front (a origem publicada muda entre preview e
// produção). Só aceitamos URL absoluta http(s); o Supabase ainda valida contra
// a lista de redirects do projeto, então isto é a primeira barreira, não a única.
function safeRedirect(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function looksLikeExistingAccount(error: { message?: string; code?: string; status?: number } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '').toLowerCase();
  if (code === 'email_exists' || code === 'user_already_exists') return true;
  const message = String(error.message ?? '').toLowerCase();
  return (
    message.includes('already been registered') ||
    message.includes('already registered') ||
    message.includes('already exists')
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const service = createServiceClient();

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json(401, { error: 'Faça login para gerenciar convites.' });

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) {
      return json(401, { error: 'Sessão inválida. Entre novamente.' });
    }
    const actor = userData.user;

    const { data: isAdmin, error: roleError } = await service.rpc('has_role', {
      _user_id: actor.id,
      _role: 'admin',
    });
    if (roleError) throw roleError;
    if (isAdmin !== true) {
      return json(403, { error: 'Apenas administradores gerenciam convites de acesso.' });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'list');

    // ---------------------------------------------------------
    // list
    // ---------------------------------------------------------
    if (action === 'list') {
      const { data, error } = await service
        .from('signup_invites')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return json(200, { invites: data ?? [] });
    }

    // ---------------------------------------------------------
    // revoke
    // ---------------------------------------------------------
    if (action === 'revoke') {
      const email = normalizeEmail(body.email);
      if (!isValidEmail(email)) return json(400, { error: 'Informe um e-mail válido.' });

      const { data, error } = await service.rpc('revoke_signup_invite', {
        _email: email,
        _actor_id: actor.id,
      });
      if (error) {
        // A função levanta exceção com texto pronto para a tela (último admin,
        // próprio acesso, e-mail em branco).
        return json(400, { error: error.message ?? 'Não foi possível revogar o convite.' });
      }
      return json(200, { revoked: data });
    }

    // ---------------------------------------------------------
    // invite
    // ---------------------------------------------------------
    if (action !== 'invite') return json(400, { error: 'Ação inválida.' });

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return json(400, { error: 'Informe um e-mail válido.' });

    const requestedRole = String(body.workspace_role ?? 'editor') as WorkspaceRole;
    const workspaceRole: WorkspaceRole = WORKSPACE_ROLES.includes(requestedRole)
      ? requestedRole
      : 'editor';
    // Administrador do workspace é também administrador do app — é ele quem
    // convida os próximos. Os demais papéis nunca ganham app_role admin por
    // este caminho.
    const appRole: 'admin' | 'user' = workspaceRole === 'admin' ? 'admin' : 'user';
    const canPublishAgent = workspaceRole === 'admin' ? true : body.can_publish_agent === true;
    const invitedName = readableText(body.name);
    const note = readableText(body.note, 400);
    const redirectTo = safeRedirect(body.redirect_to);

    const { data: actorProfile } = await service
      .from('profiles')
      .select('full_name')
      .eq('user_id', actor.id)
      .maybeSingle();
    const invitedByName = readableText(actorProfile?.full_name) ?? actor.email ?? null;

    // Nome e nota entram só quando vieram preenchidos: no reconvite, um campo
    // vazio no formulário não pode apagar o que já estava gravado.
    const allowlistRow: Record<string, unknown> = {
      email,
      workspace_role: workspaceRole,
      can_publish_agent: canPublishAgent,
      app_role: appRole,
      invited_by: actor.id,
      invited_by_name: invitedByName,
      invite_sent_at: new Date().toISOString(),
    };
    if (invitedName) allowlistRow.invited_name = invitedName;
    if (note) allowlistRow.note = note;

    const { error: allowlistError } = await service
      .from('signup_allowlist')
      .upsert(allowlistRow, { onConflict: 'email' });
    if (allowlistError) throw allowlistError;

    // 1ª tentativa: convite oficial, que dispara o e-mail quando há SMTP.
    const invited = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: invitedName ? { full_name: invitedName } : undefined,
    });

    if (!invited.error && invited.data?.user) {
      await bindMembership(service, invited.data.user.id, workspaceRole, canPublishAgent, appRole, actor.id);
      return json(200, {
        status: 'convite_enviado',
        email,
        user_id: invited.data.user.id,
        action_link: null,
        mensagem: 'Convite enviado por e-mail. A pessoa define a senha pelo link.',
      });
    }

    // Duas razões distintas para o convite falhar, e as duas terminam no mesmo
    // lugar: um link que o admin entrega na mão.
    //   a) a conta já existe → link de recuperação, para redefinir a senha;
    //   b) o projeto não tem SMTP → o usuário até é criado, mas o e-mail não sai.
    // O caso (b) degenera em (a) na segunda chamada, então o fallback tenta
    // 'invite' e, se a conta já existir, refaz como 'recovery'.
    const existingAccount = looksLikeExistingAccount(invited.error);
    const generated = await generateAccessLink(
      service,
      email,
      redirectTo,
      existingAccount ? null : invitedName,
      !existingAccount,
    );

    if (generated.error || !generated.data?.properties?.action_link) {
      return json(502, {
        error:
          generated.error?.message ??
          invited.error?.message ??
          'A conta não pôde ser criada. Verifique o e-mail e tente de novo.',
      });
    }

    const linkedUserId = generated.data.user?.id ?? null;
    if (linkedUserId) {
      await bindMembership(service, linkedUserId, workspaceRole, canPublishAgent, appRole, actor.id);
    }

    const jaTinhaConta = generated.kind === 'recovery';
    return json(200, {
      status: jaTinhaConta ? 'conta_existente' : 'link_manual',
      email,
      user_id: linkedUserId,
      action_link: generated.data.properties.action_link,
      mensagem: jaTinhaConta
        ? 'Esta pessoa já tem conta. Envie o link abaixo para ela definir a senha.'
        : 'O e-mail automático não saiu. Envie o link abaixo para a pessoa entrar.',
    });
  } catch (error) {
    console.error('team-invite falhou', error);
    const message = error instanceof Error ? error.message : 'Erro inesperado no convite.';
    return json(500, { error: message });
  }
});

// Gera o link de acesso que o admin entrega na mão. Tenta 'invite' (que cria a
// conta) e cai para 'recovery' quando a conta já existe — inclusive no caso em
// que o próprio inviteUserByEmail criou o usuário antes de falhar no envio.
async function generateAccessLink(
  service: ServiceClient,
  email: string,
  redirectTo: string | undefined,
  invitedName: string | null,
  preferInvite: boolean,
) {
  type LinkKind = 'invite' | 'recovery';

  const attempt = async (kind: LinkKind) => {
    const options: Record<string, unknown> = {};
    if (redirectTo) options.redirectTo = redirectTo;
    if (kind === 'invite' && invitedName) options.data = { full_name: invitedName };
    const result = await service.auth.admin.generateLink({
      type: kind,
      email,
      options,
    } as Parameters<typeof service.auth.admin.generateLink>[0]);
    return { ...result, kind };
  };

  if (!preferInvite) return await attempt('recovery');

  const first = await attempt('invite');
  if (!first.error && first.data?.properties?.action_link) return first;
  if (looksLikeExistingAccount(first.error)) return await attempt('recovery');
  return first;
}

// Garante o vínculo e alinha o papel. Para conta nova o trigger handle_new_user
// já criou a membership; o UPDATE existe para o caso de reconvite, em que a
// pessoa já é membro e o admin acabou de mudar o papel dela.
async function bindMembership(
  service: ServiceClient,
  userId: string,
  workspaceRole: WorkspaceRole,
  canPublishAgent: boolean,
  appRole: 'admin' | 'user',
  actorId: string,
): Promise<void> {
  try {
    const { data: workspaceId, error } = await service.rpc('ensure_workspace_membership', {
      _user_id: userId,
    });
    if (error) throw error;
    if (!workspaceId) return;

    await service
      .from('workspace_members')
      .update({
        role: workspaceRole,
        can_publish_agent: canPublishAgent,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (appRole === 'admin') {
      const { data: existing } = await service
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (!existing) {
        await service.from('user_roles').insert({ user_id: userId, role: 'admin' });
      }
      return;
    }

    // Reconvite que rebaixa o papel. Sem isto, a tela passa a dizer "Atendente"
    // enquanto a pessoa continua com o acesso de administrador que as policies
    // concedem por has_role — a lista de convites mentiria de novo.
    // Duas guardas: ninguém se rebaixa sozinho, e o último admin do app não cai.
    if (userId === actorId) return;
    const { data: admins } = await service.from('user_roles').select('user_id').eq('role', 'admin');
    const outrosAdmins = ((admins ?? []) as Array<{ user_id: string }>).filter(
      (row) => row.user_id !== userId,
    );
    if (outrosAdmins.length === 0) return;

    await service.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
    await service
      .from('user_roles')
      .upsert({ user_id: userId, role: 'user' }, { onConflict: 'user_id,role', ignoreDuplicates: true });
  } catch (error) {
    // O convite já valeu: a allowlist está gravada e a conta existe. Um vínculo
    // que falhou aqui é recriado no próximo login pelo handle_new_user/
    // ensure_workspace_membership, então não derruba a resposta.
    console.error('team-invite: vínculo de workspace não pôde ser ajustado', error);
  }
}

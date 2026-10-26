import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { consumeRateLimit, RateLimitError } from '../_shared/rate-limit.ts';
import { resolveLaraWhatsAppRow } from '../_shared/whatsapp-credentials.ts';
import {
  buildCreatePayload,
  parseMetaTemplate,
  validateTemplateDraft,
  TEMPLATE_CATEGORIES,
  type TemplateDraft,
} from '../_shared/whatsapp-templates.ts';

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface MetaErrorBody {
  error?: { message?: string; error_user_title?: string; error_user_msg?: string; code?: number };
}

/** Mensagem da Meta voltada ao usuário quando existir; senão a técnica; senão o fallback. */
function metaErrorMessage(data: MetaErrorBody, fallback: string): string {
  return data.error?.error_user_msg || data.error?.message || fallback;
}

/**
 * A autorização espelha as duas fontes que o app usa hoje: user_roles (gate das
 * telas de Settings, inclusive esta) e workspace_members (modelo dos workspaces;
 * novos usuários podem não ter membership — só o backfill de 01/08 populou a
 * tabela). Papel efetivo determinístico: admin em qualquer fonte > editor.
 */
// deno-lint-ignore no-explicit-any
async function resolveAccess(service: any, userId: string) {
  const [{ data: adminRole, error: roleError }, { data: memberships, error: memberError }] = await Promise.all([
    service.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle(),
    service.from('workspace_members').select('workspace_id, role').eq('user_id', userId).eq('status', 'active'),
  ]);
  if (roleError) throw roleError;
  if (memberError) throw memberError;
  const rows = (memberships ?? []) as Array<{ workspace_id: string; role: string }>;
  const adminMembership = rows.find((row) => row.role === 'admin');
  const editorMembership = rows.find((row) => row.role === 'editor');
  const isAdmin = Boolean(adminRole) || Boolean(adminMembership);
  // Workspace para o rate limit (a tabela tem FK real): membership de maior
  // papel → qualquer membership → primeira workspace da instância.
  let workspaceId: string | null = adminMembership?.workspace_id ?? editorMembership?.workspace_id ?? rows[0]?.workspace_id ?? null;
  if (!workspaceId) {
    const { data: anyWorkspace, error: workspaceError } = await service.from('workspaces').select('id').limit(1).maybeSingle();
    if (workspaceError) throw workspaceError;
    workspaceId = (anyWorkspace as { id: string } | null)?.id ?? null;
  }
  return { isAdmin, isEditor: Boolean(editorMembership), workspaceId };
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  try {
    const authorization = request.headers.get('authorization');
    if (!authorization) return json(401, { error: 'Unauthorized' });
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    const auth = createClient(supabaseUrl, anonKey);
    const service = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await auth.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: 'Unauthorized' });

    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action : '';
    if (!['list', 'create', 'delete'].includes(action)) {
      return json(400, { error: 'Ação inválida.', code: 'invalid_action' });
    }

    // Em 'list', estados de configuração/permissão são informativos para a UI,
    // não falhas de transporte: respondem 200 com `code` para não poluir o log
    // de erros do app com um 4xx esperado no primeiro carregamento.
    const infoStatus = action === 'list' ? 200 : 422;

    const access = await resolveAccess(service, userData.user.id);
    if (!access.isAdmin && !access.isEditor) {
      return json(action === 'list' ? 200 : 403, {
        error: 'Sem permissão para gerenciar templates.',
        code: 'not_allowed',
      });
    }
    // Criar e excluir mudam o canal oficial da conta na Meta — só admin.
    if (action !== 'list' && !access.isAdmin) {
      return json(403, { error: 'Apenas administradores podem criar ou excluir templates.', code: 'admin_required' });
    }

    if (access.workspaceId) {
      await consumeRateLimit(service, {
        workspaceId: access.workspaceId,
        subjectKey: userData.user.id,
        operation: 'whatsapp_templates',
        maxRequests: 10,
        windowSeconds: 60,
      });
    }

    const row = await resolveLaraWhatsAppRow(service, userData.user.id);
    if (!row?.whatsapp_access_token) {
      return json(infoStatus, {
        error: 'Configure o token de acesso do WhatsApp Cloud na aba APIs antes de gerenciar templates.',
        code: 'whatsapp_cloud_not_configured',
      });
    }
    if (!row.whatsapp_business_account_id) {
      // A mesma linha que o whatsapp-sender usará no envio — sem WABA nela, o
      // certo é completar o registro, não cair para as credenciais de outra conta.
      return json(infoStatus, {
        error: 'Preencha o ID da conta WhatsApp Business (WABA) na aba APIs — o registro de credenciais em uso não o possui.',
        code: 'whatsapp_cloud_not_configured',
      });
    }
    const graphHeaders = {
      Authorization: `Bearer ${row.whatsapp_access_token}`,
      'Content-Type': 'application/json',
    };
    const templatesUrl = `${GRAPH_API_URL}/${row.whatsapp_business_account_id}/message_templates`;

    if (action === 'list') {
      // A Graph API pagina por cursor; sem seguir paging.next, contas com mais
      // de 100 pares nome×idioma teriam templates invisíveis na UI.
      const collected: unknown[] = [];
      let after: string | null = null;
      for (let page = 0; page < 5; page += 1) {
        const url: string = `${templatesUrl}?limit=100&fields=name,status,category,language,components,rejected_reason${after ? `&after=${encodeURIComponent(after)}` : ''}`;
        const response: Response = await fetch(url, { headers: graphHeaders, signal: AbortSignal.timeout(10_000) });
        // deno-lint-ignore no-explicit-any
        const data: any = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error('[whatsapp-templates] list error', response.status, JSON.stringify(data).slice(0, 500));
          return json(response.status === 401 || response.status === 403 ? 422 : 502, {
            error: metaErrorMessage(data, 'Não foi possível listar os templates na Meta.'),
            code: 'meta_list_failed',
          });
        }
        collected.push(...(Array.isArray(data.data) ? data.data : []));
        after = data.paging?.next && typeof data.paging?.cursors?.after === 'string' ? data.paging.cursors.after : null;
        if (!after) break;
      }
      const templates = collected
        .map(parseMetaTemplate)
        .filter((template: unknown) => template !== null);
      return json(200, { templates });
    }

    if (action === 'create') {
      const raw = body.template && typeof body.template === 'object' ? body.template as Record<string, unknown> : {};
      const draft: TemplateDraft = {
        name: String(raw.name ?? '').trim().toLowerCase(),
        category: (TEMPLATE_CATEGORIES as readonly string[]).includes(String(raw.category))
          ? String(raw.category) as TemplateDraft['category']
          : 'UTILITY',
        language: String(raw.language ?? 'pt_BR'),
        headerText: raw.headerText ? String(raw.headerText).slice(0, 200) : undefined,
        bodyText: String(raw.bodyText ?? '').slice(0, 2_000),
        footerText: raw.footerText ? String(raw.footerText).slice(0, 200) : undefined,
        exampleValues: Array.isArray(raw.exampleValues) ? raw.exampleValues.map((value) => String(value).slice(0, 500)).slice(0, 20) : [],
      };
      const issues = validateTemplateDraft(draft);
      if (issues.length > 0) {
        return json(400, { error: issues[0].message, code: 'invalid_template', issues });
      }

      const response = await fetch(templatesUrl, {
        method: 'POST',
        headers: graphHeaders,
        body: JSON.stringify(buildCreatePayload(draft)),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[whatsapp-templates] create error', response.status, JSON.stringify(data).slice(0, 500));
        return json(422, {
          error: metaErrorMessage(data, 'A Meta recusou a criação do template.'),
          code: 'meta_create_failed',
        });
      }
      return json(200, {
        template: {
          id: typeof data.id === 'string' ? data.id : '',
          status: typeof data.status === 'string' ? data.status : 'PENDING',
          category: typeof data.category === 'string' ? data.category : draft.category,
          name: draft.name,
        },
      });
    }

    // action === 'delete'
    const name = String(body.name ?? '').trim();
    if (!/^[a-z0-9_]+$/.test(name)) {
      return json(400, { error: 'Nome de template inválido.', code: 'invalid_template_name' });
    }
    const response = await fetch(`${templatesUrl}?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: graphHeaders,
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[whatsapp-templates] delete error', response.status, JSON.stringify(data).slice(0, 500));
      return json(422, {
        error: metaErrorMessage(data, 'Não foi possível excluir o template na Meta.'),
        code: 'meta_delete_failed',
      });
    }
    return json(200, { success: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return json(429, { error: 'Muitas operações de template em sequência. Aguarde um minuto e tente novamente.' });
    }
    console.error('[whatsapp-templates] Error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return json(500, { error: message });
  }
});

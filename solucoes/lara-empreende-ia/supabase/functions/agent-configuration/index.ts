import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  compileAgentPrompt,
  type CompilerIssue,
} from '../_shared/agent-prompt-compiler.ts';

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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return json(401, { error: 'Unauthorized' });

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: 'Unauthorized' });

    const body = await req.json();
    const action = String(body.action || 'preview');
    const agentId = String(body.agent_id || '');
    if (!agentId) return json(400, { error: 'agent_id é obrigatório' });
    if (!['preview', 'publish'].includes(action)) {
      return json(400, { error: 'Ação inválida' });
    }

    const { data: agent, error: agentError } = await service
      .from('agents')
      .select('id, workspace_id, published_version_id')
      .eq('id', agentId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return json(404, { error: 'Agente não encontrada' });

    const { data: membership, error: membershipError } = await service
      .from('workspace_members')
      .select('role, can_publish_agent, status')
      .eq('workspace_id', agent.workspace_id)
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json(403, { error: 'Sem acesso a este workspace' });

    const { data: draft, error: draftError } = await service
      .from('agent_drafts')
      .select('id, config, revision, base_version_id, updated_at')
      .eq('agent_id', agentId)
      .maybeSingle();
    if (draftError) throw draftError;
    if (!draft) return json(404, { error: 'Rascunho não encontrado' });

    const compiled = compileAgentPrompt(draft.config);
    const artifactChecksum = await sha256(
      `${compiled.compilerVersion}\n${draft.revision}\n${compiled.prompt}`,
    );

    if (action === 'preview') {
      return json(200, {
        agent_id: agentId,
        draft_revision: draft.revision,
        base_version_id: draft.base_version_id,
        published_version_id: agent.published_version_id,
        compiler_version: compiled.compilerVersion,
        artifact_checksum: artifactChecksum,
        prompt: compiled.prompt,
        sections: compiled.sections,
        issues: compiled.issues,
        has_blocking_issues: compiled.hasBlockingIssues,
      });
    }

    const canPublish = membership.role === 'admin' || membership.can_publish_agent === true;
    if (!canPublish) return json(403, { error: 'Sem permissão para publicar esta agente' });

    const expectedRevision = Number(body.expected_revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== draft.revision) {
      return json(409, {
        error: 'O rascunho mudou. Revise a versão mais recente antes de publicar.',
        code: 'draft_revision_conflict',
        actual_revision: draft.revision,
      });
    }

    const blockingIssues = compiled.issues.filter((item) => item.severity === 'blocking');
    if (blockingIssues.length > 0) {
      return json(422, {
        error: 'A publicação está bloqueada por pendências de configuração.',
        code: 'configuration_blocked',
        issues: blockingIssues,
      });
    }

    const evaluationRunId = typeof body.evaluation_run_id === 'string'
      ? body.evaluation_run_id.trim()
      : '';
    if (!evaluationRunId) {
      return json(422, {
        error: 'Execute as situações de teste deste rascunho antes de publicar.',
        code: 'evaluation_required',
      });
    }
    const { data: evaluationRun, error: evaluationError } = await service
      .from('eval_runs')
      .select('id, workspace_id, agent_id, draft_id, draft_revision, status, gate_status, critical_failures, warnings, unstable, technical_failures')
      .eq('id', evaluationRunId)
      .eq('workspace_id', agent.workspace_id)
      .eq('agent_id', agentId)
      .maybeSingle();
    if (evaluationError) throw evaluationError;
    if (!evaluationRun || evaluationRun.draft_id !== draft.id || evaluationRun.draft_revision !== draft.revision) {
      return json(409, {
        error: 'A avaliação não corresponde à versão atual do rascunho. Execute os testes novamente.',
        code: 'evaluation_outdated',
      });
    }
    if (evaluationRun.status !== 'completed' || evaluationRun.technical_failures > 0 || evaluationRun.gate_status === 'technical_failure') {
      return json(422, {
        error: 'A avaliação não terminou corretamente. Rode as situações de teste novamente.',
        code: 'evaluation_technical_failure',
      });
    }
    if (evaluationRun.critical_failures > 0 || evaluationRun.unstable > 0 || evaluationRun.gate_status === 'blocked') {
      return json(422, {
        error: 'Corrija as situações críticas ou instáveis antes de publicar.',
        code: 'evaluation_blocked',
      });
    }
    if (evaluationRun.warnings > 0 && body.accept_evaluation_warnings !== true) {
      return json(409, {
        error: 'Existem alertas na avaliação. Revise e aceite conscientemente para publicar.',
        code: 'evaluation_warnings_require_acceptance',
      });
    }

    const configuredActions = Array.isArray(draft.config?.actions) ? draft.config.actions : [];
    const appointmentsEnabled = configuredActions.some((configuredAction: any) => (
      configuredAction?.actionId === 'appointments' && configuredAction?.enabled === true
    ));
    if (appointmentsEnabled) {
      const { data: workspaceMembers, error: membersError } = await service
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', agent.workspace_id)
        .eq('status', 'active');
      if (membersError) throw membersError;
      const ownerIds = (workspaceMembers || []).map((item: any) => item.user_id).filter(Boolean);
      const { data: calendarConnection, error: calendarError } = ownerIds.length > 0
        ? await service
          .from('calendar_integrations')
          .select('id')
          .in('owner_user_id', ownerIds)
          .eq('provider', 'nylas')
          .eq('status', 'active')
          .eq('sync_enabled', true)
          .limit(1)
          .maybeSingle()
        : { data: null, error: null };
      if (calendarError) throw calendarError;
      if (!calendarConnection) {
        return json(422, {
          error: 'Conecte e ative uma agenda (aba Agenda) antes de publicar agendamentos.',
          code: 'calendar_connection_required',
          field: 'actions.appointments',
        });
      }
    }

    const acceptedWarningCodes = Array.isArray(body.accepted_warning_codes)
      ? body.accepted_warning_codes.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const warnings = compiled.issues.filter((item) => item.severity === 'warning');
    const unacceptedWarnings = warnings.filter((warning) => !acceptedWarningCodes.includes(warning.code));
    if (unacceptedWarnings.length > 0) {
      return json(409, {
        error: 'Revise e aceite conscientemente os alertas antes de publicar.',
        code: 'warnings_require_acceptance',
        issues: unacceptedWarnings,
      });
    }

    const acceptedWarnings = warnings
      .filter((warning) => acceptedWarningCodes.includes(warning.code))
      .map((warning: CompilerIssue) => ({
        code: warning.code,
        field: warning.field,
        message: warning.message,
      }));

    const { data: versionData, error: publishError } = await service.rpc(
      'publish_compiled_agent_draft',
      {
        _agent_id: agentId,
        _expected_revision: expectedRevision,
        _compiled_prompt: compiled.prompt,
        _compiler_version: compiled.compilerVersion,
        _actor_user_id: userData.user.id,
        _evaluation_run_id: evaluationRun.id,
        _label: typeof body.label === 'string' ? body.label : null,
        _accepted_warnings: acceptedWarnings,
      },
    );
    if (publishError) {
      if (publishError.code === '40001') {
        return json(409, { error: publishError.message, code: 'draft_revision_conflict' });
      }
      throw publishError;
    }

    const version = Array.isArray(versionData) ? versionData[0] : versionData;
    return json(200, {
      version: {
        id: version.id,
        agent_id: version.agent_id,
        workspace_id: version.workspace_id,
        version_number: version.version_number,
        checksum: version.checksum,
        compiler_version: version.compiler_version,
        label: version.label,
        source: version.source,
        evaluation_run_id: version.evaluation_run_id,
        accepted_warnings: version.accepted_warnings,
        restored_from_version_id: version.restored_from_version_id,
        created_by: version.created_by,
        published_at: version.published_at,
        created_at: version.created_at,
        config: version.config,
      },
      artifact_checksum: artifactChecksum,
      issues: compiled.issues,
    });
  } catch (error) {
    console.error('[agent-configuration] Error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return json(500, { error: message });
  }
});

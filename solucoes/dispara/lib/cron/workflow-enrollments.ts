import "server-only";
import { nanoid } from "nanoid";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";
import { executeWorkflow } from "@/lib/builder/workflow-executor.workflow";
import {
  claimDueEnrollments,
  reapStuckEnrollments,
  rescheduleEnrollment,
  backoffEnrollment,
  completeEnrollment,
  failEnrollment,
  MAX_ENROLLMENT_ATTEMPTS,
} from "@/lib/builder/workflow-enrollments";

/**
 * Fase D (migração QStash→pg_cron) — drena os waits duráveis de fluxo vencidos.
 *
 * Chamado pelo relógio (pg_cron → /api/cron/tick). Reaper de enrollments presos, claim
 * atômico (incrementa attempts) e retoma cada um chamando executeWorkflow DIRETO a partir
 * dos resume_node_ids (multi-head), re-hidratando resolved_nodes (anti-double-send) e
 * outputs ({{@node}} a montante do Delay). Erro transitório → backoff; excesso de
 * tentativas → fail (anti-poison); node de retomada ausente (republicação) → fail visível.
 */

type ExecShape = {
  success?: boolean;
  paused?: boolean;
  wait?: { kind: string; resumeNodeIds: string[]; resumeInMs: number };
  variables?: Record<string, unknown>;
  resolvedNodeIds?: string[];
  outputs?: Record<string, unknown>;
  results?: Record<string, unknown>;
};

export async function drainWorkflowEnrollments(): Promise<{
  reaped: number;
  claimed: number;
  completed: number;
  paused: number;
  failed: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { reaped: 0, claimed: 0, completed: 0, paused: 0, failed: 0 };
  }

  const reaped = await reapStuckEnrollments(supabase);
  const workerId = nanoid();
  const claimed = await claimDueEnrollments(supabase, workerId, 25);
  if (claimed.length === 0) {
    return { reaped, claimed: 0, completed: 0, paused: 0, failed: 0 };
  }

  const companyId = await getCompanyId(supabase);
  let completed = 0;
  let paused = 0;
  let failed = 0;

  for (const e of claimed) {
    // Anti-poison: excedeu o teto de tentativas → falha definitiva (não re-executa/reenvia).
    if (e.attempts > MAX_ENROLLMENT_ATTEMPTS) {
      await failEnrollment(
        supabase,
        e.id,
        `Máximo de tentativas (${e.attempts}) excedido`
      );
      failed++;
      continue;
    }

    try {
      const record = await ensureWorkflowRecord(
        supabase,
        e.workflow_id,
        companyId
      );
      const workflow = toSavedWorkflow(record);

      const startNodeIds =
        e.resume_node_ids && e.resume_node_ids.length > 0
          ? e.resume_node_ids
          : e.current_node_id
            ? [e.current_node_id]
            : undefined;

      const executionId = nanoid();
      await supabase.from("workflow_runs").insert({
        id: executionId,
        workflow_id: e.workflow_id,
        version_id: record.workflow.active_version_id,
        status: "running",
        trigger_type: "DelayResume",
        input: {},
        started_at: new Date().toISOString(),
      });

      const execution = (await executeWorkflow({
        nodes: workflow.nodes,
        edges: workflow.edges,
        triggerInput: { from: e.phone, to: e.phone },
        executionId,
        workflowId: e.workflow_id,
        startNodeIds,
        initialVariables: e.variables ?? {},
        initialOutputs: e.outputs ?? {},
        alreadyResolvedNodeIds: e.resolved_nodes ?? [],
        workflowSettings: workflow.settings,
      })) as ExecShape;

      if (execution.paused && execution.wait?.kind === "delay") {
        // Caiu em outro Delay: reagenda o mesmo enrollment.
        await rescheduleEnrollment(supabase, e.id, {
          resumeNodeIds: execution.wait.resumeNodeIds,
          resumeAt: new Date(
            Date.now() + (execution.wait.resumeInMs || 0)
          ).toISOString(),
          variables: execution.variables ?? e.variables ?? {},
          resolvedNodeIds: execution.resolvedNodeIds ?? e.resolved_nodes ?? [],
          outputs: execution.outputs ?? e.outputs ?? {},
        });
        paused++;
      } else if (
        !execution.paused &&
        startNodeIds &&
        Object.keys(execution.results ?? {}).length === 0
      ) {
        // Nenhum nó rodou: o resume node não existe na versão atual (provável
        // republicação em voo). Não completar em silêncio — falha visível.
        await failEnrollment(
          supabase,
          e.id,
          "Nó de retomada ausente na versão atual do workflow (republicado?)"
        );
        failed++;
      } else {
        // Terminou, ou pausou por ask-question (a conversation já foi persistida).
        await completeEnrollment(supabase, e.id);
        completed++;
      }
    } catch (err) {
      // Erro transitório (DB/rede): backoff e retry até o teto; só depois falha.
      if (e.attempts >= MAX_ENROLLMENT_ATTEMPTS) {
        await failEnrollment(supabase, e.id, err);
        failed++;
      } else {
        await backoffEnrollment(supabase, e.id, e.attempts, err);
        paused++;
      }
    }
  }

  return { reaped, claimed: claimed.length, completed, paused, failed };
}

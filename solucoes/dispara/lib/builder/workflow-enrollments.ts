import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enrollments — estado durável de um contato dentro de um fluxo, para waits (Delay).
 *
 * Fase D da migração QStash→pg_cron. O executor, ao encontrar um Delay, pausa e devolve
 * o ponto de continuação (resumeNodeIds multi-head + outputs + variables + resolved_nodes);
 * a BORDA (rota /execute ou o cron drain) persiste aqui o enrollment com resume_at. O
 * relógio (pg_cron → /api/cron/tick) drena os vencidos e retoma a execução re-hidratando
 * resolved_nodes (anti-double-send) e outputs ({{@node}} a montante do Delay).
 */

export const MAX_ENROLLMENT_ATTEMPTS = 5;

export type EnrollmentRow = {
  id: string;
  workflow_id: string;
  version_id: string;
  phone: string;
  contact_id: string | null;
  status: string;
  wait_kind: string | null;
  current_node_id: string | null;
  resume_node_ids: string[] | null;
  resume_at: string | null;
  variables: Record<string, unknown> | null;
  resolved_nodes: string[] | null;
  outputs: Record<string, unknown> | null;
  run_id: string | null;
  attempts: number;
};

export type DelayWaitParams = {
  workflowId: string;
  versionId: string;
  phone: string;
  contactId?: string | null;
  runId?: string | null;
  resumeNodeIds: string[];
  resumeAt: string; // ISO
  variables: Record<string, unknown>;
  resolvedNodeIds: string[];
  outputs: Record<string, unknown>;
};

function delayPayload(params: DelayWaitParams) {
  return {
    status: "waiting",
    wait_kind: "delay",
    current_node_id: params.resumeNodeIds[0] ?? null,
    resume_node_ids: params.resumeNodeIds,
    resume_at: params.resumeAt,
    variables: params.variables,
    resolved_nodes: params.resolvedNodeIds,
    outputs: params.outputs,
    run_id: params.runId ?? null,
    locked_at: null,
    locked_by: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Persiste (ou atualiza) o enrollment quando o executor pausa por Delay.
 *
 * Idempotente e seguro sob concorrência: só toca linhas 'waiting' (nunca 'active', que
 * está sendo processada pelo drain), e trata a violação do índice único parcial
 * (23505 — duas pausas concorrentes pro mesmo contato) sem propagar erro.
 */
export async function persistDelayWait(
  supabase: SupabaseClient,
  params: DelayWaitParams
): Promise<void> {
  const shared = delayPayload(params);

  const { data: existing } = await supabase
    .from("workflow_enrollments")
    .select("id")
    .eq("workflow_id", params.workflowId)
    .eq("phone", params.phone)
    .eq("status", "waiting")
    .maybeSingle();

  if (existing) {
    await supabase
      .from("workflow_enrollments")
      .update(shared)
      .eq("id", (existing as { id: string }).id)
      .eq("status", "waiting"); // CAS: não rouba linha que o drain acabou de claimar
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("workflow_enrollments").insert({
    workflow_id: params.workflowId,
    version_id: params.versionId,
    phone: params.phone,
    contact_id: params.contactId ?? null,
    created_at: now,
    ...shared,
  });

  if (error) {
    // Provável 23505 (unique parcial): outra pausa concorrente já criou/está ativa.
    // Best-effort: atualiza só se ainda houver uma linha 'waiting' (não pisa em 'active').
    await supabase
      .from("workflow_enrollments")
      .update(shared)
      .eq("workflow_id", params.workflowId)
      .eq("phone", params.phone)
      .eq("status", "waiting");
  }
}

/**
 * Claim atômico dos enrollments vencidos (cron drain). Para cada candidato, faz um CAS
 * waiting→active (só um worker ganha) incrementando attempts. Retorna os claimados.
 */
export async function claimDueEnrollments(
  supabase: SupabaseClient,
  workerId: string,
  limit = 25
): Promise<EnrollmentRow[]> {
  const nowIso = new Date().toISOString();

  const { data: candidates } = await supabase
    .from("workflow_enrollments")
    .select("id, attempts")
    .eq("status", "waiting")
    .lte("resume_at", nowIso)
    .order("resume_at", { ascending: true })
    .limit(limit);

  const claimed: EnrollmentRow[] = [];
  for (const c of candidates || []) {
    const row = c as { id: string; attempts: number | null };
    const { data: won } = await supabase
      .from("workflow_enrollments")
      .update({
        status: "active",
        locked_at: nowIso,
        locked_by: workerId,
        attempts: (row.attempts ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", "waiting")
      .select("*")
      .maybeSingle();
    if (won) claimed.push(won as EnrollmentRow);
  }
  return claimed;
}

/**
 * Devolve à fila enrollments 'active' presos (worker morreu no meio). Reaper.
 * A janela (padrão 20min) deve ser > 2x maxDuration (300s) pra nunca devolver um worker
 * vivo — invariante que o teste documenta.
 */
export async function reapStuckEnrollments(
  supabase: SupabaseClient,
  olderThanMs = 20 * 60 * 1000
): Promise<number> {
  const cutoffIso = new Date(Date.now() - olderThanMs).toISOString();
  const { data } = await supabase
    .from("workflow_enrollments")
    .update({ status: "waiting", locked_at: null, locked_by: null })
    .eq("status", "active")
    .lt("locked_at", cutoffIso)
    .select("id");
  return (data || []).length;
}

/** Enrollment retomado encontrou OUTRO Delay: reagenda o mesmo enrollment. */
export async function rescheduleEnrollment(
  supabase: SupabaseClient,
  id: string,
  params: {
    resumeNodeIds: string[];
    resumeAt: string;
    variables: Record<string, unknown>;
    resolvedNodeIds: string[];
    outputs: Record<string, unknown>;
  }
): Promise<void> {
  await supabase
    .from("workflow_enrollments")
    .update({
      status: "waiting",
      wait_kind: "delay",
      current_node_id: params.resumeNodeIds[0] ?? null,
      resume_node_ids: params.resumeNodeIds,
      resume_at: params.resumeAt,
      variables: params.variables,
      resolved_nodes: params.resolvedNodeIds,
      outputs: params.outputs,
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/** Backoff: erro transitório no drain → reagenda pro futuro em vez de falhar em definitivo. */
export async function backoffEnrollment(
  supabase: SupabaseClient,
  id: string,
  attempts: number,
  error: unknown
): Promise<void> {
  const delayMs = Math.min(30 * 60 * 1000, 60 * 1000 * 2 ** attempts); // 2,4,8… min, cap 30min
  await supabase
    .from("workflow_enrollments")
    .update({
      status: "waiting",
      resume_at: new Date(Date.now() + delayMs).toISOString(),
      last_error: String(error).slice(0, 500),
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function completeEnrollment(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  await supabase
    .from("workflow_enrollments")
    .update({
      status: "completed",
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function failEnrollment(
  supabase: SupabaseClient,
  id: string,
  error: unknown
): Promise<void> {
  await supabase
    .from("workflow_enrollments")
    .update({
      status: "failed",
      last_error: String(error).slice(0, 500),
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

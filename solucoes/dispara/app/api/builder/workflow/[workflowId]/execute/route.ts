import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";
import { executeWorkflow } from "@/lib/builder/workflow-executor.workflow";
import { validateWorkflowSchema } from "@/lib/shared/workflow-schema";
import { verifyCronRequest, cronUnauthorizedResponse } from "@/lib/cron-auth";
import { persistDelayWait } from "@/lib/builder/workflow-enrollments";
import { normalizePhoneNumber } from "@/lib/phone-formatter";

/**
 * Executa um workflow do builder.
 *
 * Migração QStash→pg_cron (Fase D): antes era um serve() do @upstash/workflow (o QStash
 * re-invocava o endpoint por step). Agora é um POST normal autenticado (verifyCronRequest)
 * chamado pelo webhook (fire-and-forget). O DAG roda in-process; ao encontrar um Delay o
 * executor pausa e devolve o ponto de continuação — aqui persistimos o enrollment com
 * resume_at, e o cron drena/retoma depois. Ask-question segue persistindo inline
 * (workflow_conversations).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type BuilderWorkflowInput = {
  input?: {
    to?: string;
    from?: string;
    message?: string;
    previewUrl?: boolean;
  };
  startNodeIds?: string[];
  initialVariables?: Record<string, unknown>;
};

type ExecutionResultShape = {
  success?: boolean;
  paused?: boolean;
  wait?: { kind: string; resumeNodeIds: string[]; resumeInMs: number };
  variables?: Record<string, unknown>;
  resolvedNodeIds?: string[];
  outputs?: Record<string, unknown>;
  results?: unknown;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) return cronUnauthorizedResponse(auth.error);

  const { workflowId } = await params;
  const payload = (await request
    .json()
    .catch(() => ({}))) as BuilderWorkflowInput;
  const input = payload.input;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Supabase not configured",
    });
  }

  const companyId = await getCompanyId(supabase);
  const record = await ensureWorkflowRecord(supabase, workflowId, companyId);
  const workflow = toSavedWorkflow(record);
  const validation = validateWorkflowSchema(workflow);
  if (!validation.success) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Invalid workflow",
      details: validation.errors,
    });
  }

  const triggerNode = workflow.nodes.find(
    (node) => node.data.type === "trigger"
  );
  const triggerType = triggerNode?.data.config?.triggerType as
    | string
    | undefined;
  const inboundMessage = input?.message || "";

  const executionId = nanoid();
  await supabase.from("workflow_runs").insert({
    id: executionId,
    workflow_id: workflowId,
    version_id: record.workflow.active_version_id,
    status: "running",
    trigger_type: triggerType ?? null,
    input: input ?? {},
    started_at: new Date().toISOString(),
  });

  // Gate de Keywords — só no disparo inicial (não em resume, que passa startNodeIds).
  if (triggerType === "Keywords" && !payload.startNodeIds) {
    const keywordListRaw = triggerNode?.data.config?.keywordList as
      | string
      | undefined;
    const keywords = (keywordListRaw || "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const normalizedMessage = inboundMessage.toLowerCase();

    if (!normalizedMessage) {
      await supabase
        .from("workflow_runs")
        .update({
          status: "skipped",
          output: { reason: "missing_message" },
          finished_at: new Date().toISOString(),
        })
        .eq("id", executionId);
      return NextResponse.json({
        executionId,
        status: "skipped",
        output: { reason: "missing_message" },
      });
    }

    const matched = keywords.some((keyword) =>
      normalizedMessage.includes(keyword.toLowerCase())
    );
    if (!matched) {
      await supabase
        .from("workflow_runs")
        .update({
          status: "skipped",
          output: { reason: "keyword_not_matched" },
          finished_at: new Date().toISOString(),
        })
        .eq("id", executionId);
      return NextResponse.json({
        executionId,
        status: "skipped",
        output: { reason: "keyword_not_matched" },
      });
    }
  }

  const execution = (await executeWorkflow({
    nodes: workflow.nodes,
    edges: workflow.edges,
    triggerInput: input ?? {},
    executionId,
    workflowId,
    startNodeIds: payload.startNodeIds,
    initialVariables: payload.initialVariables,
    workflowSettings: workflow.settings,
  })) as ExecutionResultShape;

  // Delay durável: o executor pausou por Delay — persiste o enrollment com resume_at.
  if (execution.paused && execution.wait?.kind === "delay") {
    const phone = normalizePhoneNumber(
      String(input?.from || input?.to || "")
    );
    if (phone) {
      await persistDelayWait(supabase, {
        workflowId,
        versionId: record.workflow.active_version_id ?? "",
        phone,
        runId: executionId,
        resumeNodeIds: execution.wait.resumeNodeIds,
        resumeAt: new Date(
          Date.now() + (execution.wait.resumeInMs || 0)
        ).toISOString(),
        variables: execution.variables ?? {},
        resolvedNodeIds: execution.resolvedNodeIds ?? [],
        outputs: execution.outputs ?? {},
      });
      // Run em espera (não deixar 'running' órfão — igual ao ask-question).
      await supabase
        .from("workflow_runs")
        .update({
          status: "waiting",
          output: { status: "waiting", waitKind: "delay" },
          finished_at: null,
        })
        .eq("id", executionId);
    } else {
      // Pausou por Delay mas sem telefone pra retomar: seria um buraco silencioso
      // (run 'running' pra sempre). Falha visível.
      console.error(
        "[builder/execute] Delay pausou sem telefone de retomada — marcando run como failed."
      );
      await supabase
        .from("workflow_runs")
        .update({
          status: "failed",
          error: "Delay sem telefone de retomada",
          finished_at: new Date().toISOString(),
        })
        .eq("id", executionId);
    }
  }

  return NextResponse.json({
    executionId,
    status: execution.paused
      ? "waiting"
      : execution.success
        ? "success"
        : "failed",
    output: execution,
  });
}

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
import { completeConversation } from "@/lib/builder/workflow-conversations";
import { verifyCronRequest, cronUnauthorizedResponse } from "@/lib/cron-auth";
import { persistDelayWait } from "@/lib/builder/workflow-enrollments";
import { normalizePhoneNumber } from "@/lib/phone-formatter";

/**
 * Retoma um workflow pausado por Ask Question quando o usuário responde.
 *
 * Migração QStash→pg_cron (Fase D): antes era serve() do @upstash/workflow. Agora é um
 * POST autenticado chamado pelo webhook. Se o fluxo retomado cair num Delay, ele pausa
 * de novo e persistimos o enrollment (resume_at) aqui também.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ResumeWorkflowInput = {
  conversationId?: string;
  input?: {
    from?: string;
    to?: string;
    message?: string;
  };
};

type ExecutionResultShape = {
  success?: boolean;
  paused?: boolean;
  wait?: { kind: string; resumeNodeIds: string[]; resumeInMs: number };
  variables?: Record<string, unknown>;
  resolvedNodeIds?: string[];
  outputs?: Record<string, unknown>;
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
    .catch(() => ({}))) as ResumeWorkflowInput;
  const { conversationId, input } = payload;

  if (!workflowId || !conversationId) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Missing workflowId or conversationId",
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Supabase not configured",
    });
  }

  const { data: conversation } = await supabase
    .from("workflow_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("status", "waiting")
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Conversation not found",
    });
  }

  if (conversation.workflow_id !== workflowId) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Conversation workflow mismatch",
    });
  }

  const resumeNodeId = conversation.resume_node_id;
  if (!resumeNodeId) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Conversation missing resume node",
    });
  }

  const variableKey = conversation.variable_key;
  if (!variableKey) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Conversation missing variable key",
    });
  }

  const incomingMessage = String(input?.message || "").trim();
  if (!incomingMessage) {
    return NextResponse.json({
      executionId: nanoid(),
      status: "failed",
      error: "Missing inbound message",
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

  const executionId = nanoid();
  await supabase.from("workflow_runs").insert({
    id: executionId,
    workflow_id: workflowId,
    version_id: record.workflow.active_version_id,
    status: "running",
    trigger_type: "Resume",
    input: input ?? {},
    started_at: new Date().toISOString(),
  });

  const conversationVars =
    (conversation.variables as Record<string, unknown> | null) || {};
  const nextVariables = {
    ...conversationVars,
    [variableKey]: incomingMessage,
  };
  const fromPhone = String(
    input?.from || conversation.phone || input?.to || ""
  );

  const execution = (await executeWorkflow({
    nodes: workflow.nodes,
    edges: workflow.edges,
    triggerInput: {
      from: fromPhone,
      to: fromPhone,
      message: incomingMessage,
    },
    executionId,
    workflowId,
    startNodeIds: [resumeNodeId],
    initialVariables: nextVariables,
    workflowSettings: workflow.settings,
  })) as ExecutionResultShape;

  // A resposta foi consumida: encerra a conversa do ask-question.
  await completeConversation(supabase, conversation.id, nextVariables);

  // Se o fluxo retomado caiu num Delay, pausa de novo — persiste o enrollment.
  if (execution.paused && execution.wait?.kind === "delay") {
    const phone = normalizePhoneNumber(fromPhone);
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
        variables: execution.variables ?? nextVariables,
        resolvedNodeIds: execution.resolvedNodeIds ?? [],
        outputs: execution.outputs ?? {},
      });
      await supabase
        .from("workflow_runs")
        .update({
          status: "waiting",
          output: { status: "waiting", waitKind: "delay" },
          finished_at: null,
        })
        .eq("id", executionId);
    } else {
      console.error(
        "[builder/resume] Delay pausou sem telefone de retomada — marcando run como failed."
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

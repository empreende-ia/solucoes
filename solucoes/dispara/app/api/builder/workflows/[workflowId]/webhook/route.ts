import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";
import { executeWorkflow } from "@/lib/builder/workflow-executor.workflow";
import { safeSecretEqual } from "@/lib/builder/utils/secret-compare";
import { settingsDb } from "@/lib/supabase-db";

type RouteParams = {
  params: Promise<{ workflowId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const secret =
    (await settingsDb.get("workflow_builder_webhook_secret")) ||
    process.env.WORKFLOW_BUILDER_WEBHOOK_SECRET ||
    null;
  // Sem secret configurado continua aceitando (a rota já exige sessão ou API
  // key pelo proxy — política default); com secret, compara em tempo constante.
  const provided = request.headers.get("x-workflow-secret");
  if (secret && !safeSecretEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const companyId = await getCompanyId(supabase);
  const record = await ensureWorkflowRecord(supabase, workflowId, companyId);
  const workflow = toSavedWorkflow(record);

  const executionId = nanoid();
  await supabase.from("workflow_runs").insert({
    id: executionId,
    workflow_id: workflowId,
    version_id: record.workflow.active_version_id,
    status: "running",
    trigger_type: "Webhook",
    input: body ?? {},
    started_at: new Date().toISOString(),
  });

  const execution = await executeWorkflow({
    nodes: workflow.nodes,
    edges: workflow.edges,
    triggerInput: body ?? {},
    executionId,
    workflowId,
  });

  return NextResponse.json({
    executionId,
    status: execution.success ? "success" : "failed",
    output: execution,
  });
}

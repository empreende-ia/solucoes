import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";
import { validateWorkflowSchema } from "@/lib/shared/workflow-schema";

type RouteParams = {
  params: Promise<{ workflowId: string }>;
};

export async function POST(_request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }
  const companyId = await getCompanyId(supabase);
  const record = await ensureWorkflowRecord(supabase, workflowId, companyId);
  const workflow = toSavedWorkflow(record);
  const validation = validateWorkflowSchema(workflow);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid workflow", details: validation.errors },
      { status: 400 }
    );
  }

  const executionId = `exec_${Date.now()}`;
  await supabase.from("workflow_runs").insert({
    id: executionId,
    workflow_id: workflowId,
    version_id: record.workflow.active_version_id,
    status: "queued",
    trigger_type: "Manual",
    input: {},
    started_at: new Date().toISOString(),
  });

  return NextResponse.json({
    status: "queued",
    workflowId,
    executionId,
  });
}

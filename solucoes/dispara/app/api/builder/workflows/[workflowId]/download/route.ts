import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";

type RouteParams = {
  params: Promise<{ workflowId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
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
  return NextResponse.json({
    name: workflow.name,
    workflow,
  });
}

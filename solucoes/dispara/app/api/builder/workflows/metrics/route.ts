import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ totals: { runs: 0, success: 0, failed: 0 }, byWorkflow: {} });
  }

  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");
  let query = supabase.from("workflow_runs").select("status, workflow_id");
  if (workflowId) {
    query = query.eq("workflow_id", workflowId);
  }
  const { data } = await query;

  const totals = { runs: 0, success: 0, failed: 0 };
  const byWorkflow: Record<string, { runs: number; success: number; failed: number }> = {};
  for (const row of data || []) {
    const workflowKey = row.workflow_id || "unknown";
    if (!byWorkflow[workflowKey]) {
      byWorkflow[workflowKey] = { runs: 0, success: 0, failed: 0 };
    }
    totals.runs += 1;
    byWorkflow[workflowKey].runs += 1;
    if (row.status === "success") {
      totals.success += 1;
      byWorkflow[workflowKey].success += 1;
    }
    if (row.status === "failed" || row.status === "error") {
      totals.failed += 1;
      byWorkflow[workflowKey].failed += 1;
    }
  }

  return NextResponse.json({ totals, byWorkflow });
}

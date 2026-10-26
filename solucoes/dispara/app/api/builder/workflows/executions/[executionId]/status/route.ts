import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

type RouteParams = {
  params: Promise<{ executionId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { executionId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ status: "unknown", nodeStatuses: [] });
  }

  const { data: execution } = await supabase
    .from("workflow_runs")
    .select("status")
    .eq("id", executionId)
    .single();

  const { data: logs } = await supabase
    .from("workflow_run_logs")
    .select("node_id,status,started_at")
    .eq("run_id", executionId);

  const nodeStatuses = new Map<string, { status: string; started_at: string }>();
  for (const log of logs || []) {
    const existing = nodeStatuses.get(log.node_id);
    if (!existing || existing.started_at < log.started_at) {
      nodeStatuses.set(log.node_id, {
        status: log.status,
        started_at: log.started_at,
      });
    }
  }

  return NextResponse.json({
    status: execution?.status || "unknown",
    nodeStatuses: Array.from(nodeStatuses.entries()).map(([nodeId, data]) => ({
      nodeId,
      status: data.status,
    })),
  });
}

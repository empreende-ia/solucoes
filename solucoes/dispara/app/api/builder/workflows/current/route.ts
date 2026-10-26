import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createWorkflowRecord,
  ensureWorkflowRecord,
  getCompanyId,
  listWorkflowRecords,
  toSavedWorkflow,
  updateWorkflowRecord,
} from "@/lib/builder/workflow-db";
import {
  findWorkflowGraphIssues,
  workflowGraphIssuesBody,
} from "@/lib/builder/workflow-graph-guard";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }
  const companyId = await getCompanyId(supabase);
  const records = await listWorkflowRecords(supabase, companyId);
  if (records.length > 0) {
    return NextResponse.json(toSavedWorkflow(records[0]));
  }
  const created = await createWorkflowRecord(
    supabase,
    {
      name: "Current Workflow",
      nodes: [],
      edges: [],
    },
    companyId
  );
  return NextResponse.json(toSavedWorkflow(created));
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
  const edges = Array.isArray(body?.edges) ? body.edges : [];
  // Grava direto na versão ativa (executável): mesma revalidação de condições
  // e actionTypes do PATCH.
  const graphIssues = findWorkflowGraphIssues(nodes);
  if (graphIssues.length > 0) {
    return NextResponse.json(workflowGraphIssuesBody(graphIssues), {
      status: 400,
    });
  }
  const companyId = await getCompanyId(supabase);
  const records = await listWorkflowRecords(supabase, companyId);
  const workflowId = records[0]?.workflow.id ?? null;
  const record = workflowId
    ? await updateWorkflowRecord(supabase, workflowId, {
        nodes,
        edges,
      })
    : await createWorkflowRecord(
        supabase,
        {
          name: "Current Workflow",
          nodes,
          edges,
        },
        companyId
      );
  return NextResponse.json(toSavedWorkflow(record));
}

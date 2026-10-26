import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createWorkflowRecord,
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";
import {
  findWorkflowGraphIssues,
  workflowGraphIssuesBody,
} from "@/lib/builder/workflow-graph-guard";

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
  // A cópia nasce como versão ativa (rascunho executável): mesma revalidação de
  // condições e actionTypes do PATCH — senão duplicar um grafo gravado antes
  // da revalidação "lavaria" uma condição maliciosa ou um passo removido.
  const graphIssues = findWorkflowGraphIssues(record.version.nodes);
  if (graphIssues.length > 0) {
    return NextResponse.json(workflowGraphIssuesBody(graphIssues), {
      status: 400,
    });
  }
  const duplicate = await createWorkflowRecord(
    supabase,
    {
      name: `${record.workflow.name} Copy`,
      description: record.workflow.description ?? undefined,
      nodes: record.version.nodes,
      edges: record.version.edges,
      tree: record.version.tree ?? undefined,
    },
    companyId
  );
  return NextResponse.json(toSavedWorkflow(duplicate));
}

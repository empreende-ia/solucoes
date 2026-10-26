import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildDefaultGraph,
  createWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
} from "@/lib/builder/workflow-db";
import { validateWorkflowSchema } from "@/lib/shared/workflow-schema";
import { validateTree } from "@/lib/builder/flow/tree-validate";
import type { Flow } from "@/lib/builder/flow/types";
import {
  findWorkflowGraphIssues,
  workflowGraphIssuesBody,
} from "@/lib/builder/workflow-graph-guard";

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
  const graph =
    nodes.length === 0 && edges.length === 0 ? buildDefaultGraph() : null;
  let tree: unknown;
  if (body?.tree !== undefined) {
    if (body.tree === null || typeof body.tree !== "object") {
      return NextResponse.json(
        { error: "Invalid tree", details: "tree deve ser um objeto Flow" },
        { status: 400 }
      );
    }
    const treeValidation = validateTree(body.tree as Flow);
    if (!treeValidation.valid) {
      return NextResponse.json(
        { error: "Invalid tree", details: treeValidation.issues },
        { status: 400 }
      );
    }
    tree = body.tree;
  }
  let normalized = {
    name: body?.name,
    description: body?.description,
    nodes: graph ? graph.nodes : nodes,
    edges: graph ? graph.edges : edges,
    tree,
    visibility: body?.visibility,
  };
  let validation = validateWorkflowSchema(normalized);
  if (!validation.success && nodes.length === 0 && edges.length === 0) {
    const fallback = buildDefaultGraph();
    normalized = {
      ...normalized,
      nodes: fallback.nodes,
      edges: fallback.edges,
    };
    validation = validateWorkflowSchema(normalized);
  }
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid workflow", details: validation.errors },
      { status: 400 }
    );
  }
  // Mesma revalidação do PATCH (condições + actionTypes): o grafo cru vai
  // direto para o executor.
  const graphIssues = findWorkflowGraphIssues(normalized.nodes);
  if (graphIssues.length > 0) {
    return NextResponse.json(workflowGraphIssuesBody(graphIssues), {
      status: 400,
    });
  }
  const companyId = await getCompanyId(supabase);
  try {
    const record = await createWorkflowRecord(
      supabase,
      normalized,
      companyId
    );
    const workflow = toSavedWorkflow(record);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create workflow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

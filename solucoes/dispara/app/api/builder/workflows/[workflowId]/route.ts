import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkflowRecord,
  getCompanyId,
  toSavedWorkflow,
  updateWorkflowRecord,
} from "@/lib/builder/workflow-db";
import {
  validateWorkflowSchema,
  WorkflowNodeTypeSchema,
} from "@/lib/shared/workflow-schema";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/lib/builder/graph-types";
import type { WorkflowVisibility } from "@/lib/builder/api-client";
import { validateTree } from "@/lib/builder/flow/tree-validate";
import type { Flow } from "@/lib/builder/flow/types";
import { parseWorkflowSettings } from "@/lib/builder/workflow-settings";
import {
  findWorkflowGraphIssues,
  workflowGraphIssuesBody,
} from "@/lib/builder/workflow-graph-guard";

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
  return NextResponse.json(toSavedWorkflow(record));
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const normalized = normalizeWorkflowPatch(body);
  const validation = validateWorkflowSchema(normalized);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid workflow", details: validation.errors },
      { status: 400 }
    );
  }
  // O grafo cru vai direto para o executor: revalida no servidor TODAS as
  // expressões de Condition e os actionTypes (não confia no compile do cliente).
  const graphIssues = findWorkflowGraphIssues(normalized.nodes);
  if (graphIssues.length > 0) {
    return NextResponse.json(workflowGraphIssuesBody(graphIssues), {
      status: 400,
    });
  }
  // Árvore canônica do builder novo: valida estrutura leve antes de persistir.
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
  await updateWorkflowRecord(supabase, workflowId, {
    name: normalized?.name,
    description: normalized?.description,
    nodes: normalized?.nodes,
    edges: normalized?.edges,
    tree,
    visibility: normalized?.visibility,
    settings: normalized?.settings,
  });
  const companyId = await getCompanyId(supabase);
  const record = await ensureWorkflowRecord(supabase, workflowId, companyId);
  return NextResponse.json(toSavedWorkflow(record));
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { workflowId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }
  await supabase.from("workflows").delete().eq("id", workflowId);
  return NextResponse.json({ success: true });
}

function normalizeWorkflowPatch(body: Record<string, unknown>) {
  const nodes: WorkflowNode[] = Array.isArray(body?.nodes)
    ? body.nodes.map((node) => normalizeNode(node))
    : [];
  const edges: WorkflowEdge[] = Array.isArray(body?.edges)
    ? body.edges.map((edge) => normalizeEdge(edge))
    : [];

  return {
    name: typeof body?.name === "string" ? body.name : undefined,
    description:
      typeof body?.description === "string" ? body.description : undefined,
    nodes,
    edges,
    visibility:
      body?.visibility === "private" || body?.visibility === "public"
        ? (body.visibility as WorkflowVisibility)
        : undefined,
    // Sanitizado de verdade em updateWorkflowRecord (parseWorkflowSettings).
    settings:
      body?.settings && typeof body.settings === "object"
        ? parseWorkflowSettings(body.settings)
        : undefined,
  };
}

function normalizeNode(node: unknown): WorkflowNode {
  const data = (node as { data?: Record<string, unknown> } | null)?.data ?? {};
  const rawType = (node as { type?: unknown } | null)?.type;
  const fallbackType = data?.type;
  const typeValue =
    typeof rawType === "string" ? rawType : typeof fallbackType === "string" ? fallbackType : "action";
  const parsedType = WorkflowNodeTypeSchema.safeParse(typeValue);
  const type = parsedType.success ? parsedType.data : "action";
  const position = (node as { position?: { x?: unknown; y?: unknown } } | null)
    ?.position ?? { x: 0, y: 0 };

  return {
    id: String((node as { id?: unknown } | null)?.id ?? ""),
    type,
    position: {
      x: typeof position.x === "number" ? position.x : 0,
      y: typeof position.y === "number" ? position.y : 0,
    },
    data: {
      label: typeof data.label === "string" ? data.label : "",
      description:
        typeof data.description === "string" ? data.description : undefined,
      type,
      config:
        typeof data.config === "object" && data.config !== null
          ? normalizeActionConfig(data.config as Record<string, unknown>)
          : undefined,
      status:
        data.status === "idle" ||
        data.status === "running" ||
        data.status === "success" ||
        data.status === "error"
          ? data.status
          : undefined,
      enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
    },
    selected:
      typeof (node as { selected?: unknown } | null)?.selected === "boolean"
        ? (node as { selected?: boolean }).selected
        : undefined,
  } as WorkflowNode;
}

function normalizeActionConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const actionType =
    typeof config.actionType === "string" ? config.actionType : undefined;

  const variableKey =
    typeof config.variableKey === "string" ? config.variableKey.trim() : "";
  const message =
    typeof config.message === "string" ? config.message.trim() : "";
  const toSource =
    typeof config.toSource === "string" ? config.toSource.trim() : "";

  const looksLikeAskQuestion =
    Boolean(variableKey) &&
    Boolean(message) &&
    (toSource === "inbound" || toSource === "manual") &&
    actionType !== "Set Variable";

  if (!looksLikeAskQuestion) {
    return config;
  }

  const nextConfig: Record<string, unknown> = {
    ...config,
    actionType: "whatsapp/ask-question",
  };

  const keysToDrop = [
    "templateName",
    "parameterFormat",
    "bodyParams",
    "headerParams",
    "buttonParams",
    "headerText",
    "footer",
    "language",
    "body",
    "buttons",
  ];
  for (const key of keysToDrop) {
    if (key in nextConfig) {
      delete nextConfig[key];
    }
  }

  return nextConfig;
}

function normalizeEdge(edge: unknown): WorkflowEdge {
  return {
    id: String((edge as { id?: unknown } | null)?.id ?? ""),
    source: String((edge as { source?: unknown } | null)?.source ?? ""),
    target: String((edge as { target?: unknown } | null)?.target ?? ""),
    type:
      typeof (edge as { type?: unknown } | null)?.type === "string"
        ? (edge as { type?: string }).type
        : undefined,
  } as WorkflowEdge;
}

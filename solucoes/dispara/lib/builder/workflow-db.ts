import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedWorkflow, WorkflowData } from "./api-client";
import type { WorkflowEdge, WorkflowNode } from "./graph-types";
import { createEmptyFlow } from "./flow/operations";
import type { Flow } from "./flow/types";
import { parseWorkflowSettings } from "./workflow-settings";

type WorkflowRow = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  owner_company_id?: string | null;
  active_version_id?: string | null;
  settings?: unknown;
  created_at: string;
  updated_at: string;
};

type WorkflowVersionRow = {
  id: string;
  workflow_id: string;
  version: number;
  status: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** árvore canônica do builder novo (lib/builder/flow/types.ts); nodes/edges são derivados */
  tree?: unknown;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
};

export type WorkflowRecord = {
  workflow: WorkflowRow;
  version: WorkflowVersionRow;
  lastPublishedVersion?: number | null;
};

const DEFAULT_WORKFLOW_NAME = "Fluxo inicial";

export function buildDefaultGraph(): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const triggerId = nanoid();
  const actionId = nanoid();

  return {
    nodes: [
      {
        id: triggerId,
        type: "trigger",
        position: { x: 80, y: 120 },
        data: {
          label: "Mensagem recebida",
          description: "Inicia quando uma mensagem chega",
          type: "trigger",
          config: { triggerType: "Webhook" },
        },
      },
      {
        id: actionId,
        type: "action",
        position: { x: 420, y: 120 },
        data: {
          label: "Enviar mensagem",
          description: "Responder ao usuario",
          type: "action",
          config: { actionType: "Send Message" },
        },
      },
    ],
    edges: [
      {
        id: nanoid(),
        source: triggerId,
        target: actionId,
        type: "animated",
      },
    ],
  };
}

/** Irmão de buildDefaultGraph: árvore canônica vazia do builder novo. */
export function buildDefaultTree(args?: { id?: string; name?: string }): Flow {
  return createEmptyFlow({
    id: args?.id,
    name: args?.name ?? DEFAULT_WORKFLOW_NAME,
  });
}

export async function getCompanyId(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "company_id")
    .maybeSingle();

  if (!data?.value) {
    return null;
  }
  return data.value;
}

export function toSavedWorkflow(
  record: WorkflowRecord,
  options?: { isOwner?: boolean }
): SavedWorkflow {
  return {
    id: record.workflow.id,
    name: record.workflow.name,
    description: record.workflow.description ?? undefined,
    nodes: record.version.nodes,
    edges: record.version.edges,
    tree: record.version.tree ?? undefined,
    visibility: "private",
    settings: parseWorkflowSettings(record.workflow.settings),
    createdAt: record.workflow.created_at,
    updatedAt: record.workflow.updated_at,
    isOwner: options?.isOwner ?? true,
    status: record.workflow.status,
    lastPublishedVersion: record.lastPublishedVersion ?? null,
  };
}

export async function fetchWorkflowRecord(
  supabase: SupabaseClient,
  workflowId: string
): Promise<WorkflowRecord | null> {
  const { data: workflow } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle<WorkflowRow>();

  if (!workflow) {
    return null;
  }

  const versionId = workflow.active_version_id;
  if (!versionId) {
    return null;
  }

  const { data: version } = await supabase
    .from("workflow_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle<WorkflowVersionRow>();

  if (!version) {
    return null;
  }

  return { workflow, version };
}

export async function ensureWorkflowRecord(
  supabase: SupabaseClient,
  workflowId: string,
  ownerCompanyId?: string | null
): Promise<WorkflowRecord> {
  const existing = await fetchWorkflowRecord(supabase, workflowId);
  if (existing) return existing;

  const graph = buildDefaultGraph();
  const now = new Date().toISOString();
  const versionId = nanoid();

  const { error: workflowError } = await supabase.from("workflows").insert({
    id: workflowId,
    name: DEFAULT_WORKFLOW_NAME,
    description: null,
    status: "draft",
    owner_company_id: ownerCompanyId ?? null,
    active_version_id: null,
    created_at: now,
    updated_at: now,
  });
  if (workflowError) {
    throw new Error(`Failed to create workflow: ${workflowError.message}`);
  }

  const { error: versionError } = await supabase.from("workflow_versions").insert({
    id: versionId,
    workflow_id: workflowId,
    version: 1,
    status: "draft",
    nodes: graph.nodes,
    edges: graph.edges,
    tree: buildDefaultTree({ id: workflowId }),
    created_at: now,
    updated_at: now,
  });
  if (versionError) {
    throw new Error(`Failed to create workflow version: ${versionError.message}`);
  }

  const { error: linkError } = await supabase.from("workflows").update({
    active_version_id: versionId,
    updated_at: now,
  }).eq("id", workflowId);
  if (linkError) {
    throw new Error(`Failed to link workflow version: ${linkError.message}`);
  }

  const created = await fetchWorkflowRecord(supabase, workflowId);
  if (!created) {
    throw new Error("Failed to create workflow");
  }
  return created;
}

export async function createWorkflowRecord(
  supabase: SupabaseClient,
  input: WorkflowData,
  ownerCompanyId?: string | null
): Promise<WorkflowRecord> {
  const workflowId = input.id ?? nanoid();
  const versionId = nanoid();
  const now = new Date().toISOString();

  const { error: workflowError } = await supabase.from("workflows").insert({
    id: workflowId,
    name: input.name ?? DEFAULT_WORKFLOW_NAME,
    description: input.description ?? null,
    status: "draft",
    owner_company_id: ownerCompanyId ?? null,
    active_version_id: null,
    created_at: now,
    updated_at: now,
  });
  if (workflowError) {
    throw new Error(`Failed to create workflow: ${workflowError.message}`);
  }

  const { error: versionError } = await supabase.from("workflow_versions").insert({
    id: versionId,
    workflow_id: workflowId,
    version: 1,
    status: "draft",
    nodes: input.nodes,
    edges: input.edges,
    tree: input.tree ?? null,
    created_at: now,
    updated_at: now,
  });
  if (versionError) {
    throw new Error(`Failed to create workflow version: ${versionError.message}`);
  }

  const { error: linkError } = await supabase.from("workflows").update({
    active_version_id: versionId,
    updated_at: now,
  }).eq("id", workflowId);
  if (linkError) {
    throw new Error(`Failed to link workflow version: ${linkError.message}`);
  }

  const created = await fetchWorkflowRecord(supabase, workflowId);
  if (!created) {
    throw new Error("Failed to create workflow");
  }
  return created;
}

export async function updateWorkflowRecord(
  supabase: SupabaseClient,
  workflowId: string,
  patch: Partial<WorkflowData>
): Promise<WorkflowRecord> {
  const existing = await ensureWorkflowRecord(supabase, workflowId);
  const now = new Date().toISOString();

  await supabase.from("workflows").update({
    name: patch.name ?? existing.workflow.name,
    description:
      patch.description === undefined
        ? existing.workflow.description
        : patch.description,
    settings:
      patch.settings === undefined
        ? (existing.workflow.settings ?? {})
        : parseWorkflowSettings(patch.settings),
    updated_at: now,
  }).eq("id", workflowId);

  const versionId = existing.workflow.active_version_id;
  if (!versionId) {
    throw new Error("Workflow missing active version");
  }

  await supabase.from("workflow_versions").update({
    nodes: patch.nodes ?? existing.version.nodes,
    edges: patch.edges ?? existing.version.edges,
    tree: patch.tree === undefined ? (existing.version.tree ?? null) : patch.tree,
    updated_at: now,
  }).eq("id", versionId);

  const updated = await fetchWorkflowRecord(supabase, workflowId);
  if (!updated) {
    throw new Error("Failed to update workflow");
  }
  return updated;
}

export async function listWorkflowRecords(
  supabase: SupabaseClient,
  ownerCompanyId?: string | null
): Promise<WorkflowRecord[]> {
  let query = supabase.from("workflows").select("*").order("updated_at", {
    ascending: false,
  });
  if (ownerCompanyId) {
    query = query.eq("owner_company_id", ownerCompanyId);
  }
  const { data } = await query;
  if (!data || data.length === 0) return [];

  const versionIds = data
    .map((workflow) => workflow.active_version_id)
    .filter(Boolean) as string[];
  if (versionIds.length === 0) return [];

  const { data: versions } = await supabase
    .from("workflow_versions")
    .select("*")
    .in("id", versionIds);

  const versionMap = new Map(
    (versions || []).map((version) => [version.id, version])
  );

  const workflowIds = (data as WorkflowRow[]).map((workflow) => workflow.id);
  const { data: publishedVersions } = await supabase
    .from("workflow_versions")
    .select("workflow_id, version")
    .in("workflow_id", workflowIds)
    .eq("status", "published");

  const publishedMap = new Map<string, number>();
  for (const row of publishedVersions || []) {
    const current = publishedMap.get(row.workflow_id) ?? 0;
    if (row.version > current) {
      publishedMap.set(row.workflow_id, row.version);
    }
  }

  return (data as WorkflowRow[])
    .map((workflow) => {
      const version = workflow.active_version_id
        ? versionMap.get(workflow.active_version_id)
        : undefined;
      if (!version) return null;
      return {
        workflow,
        version,
        lastPublishedVersion: publishedMap.get(workflow.id) ?? null,
      } as WorkflowRecord;
    })
    .filter((record): record is WorkflowRecord => Boolean(record));
}

export async function createNewVersion(
  supabase: SupabaseClient,
  workflowId: string,
  input: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    tree?: unknown;
    status: string;
  }
): Promise<WorkflowVersionRow> {
  const { data: latestVersion } = await supabase
    .from("workflow_versions")
    .select("version")
    .eq("workflow_id", workflowId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  const version = (latestVersion?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const versionId = nanoid();

  await supabase.from("workflow_versions").insert({
    id: versionId,
    workflow_id: workflowId,
    version,
    status: input.status,
    nodes: input.nodes,
    edges: input.edges,
    tree: input.tree ?? null,
    created_at: now,
    updated_at: now,
    published_at: input.status === "published" ? now : null,
  });

  const { data: created } = await supabase
    .from("workflow_versions")
    .select("*")
    .eq("id", versionId)
    .single<WorkflowVersionRow>();

  if (!created) {
    throw new Error("Failed to create workflow version");
  }

  return created;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

let configuredSecret: string | null = null;

vi.mock("@/lib/supabase-db", () => ({
  settingsDb: { get: vi.fn(async () => configuredSecret) },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: async () => ({ data: null, error: null }) }),
  }),
}));

vi.mock("@/lib/builder/workflow-db", () => ({
  getCompanyId: vi.fn(async () => "company-1"),
  ensureWorkflowRecord: vi.fn(async () => ({
    workflow: { id: "wf-1", active_version_id: "ver-1" },
    version: { nodes: [], edges: [] },
  })),
  toSavedWorkflow: vi.fn(() => ({ nodes: [], edges: [] })),
}));

const executeWorkflow = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/builder/workflow-executor.workflow", () => ({
  executeWorkflow: (...args: unknown[]) => executeWorkflow(...(args as [])),
}));

import { POST } from "./route";

const params = { params: Promise.resolve({ workflowId: "wf-1" }) };

function request(secret?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== undefined) headers["x-workflow-secret"] = secret;
  return new Request("http://localhost/api/builder/workflows/wf-1/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify({ hello: "world" }),
  });
}

beforeEach(() => {
  executeWorkflow.mockClear();
  configuredSecret = null;
  delete process.env.WORKFLOW_BUILDER_WEBHOOK_SECRET;
});

describe("POST /api/builder/workflows/[workflowId]/webhook — segredo", () => {
  it("com secret configurado: rejeita header errado (401) sem executar", async () => {
    configuredSecret = "s3cret";
    const res = await POST(request("s3creT"), params);
    expect(res.status).toBe(401);
    expect(executeWorkflow).not.toHaveBeenCalled();
  });

  it("com secret configurado: rejeita header ausente (401)", async () => {
    configuredSecret = "s3cret";
    const res = await POST(request(), params);
    expect(res.status).toBe(401);
    expect(executeWorkflow).not.toHaveBeenCalled();
  });

  it("com secret configurado: aceita o header correto", async () => {
    configuredSecret = "s3cret";
    const res = await POST(request("s3cret"), params);
    expect(res.status).toBe(200);
    expect(executeWorkflow).toHaveBeenCalledTimes(1);
  });

  it("sem secret configurado continua aceitando (proxy já exige sessão/API key)", async () => {
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(executeWorkflow).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks (sem banco, sem rede) ─────────────────────────────────────────────

const updateWorkflowRecord = vi.fn(async () => undefined);
const createNewVersion = vi.fn(async () => ({ id: "ver-new", version: 2 }));
const createWorkflowRecord = vi.fn(async () => ({}));
let currentVersionNodes: unknown[] = [];
let existingRecords: unknown[] = [];

vi.mock("@/lib/builder/workflow-db", () => ({
  getCompanyId: vi.fn(async () => "company-1"),
  ensureWorkflowRecord: vi.fn(async () => ({
    workflow: { id: "wf-1", active_version_id: "ver-old", name: "Fluxo" },
    version: { nodes: currentVersionNodes, edges: [], tree: null },
  })),
  listWorkflowRecords: vi.fn(async () => existingRecords),
  toSavedWorkflow: vi.fn(() => ({ id: "wf-1" })),
  updateWorkflowRecord: (...args: unknown[]) => updateWorkflowRecord(...(args as [])),
  createNewVersion: (...args: unknown[]) => createNewVersion(...(args as [])),
  createWorkflowRecord: (...args: unknown[]) => createWorkflowRecord(...(args as [])),
  buildDefaultGraph: vi.fn(() => ({ nodes: [], edges: [] })),
}));

vi.mock("@/lib/builder/workflow-schedule", () => ({
  syncWorkflowSchedule: vi.fn(async () => undefined),
  clearWorkflowSchedule: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase-db", () => ({
  settingsDb: { get: vi.fn(async () => null) },
}));

// Supabase fake: registra updates e devolve a versão "selecionada" no rollback.
const supabaseUpdates: unknown[] = [];
let selectedVersionRow: Record<string, unknown> | null = null;

function makeQuery() {
  const query = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    maybeSingle: async () => ({ data: selectedVersionRow, error: null }),
    update: (values: unknown) => {
      supabaseUpdates.push(values);
      return query;
    },
    then: (resolve: (value: { data: null; error: null }) => unknown) =>
      resolve({ data: null, error: null }),
  };
  return query;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: () => makeQuery() }),
}));

import { PATCH } from "./route";
import { POST as PUBLISH } from "./publish/route";
import { POST as ROLLBACK } from "./rollback/route";
import { POST as CREATE } from "@/app/api/builder/workflows/create/route";
import { POST as DUPLICATE } from "./duplicate/route";
import { POST as SAVE_CURRENT } from "@/app/api/builder/workflows/current/route";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TRIGGER = {
  id: "__trigger",
  type: "trigger",
  position: { x: 0, y: 0 },
  data: { type: "trigger", label: "Gatilho", config: { triggerType: "Keywords" } },
};

function conditionNode(id: string, condition: string) {
  return {
    id,
    type: "action",
    position: { x: 0, y: 1 },
    data: { type: "action", label: `Cond ${id}`, config: { actionType: "Condition", condition } },
  };
}

const GOOD = conditionNode("good", '{{@__trigger:Gatilho.message}}.includes("oi")');
const EVIL = conditionNode(
  "evil",
  '{{@__trigger:Gatilho.message}}["constructor"]["constructor"]("return process.env")()'
);
// Passo removido (SQL arbitrário via DATABASE_URL) injetado no grafo cru.
const DB_QUERY = {
  id: "dbq",
  type: "action",
  position: { x: 0, y: 2 },
  data: {
    type: "action",
    label: "SQL",
    config: { actionType: "Database Query", dbQuery: "select * from settings" },
  },
};

function graph(...nodes: unknown[]) {
  return {
    name: "Fluxo",
    nodes: [TRIGGER, ...nodes],
    edges: nodes.map((n, i) => ({
      id: `e${i}`,
      source: "__trigger",
      target: (n as { id: string }).id,
    })),
  };
}

const params = { params: Promise.resolve({ workflowId: "wf-1" }) };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/builder/workflows/wf-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  updateWorkflowRecord.mockClear();
  createNewVersion.mockClear();
  createWorkflowRecord.mockClear();
  supabaseUpdates.length = 0;
  currentVersionNodes = [];
  existingRecords = [];
  selectedVersionRow = null;
});

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe("PATCH /api/builder/workflows/[workflowId] — revalida condições", () => {
  it("rejeita com 400 e mensagem clara um grafo com condição maliciosa", async () => {
    const res = await PATCH(jsonRequest(graph(GOOD, EVIL)), params);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: Array<{ nodeId: string }> };
    expect(body.error).toContain('Condição inválida no nó "Cond evil"');
    expect(body.details.map((d) => d.nodeId)).toEqual(["evil"]);
    expect(updateWorkflowRecord).not.toHaveBeenCalled();
  });

  it("aceita e persiste um grafo com condições válidas", async () => {
    const res = await PATCH(jsonRequest(graph(GOOD)), params);
    expect(res.status).toBe(200);
    expect(updateWorkflowRecord).toHaveBeenCalledTimes(1);
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("POST /api/builder/workflows/create — revalida condições", () => {
  it("rejeita com 400 um grafo com condição maliciosa", async () => {
    const res = await CREATE(jsonRequest(graph(EVIL)));
    expect(res.status).toBe(400);
    expect(createWorkflowRecord).not.toHaveBeenCalled();
  });

  it("aceita grafo válido", async () => {
    const res = await CREATE(jsonRequest(graph(GOOD)));
    expect(res.status).toBe(200);
    expect(createWorkflowRecord).toHaveBeenCalledTimes(1);
  });
});

// ─── publish ─────────────────────────────────────────────────────────────────

describe("POST /api/builder/workflows/[workflowId]/publish — revalida condições", () => {
  it("não publica rascunho com condição maliciosa (gravado antes da correção)", async () => {
    currentVersionNodes = graph(EVIL).nodes;
    const res = await PUBLISH(jsonRequest({}), params);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Condição inválida");
    expect(createNewVersion).not.toHaveBeenCalled();
    expect(supabaseUpdates).toEqual([]);
  });

  it("publica rascunho válido", async () => {
    currentVersionNodes = graph(GOOD).nodes;
    const res = await PUBLISH(jsonRequest({}), params);
    expect(res.status).toBe(200);
    expect(createNewVersion).toHaveBeenCalledTimes(1);
  });
});

// ─── rollback ────────────────────────────────────────────────────────────────

describe("POST /api/builder/workflows/[workflowId]/rollback — revalida condições", () => {
  it("não reativa versão antiga com condição maliciosa", async () => {
    selectedVersionRow = { id: "ver-old", workflow_id: "wf-1", nodes: graph(EVIL).nodes };
    const res = await ROLLBACK(jsonRequest({ versionId: "ver-old" }), params);
    expect(res.status).toBe(400);
    expect(supabaseUpdates).toEqual([]);
  });

  it("reativa versão válida", async () => {
    selectedVersionRow = { id: "ver-old", workflow_id: "wf-1", nodes: graph(GOOD).nodes };
    const res = await ROLLBACK(jsonRequest({ versionId: "ver-old" }), params);
    expect(res.status).toBe(200);
    expect(supabaseUpdates.length).toBeGreaterThan(0);
  });
});

// ─── allowlist de actionType (PATCH, create, publish, rollback) ──────────────

describe("rotas do builder — recusam actionType fora da allowlist", () => {
  it("PATCH: nó Database Query → 400 e nada é gravado", async () => {
    const res = await PATCH(jsonRequest(graph(GOOD, DB_QUERY)), params);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      details: Array<{ nodeId: string; kind: string }>;
    };
    expect(body.error).toContain('Ação não suportada no nó "SQL"');
    expect(body.error).toContain("Database Query");
    expect(body.details).toEqual([expect.objectContaining({ nodeId: "dbq", kind: "action" })]);
    expect(updateWorkflowRecord).not.toHaveBeenCalled();
  });

  it("create: nó Database Query → 400", async () => {
    const res = await CREATE(jsonRequest(graph(DB_QUERY)));
    expect(res.status).toBe(400);
    expect(createWorkflowRecord).not.toHaveBeenCalled();
  });

  it("publish: rascunho antigo com Database Query não é publicado", async () => {
    currentVersionNodes = graph(DB_QUERY).nodes;
    const res = await PUBLISH(jsonRequest({}), params);
    expect(res.status).toBe(400);
    expect(createNewVersion).not.toHaveBeenCalled();
    expect(supabaseUpdates).toEqual([]);
  });

  it("rollback: versão antiga com Database Query não é reativada", async () => {
    selectedVersionRow = { id: "ver-old", workflow_id: "wf-1", nodes: graph(DB_QUERY).nodes };
    const res = await ROLLBACK(jsonRequest({ versionId: "ver-old" }), params);
    expect(res.status).toBe(400);
    expect(supabaseUpdates).toEqual([]);
  });
});

// ─── duplicate ───────────────────────────────────────────────────────────────

describe("POST /api/builder/workflows/[workflowId]/duplicate — revalida o grafo", () => {
  it("não duplica (não 'lava') um grafo com condição maliciosa", async () => {
    currentVersionNodes = graph(EVIL).nodes;
    const res = await DUPLICATE(jsonRequest({}), params);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Condição inválida no nó "Cond evil"');
    expect(createWorkflowRecord).not.toHaveBeenCalled();
  });

  it("não duplica um grafo com actionType fora da allowlist", async () => {
    currentVersionNodes = graph(DB_QUERY).nodes;
    const res = await DUPLICATE(jsonRequest({}), params);
    expect(res.status).toBe(400);
    expect(createWorkflowRecord).not.toHaveBeenCalled();
  });

  it("duplica grafo válido", async () => {
    currentVersionNodes = graph(GOOD).nodes;
    const res = await DUPLICATE(jsonRequest({}), params);
    expect(res.status).toBe(200);
    expect(createWorkflowRecord).toHaveBeenCalledTimes(1);
  });
});

// ─── current (POST) ──────────────────────────────────────────────────────────

describe("POST /api/builder/workflows/current — revalida o grafo", () => {
  it("rejeita condição maliciosa sem gravar", async () => {
    existingRecords = [{ workflow: { id: "wf-1" } }];
    const res = await SAVE_CURRENT(jsonRequest(graph(EVIL)));
    expect(res.status).toBe(400);
    expect(updateWorkflowRecord).not.toHaveBeenCalled();
    expect(createWorkflowRecord).not.toHaveBeenCalled();
  });

  it("rejeita actionType fora da allowlist sem gravar", async () => {
    const res = await SAVE_CURRENT(jsonRequest(graph(DB_QUERY)));
    expect(res.status).toBe(400);
    expect(createWorkflowRecord).not.toHaveBeenCalled();
  });

  it("grava grafo válido (atualiza o existente ou cria)", async () => {
    existingRecords = [{ workflow: { id: "wf-1" } }];
    expect((await SAVE_CURRENT(jsonRequest(graph(GOOD)))).status).toBe(200);
    expect(updateWorkflowRecord).toHaveBeenCalledTimes(1);

    existingRecords = [];
    expect((await SAVE_CURRENT(jsonRequest(graph(GOOD)))).status).toBe(200);
    expect(createWorkflowRecord).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

// server-only barra a importação em ambiente de teste; neutraliza.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/builder/workflow-execution-settings", () => ({
  getWorkflowExecutionConfig: vi.fn(async () => ({
    config: { retryCount: 0, retryDelayMs: 0, timeoutMs: 10000 },
  })),
}));

import { executeWorkflow } from "./workflow-executor.workflow";

const CANARY = "__dispara_executor_pwned__";
const canaryHolder = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete canaryHolder[CANARY];
});

const TRIGGER_REF = "{{@__trigger:Gatilho.message}}";

/** trigger → condition(expr) → set variable (marca se a branch passou). */
function buildGraph(condition: unknown) {
  const nodes = [
    {
      id: "__trigger",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: { type: "trigger", label: "Gatilho", config: { triggerType: "Keywords" } },
    },
    {
      id: "cond",
      type: "action",
      position: { x: 0, y: 1 },
      data: {
        type: "action",
        label: "Condição",
        config: { actionType: "Condition", condition },
      },
    },
    {
      id: "after",
      type: "action",
      position: { x: 0, y: 2 },
      data: {
        type: "action",
        label: "Depois",
        config: { actionType: "Set Variable", variableKey: "passed", variableValue: "sim" },
      },
    },
  ] as never[];
  const edges = [
    { id: "e1", source: "__trigger", target: "cond" },
    { id: "e2", source: "cond", target: "after" },
  ] as never[];
  return { nodes, edges };
}

type ExecResult = {
  results: Record<string, { success: boolean; data?: unknown; error?: string }>;
};

async function run(condition: unknown, message: string): Promise<ExecResult> {
  const { nodes, edges } = buildGraph(condition);
  return (await executeWorkflow({
    nodes,
    edges,
    triggerInput: { message, from: "+5511999999999" },
  })) as unknown as ExecResult;
}

function conditionOf(result: ExecResult): unknown {
  return (result.results.cond?.data as { condition?: unknown } | undefined)?.condition;
}

describe("executor — avaliação SEGURA de Condition", () => {
  it("condição gerada pela UI (contains) continua roteando", async () => {
    const yes = await run(`${TRIGGER_REF}.includes("oi")`, "oi, tudo bem?");
    expect(conditionOf(yes)).toBe(true);
    expect(yes.results.after?.success).toBe(true);

    const no = await run(`${TRIGGER_REF}.includes("oi")`, "bom dia");
    expect(conditionOf(no)).toBe(false);
    expect(no.results.after?.error).toBe("skipped");
  });

  it("negação + igualdade (branch None) continua funcionando", async () => {
    const expr = `!(${TRIGGER_REF}.includes("vendas")) && !(${TRIGGER_REF} === "suporte")`;
    expect(conditionOf(await run(expr, "outra coisa"))).toBe(true);
    expect(conditionOf(await run(expr, "suporte"))).toBe(false);
  });

  it("condição booleana literal segue a semântica antiga", async () => {
    expect(conditionOf(await run(true, "x"))).toBe(true);
    expect(conditionOf(await run("true", "x"))).toBe(true);
  });

  const payloads = [
    `${TRIGGER_REF}["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`,
    `""["constructor"]["constructor"]("globalThis.${CANARY} = 1")()`,
    `${TRIGGER_REF}["\\u0063onstructor"]["\\u0063onstructor"]("globalThis.${CANARY} = 1")()`,
    `${TRIGGER_REF}['\\x63onstructor']['\\x63onstructor']('globalThis.${CANARY} = 1')()`,
  ];

  for (const payload of payloads) {
    it(`payload de RCE no grafo cru NÃO executa: ${payload}`, async () => {
      const result = await run(payload, "oi");
      expect(canaryHolder[CANARY]).toBeUndefined();
      expect(conditionOf(result)).toBe(false);
      expect(result.results.after?.error).toBe("skipped");
    });
  }
});

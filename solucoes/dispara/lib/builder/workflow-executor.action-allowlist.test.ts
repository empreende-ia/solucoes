import { beforeEach, describe, expect, it, vi } from "vitest";

// server-only barra a importação em ambiente de teste; neutraliza.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/builder/workflow-execution-settings", () => ({
  getWorkflowExecutionConfig: vi.fn(async () => ({
    config: { retryCount: 0, retryDelayMs: 0, timeoutMs: 10000 },
  })),
}));

// Captura o input do passo Condition (é ele que vai para o log da run).
const conditionInputs: Array<Record<string, unknown>> = [];
vi.mock("./steps/condition", () => ({
  conditionStep: vi.fn(async (input: Record<string, unknown>) => {
    conditionInputs.push(input);
    return { condition: input.condition };
  }),
}));

// "Perguntar" sem rede/banco: só prova que a coerção antiga continua chegando lá.
const askQuestionStep = vi.fn(async () => ({ success: false, error: "ask-question mockado" }));
vi.mock("./steps/whatsapp/ask-question", () => ({
  askQuestionStep: (...args: unknown[]) => askQuestionStep(...(args as [])),
}));

import { executeWorkflow } from "./workflow-executor.workflow";

type ExecResult = {
  success: boolean;
  results: Record<string, { success: boolean; data?: unknown; error?: string }>;
};

/** trigger → nó testado → set variable (marca se o fluxo seguiu). */
async function runWith(config: Record<string, unknown>): Promise<ExecResult> {
  const nodes = [
    {
      id: "__trigger",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: { type: "trigger", label: "Gatilho", config: { triggerType: "Keywords" } },
    },
    {
      id: "target",
      type: "action",
      position: { x: 0, y: 1 },
      data: { type: "action", label: "Alvo", config },
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
    { id: "e1", source: "__trigger", target: "target" },
    { id: "e2", source: "target", target: "after" },
  ] as never[];
  return (await executeWorkflow({
    nodes,
    edges,
    triggerInput: { message: "oi", from: "+5511999999999" },
  })) as unknown as ExecResult;
}

beforeEach(() => {
  conditionInputs.length = 0;
  askQuestionStep.mockClear();
});

describe("executor — allowlist de actionType em runtime", () => {
  it("Database Query (removido) falha de forma controlada e bloqueia a continuação", async () => {
    const result = await runWith({
      actionType: "Database Query",
      dbQuery: "select * from settings",
    });
    expect(result.success).toBe(false);
    expect(result.results.target).toEqual({
      success: false,
      error: 'Action type "Database Query" is not supported (node "Alvo").',
    });
    expect(result.results.after?.error).toBe("skipped");
  });

  it("chave de protótipo como actionType não cai em Object.prototype", async () => {
    for (const actionType of ["constructor", "__proto__", "toString"]) {
      const result = await runWith({ actionType });
      expect(result.results.target?.success, actionType).toBe(false);
      expect(result.results.target?.error, actionType).toContain("is not supported");
    }
  });

  it("tipos permitidos seguem executando", async () => {
    const result = await runWith({ actionType: "Get Variable", variableKey: "x" });
    expect(result.results.target?.success).toBe(true);
    expect(result.results.after?.success).toBe(true);
  });

  it("nó desconhecido com cara de 'Perguntar' segue a coerção antiga (não é barrado)", async () => {
    const result = await runWith({
      actionType: "Pergunta Legada",
      variableKey: "resposta",
      message: "Qual seu nome?",
      toSource: "inbound",
    });
    expect(askQuestionStep).toHaveBeenCalledTimes(1);
    expect(result.results.target?.error).toBe("ask-question mockado");
  });
});

describe("executor — condição rejeitada pela gramática vai para o log do passo", () => {
  it("expressão inválida (crase) registra expressionError e a condição fica false", async () => {
    const result = await runWith({
      actionType: "Condition",
      condition: "{{@__trigger:Gatilho.message}} === `oi`",
    });
    expect((result.results.target?.data as { condition?: boolean }).condition).toBe(false);
    expect(conditionInputs).toHaveLength(1);
    expect(conditionInputs[0].expressionError).toContain("Template literals");
  });

  it("expressão válida não registra erro (false 'normal' é só false)", async () => {
    const result = await runWith({
      actionType: "Condition",
      condition: '{{@__trigger:Gatilho.message}} ?? "" === "tchau"',
    });
    expect(conditionInputs).toHaveLength(1);
    expect(conditionInputs[0].expressionError).toBeUndefined();
    // "oi" ?? ... → "oi" (truthy): a branch segue.
    expect((result.results.target?.data as { condition?: boolean }).condition).toBe(true);
  });

  it("?. e ternário (antes sempre false) voltam a rotear no executor", async () => {
    const result = await runWith({
      actionType: "Condition",
      condition: '{{@__trigger:Gatilho.message}}?.includes("oi") ? true : false',
    });
    expect((result.results.target?.data as { condition?: boolean }).condition).toBe(true);
    expect(result.results.after?.success).toBe(true);
  });
});

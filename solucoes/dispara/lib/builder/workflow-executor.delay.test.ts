import { describe, it, expect, vi } from "vitest";

// server-only barra a importação em ambiente de teste; neutraliza.
vi.mock("server-only", () => ({}));

// Mocks mínimos: só o que o caminho trigger→delay toca.
vi.mock("@/lib/builder/workflow-execution-settings", () => ({
  getWorkflowExecutionConfig: vi.fn(async () => ({
    config: { retryCount: 0, retryDelayMs: 0, timeoutMs: 10000 },
  })),
}));

const triggerStepMock = vi.fn(async () => ({
  success: true,
  data: { triggered: true },
}));
vi.mock("./steps/trigger", () => ({
  triggerStep: (...args: unknown[]) => triggerStepMock(...args),
}));

import { executeWorkflow } from "./workflow-executor.workflow";

// Grafo: trigger → delay(10min) → setvar
const nodes = [
  {
    id: "trigger-1",
    type: "trigger",
    position: { x: 0, y: 0 },
    data: { type: "trigger", config: { triggerType: "Keywords" } },
  },
  {
    id: "delay-1",
    type: "action",
    position: { x: 0, y: 1 },
    data: { type: "action", config: { actionType: "Delay", delayMs: 600000 } },
  },
  {
    id: "setvar-1",
    type: "action",
    position: { x: 0, y: 2 },
    data: {
      type: "action",
      config: { actionType: "Set Variable", variableKey: "k", value: "v" },
    },
  },
] as never[];

const edges = [
  { id: "e1", source: "trigger-1", target: "delay-1" },
  { id: "e2", source: "delay-1", target: "setvar-1" },
] as never[];

const triggerInput = { from: "+5511999999999", to: "+5511999999999" };

describe("executor — Delay durável (Fase D)", () => {
  it("pausa no Delay e devolve o ponto de continuação + resolvedNodeIds", async () => {
    triggerStepMock.mockClear();
    const res = (await executeWorkflow({
      nodes,
      edges,
      triggerInput,
    })) as {
      paused?: boolean;
      wait?: { kind: string; resumeNodeId: string; resumeInMs: number };
      resolvedNodeIds?: string[];
    };

    expect(res.paused).toBe(true);
    expect(res.wait).toEqual({
      kind: "delay",
      resumeNodeIds: ["setvar-1"],
      resumeInMs: 600000,
    });
    // O nó seguinte ao delay NÃO deve estar resolvido (é o ponto de retomada).
    expect(res.resolvedNodeIds).toContain("trigger-1");
    expect(res.resolvedNodeIds).toContain("delay-1");
    expect(res.resolvedNodeIds).not.toContain("setvar-1");
  });

  it("resume multi-head: captura TODAS as saídas do Delay (Delay antes de fan-out)", async () => {
    triggerStepMock.mockClear();
    const mnodes = [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: { type: "trigger", config: { triggerType: "Keywords" } },
      },
      {
        id: "delay-1",
        type: "action",
        position: { x: 0, y: 1 },
        data: { type: "action", config: { actionType: "Delay", delayMs: 1000 } },
      },
      {
        id: "cond_0",
        type: "action",
        position: { x: 0, y: 2 },
        data: { type: "action", config: { actionType: "Condition", condition: "true" } },
      },
      {
        id: "cond_none",
        type: "action",
        position: { x: 1, y: 2 },
        data: { type: "action", config: { actionType: "Condition", condition: "true" } },
      },
    ] as never[];
    const medges = [
      { id: "e1", source: "trigger-1", target: "delay-1" },
      { id: "e2", source: "delay-1", target: "cond_0" },
      { id: "e3", source: "delay-1", target: "cond_none" },
    ] as never[];

    const res = (await executeWorkflow({
      nodes: mnodes,
      edges: medges,
      triggerInput,
    })) as { wait?: { resumeNodeIds: string[] } };

    // Sem multi-head, cond_none seria perdido e quem não casa cond_0 morreria em silêncio.
    expect(res.wait?.resumeNodeIds).toEqual(["cond_0", "cond_none"]);
  });

  it("anti-double-send: nó já resolvido em startNodeIds NÃO re-executa", async () => {
    triggerStepMock.mockClear();
    await executeWorkflow({
      nodes,
      edges,
      triggerInput,
      startNodeIds: ["trigger-1"],
      alreadyResolvedNodeIds: ["trigger-1"],
    });
    // O trigger foi re-hidratado como resolvido → o executor pula, não reenvia.
    expect(triggerStepMock).not.toHaveBeenCalled();
  });

  it("contraste: sem alreadyResolvedNodeIds, o mesmo nó em startNodeIds re-executa", async () => {
    triggerStepMock.mockClear();
    await executeWorkflow({
      nodes,
      edges,
      triggerInput,
      startNodeIds: ["trigger-1"],
    });
    expect(triggerStepMock).toHaveBeenCalledTimes(1);
  });
});

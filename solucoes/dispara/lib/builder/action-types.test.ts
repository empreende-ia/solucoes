import { describe, expect, it } from "vitest";
import {
  findUnsupportedWorkflowActions,
  isAllowedWorkflowActionType,
  listAllowedWorkflowActionTypes,
  SYSTEM_ACTION_TYPES,
} from "@/lib/builder/action-types";
import { getAllActions } from "@/lib/builder/plugins";
import { getStepImporter } from "@/lib/builder/step-registry";
import {
  describeWorkflowGraphIssues,
  findWorkflowGraphIssues,
} from "@/lib/builder/workflow-graph-guard";
import {
  ACTION_ADD_TAG,
  ACTION_ASK_QUESTION,
  ACTION_CONDITION,
  ACTION_DELAY,
  ACTION_GET_VARIABLE,
  ACTION_MOVE_PIPELINE,
  ACTION_REMOVE_TAG,
  ACTION_SEND_MEDIA,
  ACTION_SEND_MESSAGE,
  ACTION_SEND_TEMPLATE,
  compileFlow,
} from "@/lib/builder/flow/compile";
import type { Flow, Step } from "@/lib/builder/flow/types";
import { buildDefaultGraph } from "@/lib/builder/workflow-db";

function actionNode(id: string, actionType: unknown, label = `Nó ${id}`) {
  return {
    id,
    type: "action",
    position: { x: 0, y: 0 },
    data: { type: "action", label, config: { actionType } },
  };
}

const COMPILE_ACTION_TYPES = [
  ACTION_SEND_MESSAGE,
  ACTION_SEND_TEMPLATE,
  ACTION_SEND_MEDIA,
  ACTION_ASK_QUESTION,
  ACTION_CONDITION,
  ACTION_DELAY,
  ACTION_GET_VARIABLE,
  ACTION_ADD_TAG,
  ACTION_REMOVE_TAG,
  ACTION_MOVE_PIPELINE,
];

describe("allowlist de actionType — lista real", () => {
  it("é exatamente: sistema do executor + ações dos plugins registrados", () => {
    expect(listAllowedWorkflowActionTypes()).toEqual([
      "Condition",
      "Delay",
      "Set Variable",
      "Get Variable",
      "HTTP Request",
      "whatsapp/send-message",
      "whatsapp/ask-question",
      "whatsapp/send-template",
      "whatsapp/send-media",
      "whatsapp/send-buttons",
      "whatsapp/send-list",
      "contacts/add-tag",
      "contacts/remove-tag",
      "crm/move-pipeline",
    ]);
  });

  it("todo tipo que o compileFlow emite é permitido", () => {
    for (const actionType of COMPILE_ACTION_TYPES) {
      expect(isAllowedWorkflowActionType(actionType), actionType).toBe(true);
    }
  });

  it("toda ação de plugin permitida tem step executável (getStepImporter)", () => {
    for (const action of getAllActions()) {
      expect(getStepImporter(action.id), action.id).not.toBeNull();
    }
  });

  it("aceita os aliases que o executor já resolve (slug, label, rótulos legados)", () => {
    for (const alias of ["send-message", "Enviar mensagem", "Send Message", "Ask Question"]) {
      expect(isAllowedWorkflowActionType(alias), alias).toBe(true);
    }
  });

  it("Database Query (SQL arbitrário via DATABASE_URL) foi removido e é recusado", () => {
    expect(SYSTEM_ACTION_TYPES).not.toContain("Database Query");
    expect(isAllowedWorkflowActionType("Database Query")).toBe(false);
  });

  it("recusa tipos desconhecidos, vazios, não-string e chaves de protótipo", () => {
    for (const value of [
      "Database Query",
      "Run Code",
      "whatsapp/unknown",
      "condition",
      " Condition",
      "",
      "   ",
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      5,
      null,
      undefined,
      { actionType: "Condition" },
      ["Condition"],
    ]) {
      expect(isAllowedWorkflowActionType(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("findUnsupportedWorkflowActions", () => {
  it("acusa o nó Database Query num grafo cru (cenário do achado)", () => {
    const issues = findUnsupportedWorkflowActions([
      actionNode("ok", "whatsapp/send-message"),
      actionNode("db", "Database Query", "SQL"),
    ]);
    expect(issues).toEqual([
      { nodeId: "db", label: "SQL", error: 'Action type "Database Query" is not supported' },
    ]);
  });

  it("acusa actionType não-string", () => {
    expect(findUnsupportedWorkflowActions([actionNode("n", 42)])).toEqual([
      { nodeId: "n", label: "Nó n", error: "Action type must be a string" },
    ]);
  });

  it("ignora nó sem actionType (o executor já falha de forma controlada) e entradas não-array", () => {
    expect(findUnsupportedWorkflowActions(null)).toEqual([]);
    expect(
      findUnsupportedWorkflowActions([
        { id: "t", data: { type: "trigger", config: { triggerType: "Keywords" } } },
        actionNode("vazio", ""),
        actionNode("indef", undefined),
        null,
        "lixo",
      ])
    ).toEqual([]);
  });

  it("não acusa nada num grafo compilado pela UI", () => {
    const cond: Step = {
      id: "cond",
      type: "condition",
      name: "Condição",
      config: {},
      next: null,
      branches: [
        { id: "b1", label: "Urgente", child: null, operator: "contains", value: "urgente" },
        { id: "b2", label: "None", child: null, locked: true },
      ],
    };
    const ask: Step = {
      id: "ask",
      type: "interactive",
      name: "Pergunta",
      config: { message: "Escolha" },
      next: cond,
      branches: [
        { id: "i1", label: "Vendas", child: null },
        { id: "i2", label: "Suporte", child: null },
      ],
    };
    const pipeline: Step = {
      id: "pipe",
      type: "pipeline",
      name: "Pipeline",
      config: { pipelineId: "p1", stageId: "s1" },
      next: ask,
    };
    const untag: Step = {
      id: "untag",
      type: "tag_remove",
      name: "Remove tag",
      config: { tags: ["frio"] },
      next: pipeline,
    };
    const tag: Step = {
      id: "tag",
      type: "tag",
      name: "Tag",
      config: { tags: ["lead"] },
      next: untag,
    };
    const wait: Step = {
      id: "wait",
      type: "wait",
      name: "Aguardar",
      config: { value: 5, unit: "minutes" },
      next: tag,
    };
    const hello: Step = {
      id: "hello",
      type: "whatsapp",
      name: "Olá",
      config: { message: "Oi!" },
      next: wait,
    };
    const flow: Flow = {
      schemaVersion: 1,
      id: "f1",
      name: "Fluxo",
      trigger: { label: "Palavras-chave", keywords: ["oi"] },
      root: hello,
    };
    const compiled = compileFlow(flow);
    const emitted = new Set(
      compiled.nodes.map((n) => n.data.config?.actionType).filter(Boolean)
    );
    // Cobre os tipos principais que o compile emite.
    for (const actionType of [
      ACTION_SEND_MESSAGE,
      ACTION_DELAY,
      ACTION_ADD_TAG,
      ACTION_REMOVE_TAG,
      ACTION_MOVE_PIPELINE,
      ACTION_ASK_QUESTION,
      ACTION_CONDITION,
    ]) {
      expect(emitted.has(actionType), actionType).toBe(true);
    }
    expect(findUnsupportedWorkflowActions(compiled.nodes)).toEqual([]);
    expect(findWorkflowGraphIssues(compiled.nodes)).toEqual([]);
  });
});

describe("findWorkflowGraphIssues / describeWorkflowGraphIssues", () => {
  const evilCondition = {
    id: "evil",
    type: "action",
    data: {
      type: "action",
      label: "Maliciosa",
      config: { actionType: "Condition", condition: '{{@a:A.x}}["constructor"]' },
    },
  };

  it("junta ações proibidas e condições inválidas (ações primeiro)", () => {
    const issues = findWorkflowGraphIssues([evilCondition, actionNode("db", "Database Query", "SQL")]);
    expect(issues.map((i) => [i.kind, i.nodeId])).toEqual([
      ["action", "db"],
      ["condition", "evil"],
    ]);
    expect(describeWorkflowGraphIssues(issues)).toBe(
      'Ação não suportada no nó "SQL": Action type "Database Query" is not supported (e mais 1 problema(s) no fluxo)'
    );
  });

  it("mantém a mensagem de condição inválida", () => {
    const issues = findWorkflowGraphIssues([evilCondition]);
    expect(describeWorkflowGraphIssues(issues)).toContain('Condição inválida no nó "Maliciosa"');
  });

  it("grafo padrão do create (UI cria com nodes vazios → rótulo legado) passa", () => {
    // /workflows chama create({ nodes: [] }) → buildDefaultGraph() com
    // actionType "Send Message": não pode virar 400.
    expect(findWorkflowGraphIssues(buildDefaultGraph().nodes)).toEqual([]);
  });

  it("grafo vazio/inválido não gera problema nem mensagem", () => {
    expect(findWorkflowGraphIssues(undefined)).toEqual([]);
    expect(describeWorkflowGraphIssues([])).toBe("");
  });
});

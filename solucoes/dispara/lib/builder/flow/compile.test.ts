import { describe, expect, it } from "vitest";
import { validateConditionExpression } from "@/lib/builder/condition-validator";
import { getStepImporter } from "@/lib/builder/step-registry";
import { validateWorkflowSchema } from "@/lib/shared/workflow-schema";
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
  FlowCompileError,
  TRIGGER_NODE_ID,
  type CompiledWorkflow,
} from "./compile";
import { validateTree } from "./tree-validate";
import type { Branch, Flow, Step } from "./types";

// ─── Builders de árvore (ids determinísticos, sem nanoid) ─────────────────────

function makeFlow(root: Step | null, keywords = ["oi", "menu"]): Flow {
  return {
    schemaVersion: 1,
    id: "flow1",
    name: "Fluxo de teste",
    trigger: { label: "Palavras-chave", keywords },
    root,
  };
}

function whatsapp(id: string, message: string, next: Step | null = null): Step {
  return {
    id,
    type: "whatsapp",
    name: `WhatsApp ${id}`,
    config: { template: "", mediaUrl: "", message },
    next,
  };
}

function endStep(id: string): Step {
  return { id, type: "end", name: "END", config: {}, next: null };
}

function branch(id: string, label: string, child: Step | null, extra: Partial<Branch> = {}): Branch {
  return { id, label, child, ...extra };
}

/**
 * Cenário principal:
 *   trigger(keywords) → w1 (whatsapp) → ask (perguntar, 2 botões)
 *     botão "Vendas"  → w2 (whatsapp)
 *     botão "Suporte" → (vazio, converge)
 *   → cond (condição: contém "urgente" / None)
 *     branch urgente → w3 (whatsapp)
 *     None           → (vazio, converge)
 *   → w4 (whatsapp) → end
 */
function buildMainFlow(): Flow {
  const w3 = whatsapp("w3", "Prioridade máxima!");
  const w4 = whatsapp("w4", "Obrigado pelo contato!", endStep("fim"));
  const cond: Step = {
    id: "cond",
    type: "condition",
    name: "É urgente?",
    config: {},
    next: w4,
    branches: [
      branch("bc1", "Urgente", w3, {
        field: "Replied message",
        operator: "contains",
        value: "urgente",
      }),
      branch("bc2", "None", null, { locked: true }),
    ],
  };
  const w2 = whatsapp("w2", "Show, vamos falar de vendas!");
  const ask: Step = {
    id: "ask",
    type: "interactive",
    name: "Vendas ou suporte?",
    config: { message: "Você quer falar com vendas ou suporte?" },
    next: cond,
    branches: [
      branch("bi1", "Vendas", w2),
      branch("bi2", "Suporte", null),
      branch("bi3", "Not Delivered", null, { locked: true }),
      branch("bi4", "Timeout", null, { locked: true }),
    ],
  };
  const w1 = whatsapp("w1", "Bem-vindo! Como posso ajudar?", ask);
  return makeFlow(w1);
}

function nodeById(compiled: CompiledWorkflow, id: string) {
  const node = compiled.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Node não encontrado: ${id}`);
  return node;
}

function edgesFrom(compiled: CompiledWorkflow, source: string): string[] {
  return compiled.edges.filter((e) => e.source === source).map((e) => e.target).sort();
}

function edgesTo(compiled: CompiledWorkflow, target: string): string[] {
  return compiled.edges.filter((e) => e.target === target).map((e) => e.source).sort();
}

const SYSTEM_ACTION_TYPES = new Set([ACTION_CONDITION, ACTION_DELAY, ACTION_GET_VARIABLE, "Set Variable"]);

const REF_ASK = "{{@ask__var:Resposta.value}}";
// Condições referenciam a resposta do "Perguntar" via VARIÁVEL persistida
// (sobrevive a resume), não a saída de nó {{@ask__var:...}} (que zera no resume).
const REF_VAR = "{{var.reply_ask}}";

// ─── Cenário principal ─────────────────────────────────────────────────────────

describe("compileFlow — cenário principal (keywords → whatsapp → perguntar → condição → convergência → end)", () => {
  const compiled = compileFlow(buildMainFlow());

  it("passa no validateWorkflowSchema (grafo persistível/executável)", () => {
    const result = validateWorkflowSchema({
      name: "Fluxo de teste",
      nodes: compiled.nodes,
      edges: compiled.edges,
    });
    expect(result.success).toBe(true);
  });

  it("tem exatamente 1 trigger com Keywords + keywordList por linha", () => {
    const triggers = compiled.nodes.filter((n) => n.data.type === "trigger");
    expect(triggers).toHaveLength(1);
    expect(triggers[0].id).toBe(TRIGGER_NODE_ID);
    expect(triggers[0].data.config).toMatchObject({
      triggerType: "Keywords",
      keywordList: "oi\nmenu",
    });
  });

  it("todos os actionTypes existem no step-registry ou são system actions", () => {
    const actionNodes = compiled.nodes.filter((n) => n.data.type === "action");
    expect(actionNodes.length).toBeGreaterThan(0);
    for (const node of actionNodes) {
      const actionType = String(node.data.config.actionType);
      if (SYSTEM_ACTION_TYPES.has(actionType)) continue;
      expect(getStepImporter(actionType), `actionType desconhecido: ${actionType}`).toBeTruthy();
    }
  });

  it("emite os nodes esperados com ids determinísticos (end NÃO vira node)", () => {
    const ids = compiled.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(
      [
        TRIGGER_NODE_ID,
        "w1",
        "ask",
        "ask__var",
        "ask__cond_0",
        "ask__cond_1",
        "ask__cond_else",
        "w2",
        "cond__cond_0",
        "cond__cond_none",
        "w3",
        "w4",
      ].sort()
    );
    // O step "end" (id fim) não vira node e w4 não tem saídas.
    expect(compiled.nodes.some((n) => n.id === "fim")).toBe(false);
    expect(edgesFrom(compiled, "w4")).toEqual([]);
  });

  it("perguntar: resume node ÚNICO (ask → ask__var) com Get Variable e mesma variableKey", () => {
    const askTargets = edgesFrom(compiled, "ask");
    expect(askTargets).toEqual(["ask__var"]);

    const ask = nodeById(compiled, "ask");
    expect(ask.data.config).toMatchObject({
      actionType: ACTION_ASK_QUESTION,
      toSource: "inbound",
      message: "Você quer falar com vendas ou suporte?",
      variableKey: "reply_ask",
    });

    const getVar = nodeById(compiled, "ask__var");
    expect(getVar.data.config).toMatchObject({
      actionType: ACTION_GET_VARIABLE,
      variableKey: "reply_ask",
    });
    // Sem "message" no Get Variable — senão shouldTreatAsAskQuestion sequestra o node.
    expect(getVar.data.config).not.toHaveProperty("message");
  });

  it("perguntar: fan-out do Get Variable para condições mutuamente exclusivas + else", () => {
    expect(edgesFrom(compiled, "ask__var")).toEqual([
      "ask__cond_0",
      "ask__cond_1",
      "ask__cond_else",
    ]);

    const c0 = nodeById(compiled, "ask__cond_0");
    const c1 = nodeById(compiled, "ask__cond_1");
    const cElse = nodeById(compiled, "ask__cond_else");

    expect(c0.data.config.actionType).toBe(ACTION_CONDITION);
    // Botão interativo casa por igualdade EXATA (===), não substring — a resposta
    // do WhatsApp volta com o texto exato do botão.
    expect(c0.data.config.condition).toBe(`${REF_ASK} === "Vendas"`);

    // Exclusividade: cada C_i nega os anteriores via &&
    expect(c1.data.config.condition).toBe(
      `${REF_ASK} === "Suporte" && !(${REF_ASK} === "Vendas")`
    );

    // Branch else = negação de todas
    expect(cElse.data.config.condition).toBe(
      `!(${REF_ASK} === "Vendas") && !(${REF_ASK} === "Suporte")`
    );
  });

  it("condição referencia a resposta do Perguntar mais próximo acima via variável persistida", () => {
    const c0 = nodeById(compiled, "cond__cond_0");
    const cNone = nodeById(compiled, "cond__cond_none");

    expect(c0.data.config.condition).toBe(`${REF_VAR}.includes("urgente")`);
    expect(cNone.data.config.condition).toBe(`!(${REF_VAR}.includes("urgente"))`);
  });

  it("convergência: caudas das branches apontam para a continuação comum", () => {
    // Branch "Vendas" (w2) e branches vazias convergem nos heads da condição.
    expect(edgesFrom(compiled, "w2")).toEqual(["cond__cond_0", "cond__cond_none"]);
    expect(edgesFrom(compiled, "ask__cond_1")).toEqual(["cond__cond_0", "cond__cond_none"]);
    expect(edgesFrom(compiled, "ask__cond_else")).toEqual(["cond__cond_0", "cond__cond_none"]);

    // Branches da condição convergem em w4.
    expect(edgesFrom(compiled, "cond__cond_0")).toEqual(["w3"]);
    expect(edgesFrom(compiled, "w3")).toEqual(["w4"]);
    expect(edgesFrom(compiled, "cond__cond_none")).toEqual(["w4"]);
    expect(edgesTo(compiled, "w4")).toEqual(["cond__cond_none", "w3"]);
  });

  it("todas as expressões geradas passam no condition-validator (pós substituição de templates)", () => {
    const conditions = compiled.nodes.filter(
      (n) => n.data.config.actionType === ACTION_CONDITION
    );
    expect(conditions.length).toBe(5);
    for (const node of conditions) {
      let counter = 0;
      // Mesma substituição do executor: {{@id:...}} E {{var.*}} viram __vN.
      // (O validador antigo aceitava {{var.*}} cru por acidente; o parser da
      // AST restrita não aceita texto que não é expressão.)
      const simulated = String(node.data.config.condition)
        .replace(/\{\{@([^:]+):([^}]+)\}\}/g, () => `__v${counter++}`)
        .replace(/\{\{\s*var\.[a-zA-Z0-9_.-]+\s*\}\}/g, () => `__v${counter++}`);
      const result = validateConditionExpression(simulated);
      expect(result, `expressão inválida no node ${node.id}: ${simulated}`).toEqual({
        valid: true,
      });
    }
  });

  it("snapshot da estrutura compilada (nodes + edges)", () => {
    const structure = {
      nodes: compiled.nodes
        .map((n) => `${n.id} :: ${String(n.data.config.actionType ?? "trigger")}`)
        .sort(),
      edges: compiled.edges.map((e) => `${e.source} -> ${e.target}`).sort(),
    };
    expect(structure).toMatchSnapshot();
  });
});

// ─── Variações de mapeamento ───────────────────────────────────────────────────

describe("compileFlow — mapeamento por tipo", () => {
  it("condição sem Perguntar acima referencia a mensagem do trigger", () => {
    const cond: Step = {
      id: "c1",
      type: "condition",
      name: "Triagem",
      config: {},
      next: null,
      branches: [
        branch("b1", "Preço", whatsapp("wp", "Tabela de preços"), {
          operator: "contains",
          value: "preço",
        }),
        branch("b2", "None", null, { locked: true }),
      ],
    };
    const compiled = compileFlow(makeFlow(cond));

    // Trigger fan-out para TODAS as condições (pai comum).
    expect(edgesFrom(compiled, TRIGGER_NODE_ID)).toEqual(["c1__cond_0", "c1__cond_none"]);
    expect(nodeById(compiled, "c1__cond_0").data.config.condition).toBe(
      `{{@${TRIGGER_NODE_ID}:Gatilho.message}}.includes("preço")`
    );
    expect(
      validateWorkflowSchema({ nodes: compiled.nodes, edges: compiled.edges }).success
    ).toBe(true);
  });

  it("condição: operadores not_contains e equals", () => {
    const cond: Step = {
      id: "c1",
      type: "condition",
      name: "Operadores",
      config: {},
      next: null,
      branches: [
        branch("b1", "Sem oi", null, { operator: "not_contains", value: "oi" }),
        branch("b2", "Exato", null, { operator: "equals", value: "sim" }),
        branch("b3", "None", null, { locked: true }),
      ],
    };
    const compiled = compileFlow(makeFlow(cond));
    const ref = `{{@${TRIGGER_NODE_ID}:Gatilho.message}}`;

    expect(nodeById(compiled, "c1__cond_0").data.config.condition).toBe(
      `!(${ref}.includes("oi"))`
    );
    expect(nodeById(compiled, "c1__cond_1").data.config.condition).toBe(
      `${ref} === "sim" && !(!(${ref}.includes("oi")))`
    );
  });

  it("whatsapp com template → whatsapp/send-template (pt_BR, inbound)", () => {
    const step: Step = {
      id: "t1",
      type: "whatsapp",
      name: "Template",
      config: { template: "boas_vindas", mediaUrl: "", message: "" },
      next: null,
    };
    const compiled = compileFlow(makeFlow(step));
    expect(nodeById(compiled, "t1").data.config).toMatchObject({
      actionType: ACTION_SEND_TEMPLATE,
      toSource: "inbound",
      templateName: "boas_vindas",
      language: "pt_BR",
    });
  });

  it("whatsapp com mediaUrl → whatsapp/send-media (caption = message)", () => {
    const step: Step = {
      id: "m1",
      type: "whatsapp",
      name: "Mídia",
      config: { template: "", mediaUrl: "https://example.com/img.png", message: "Olha isso" },
      next: null,
    };
    const compiled = compileFlow(makeFlow(step));
    expect(nodeById(compiled, "m1").data.config).toMatchObject({
      actionType: ACTION_SEND_MEDIA,
      toSource: "inbound",
      mediaType: "image",
      mediaUrl: "https://example.com/img.png",
      caption: "Olha isso",
    });
  });

  it("whatsapp só com message → whatsapp/send-message", () => {
    const compiled = compileFlow(makeFlow(whatsapp("s1", "Oi!")));
    expect(nodeById(compiled, "s1").data.config).toMatchObject({
      actionType: ACTION_SEND_MESSAGE,
      toSource: "inbound",
      message: "Oi!",
    });
  });

  it("wait → Delay com delayMs = value * unidade", () => {
    const mk = (value: number, unit: string): Step => ({
      id: "wait1",
      type: "wait",
      name: "Aguardar",
      config: { mode: "duration", value, unit },
      next: null,
    });
    expect(
      nodeById(compileFlow(makeFlow(mk(2, "minutes"))), "wait1").data.config
    ).toMatchObject({ actionType: ACTION_DELAY, delayMs: 120_000 });
    expect(
      nodeById(compileFlow(makeFlow(mk(3, "hours"))), "wait1").data.config
    ).toMatchObject({ actionType: ACTION_DELAY, delayMs: 10_800_000 });
    expect(
      nodeById(compileFlow(makeFlow(mk(1, "days"))), "wait1").data.config
    ).toMatchObject({ actionType: ACTION_DELAY, delayMs: 86_400_000 });
  });

  it("end no meio da árvore encerra a cadeia (branch com end não converge)", () => {
    const askEnd: Step = {
      id: "ask",
      type: "interactive",
      name: "Continuar?",
      config: { message: "Quer continuar?" },
      next: whatsapp("wNext", "Continuando..."),
      branches: [
        branch("b1", "Sim", null),
        branch("b2", "Não", endStep("fimNao")),
        branch("b3", "Not Delivered", null, { locked: true }),
        branch("b4", "Timeout", null, { locked: true }),
      ],
    };
    const compiled = compileFlow(makeFlow(askEnd));

    // Branch "Sim" vazia converge para wNext; branch "Não" (end) NÃO tem saída.
    expect(edgesFrom(compiled, "ask__cond_0")).toEqual(["wNext"]);
    expect(edgesFrom(compiled, "ask__cond_1")).toEqual([]);
    expect(compiled.nodes.some((n) => n.id === "fimNao")).toBe(false);
  });
});

// ─── Erros de compilação ───────────────────────────────────────────────────────

describe("compileFlow — erros claros", () => {
  it("split não compila no v1", () => {
    const split: Step = {
      id: "sp1",
      type: "split",
      name: "Split",
      config: {},
      next: null,
      branches: [
        branch("b1", "Path A", null, { percent: 50 }),
        branch("b2", "Path B", null, { percent: 50 }),
      ],
    };
    expect(() => compileFlow(makeFlow(split))).toThrow(FlowCompileError);
    expect(() => compileFlow(makeFlow(split))).toThrow(/não é suportado no v1/);
  });

  it("goto não compila no v1", () => {
    const target = whatsapp("w1", "Oi");
    const goTo: Step = { id: "g1", type: "goto", name: "Ir para", config: { targetId: "w1" }, next: null };
    target.next = goTo;
    expect(() => compileFlow(makeFlow(target))).toThrow(/não é suportado no v1/);
  });

  it("tag sem tags configuradas falha com erro claro", () => {
    const tag: Step = { id: "tg1", type: "tag", name: "Tag", config: { tags: [] }, next: null };
    expect(() => compileFlow(makeFlow(tag))).toThrow(/pelo menos 1 tag/);
  });

  it("pipeline sem pipeline/etapa falha com erro claro", () => {
    const pipe: Step = {
      id: "pp1",
      type: "pipeline",
      name: "Mover no pipeline",
      config: { pipelineId: "", stageId: "" },
      next: null,
    };
    expect(() => compileFlow(makeFlow(pipe))).toThrow(/pipeline e a etapa/);
  });

  it("wait até resposta (mode reply) não é suportado no v1", () => {
    const wait: Step = {
      id: "wt1",
      type: "wait",
      name: "Aguardar",
      config: { mode: "reply", value: 1, unit: "hours" },
      next: null,
    };
    expect(() => compileFlow(makeFlow(wait))).toThrow(/não é suportado no v1/);
  });

  it("whatsapp sem conteúdo falha com erro claro", () => {
    const empty: Step = {
      id: "w1",
      type: "whatsapp",
      name: "Vazio",
      config: { template: "", mediaUrl: "", message: "" },
      next: null,
    };
    expect(() => compileFlow(makeFlow(empty))).toThrow(/está vazio/);
  });

  it("branch bloqueada (Not Delivered/Timeout) com ações falha com erro claro", () => {
    const ask: Step = {
      id: "ask",
      type: "interactive",
      name: "Pergunta",
      config: { message: "Escolha:" },
      next: null,
      branches: [
        branch("b1", "Sim", null),
        branch("b2", "Not Delivered", whatsapp("w9", "não entregue"), { locked: true }),
        branch("b3", "Timeout", null, { locked: true }),
      ],
    };
    expect(() => compileFlow(makeFlow(ask))).toThrow(/Not Delivered/);
  });

  it("label de botão com conteúdo perigoso vira DADO inerte (escapeLiteral impede breakout), não código", () => {
    // O condition-validator trata o conteúdo entre aspas como dados opacos; e
    // escapeLiteral escapa " e \\, então é impossível quebrar pra fora do literal.
    // Um label assim compila e vira uma comparação de string 100% inofensiva.
    const ask: Step = {
      id: "ask",
      type: "interactive",
      name: "Pergunta",
      config: { message: "Escolha:" },
      next: null,
      branches: [
        branch("b1", 'Sim"; process.exit(); "', null),
        branch("b2", "Not Delivered", null, { locked: true }),
        branch("b3", "Timeout", null, { locked: true }),
      ],
    };
    const compiled = compileFlow(makeFlow(ask));
    // O " do label é escapado (\"), preso dentro da string — não executa nada.
    expect(nodeById(compiled, "ask__cond_0").data.config.condition).toBe(
      `${REF_ASK} === "Sim\\"; process.exit(); \\""`
    );
  });

  it("árvore inválida (ids duplicados) falha antes de compilar", () => {
    const dup = whatsapp("dup", "a", whatsapp("dup", "b"));
    expect(() => compileFlow(makeFlow(dup))).toThrow(/duplicado/);
  });
});

// ─── tree-validate ─────────────────────────────────────────────────────────────

describe("validateTree", () => {
  it("aceita a árvore do cenário principal", () => {
    const result = validateTree(buildMainFlow());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejeita ids de step duplicados", () => {
    const result = validateTree(makeFlow(whatsapp("x", "a", whatsapp("x", "b"))));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("duplicado"))).toBe(true);
  });

  it("rejeita condition sem branches", () => {
    const cond: Step = {
      id: "c1",
      type: "condition",
      name: "Condição",
      config: {},
      next: null,
      branches: [],
    };
    const result = validateTree(makeFlow(cond));
    expect(result.valid).toBe(false);
  });

  it("rejeita split com percentuais que não somam 100", () => {
    const split: Step = {
      id: "sp1",
      type: "split",
      name: "Split",
      config: {},
      next: null,
      branches: [
        branch("b1", "Path A", null, { percent: 60 }),
        branch("b2", "Path B", null, { percent: 50 }),
      ],
    };
    const result = validateTree(makeFlow(split));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("110%"))).toBe(true);
  });

  it("rejeita goto apontando para step inexistente", () => {
    const goTo: Step = {
      id: "g1",
      type: "goto",
      name: "Ir para",
      config: { targetId: "nao-existe" },
      next: null,
    };
    const result = validateTree(makeFlow(whatsapp("w1", "oi", goTo)));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes("inexistente"))).toBe(true);
  });

  it("aceita goto com alvo válido (estrutura ok; quem barra no v1 é o compile)", () => {
    const goTo: Step = {
      id: "g1",
      type: "goto",
      name: "Ir para",
      config: { targetId: "w1" },
      next: null,
    };
    const result = validateTree(makeFlow(whatsapp("w1", "oi", goTo)));
    expect(result.valid).toBe(true);
  });
});

// ─── Regressões de bugs confirmados ──────────────────────────────────────────

describe("compileFlow — regressões de bugs", () => {
  /** Interactive com N botões (branches não-locked, sem continuação própria). */
  function interactive(id: string, labels: string[], next: Step | null = null): Step {
    return {
      id,
      type: "interactive",
      name: `Ask ${id}`,
      config: { message: "?" },
      next,
      branches: labels.map((label, i) => branch(`${id}-b${i}`, label, null)),
    };
  }

  /** Resolve {{@id:...}} e {{var.x}} pro mesmo valor e AVALIA a expressão. */
  function resolveAndEval(condition: string, replyValue: string): boolean {
    let counter = 0;
    const ctx: Record<string, unknown> = {};
    const bind = (): string => {
      const name = `__v${counter}`;
      counter += 1;
      ctx[name] = replyValue;
      return name;
    };
    const transformed = condition
      .replace(/\{\{@([^:]+):([^}]+)\}\}/g, bind)
      .replace(/\{\{\s*var\.[a-zA-Z0-9_.-]+\s*\}\}/g, bind);
    // Espelha o new Function do executor, sobre uma expressão já validada.
    const fn = new Function(...Object.keys(ctx), `return (${transformed});`);
    return Boolean(fn(...Object.values(ctx)));
  }

  // ── #1: botão interativo casa por igualdade EXATA (não substring) ──────────
  it("#1 botão 'Sim' NÃO captura a resposta do botão 'Simon' (igualdade exata, não substring)", () => {
    const compiled = compileFlow(makeFlow(interactive("ask", ["Sim", "Simon"])));
    const c0 = String(nodeById(compiled, "ask__cond_0").data.config.condition);
    const c1 = String(nodeById(compiled, "ask__cond_1").data.config.condition);

    // Resposta exata do botão longo: só a branch dele dispara (antes do fix, o
    // .includes("Sim") de c0 disparava errado em "Simon").
    expect(resolveAndEval(c0, "Simon")).toBe(false);
    expect(resolveAndEval(c1, "Simon")).toBe(true);
    // Resposta do botão curto continua indo pra branch certa.
    expect(resolveAndEval(c0, "Sim")).toBe(true);
    expect(resolveAndEval(c1, "Sim")).toBe(false);
  });

  it("#1+#6 rótulo de botão com vírgula compila e roteia certo ('Sim' vs 'Sim, quero mais')", () => {
    const compiled = compileFlow(makeFlow(interactive("ask", ["Sim", "Sim, quero mais"])));
    const c0 = String(nodeById(compiled, "ask__cond_0").data.config.condition);
    const c1 = String(nodeById(compiled, "ask__cond_1").data.config.condition);

    expect(resolveAndEval(c0, "Sim, quero mais")).toBe(false);
    expect(resolveAndEval(c1, "Sim, quero mais")).toBe(true);
  });

  // ── #2: rótulos/valores de 3+ palavras (tokenização do validator) ──────────
  it("#2 rótulo de botão com 3+ palavras compila (não vira 'identificador não autorizado')", () => {
    const labels = ["Quero saber mais", "Falar com atendente", "Ver meus pedidos"];
    expect(() => compileFlow(makeFlow(interactive("ask", labels)))).not.toThrow();
  });

  it("#2 valor de condição com 3+ palavras compila", () => {
    const cond: Step = {
      id: "c1",
      type: "condition",
      name: "Triagem",
      config: {},
      next: null,
      branches: [
        branch("b1", "Interesse", null, { operator: "contains", value: "quero saber mais" }),
        branch("b2", "None", null, { locked: true }),
      ],
    };
    expect(() => compileFlow(makeFlow(cond))).not.toThrow();
    expect(nodeById(compileFlow(makeFlow(cond)), "c1__cond_0").data.config.condition).toBe(
      `{{@${TRIGGER_NODE_ID}:Gatilho.message}}.includes("quero saber mais")`
    );
  });

  // ── #3: rótulos que contêm document/process/import ─────────────────────────
  it("#3 rótulos 'Documento'/'Processo'/'Importante' compilam (não confundidos com keyword de código)", () => {
    const labels = ["Documento", "Processo", "Importante"];
    expect(() => compileFlow(makeFlow(interactive("ask", labels)))).not.toThrow();
  });

  // ── #6: emoticon ":)" (parêntese solto dentro de string) ───────────────────
  it("#6 emoticon ':)' em valor de condição compila (parêntese desbalanceado é só dado)", () => {
    const cond: Step = {
      id: "c1",
      type: "condition",
      name: "Humor",
      config: {},
      next: null,
      branches: [
        branch("b1", "Feliz", null, { operator: "contains", value: "obrigado :)" }),
        branch("b2", "None", null, { locked: true }),
      ],
    };
    const compiled = compileFlow(makeFlow(cond));
    expect(nodeById(compiled, "c1__cond_0").data.config.condition).toBe(
      `{{@${TRIGGER_NODE_ID}:Gatilho.message}}.includes("obrigado :)")`
    );
  });

  it("#6 emoticon ':)' em rótulo de botão compila", () => {
    expect(() => compileFlow(makeFlow(interactive("ask", ["obrigado :)", "não"])))).not.toThrow();
  });

  // ── #4: condição referencia a resposta de um Perguntar ANTERIOR ────────────
  it("#4 condição após um SEGUNDO Perguntar referencia a resposta do PRIMEIRO via {{var.reply_ask1}} (sobrevive ao resume)", () => {
    // ask1 → (botão A) → ask2 → converge; ask1.next = cond que olha a resposta de ask1.
    // Quando o resume é disparado por ask2, a saída de nó de ask1 já estaria vazia —
    // por isso a condição precisa referenciar a VARIÁVEL persistida, não o nó.
    const ask2 = interactive("ask2", ["ok", "não"]);
    const cond: Step = {
      id: "cond",
      type: "condition",
      name: "Checa ask1",
      config: {},
      next: null,
      branches: [
        branch("cb1", "Sim", null, { operator: "contains", value: "sim" }),
        branch("cb2", "None", null, { locked: true }),
      ],
    };
    const ask1: Step = {
      id: "ask1",
      type: "interactive",
      name: "Ask 1",
      config: { message: "?" },
      next: cond,
      branches: [branch("a1", "A", ask2), branch("a2", "B", null)],
    };
    const compiled = compileFlow(makeFlow(ask1));
    const condStr = String(nodeById(compiled, "cond__cond_0").data.config.condition);

    expect(condStr).toContain("{{var.reply_ask1}}");
    expect(condStr).not.toContain("@ask1__var");
    expect(
      validateWorkflowSchema({ nodes: compiled.nodes, edges: compiled.edges }).success
    ).toBe(true);
  });

  // ── #5: wait acima do teto do setTimeout (2^31-1 ms) ───────────────────────
  it("#5 wait de 30 dias estoura o teto do agendador e falha na compilação", () => {
    const wait: Step = {
      id: "w",
      type: "wait",
      name: "Espera longa",
      config: { mode: "duration", value: 30, unit: "days" },
      next: null,
    };
    expect(() => compileFlow(makeFlow(wait))).toThrow(FlowCompileError);
    expect(() => compileFlow(makeFlow(wait))).toThrow(/excede o máximo/);
  });

  // ── #7: colisão de ids após a sanitização do executor ──────────────────────
  it("#7 ids que só diferem por '-' vs '_' colidem após sanitização do executor e falham", () => {
    const flow = makeFlow(whatsapp("a-b", "x", whatsapp("a_b", "y")));
    expect(() => compileFlow(flow)).toThrow(FlowCompileError);
    expect(() => compileFlow(flow)).toThrow(/sanitiza/);
  });

  // ── #8: condição sem branch None ganha fallback __cond_none ─────────────────
  it("#8 condição sem branch None ganha fallback __cond_none que segue pra continuação", () => {
    const cont = whatsapp("cont", "continua");
    const cond: Step = {
      id: "c1",
      type: "condition",
      name: "Sem None",
      config: {},
      next: cont,
      branches: [branch("b1", "Tem oi", null, { operator: "contains", value: "oi" })],
    };
    const compiled = compileFlow(makeFlow(cond));

    expect(compiled.nodes.some((n) => n.id === "c1__cond_none")).toBe(true);
    // Sem o fallback, uma resposta que não bate na condição travaria o fluxo.
    expect(edgesFrom(compiled, "c1__cond_none")).toEqual(["cont"]);
  });
});

// ─── Paridade GHL: passos de dados/CRM e tipos de gatilho ──────────────────────

describe("compileFlow — tag, tag_remove e pipeline", () => {
  it("tag compila para contacts/add-tag com as tags normalizadas", () => {
    const tag: Step = {
      id: "tg1",
      type: "tag",
      name: "Marcar VIP",
      config: { tags: [" vip ", "cliente", "vip"] },
      next: null,
    };
    const compiled = compileFlow(makeFlow(tag));
    const node = compiled.nodes.find((n) => n.id === "tg1");
    expect(node?.data.config).toMatchObject({
      actionType: ACTION_ADD_TAG,
      toSource: "inbound",
      tags: ["vip", "cliente"],
    });
    expect(edgesFrom(compiled, TRIGGER_NODE_ID)).toEqual(["tg1"]);
  });

  it("tag aceita tagName legado (vira array de 1)", () => {
    const tag: Step = {
      id: "tg2",
      type: "tag",
      name: "Tag legada",
      config: { tagName: "quente" },
      next: null,
    };
    const compiled = compileFlow(makeFlow(tag));
    const node = compiled.nodes.find((n) => n.id === "tg2");
    expect(node?.data.config).toMatchObject({ tags: ["quente"] });
  });

  it("tag_remove compila para contacts/remove-tag", () => {
    const tag: Step = {
      id: "tr1",
      type: "tag_remove",
      name: "Desmarcar",
      config: { tags: ["frio"] },
      next: null,
    };
    const compiled = compileFlow(makeFlow(tag));
    const node = compiled.nodes.find((n) => n.id === "tr1");
    expect(node?.data.config).toMatchObject({
      actionType: ACTION_REMOVE_TAG,
      tags: ["frio"],
    });
  });

  it("pipeline compila para crm/move-pipeline com ids e status", () => {
    const pipe: Step = {
      id: "pp1",
      type: "pipeline",
      name: "Mover pra Qualificado",
      config: {
        pipelineId: "pl_1",
        stageId: "pls_2",
        oppStatus: "open",
        pipelineName: "Vendas",
        stageName: "Qualificado",
      },
      next: null,
    };
    const compiled = compileFlow(makeFlow(pipe));
    const node = compiled.nodes.find((n) => n.id === "pp1");
    expect(node?.data.config).toMatchObject({
      actionType: ACTION_MOVE_PIPELINE,
      pipelineId: "pl_1",
      stageId: "pls_2",
      oppStatus: "open",
    });
  });

  it("passos de dados encadeiam na cadeia como ações normais", () => {
    const w1 = whatsapp("w1", "Oi!");
    const tag: Step = {
      id: "tg1",
      type: "tag",
      name: "Tag",
      config: { tags: ["engajou"] },
      next: w1,
    };
    const compiled = compileFlow(makeFlow(tag));
    expect(edgesFrom(compiled, "tg1")).toEqual(["w1"]);
  });
});

describe("compileFlow — tipos de gatilho", () => {
  it("trigger sem type compila como Keywords (compat com árvores antigas)", () => {
    const compiled = compileFlow(makeFlow(whatsapp("w1", "Oi")));
    const trigger = compiled.nodes.find((n) => n.id === TRIGGER_NODE_ID);
    expect(trigger?.data.config).toMatchObject({
      triggerType: "Keywords",
      keywordList: "oi\nmenu",
    });
  });

  it("trigger none compila como None (fluxo publicável, entrada manual)", () => {
    const flow = makeFlow(whatsapp("w1", "Oi"));
    flow.trigger = { type: "none", label: "", keywords: [] };
    const compiled = compileFlow(flow);
    const trigger = compiled.nodes.find((n) => n.id === TRIGGER_NODE_ID);
    expect(trigger?.data.config).toEqual({ triggerType: "None" });
    expect(trigger?.data.label).toBe("Sem gatilho (entrada manual)");
    // O grafo continua passando na validação (exatamente 1 trigger node).
    expect(validateWorkflowSchema({ nodes: compiled.nodes, edges: compiled.edges }).success).toBe(true);
  });

  it("trigger campaign_reply compila como CampaignReply com filtros", () => {
    const flow = makeFlow(whatsapp("w1", "Oi"));
    flow.trigger = {
      type: "campaign_reply",
      label: "Respondeu ao disparo",
      keywords: [],
      campaignId: "c_123",
      campaignName: "Campanha X",
      replyFilter: "  quero  ",
    };
    const compiled = compileFlow(flow);
    const trigger = compiled.nodes.find((n) => n.id === TRIGGER_NODE_ID);
    expect(trigger?.data.config).toMatchObject({
      triggerType: "CampaignReply",
      campaignId: "c_123",
      replyFilter: "quero",
    });
  });
});

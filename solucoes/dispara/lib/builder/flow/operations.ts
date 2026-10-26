// Todas as mutações da árvore são funções puras: recebem um Flow, retornam um Flow novo.
// Internamente clonam com structuredClone e mutam o clone.
// Porte do protótipo zapflow (src/flow/operations.ts), adaptado para o trigger com keywords.

import { nanoid } from "nanoid";
import type { Branch, Flow, FlowTriggerType, Slot, Step, StepType } from "./types";

export const isTerminalType = (t: StepType) => t === "end" || t === "goto";

/**
 * Cria um Flow vazio. Como no GHL, fluxo novo começa SEM gatilho (slot
 * "Adicionar novo gatilho"); passar keywords/triggerLabel cria um trigger de
 * keywords (compat com chamadas antigas e testes).
 */
export function createEmptyFlow(args?: {
  id?: string;
  name?: string;
  triggerLabel?: string;
  keywords?: string[];
}): Flow {
  const hasKeywordArgs =
    args?.keywords !== undefined || args?.triggerLabel !== undefined;
  return {
    schemaVersion: 1,
    id: args?.id ?? nanoid(8),
    name: args?.name ?? "Novo fluxo",
    trigger: hasKeywordArgs
      ? {
          type: "keywords",
          label: args?.triggerLabel ?? "Palavras-chave",
          keywords: args?.keywords ?? [],
        }
      : { type: "none", label: "", keywords: [] },
    root: null,
  };
}

/** Percorre todos os steps da árvore (chain + branches, recursivo). */
export function walkSteps(step: Step | null, fn: (s: Step) => void): void {
  if (!step) return;
  fn(step);
  if (step.branches) {
    for (const b of step.branches) walkSteps(b.child, fn);
  }
  walkSteps(step.next, fn);
}

export function findStep(flow: Flow, id: string): Step | null {
  let found: Step | null = null;
  walkSteps(flow.root, (s) => {
    if (s.id === id) found = s;
  });
  return found;
}

export function listSteps(flow: Flow): Step[] {
  const out: Step[] = [];
  walkSteps(flow.root, (s) => out.push(s));
  return out;
}

/** Remove targets de Go To que apontam para steps que não existem mais. */
function pruneGotoTargets(flow: Flow): void {
  const ids = new Set<string>();
  walkSteps(flow.root, (s) => ids.add(s.id));
  walkSteps(flow.root, (s) => {
    if (s.type === "goto") {
      const target = s.config.targetId as string | null | undefined;
      if (target && !ids.has(target)) s.config.targetId = null;
    }
  });
}

function createStep(type: StepType): Step {
  const id = nanoid(8);
  switch (type) {
    case "whatsapp":
      return {
        id,
        type,
        name: "WhatsApp",
        config: {
          template: "",
          mediaUrl: "",
          message: "",
        },
        next: null,
      };
    case "interactive":
      return {
        id,
        type,
        name: "Perguntar",
        config: { message: "" },
        next: null,
        branches: [
          { id: nanoid(6), label: "Botão 1", child: null },
          { id: nanoid(6), label: "Not Delivered", child: null, locked: true },
          { id: nanoid(6), label: "Timeout", child: null, locked: true },
        ],
      };
    case "wait":
      return {
        id,
        type,
        name: "Aguardar",
        config: {
          mode: "duration",
          value: 2,
          unit: "minutes",
          timeoutValue: 1,
          timeoutUnit: "hours",
        },
        next: null,
      };
    case "condition":
      return {
        id,
        type,
        name: "Condição",
        config: {},
        next: null,
        branches: [
          {
            id: nanoid(6),
            label: "Branch 1",
            child: null,
            field: "Replied message",
            operator: "contains",
            value: "",
          },
          { id: nanoid(6), label: "None", child: null, locked: true },
        ],
      };
    case "split":
      return {
        id,
        type,
        name: "Split",
        config: {},
        next: null,
        branches: [
          { id: nanoid(6), label: "Path A", child: null, percent: 50 },
          { id: nanoid(6), label: "Path B", child: null, percent: 50 },
        ],
      };
    case "tag":
      return { id, type, name: "Adicionar tag", config: { tags: [] }, next: null };
    case "tag_remove":
      return { id, type, name: "Remover tag", config: { tags: [] }, next: null };
    case "pipeline":
      return {
        id,
        type,
        name: "Mover no pipeline",
        config: {
          pipelineId: "",
          pipelineName: "",
          stageId: "",
          stageName: "",
          oppStatus: "open",
        },
        next: null,
      };
    case "goto":
      return { id, type, name: "Ir para", config: { targetId: null }, next: null };
    case "end":
      return { id, type, name: "END", config: {}, next: null };
  }
}

/**
 * True se já existe uma cadeia depois do slot. Inserir um terminal (end/goto)
 * num slot com cauda a descartaria — a UI usa isso para nem oferecer a opção
 * (terminal só entra em pontas abertas).
 */
export function slotHasTail(flow: Flow, slot: Slot): boolean {
  if (slot.kind === "root") return flow.root !== null;
  const parent = findStep(flow, slot.stepId);
  if (!parent) return false;
  if (slot.kind === "after") return parent.next !== null;
  return (parent.branches?.[slot.branchIndex]?.child ?? null) !== null;
}

/**
 * Insere um novo step no slot dado. Terminal (end/goto) só entra em slot SEM
 * cauda — com cauda a operação é no-op (a UI já omite esses tipos no Action
 * Picker via slotHasTail; a guarda aqui é defesa em profundidade).
 */
export function addStep(
  flow: Flow,
  args: { type: StepType; slot: Slot }
): { flow: Flow; stepId: string } {
  // Terminal num slot com cauda descartaria a sub-árvore inteira → flow inalterado.
  if (isTerminalType(args.type) && slotHasTail(flow, args.slot)) {
    return { flow, stepId: "" };
  }
  const f = structuredClone(flow);
  const step = createStep(args.type);
  const { slot } = args;

  const attach = (getTail: () => Step | null, setHead: (s: Step) => void) => {
    step.next = isTerminalType(step.type) ? null : getTail();
    setHead(step);
  };

  if (slot.kind === "root") {
    attach(
      () => f.root,
      (s) => {
        f.root = s;
      }
    );
  } else if (slot.kind === "after") {
    const parent = findStep(f, slot.stepId);
    if (!parent) return { flow, stepId: step.id };
    attach(
      () => parent.next,
      (s) => {
        parent.next = s;
      }
    );
  } else {
    const parent = findStep(f, slot.stepId);
    const branch = parent?.branches?.[slot.branchIndex];
    if (!branch) return { flow, stepId: step.id };
    attach(
      () => branch.child,
      (s) => {
        branch.child = s;
      }
    );
  }

  pruneGotoTargets(f);
  return { flow: f, stepId: step.id };
}

/**
 * Remove um step religando pai → filho (step.next).
 * Se o step tiver branches, as sub-árvores das branches são apagadas junto
 * (a confirmação é responsabilidade da UI).
 */
export function deleteStep(flow: Flow, stepId: string): Flow {
  const f = structuredClone(flow);
  if (f.root?.id === stepId) {
    f.root = f.root.next;
  } else {
    walkSteps(f.root, (s) => {
      if (s.next?.id === stepId) s.next = s.next.next;
      if (s.branches) {
        for (const b of s.branches) {
          if (b.child?.id === stepId) b.child = b.child.next;
        }
      }
    });
  }
  pruneGotoTargets(f);
  return f;
}

export interface StepPatch {
  name?: string;
  config?: Record<string, unknown>;
  branches?: Branch[];
}

export function updateStep(flow: Flow, stepId: string, patch: StepPatch): Flow {
  const f = structuredClone(flow);
  const s = findStep(f, stepId);
  if (!s) return flow;
  const before = JSON.stringify(s);
  if (patch.name !== undefined) s.name = patch.name;
  if (patch.config) s.config = { ...s.config, ...patch.config };
  if (patch.branches) s.branches = structuredClone(patch.branches);
  // Patch não mudou nada → devolve o flow ORIGINAL; o store usa a identidade
  // para não empurrar snapshot de undo redundante.
  if (JSON.stringify(s) === before) return flow;
  pruneGotoTargets(f);
  return f;
}

/** Atualiza o trigger (tipo, label, keywords, filtros) preservando a identidade em no-op. */
export function updateTrigger(
  flow: Flow,
  patch: {
    type?: FlowTriggerType;
    label?: string;
    keywords?: string[];
    campaignId?: string | null;
    campaignName?: string | null;
    replyFilter?: string;
  }
): Flow {
  const f = structuredClone(flow);
  if (patch.type !== undefined) f.trigger.type = patch.type;
  if (patch.label !== undefined) f.trigger.label = patch.label;
  if (patch.keywords !== undefined) {
    f.trigger.keywords = patch.keywords.map((k) => k.trim()).filter(Boolean);
  }
  if (patch.campaignId !== undefined) f.trigger.campaignId = patch.campaignId;
  if (patch.campaignName !== undefined) f.trigger.campaignName = patch.campaignName;
  if (patch.replyFilter !== undefined) f.trigger.replyFilter = patch.replyFilter.trim();
  if (JSON.stringify(f.trigger) === JSON.stringify(flow.trigger)) return flow;
  return f;
}

/** Adiciona uma branch respeitando as branches fixas de cada tipo. */
export function addBranch(flow: Flow, stepId: string, label?: string): Flow {
  const f = structuredClone(flow);
  const s = findStep(f, stepId);
  if (!s?.branches) return f;
  const nb: Branch = {
    id: nanoid(6),
    label: label ?? `Branch ${s.branches.length}`,
    child: null,
  };
  if (s.type === "split") {
    nb.label = label ?? `Path ${String.fromCharCode(65 + s.branches.length)}`;
    nb.percent = 0;
    s.branches.push(nb);
  } else if (s.type === "condition") {
    nb.field = "Replied message";
    nb.operator = "contains";
    nb.value = "";
    s.branches.splice(s.branches.length - 1, 0, nb); // antes do "None"
  } else {
    nb.label = label ?? `Botão ${s.branches.length - 1}`;
    s.branches.splice(s.branches.length - 2, 0, nb); // antes de "Not Delivered"/"Timeout"
  }
  return f;
}

export function setGotoTarget(
  flow: Flow,
  stepId: string,
  targetId: string | null
): Flow {
  const f = structuredClone(flow);
  const s = findStep(f, stepId);
  if (!s || s.type !== "goto") return f;
  s.config = { ...s.config, targetId };
  return f;
}

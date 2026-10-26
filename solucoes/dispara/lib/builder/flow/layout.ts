// layoutFlow: função PURA que deriva nodes + edges visuais a partir da árvore.
// Algoritmo recursivo bottom-up com bounding boxes (estilo Activepieces):
//   1. measureChain calcula o bounding box de cada sub-árvore.
//   2. placeStep posiciona tudo com base nos boxes, centralizando branches sob o container.
// Edges de Go To NUNCA participam do layout — são derivadas por fora e roteadas pela lateral.
//
// SERVER-SAFE: não importa @xyflow/react. Os types locais são estruturalmente
// compatíveis com Node/Edge do React Flow (a UI pode fazer cast direto).

import { CONDITION_OPERATORS, WAIT_UNITS } from "./meta";
import type { Flow, Slot, Step } from "./types";

// ─── Types locais (compatíveis com React Flow) ────────────────────────────────
export interface LayoutNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: Record<string, unknown>;
  selectable?: boolean;
  zIndex?: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: Record<string, unknown>;
  zIndex?: number;
  markerEnd?: {
    type: string;
    color?: string;
    width?: number;
    height?: number;
  };
}

// ─── Constantes da spec ────────────────────────────────────────────────────────
export const NODE_W = 320;
export const SIMPLE_H = 64; // ação simples
export const CONTAINER_H = 72; // branch-header (condition/split/interactive)
export const V_GAP = 56;
export const H_GAP = 48;
export const BRANCH_LABEL_H = 36; // espaço extra reservado para a pill de label da branch
export const END_W = 96;
export const END_H = 32;
export const PLACEHOLDER_H = 48; // branch vazia: reserva NODE_W de largura
export const PLUS_SIZE = 32; // "+" folha no fim de uma cadeia aberta
export const TRIGGER_W = 320;
export const TRIGGER_H = 64;
export const GOTO_SIDE_OFFSET = 64; // distância da rota lateral do goto além do maxX da árvore

export const TRIGGER_ID = "__trigger";

interface Box {
  width: number;
  height: number;
}

interface Ctx {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  gotos: Step[];
  names: Map<string, string>;
}

const isContainer = (s: Step) => Array.isArray(s.branches) && s.branches.length > 0;
const isTerminal = (s: Step) => s.type === "end" || s.type === "goto";

export function nodeSize(s: Step): { w: number; h: number } {
  if (s.type === "end") return { w: END_W, h: END_H };
  if (isContainer(s)) return { w: NODE_W, h: CONTAINER_H };
  return { w: NODE_W, h: SIMPLE_H };
}

// ─── Medição (bottom-up) ───────────────────────────────────────────────────────
/**
 * Bounding box de uma cadeia (step + next + ...).
 * `hasTarget`: existe um ponto de convergência abaixo desta cadeia (next de algum
 * container ancestral) — se sim, caudas abertas convergem em vez de ganhar "+" folha.
 */
export function measureChain(step: Step | null, hasTarget: boolean): Box {
  if (!step) {
    // branch vazia → placeholder reserva largura de nó inteiro
    return { width: NODE_W, height: PLACEHOLDER_H };
  }
  const size = nodeSize(step);
  let width = size.w;
  let height = size.h;

  if (isContainer(step)) {
    const innerHasTarget = !!step.next || hasTarget;
    const cols = step.branches!.map((b) => measureChain(b.child, innerHasTarget));
    const colWidths = cols.map((c) => Math.max(NODE_W, c.width));
    const totalW =
      colWidths.reduce((a, b) => a + b, 0) + H_GAP * Math.max(0, cols.length - 1);
    const colsH = cols.length ? Math.max(...cols.map((c) => c.height)) : 0;
    width = Math.max(width, totalW);
    height += V_GAP + BRANCH_LABEL_H + colsH;
    if (step.next) {
      const nextBox = measureChain(step.next, hasTarget);
      width = Math.max(width, nextBox.width);
      height += V_GAP + nextBox.height;
    }
    return { width, height };
  }

  if (step.next) {
    const nextBox = measureChain(step.next, hasTarget);
    width = Math.max(width, nextBox.width);
    height += V_GAP + nextBox.height;
    return { width, height };
  }

  // cauda aberta sem convergência: reserva espaço para o "+" folha
  if (!isTerminal(step) && !hasTarget) height += V_GAP + PLUS_SIZE;
  return { width, height };
}

// ─── Helpers de construção ─────────────────────────────────────────────────────
function flowEdge(
  ctx: Ctx,
  source: string,
  target: string,
  data: Record<string, unknown>
): void {
  ctx.edges.push({ id: `e-${source}-${target}`, source, target, type: "flow", data });
}

function plusNode(id: string, cx: number, y: number, slot: Slot): LayoutNode {
  return {
    id,
    type: "plus",
    position: { x: cx - PLUS_SIZE / 2, y },
    width: PLUS_SIZE,
    height: PLUS_SIZE,
    data: { slot },
    selectable: false,
  };
}

function branchEdgeLabel(step: Step, i: number): string {
  const b = step.branches![i];
  if (step.type === "split" && b.percent != null) return `${b.label} · ${b.percent}%`;
  return b.label;
}

// ─── Posicionamento (top-down, usando os boxes) ───────────────────────────────
/**
 * Posiciona `step` com centro da coluna em `cx`, topo em `y`.
 * Retorna true se alguma cauda desta sub-árvore convergiu para `convergeTargetId`.
 */
function placeStep(
  ctx: Ctx,
  step: Step,
  cx: number,
  y: number,
  convergeTargetId: string | null
): boolean {
  const size = nodeSize(step);
  ctx.nodes.push({
    id: step.id,
    type: step.type === "end" ? "end" : "step",
    position: { x: cx - size.w / 2, y },
    width: size.w,
    height: size.h,
    data: { step, subtitle: subtitleFor(step, ctx.names) },
  });
  if (step.type === "goto") ctx.gotos.push(step);

  if (isContainer(step)) {
    const branches = step.branches!;
    const innerHasTarget = !!step.next || !!convergeTargetId;
    const innerTargetId = step.next ? step.next.id : convergeTargetId;
    const cols = branches.map((b) => measureChain(b.child, innerHasTarget));
    const colWidths = cols.map((c) => Math.max(NODE_W, c.width));
    const totalW =
      colWidths.reduce((a, b) => a + b, 0) + H_GAP * Math.max(0, cols.length - 1);
    const childY = y + size.h + V_GAP + BRANCH_LABEL_H;
    const colsH = cols.length ? Math.max(...cols.map((c) => c.height)) : 0;

    let colX = cx - totalW / 2;
    let anyConverged = false;
    branches.forEach((b, i) => {
      const colCx = colX + colWidths[i] / 2;
      const slot: Slot = { kind: "branch", stepId: step.id, branchIndex: i };
      const label = branchEdgeLabel(step, i);
      if (b.child) {
        flowEdge(ctx, step.id, b.child.id, { slot, branchLabel: label, count: b.count });
        if (placeStep(ctx, b.child, colCx, childY, innerTargetId)) anyConverged = true;
      } else {
        // branch vazia: placeholder "+ Adicionar ação" reserva a largura da coluna
        const phId = `ph-${step.id}-${i}`;
        ctx.nodes.push({
          id: phId,
          type: "placeholder",
          position: { x: colCx - NODE_W / 2, y: childY },
          width: NODE_W,
          height: PLACEHOLDER_H,
          data: { slot },
          selectable: false,
        });
        flowEdge(ctx, step.id, phId, { branchLabel: label, count: b.count, noButton: true });
        if (innerTargetId) {
          flowEdge(ctx, phId, innerTargetId, { noButton: true, converge: true });
          anyConverged = true;
        }
      }
      colX += colWidths[i] + H_GAP;
    });

    if (step.next) {
      // todas as branches terminam em end/goto → nada converge; liga container→next
      // contornando o bloco de branches pela lateral (senão a edge atravessaria a
      // coluna do meio) e mantém o slot para o "+" (critério: + em QUALQUER edge)
      if (!anyConverged) {
        flowEdge(ctx, step.id, step.next.id, {
          slot: { kind: "after", stepId: step.id },
          bypassX: cx + totalW / 2 + H_GAP / 2,
        });
      }
      const afterY = childY + colsH + V_GAP;
      return placeStep(ctx, step.next, cx, afterY, convergeTargetId);
    }
    return anyConverged;
  }

  if (step.next) {
    flowEdge(ctx, step.id, step.next.id, { slot: { kind: "after", stepId: step.id } });
    return placeStep(ctx, step.next, cx, y + size.h + V_GAP, convergeTargetId);
  }

  if (isTerminal(step)) return false;

  if (convergeTargetId) {
    // convergência visual: última ação da branch → próximo step do container
    flowEdge(ctx, step.id, convergeTargetId, {
      slot: { kind: "after", stepId: step.id },
      converge: true,
    });
    return true;
  }

  // cauda aberta sem convergência: "+" folha para continuar construindo
  const plusId = `plus-${step.id}`;
  ctx.nodes.push(plusNode(plusId, cx, y + size.h + V_GAP, { kind: "after", stepId: step.id }));
  flowEdge(ctx, step.id, plusId, { noButton: true });
  return false;
}

// ─── Subtítulos dos cards ──────────────────────────────────────────────────────
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function subtitleFor(step: Step, names: Map<string, string>): string {
  const cfg = step.config;
  switch (step.type) {
    case "whatsapp": {
      const template = String(cfg.template ?? "");
      if (template) return template;
      const message = String(cfg.message ?? "");
      return message ? truncate(message, 42) : "Mensagem livre";
    }
    case "interactive": {
      const buttons = (step.branches ?? []).filter((b) => !b.locked).length;
      return `${buttons} ${buttons === 1 ? "botão interativo" : "botões interativos"}`;
    }
    case "wait": {
      if (cfg.mode === "reply") return "Até resposta do contato";
      const value = Number(cfg.value ?? 0);
      const unit = WAIT_UNITS[String(cfg.unit ?? "minutes")] ?? WAIT_UNITS.minutes;
      return `${value} ${value === 1 ? unit.singular : unit.plural}`;
    }
    case "condition": {
      const b = step.branches?.find((br) => !br.locked);
      if (b?.value) {
        const op = CONDITION_OPERATORS[b.operator ?? "contains"] ?? b.operator;
        return truncate(`Se "${b.field}" ${op} "${b.value}"`, 48);
      }
      const n = (step.branches?.length ?? 1) - 1;
      return `${n} ${n === 1 ? "branch" : "branches"} + None`;
    }
    case "split": {
      const n = step.branches?.length ?? 0;
      return `${n} paths`;
    }
    case "tag":
    case "tag_remove": {
      const raw = cfg.tags;
      const tags = Array.isArray(raw)
        ? raw.map((t) => String(t).trim()).filter(Boolean)
        : [];
      const legacy = String(cfg.tagName ?? "").trim();
      const all = tags.length > 0 ? tags : legacy ? [legacy] : [];
      if (all.length === 0) return "Definir tags";
      return truncate(all.join(", "), 42);
    }
    case "pipeline": {
      const pipelineName = String(cfg.pipelineName ?? "").trim();
      const stageName = String(cfg.stageName ?? "").trim();
      if (pipelineName && stageName)
        return truncate(`${pipelineName} → ${stageName}`, 46);
      return "Selecionar pipeline e etapa";
    }
    case "goto": {
      const target = cfg.targetId as string | null | undefined;
      const name = target ? names.get(target) : undefined;
      return name ? `Ir para: ${name}` : "Selecionar destino";
    }
    case "end":
      return "";
  }
}

// ─── Entrada principal ─────────────────────────────────────────────────────────
export function layoutFlow(flow: Flow): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const ctx: Ctx = { nodes: [], edges: [], gotos: [], names: new Map() };

  // índice id → nome (para subtítulo do goto)
  const collect = (s: Step | null): void => {
    if (!s) return;
    ctx.names.set(s.id, s.name);
    if (s.branches) for (const b of s.branches) collect(b.child);
    collect(s.next);
  };
  collect(flow.root);

  // trigger no topo, centralizado em x=0
  ctx.nodes.push({
    id: TRIGGER_ID,
    type: "trigger",
    position: { x: -TRIGGER_W / 2, y: 0 },
    width: TRIGGER_W,
    height: TRIGGER_H,
    data: {
      label: flow.trigger.label,
      keywords: flow.trigger.keywords,
      triggerType: flow.trigger.type ?? "keywords",
      campaignName: flow.trigger.campaignName ?? "",
      campaignId: flow.trigger.campaignId ?? "",
      replyFilter: flow.trigger.replyFilter ?? "",
    },
    selectable: false,
  });

  const rootY = TRIGGER_H + V_GAP;
  if (flow.root) {
    flowEdge(ctx, TRIGGER_ID, flow.root.id, { slot: { kind: "root" } });
    placeStep(ctx, flow.root, 0, rootY, null);
  } else {
    const id = "__plus-root";
    ctx.nodes.push(plusNode(id, 0, rootY, { kind: "root" }));
    flowEdge(ctx, TRIGGER_ID, id, { noButton: true });
  }

  // goto-edges: derivadas por fora do layout, roteadas pela lateral direita da árvore.
  // Cada goto ganha um trilho próprio (sideX + i*16) para não sobrepor as demais.
  const maxX = ctx.nodes.reduce((m, n) => Math.max(m, n.position.x + (n.width ?? NODE_W)), 0);
  let gotoIndex = 0;
  for (const g of ctx.gotos) {
    const target = g.config.targetId as string | null | undefined;
    if (target && target !== g.id && ctx.nodes.some((n) => n.id === target)) {
      ctx.edges.push({
        id: `goto-${g.id}`,
        source: g.id,
        target,
        type: "goto",
        zIndex: 1000,
        data: { sideX: maxX + GOTO_SIDE_OFFSET + gotoIndex * 16 },
        // 'arrowclosed' === MarkerType.ArrowClosed do @xyflow/react
        markerEnd: { type: "arrowclosed", color: "#8b5cf6", width: 18, height: 18 },
      });
      gotoIndex += 1;
    }
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

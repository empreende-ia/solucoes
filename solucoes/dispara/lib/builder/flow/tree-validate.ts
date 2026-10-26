// Validador estrutural LEVE da árvore (Flow). Não valida semântica de execução
// (isso é papel do compileFlow + validateWorkflowSchema no grafo compilado) —
// só invariantes básicas que a UI e as operações devem manter.

import type { Branch, Flow, Step } from "./types";

export interface TreeIssue {
  /** id do step relacionado (null = problema no nível do flow/trigger) */
  stepId: string | null;
  message: string;
}

export interface TreeValidationResult {
  valid: boolean;
  issues: TreeIssue[];
}

const BRANCHED_TYPES = new Set(["condition", "split", "interactive"]);

function walk(step: Step | null, fn: (s: Step) => void): void {
  if (!step) return;
  fn(step);
  if (step.branches) {
    for (const b of step.branches) walk(b.child, fn);
  }
  walk(step.next, fn);
}

function nonLocked(branches: Branch[] | undefined): Branch[] {
  return (branches ?? []).filter((b) => !b.locked);
}

export function validateTree(flow: Flow): TreeValidationResult {
  const issues: TreeIssue[] = [];

  if (flow.schemaVersion !== 1) {
    issues.push({
      stepId: null,
      message: `schemaVersion não suportada: ${String(flow.schemaVersion)} (esperado 1).`,
    });
  }

  // ── ids únicos (steps e branches) ────────────────────────────────────────
  const stepIds = new Set<string>();
  const branchIds = new Set<string>();
  const allStepIds = new Set<string>();
  walk(flow.root, (s) => allStepIds.add(s.id));

  walk(flow.root, (s) => {
    if (!s.id) {
      issues.push({ stepId: null, message: `Step do tipo "${s.type}" sem id.` });
    } else if (stepIds.has(s.id)) {
      issues.push({ stepId: s.id, message: `Id de step duplicado: "${s.id}".` });
    } else {
      stepIds.add(s.id);
    }

    for (const b of s.branches ?? []) {
      if (!b.id) {
        issues.push({ stepId: s.id, message: `Branch "${b.label}" sem id em "${s.name}".` });
      } else if (branchIds.has(b.id)) {
        issues.push({ stepId: s.id, message: `Id de branch duplicado: "${b.id}".` });
      } else {
        branchIds.add(b.id);
      }
    }

    // ── branches obrigatórios em tipos ramificados ─────────────────────────
    if (BRANCHED_TYPES.has(s.type)) {
      if (!s.branches || s.branches.length === 0) {
        issues.push({
          stepId: s.id,
          message: `Step "${s.name}" (${s.type}) precisa ter branches.`,
        });
      } else if (s.type === "condition" && nonLocked(s.branches).length === 0) {
        issues.push({
          stepId: s.id,
          message: `Condição "${s.name}" precisa de pelo menos 1 branch além do "None".`,
        });
      } else if (s.type === "interactive" && nonLocked(s.branches).length === 0) {
        issues.push({
          stepId: s.id,
          message: `Pergunta "${s.name}" precisa de pelo menos 1 botão.`,
        });
      }
    } else if (s.branches && s.branches.length > 0) {
      issues.push({
        stepId: s.id,
        message: `Step "${s.name}" (${s.type}) não deveria ter branches.`,
      });
    }

    // ── split: percentuais somam 100 ───────────────────────────────────────
    if (s.type === "split" && s.branches && s.branches.length > 0) {
      const total = s.branches.reduce((sum, b) => sum + (b.percent ?? 0), 0);
      if (total !== 100) {
        issues.push({
          stepId: s.id,
          message: `Split "${s.name}": percentuais somam ${total}% (esperado 100%).`,
        });
      }
    }

    // ── goto: alvo precisa existir ─────────────────────────────────────────
    if (s.type === "goto") {
      const target = s.config.targetId as string | null | undefined;
      if (target && !allStepIds.has(target)) {
        issues.push({
          stepId: s.id,
          message: `Go To "${s.name}" aponta para step inexistente: "${target}".`,
        });
      }
    }

    // ── terminais não podem ter next ───────────────────────────────────────
    if ((s.type === "end" || s.type === "goto") && s.next) {
      issues.push({
        stepId: s.id,
        message: `Step terminal "${s.name}" (${s.type}) não pode ter continuação.`,
      });
    }
  });

  return { valid: issues.length === 0, issues };
}

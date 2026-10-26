/**
 * Allowlist de actionType dos nós de ação do workflow builder.
 *
 * O grafo (nodes/edges) vai CRU para o executor: um nó com actionType que o
 * produto não conhece não pode ser salvo (400 nas rotas do builder) nem
 * executado (falha controlada no executor). Só entram:
 *
 * - SYSTEM_ACTION_TYPES: tratados direto pelo executor, sem plugin
 *   (Condition, Delay, Set Variable, Get Variable — o compileFlow emite
 *   Condition/Delay/Get Variable — e HTTP Request, protegido contra SSRF por
 *   lib/builder/utils/safe-http.ts);
 * - ações dos plugins registrados em lib/builder/plugins.ts (whatsapp/*,
 *   contacts/*, crm/*), por id canônico ("whatsapp/send-message") ou pelos
 *   aliases que o executor já resolve (slug, label, rótulos legados como
 *   "Send Message" / "Ask Question").
 *
 * O antigo passo "Database Query" (SQL arbitrário via DATABASE_URL) foi
 * removido e NÃO está aqui.
 */

import { findActionById, getAllActions } from "@/lib/builder/plugins";

/** actionTypes executados pelo próprio executor (sem plugin). */
export const SYSTEM_ACTION_TYPES = [
  "Condition",
  "Delay",
  "Set Variable",
  "Get Variable",
  "HTTP Request",
] as const;

const SYSTEM_ACTION_TYPE_SET: ReadonlySet<string> = new Set(SYSTEM_ACTION_TYPES);

/** True se o actionType é executável pelo produto (sistema ou plugin). */
export function isAllowedWorkflowActionType(actionType: unknown): boolean {
  if (typeof actionType !== "string" || actionType.trim() === "") {
    return false;
  }
  if (SYSTEM_ACTION_TYPE_SET.has(actionType)) {
    return true;
  }
  return findActionById(actionType) !== undefined;
}

/** Lista canônica (sistema + id de cada plugin) — para mensagens e testes. */
export function listAllowedWorkflowActionTypes(): string[] {
  return [...SYSTEM_ACTION_TYPES, ...getAllActions().map((action) => action.id)];
}

export type WorkflowActionTypeIssue = {
  nodeId: string;
  label: string;
  error: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Nós com actionType fora da allowlist. Checa todo nó que declara
 * `config.actionType` (o executor despacha por ele nos nós de ação). Nó de
 * ação SEM actionType não é erro aqui: o executor já falha de forma controlada
 * ("has no action type configured").
 */
export function findUnsupportedWorkflowActions(
  nodes: unknown
): WorkflowActionTypeIssue[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  const issues: WorkflowActionTypeIssue[] = [];
  for (const rawNode of nodes) {
    const node = asRecord(rawNode);
    const data = asRecord(node?.data);
    const config = asRecord(data?.config);
    if (!config || !("actionType" in config)) {
      continue;
    }
    const actionType = config.actionType;
    if (actionType === undefined || actionType === null || actionType === "") {
      continue;
    }
    if (isAllowedWorkflowActionType(actionType)) {
      continue;
    }
    const nodeId = typeof node?.id === "string" ? node.id : String(node?.id ?? "");
    const label = typeof data?.label === "string" ? data.label : "";
    issues.push({
      nodeId,
      label,
      error:
        typeof actionType === "string"
          ? `Action type "${actionType}" is not supported`
          : "Action type must be a string",
    });
  }
  return issues;
}

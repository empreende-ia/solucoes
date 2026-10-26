/**
 * Revalidação no SERVIDOR do grafo cru (nodes) que o executor vai rodar:
 * actionTypes fora da allowlist (lib/builder/action-types.ts) e expressões de
 * Condition inválidas (lib/builder/condition-validator.ts). Usada por TODA rota
 * que grava ou reativa um grafo: PATCH, create, current (POST), publish,
 * rollback e duplicate — nunca confiar no compile do cliente nem em versões
 * gravadas antes da revalidação.
 */

import { findUnsupportedWorkflowActions } from "@/lib/builder/action-types";
import { findInvalidWorkflowConditions } from "@/lib/builder/condition-validator";

export type WorkflowGraphIssue = {
  nodeId: string;
  label: string;
  kind: "action" | "condition";
  error: string;
};

/** Todos os problemas do grafo (vazio = ok): ações primeiro, depois condições. */
export function findWorkflowGraphIssues(nodes: unknown): WorkflowGraphIssue[] {
  const actionIssues = findUnsupportedWorkflowActions(nodes).map(
    (issue): WorkflowGraphIssue => ({ ...issue, kind: "action" })
  );
  const conditionIssues = findInvalidWorkflowConditions(nodes).map(
    (issue): WorkflowGraphIssue => ({ ...issue, kind: "condition" })
  );
  return [...actionIssues, ...conditionIssues];
}

/** Mensagem única (pt-BR) para a resposta 400 das rotas do builder. */
export function describeWorkflowGraphIssues(issues: WorkflowGraphIssue[]): string {
  if (issues.length === 0) {
    return "";
  }
  const [first] = issues;
  const name = first.label || first.nodeId || "sem id";
  const prefix =
    first.kind === "action" ? "Ação não suportada no nó" : "Condição inválida no nó";
  const extra =
    issues.length > 1 ? ` (e mais ${issues.length - 1} problema(s) no fluxo)` : "";
  return `${prefix} "${name}": ${first.error}${extra}`;
}

/** Corpo padrão da resposta 400 (`error` legível + `details` por nó). */
export function workflowGraphIssuesBody(issues: WorkflowGraphIssue[]): {
  error: string;
  details: WorkflowGraphIssue[];
} {
  return { error: describeWorkflowGraphIssues(issues), details: issues };
}

// Types do grafo compilado/persistido (workflow_versions.nodes/edges).
// Módulo server-safe (import type de @xyflow/react não puxa código de runtime).
// A UI legada (components/builder/* + lib/builder/workflow-store.ts) foi removida;
// estes types são a fonte única para executor, rotas de API e o builder novo.

import type { Edge, Node } from "@xyflow/react";

export type WorkflowNodeType = "trigger" | "action" | "add";

export type WorkflowNodeData = {
  label: string;
  description?: string;
  type: WorkflowNodeType;
  config?: Record<string, unknown>;
  status?: "idle" | "running" | "success" | "error";
  enabled?: boolean; // Whether the step is enabled (defaults to true)
  onClick?: () => void; // For the "add" node type
};

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;

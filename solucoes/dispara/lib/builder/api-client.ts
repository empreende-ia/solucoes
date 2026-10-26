/**
 * API Client for making type-safe API calls to the backend
 * Replaces server actions with API endpoints
 */

import type { WorkflowEdge, WorkflowNode } from "./graph-types";
import type { WorkflowSettings } from "./workflow-settings";

// Workflow data types
export type WorkflowVisibility = "private" | "public";

export type WorkflowData = {
  id?: string;
  name?: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** árvore canônica do builder novo (lib/builder/flow/types.ts, schemaVersion 1) */
  tree?: unknown;
  visibility?: WorkflowVisibility;
  /** configurações estilo GHL (workflows.settings) */
  settings?: WorkflowSettings;
};

export type SavedWorkflow = WorkflowData & {
  id: string;
  name: string;
  visibility: WorkflowVisibility;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
  status?: string;
  lastPublishedVersion?: number | null;
};

// API error class
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Helper function to make API calls
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(response.status, error.error || "Request failed");
  }

  return response.json();
}

/* Seções removidas junto com a UI antiga do builder (template Vercel):
 * aiApi (streaming /api/builder/ai/generate), integrationApi, userApi e
 * aiGatewayApi — nenhum consumidor vivo após a migração para
 * components/flow-builder/. */

// Workflow API
export const workflowApi = {
  // Get all workflows
  getAll: () => apiCall<SavedWorkflow[]>("/api/builder/workflows"),

  // Get a specific workflow
  getById: (id: string) =>
    apiCall<SavedWorkflow>(`/api/builder/workflows/${id}`),

  // Create a new workflow
  create: (workflow: Omit<WorkflowData, "id">) =>
    apiCall<SavedWorkflow>("/api/builder/workflows/create", {
      method: "POST",
      body: JSON.stringify(workflow),
    }),

  // Update a workflow
  update: (id: string, workflow: Partial<WorkflowData>) =>
    apiCall<SavedWorkflow>(`/api/builder/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(workflow),
    }),

  // Delete a workflow
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/builder/workflows/${id}`, {
      method: "DELETE",
    }),

  // Duplicate a workflow
  duplicate: (id: string) =>
    apiCall<SavedWorkflow>(`/api/builder/workflows/${id}/duplicate`, {
      method: "POST",
    }),

  // Get current workflow state
  getCurrent: () => apiCall<WorkflowData>("/api/builder/workflows/current"),

  // Save current workflow state
  saveCurrent: (nodes: WorkflowNode[], edges: WorkflowEdge[]) =>
    apiCall<WorkflowData>("/api/builder/workflows/current", {
      method: "POST",
      body: JSON.stringify({ nodes, edges }),
    }),

  // Execute workflow
  execute: (id: string, input: Record<string, unknown> = {}) =>
    apiCall<{
      executionId: string;
      status: string;
      output?: unknown;
      error?: string;
      duration?: number;
    }>(`/api/builder/workflow/${id}/execute`, {
      method: "POST",
      body: JSON.stringify({ workflowId: id, input }),
    }),

  // Run workflow via builder executor
  run: (id: string) =>
    apiCall<{ executionId: string; status: string; workflowId: string }>(
      `/api/builder/workflows/${id}/run`,
      { method: "POST" }
    ),

  // Trigger workflow via webhook
  triggerWebhook: (id: string, input: Record<string, unknown> = {}) =>
    apiCall<{
      executionId: string;
      status: string;
    }>(`/api/builder/workflows/${id}/webhook`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Get workflow code
  getCode: (id: string) =>
    apiCall<{ code: string; workflowName: string }>(
      `/api/builder/workflows/${id}/code`
    ),

  // Metrics
  getMetrics: () =>
    apiCall<{
      totals: { runs: number; success: number; failed: number };
      byWorkflow: Record<string, { runs: number; success: number; failed: number }>;
    }>(`/api/builder/workflows/metrics`),

  // Versions
  getVersions: (id: string) =>
    apiCall<
      Array<{
        id: string;
        version: number;
        status: string;
        created_at: string;
        published_at?: string | null;
      }>
    >(`/api/builder/workflows/${id}/versions`),

  // Publish workflow
  publish: (id: string) =>
    apiCall<{ success: boolean; versionId: string; version: number }>(
      `/api/builder/workflows/${id}/publish`,
      { method: "POST" }
    ),

  // Rollback workflow
  rollback: (id: string, versionId: string) =>
    apiCall<{ success: boolean; versionId: string }>(
      `/api/builder/workflows/${id}/rollback`,
      {
        method: "POST",
        body: JSON.stringify({ versionId }),
      }
    ),

  // Get executions
  getExecutions: (id: string) =>
    apiCall<
      Array<{
        id: string;
        workflowId: string;
        userId: string;
        status: string;
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
      }>
    >(`/api/builder/workflows/${id}/executions`),

  // Delete executions
  deleteExecutions: (id: string) =>
    apiCall<{ success: boolean; deletedCount: number }>(
      `/api/builder/workflows/${id}/executions`,
      {
        method: "DELETE",
      }
    ),

  // Get execution logs
  getExecutionLogs: (executionId: string) =>
    apiCall<{
      execution: {
        id: string;
        workflowId: string;
        userId: string;
        status: string;
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
        workflow: {
          id: string;
          name: string;
          nodes: unknown;
          edges: unknown;
        };
      };
      logs: Array<{
        id: string;
        executionId: string;
        nodeId: string;
        nodeName: string;
        nodeType: string;
        status: "pending" | "running" | "success" | "error";
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
      }>;
    }>(`/api/builder/workflows/executions/${executionId}/logs`),

  // Get execution status
  getExecutionStatus: (executionId: string) =>
    apiCall<{
      status: string;
      nodeStatuses: Array<{
        nodeId: string;
        status: "pending" | "running" | "success" | "error";
      }>;
    }>(`/api/builder/workflows/executions/${executionId}/status`),

  // Download workflow
  download: (id: string) =>
    apiCall<{
      success: boolean;
      files?: Record<string, string>;
      error?: string;
    }>(`/api/builder/workflows/${id}/download`),

  // Auto-save with debouncing (kept for backwards compatibility)
  autoSaveCurrent: (() => {
    let autosaveTimeout: NodeJS.Timeout | null = null;
    const AUTOSAVE_DELAY = 2000;

    return (nodes: WorkflowNode[], edges: WorkflowEdge[]): void => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = setTimeout(() => {
        workflowApi.saveCurrent(nodes, edges).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }, AUTOSAVE_DELAY);
    };
  })(),

  // Auto-save specific workflow with debouncing
  autoSaveWorkflow: (() => {
    let autosaveTimeout: NodeJS.Timeout | null = null;
    const AUTOSAVE_DELAY = 2000;

    return (
      id: string,
      data: Partial<WorkflowData>,
      debounce = true
    ): Promise<SavedWorkflow> | undefined => {
      if (!debounce) {
        return workflowApi.update(id, data);
      }

      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = setTimeout(() => {
        workflowApi.update(id, data).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }, AUTOSAVE_DELAY);
    };
  })(),
};

// Export all APIs as a single object
export const api = {
  workflow: workflowApi,
};

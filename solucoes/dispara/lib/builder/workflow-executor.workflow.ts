/**
 * Workflow-based executor using "use workflow" and "use step" directives
 * This executor captures step executions through the workflow SDK for better observability
 */

import {
  preValidateConditionExpression,
  validateConditionExpression,
} from "@/lib/builder/condition-validator";
import { evaluateSafeExpression } from "@/lib/builder/condition-evaluator";
import { isAllowedWorkflowActionType } from "@/lib/builder/action-types";
import {
  getActionLabel,
  getStepImporter,
  type StepImporter,
} from "./step-registry";
import { findActionById } from "./plugins";
import type { StepContext } from "./steps/step-handler";
import { triggerStep } from "./steps/trigger";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getErrorMessageAsync } from "./utils";
import { createConversation } from "./workflow-conversations";
import { normalizePhoneNumber } from "@/lib/phone-formatter";
import type { WorkflowEdge, WorkflowNode } from "./graph-types";
import { getWorkflowExecutionConfig } from "@/lib/builder/workflow-execution-settings";
import {
  timeWindowDelayMs,
  type WorkflowSettings,
} from "@/lib/builder/workflow-settings";

// System actions that don't have plugins - maps to module import functions.
// O antigo "Database Query" (SQL arbitrário via DATABASE_URL, sem UI que o
// emitisse) foi removido; a allowlist (lib/builder/action-types.ts) barra o
// actionType no save e aqui no runtime.
const SYSTEM_ACTIONS: Record<string, StepImporter> = {
  "HTTP Request": {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic module import
    importer: () => import("./steps/http-request") as Promise<any>,
    stepFunction: "httpRequestStep",
  },
  Condition: {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic module import
    importer: () => import("./steps/condition") as Promise<any>,
    stepFunction: "conditionStep",
  },
};

function isAskQuestionAction(actionType?: string): boolean {
  if (!actionType) return false;
  if (actionType === "Ask Question") return true;
  const action = findActionById(actionType);
  return action?.slug === "ask-question";
}

function shouldTreatAsAskQuestion(
  actionType: string | undefined,
  config: Record<string, unknown>
): boolean {
  if (isAskQuestionAction(actionType)) return true;
  if (actionType === "Set Variable") return false;

  const variableKey =
    typeof config.variableKey === "string" ? config.variableKey.trim() : "";
  if (!variableKey) return false;

  const message =
    typeof config.message === "string" ? config.message.trim() : "";
  if (!message) return false;

  const toSource =
    typeof config.toSource === "string" ? config.toSource.trim() : "";
  if (toSource !== "inbound" && toSource !== "manual") return false;

  return true;
}

type ExecutionResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type NodeOutputs = Record<string, { label: string; data: unknown }>;

export type WorkflowExecutionInput = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggerInput?: Record<string, unknown>;
  executionId?: string;
  workflowId?: string; // Used by steps to fetch credentials
};

/**
 * Helper to replace template variables in conditions
 */
// biome-ignore lint/nursery/useMaxParams: Helper function needs all parameters for template replacement
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Template variable replacement requires nested logic for standardized outputs
function replaceTemplateVariable(
  match: string,
  nodeId: string,
  rest: string,
  outputs: NodeOutputs,
  evalContext: Record<string, unknown>,
  varCounter: { value: number }
): string {
  const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
  const output = outputs[sanitizedNodeId];

  if (!output) {
    console.log("[Condition] Output not found for node:", sanitizedNodeId);
    return match;
  }

  const dotIndex = rest.indexOf(".");
  let value: unknown;

  if (dotIndex === -1) {
    value = output.data;
  } else if (output.data === null || output.data === undefined) {
    value = undefined;
  } else {
    const fieldPath = rest.substring(dotIndex + 1);
    const fields = fieldPath.split(".");
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic data traversal
    let current: any = output.data;

    // For standardized outputs { success, data, error }, automatically look inside data
    // unless explicitly accessing success/data/error
    const firstField = fields[0];
    if (
      current &&
      typeof current === "object" &&
      "success" in current &&
      "data" in current &&
      firstField !== "success" &&
      firstField !== "data" &&
      firstField !== "error"
    ) {
      current = current.data;
    }

    for (const field of fields) {
      if (current && typeof current === "object") {
        current = current[field];
      } else {
        console.log("[Condition] Field access failed:", fieldPath);
        value = undefined;
        break;
      }
    }
    if (value === undefined && current !== undefined) {
      value = current;
    }
  }

  const varName = `__v${varCounter.value}`;
  varCounter.value += 1;
  evalContext[varName] = value;
  return varName;
}

type ConditionEvalResult = {
  result: boolean;
  resolvedValues: Record<string, unknown>;
  /**
   * Expressão rejeitada pela gramática/política (não um false "normal"): vai
   * para o log do passo, para a falha não passar como false silencioso.
   */
  expressionError?: string;
};

/**
 * Evaluate condition expression with template variable replacement
 *
 * Security: a expressão NÃO é executada como código (sem new Function/eval).
 * Ela é parseada para uma AST de um subconjunto restrito de JS e interpretada
 * por lib/builder/condition-evaluator.ts: só variáveis __vN, literais,
 * operadores de comparação/lógicos/aritméticos, leitura de propriedades
 * próprias de dados e métodos da whitelist. Qualquer erro → condição falsa.
 */
function evaluateConditionExpression(
  conditionExpression: unknown,
  outputs: NodeOutputs,
  variables: Record<string, unknown> = {}
): ConditionEvalResult {
  console.log("[Condition] Original expression:", conditionExpression);

  if (typeof conditionExpression === "boolean") {
    return { result: conditionExpression, resolvedValues: {} };
  }

  if (typeof conditionExpression === "string") {
    // Pre-validate the expression before any processing
    const preValidation = preValidateConditionExpression(conditionExpression);
    if (!preValidation.valid) {
      console.error("[Condition] Pre-validation failed:", preValidation.error);
      console.error("[Condition] Expression was:", conditionExpression);
      return {
        result: false,
        resolvedValues: {},
        expressionError: preValidation.error,
      };
    }

    try {
      const evalContext: Record<string, unknown> = {};
      const resolvedValues: Record<string, unknown> = {};
      let transformedExpression = conditionExpression;
      const templatePattern = /\{\{@([^:]+):([^}]+)\}\}/g;
      const varCounter = { value: 0 };

      transformedExpression = transformedExpression.replace(
        templatePattern,
        (match, nodeId, rest) => {
          const varName = replaceTemplateVariable(
            match,
            nodeId,
            rest,
            outputs,
            evalContext,
            varCounter
          );
          // Store the resolved value with a readable key (the display text from the template)
          resolvedValues[rest] = evalContext[varName];
          return varName;
        }
      );

      // Resolve persisted run variables {{var.<key>}} — these survive a resume
      // (restored via initialVariables), unlike node outputs which start empty on
      // each resume. Additive: {{@id:...}} above keeps working. Mirrors the
      // {{var.<key>}} handling in processTemplates.
      const varTemplatePattern = /\{\{\s*var\.([a-zA-Z0-9_.-]+)\s*\}\}/g;
      transformedExpression = transformedExpression.replace(
        varTemplatePattern,
        (_match, varKey: string) => {
          const varName = `__v${varCounter.value}`;
          varCounter.value += 1;
          const value = variables[varKey];
          evalContext[varName] = value;
          resolvedValues[`var.${varKey}`] = value;
          return varName;
        }
      );

      // Validate the transformed expression before evaluation
      const validation = validateConditionExpression(transformedExpression);
      if (!validation.valid) {
        console.error("[Condition] Validation failed:", validation.error);
        console.error("[Condition] Original expression:", conditionExpression);
        console.error(
          "[Condition] Transformed expression:",
          transformedExpression
        );
        return { result: false, resolvedValues, expressionError: validation.error };
      }

      // Interpretador de AST restrita — nunca gera/executa código (o antigo
      // new Function permitia RCE via __v0["constructor"]["constructor"](...)).
      const result = evaluateSafeExpression(transformedExpression, evalContext);
      return { result: Boolean(result), resolvedValues };
    } catch (error) {
      console.error("[Condition] Failed to evaluate condition:", error);
      console.error("[Condition] Expression was:", conditionExpression);
      return { result: false, resolvedValues: {} };
    }
  }

  return { result: Boolean(conditionExpression), resolvedValues: {} };
}

async function sleep(ms: number): Promise<void> {
  if (!ms || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs?: number
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return await fn();
  }

  return await Promise.race([
    fn(),
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error("Step timeout")), timeoutMs)
    ),
  ]);
}

async function runWithRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseDelayMs: number,
  timeoutMs?: number
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await runWithTimeout(fn, timeoutMs);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      const delay = Math.max(0, baseDelayMs) * Math.pow(2, attempt);
      attempt += 1;
      await sleep(delay);
    }
  }
}

function resolveExecutionNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
}

/**
 * Execute a single action step with logging via stepHandler
 * IMPORTANT: Steps receive only the integration ID as a reference to fetch credentials.
 * This prevents credentials from being logged in Vercel's workflow observability.
 */
async function executeActionStep(input: {
  actionType: string;
  config: Record<string, unknown>;
  outputs: NodeOutputs;
  context: StepContext;
  triggerData: Record<string, unknown>;
  variables: Record<string, unknown>;
  executionDefaults?: {
    retryCount: number;
    retryDelayMs: number;
    timeoutMs: number;
  };
}) {
  const {
    actionType,
    config,
    outputs,
    context,
    triggerData,
    variables,
    executionDefaults,
  } = input;

  // Build step input WITHOUT credentials, but WITH integrationId reference and logging context
  const stepInput: Record<string, unknown> = {
    ...config,
    triggerData,
    _context: context,
  };

  const retryCount = resolveExecutionNumber(
    config.retryCount,
    executionDefaults?.retryCount ?? 0
  );
  const retryDelayMs = resolveExecutionNumber(
    config.retryDelayMs,
    executionDefaults?.retryDelayMs ?? 0
  );
  const timeoutMs = resolveExecutionNumber(
    config.timeoutMs,
    executionDefaults?.timeoutMs ?? 0
  );

  if (actionType === "Delay") {
    // Fase D: o Delay durável é interceptado no loop principal de executeWorkflow (pausa
    // + enrollment com resume_at). Aqui não bloqueamos mais com setTimeout — se um Delay
    // chegar até este ponto (caminho inesperado), retorna imediato pra não travar a
    // função por até ~24 dias.
    const delayMs =
      typeof stepInput.delayMs === "number"
        ? stepInput.delayMs
        : Number(stepInput.delayMs || 0);
    const safeDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
    return { success: true, data: { delayMs: safeDelay } };
  }

  if (actionType === "Set Variable") {
    const key = String(stepInput.variableKey || "");
    const value = stepInput.variableValue;
    if (!key) {
      return { success: false, error: "Variable key is required" };
    }
    variables[key] = value;
    return { success: true, data: { key, value } };
  }

  if (actionType === "Get Variable") {
    const key = String(stepInput.variableKey || "");
    if (!key) {
      return { success: false, error: "Variable key is required" };
    }
    return { success: true, data: { key, value: variables[key] } };
  }

  // Special handling for Condition action - needs template evaluation
  if (actionType === "Condition") {
    const systemAction = SYSTEM_ACTIONS.Condition;
    const mod = (await systemAction.importer()) as Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >;
    const originalExpression = stepInput.condition;
    const {
      result: evaluatedCondition,
      resolvedValues,
      expressionError,
    } = evaluateConditionExpression(originalExpression, outputs, variables);
    console.log("[Condition] Final result:", evaluatedCondition);

    return await runWithRetry(
      () =>
        mod[systemAction.stepFunction]({
          condition: evaluatedCondition,
          // Include original expression and resolved values for logging purposes
          expression:
            typeof originalExpression === "string"
              ? originalExpression
              : undefined,
          values:
            Object.keys(resolvedValues).length > 0 ? resolvedValues : undefined,
          expressionError,
          _context: context,
        }),
      Number.isFinite(retryCount) ? retryCount : 0,
      Number.isFinite(retryDelayMs) ? retryDelayMs : 0,
      Number.isFinite(timeoutMs) ? timeoutMs : 0
    );
  }

  // Check system actions first (HTTP Request). Só chave PRÓPRIA: um actionType
  // como "constructor" não pode cair em Object.prototype.
  const systemAction = Object.prototype.hasOwnProperty.call(
    SYSTEM_ACTIONS,
    actionType
  )
    ? SYSTEM_ACTIONS[actionType]
    : undefined;
  if (systemAction) {
    const mod = (await systemAction.importer()) as Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >;
    const stepFunction = mod[systemAction.stepFunction];
    return await runWithRetry(
      () => stepFunction(stepInput),
      Number.isFinite(retryCount) ? retryCount : 0,
      Number.isFinite(retryDelayMs) ? retryDelayMs : 0,
      Number.isFinite(timeoutMs) ? timeoutMs : 0
    );
  }

  // Look up plugin action from the generated step registry
  const stepImporter = getStepImporter(actionType);
  if (stepImporter) {
    const mod = (await stepImporter.importer()) as Record<
      string,
      (input: Record<string, unknown>) => Promise<unknown>
    >;
    const stepFunction = mod[stepImporter.stepFunction];
    if (stepFunction) {
      return await runWithRetry(
        () => stepFunction(stepInput),
        Number.isFinite(retryCount) ? retryCount : 0,
        Number.isFinite(retryDelayMs) ? retryDelayMs : 0,
        Number.isFinite(timeoutMs) ? timeoutMs : 0
      );
    }

    return {
      success: false,
      error: `Step function "${stepImporter.stepFunction}" not found in module for action "${actionType}". Check that the plugin exports the correct function name.`,
    };
  }

  // Fallback for unknown action types
  return {
    success: false,
    error: `Unknown action type: "${actionType}". This action is not registered in the plugin system. Available system actions: ${Object.keys(SYSTEM_ACTIONS).join(", ")}.`,
  };
}

/**
 * Process template variables in config
 */
function processTemplates(
  config: Record<string, unknown>,
  outputs: NodeOutputs,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const processed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      // Process template variables like {{@nodeId:Label.field}}
      let processedValue = value;
      const variablePattern = /\{\{\s*var\.([a-zA-Z0-9_.-]+)\s*\}\}/g;
      processedValue = processedValue.replace(variablePattern, (_match, varKey) => {
        const rawValue = variables[varKey];
        if (rawValue === null || rawValue === undefined) {
          return "";
        }
        if (typeof rawValue === "object") {
          return JSON.stringify(rawValue);
        }
        return String(rawValue);
      });
      const templatePattern = /\{\{@([^:]+):([^}]+)\}\}/g;
      processedValue = processedValue.replace(
        templatePattern,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Template processing requires nested logic
        (match, nodeId, rest) => {
          const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
          const output = outputs[sanitizedNodeId];
          if (!output) {
            return match;
          }

          const dotIndex = rest.indexOf(".");
          if (dotIndex === -1) {
            // No field path, return the entire output data
            const data = output.data;
            if (data === null || data === undefined) {
              // Return empty string for null/undefined data (e.g., from disabled nodes)
              return "";
            }
            if (typeof data === "object") {
              return JSON.stringify(data);
            }
            return String(data);
          }

          // If data is null/undefined, return empty string instead of trying to access fields
          if (output.data === null || output.data === undefined) {
            return "";
          }

          const fieldPath = rest.substring(dotIndex + 1);
          const fields = fieldPath.split(".");
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic output data traversal
          let current: any = output.data;

          // For standardized outputs { success, data, error }, automatically look inside data
          // unless explicitly accessing success/data/error
          const firstField = fields[0];
          if (
            current &&
            typeof current === "object" &&
            "success" in current &&
            "data" in current &&
            firstField !== "success" &&
            firstField !== "data" &&
            firstField !== "error"
          ) {
            current = current.data;
          }

          for (const field of fields) {
            if (current && typeof current === "object") {
              current = current[field];
            } else {
              // Field access failed, return empty string
              return "";
            }
          }

          // Convert value to string, using JSON.stringify for objects/arrays
          if (current === null || current === undefined) {
            return "";
          }
          if (typeof current === "object") {
            return JSON.stringify(current);
          }
          return String(current);
        }
      );

      processed[key] = processedValue;
    } else {
      processed[key] = value;
    }
  }

  return processed;
}

/**
 * Main workflow executor function
 */
export async function executeWorkflow(
  input: WorkflowExecutionInput & {
    startNodeIds?: string[];
    initialVariables?: Record<string, unknown>;
    // Nós já executados numa passada anterior (persistidos no enrollment). Ao retomar
    // após um wait durável, o executor os pula — defesa anti-double-send (Fase D).
    alreadyResolvedNodeIds?: string[];
    // Snapshot das saídas dos nós já executados. Sem isto, outputs começa {} no resume e
    // refs {{@nodeId}}/{{@__trigger}} a montante do Delay viram literal cru ou falham
    // (ex.: Condition sobre a mensagem do gatilho após um Delay). Fase D.
    // Tipo permissivo (Record) porque vem do jsonb do enrollment; casteado internamente.
    initialOutputs?: Record<string, unknown>;
    // Settings do workflow (workflows.settings): timeWindow pausa passos de
    // comunicação (whatsapp/*) fora da janela — mesma mecânica do Delay durável.
    workflowSettings?: WorkflowSettings;
  }
) {
  "use workflow";

  console.log("[Workflow Executor] Starting workflow execution");

  const { nodes, edges, triggerInput = {}, executionId, workflowId } = input;

  console.log("[Workflow Executor] Input:", {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    hasExecutionId: !!executionId,
    workflowId: workflowId || "none",
  });

  const outputs: NodeOutputs = { ...(input.initialOutputs || {}) } as NodeOutputs;
  const results: Record<string, ExecutionResult> = {};
  const variables: Record<string, unknown> = {
    ...(input.initialVariables || {}),
  };
  const executionDefaults = await getWorkflowExecutionConfig()
    .then((res) => res.config)
    .catch((error) => {
      console.error(
        "[Workflow Executor] Failed to load execution defaults:",
        error
      );
      return { retryCount: 0, retryDelayMs: 500, timeoutMs: 10000 };
    });

  // Build node and edge maps
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgesBySource = new Map<string, string[]>();
  const incomingCounts = new Map<string, number>();
  for (const node of nodes) {
    incomingCounts.set(node.id, 0);
  }
  for (const edge of edges) {
    const targets = edgesBySource.get(edge.source) || [];
    targets.push(edge.target);
    edgesBySource.set(edge.source, targets);
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) || 0) + 1);
  }

  const satisfiedIncoming = new Map<string, number>();
  const blockedIncoming = new Map<string, number>();
  // Re-hidrata nós já executados numa passada anterior (retomada após wait durável):
  // o loop pula quem já está aqui (if resolvedNodes.has → continue/return). Anti-double-send.
  const resolvedNodes = new Set<string>(input.alreadyResolvedNodeIds ?? []);

  const startNodeIds =
    input.startNodeIds && input.startNodeIds.length > 0
      ? input.startNodeIds
      : null;

  const reachableNodes = new Set<string>();
  if (startNodeIds) {
    const stack = [...startNodeIds];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || reachableNodes.has(current)) continue;
      reachableNodes.add(current);
      const nextNodes = edgesBySource.get(current) || [];
      for (const next of nextNodes) {
        if (!reachableNodes.has(next)) {
          stack.push(next);
        }
      }
    }
  }

  if (startNodeIds) {
    const filteredIncoming = new Map<string, number>();
    for (const nodeId of reachableNodes) {
      filteredIncoming.set(nodeId, 0);
    }
    for (const edge of edges) {
      if (reachableNodes.has(edge.source) && reachableNodes.has(edge.target)) {
        filteredIncoming.set(
          edge.target,
          (filteredIncoming.get(edge.target) || 0) + 1
        );
      }
    }
    for (const [nodeId, count] of filteredIncoming.entries()) {
      incomingCounts.set(nodeId, count);
    }
    for (const nodeId of [...incomingCounts.keys()]) {
      if (!reachableNodes.has(nodeId)) {
        incomingCounts.delete(nodeId);
      }
    }
    for (const nodeId of startNodeIds) {
      if (incomingCounts.has(nodeId)) {
        incomingCounts.set(nodeId, 0);
      }
    }
  }

  const readyQueue: string[] = [];
  for (const [nodeId, count] of incomingCounts.entries()) {
    if (count === 0) {
      if (!startNodeIds || reachableNodes.has(nodeId)) {
        readyQueue.push(nodeId);
      }
    }
  }

  // Helper to get a meaningful node name
  function getNodeName(node: WorkflowNode): string {
    if (node.data.label) {
      return node.data.label;
    }
    if (node.data.type === "action") {
      const actionType = node.data.config?.actionType as string;
      if (actionType) {
        // Look up the human-readable label from the step registry
        const label = getActionLabel(actionType);
        if (label) {
          return label;
        }
      }
      return "Action";
    }
    if (node.data.type === "trigger") {
      return (node.data.config?.triggerType as string) || "Trigger";
    }
    return node.data.type;
  }

  try {
    console.log("[Workflow Executor] Starting execution from trigger nodes");
    const workflowStartTime = Date.now();
    const enqueueIfReady = (nodeId: string) => {
      if (resolvedNodes.has(nodeId)) return;
      const total = incomingCounts.get(nodeId) || 0;
      const satisfied = satisfiedIncoming.get(nodeId) || 0;
      const blocked = blockedIncoming.get(nodeId) || 0;
      if (satisfied + blocked < total) return;
      if (total === 0 || satisfied > 0) {
        readyQueue.push(nodeId);
        return;
      }
      if (blocked === total) {
        skipNode(nodeId);
      }
    };

    const markEdgeResult = (targetId: string, status: "satisfied" | "blocked") => {
      if (status === "satisfied") {
        satisfiedIncoming.set(
          targetId,
          (satisfiedIncoming.get(targetId) || 0) + 1
        );
      } else {
        blockedIncoming.set(
          targetId,
          (blockedIncoming.get(targetId) || 0) + 1
        );
      }
      enqueueIfReady(targetId);
    };

    const skipNode = (nodeId: string) => {
      if (resolvedNodes.has(nodeId)) return;
      resolvedNodes.add(nodeId);
      results[nodeId] = { success: false, error: "skipped" };
      const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
      outputs[sanitizedNodeId] = {
        label: nodeMap.get(nodeId)?.data.label || nodeId,
        data: null,
      };
      const nextNodes = edgesBySource.get(nodeId) || [];
      for (const next of nextNodes) {
        markEdgeResult(next, "blocked");
      }
    };

    while (readyQueue.length > 0) {
      const nodeId = readyQueue.shift();
      if (!nodeId || resolvedNodes.has(nodeId)) {
        continue;
      }
      const node = nodeMap.get(nodeId);
      if (!node) {
        resolvedNodes.add(nodeId);
        continue;
      }

      if (node.data.enabled === false) {
        skipNode(nodeId);
        continue;
      }

      let result: ExecutionResult;
      try {
        if (node.data.type === "trigger") {
          const config = node.data.config || {};
          const triggerType = config.triggerType as string;
          let triggerData: Record<string, unknown> = {
            triggered: true,
            timestamp: Date.now(),
          };

          if (
            triggerType === "Webhook" &&
            config.webhookMockRequest &&
            (!triggerInput || Object.keys(triggerInput).length === 0)
          ) {
            try {
              const mockData = JSON.parse(config.webhookMockRequest as string);
              triggerData = { ...triggerData, ...mockData };
            } catch (error) {
              console.error(
                "[Workflow Executor] Failed to parse webhook mock request:",
                error
              );
            }
          } else if (triggerInput && Object.keys(triggerInput).length > 0) {
            triggerData = { ...triggerData, ...triggerInput };
          }

          const triggerContext: StepContext = {
            executionId,
            workflowId,
            nodeId: node.id,
            nodeName: getNodeName(node),
            nodeType: node.data.type,
          };

          const triggerResult = await triggerStep({
            triggerData,
            _context: triggerContext,
          });

          result = { success: triggerResult.success, data: triggerResult.data };
        } else if (node.data.type === "action") {
          const config = node.data.config || {};
          const actionType = config.actionType as string | undefined;

          if (!actionType) {
            result = {
              success: false,
              error: `Action node "${node.data.label || node.id}" has no action type configured`,
            };
          } else if (
            !isAllowedWorkflowActionType(actionType) &&
            !shouldTreatAsAskQuestion(actionType, config)
          ) {
            // Falha controlada: actionType fora da allowlist (ex.: o removido
            // "Database Query", ou valor forjado no grafo cru) nunca é
            // despachado. Nós com cara de "Perguntar" seguem a coerção antiga.
            result = {
              success: false,
              error: `Action type "${actionType}" is not supported (node "${node.data.label || node.id}").`,
            };
          } else {
            const configWithoutCondition = { ...config };
            const originalCondition = config.condition;
            configWithoutCondition.condition = undefined;

            const processedConfig = processTemplates(
              configWithoutCondition,
              outputs,
              variables
            );

            if (originalCondition !== undefined) {
              processedConfig.condition = originalCondition;
            }

            // Delay durável (Fase D): em vez de bloquear com setTimeout — que morre no
            // maxDuration (~5min) e nunca completa waits de horas/dias — o executor pausa
            // e devolve o ponto de continuação. A borda (rota /execute ou cron drain)
            // persiste o enrollment com resume_at. Se o Delay for terminal (sem próximo
            // nó), não há o que retomar: trata como nó normal já resolvido.
            if (actionType === "Delay") {
              const delayRaw =
                typeof processedConfig.delayMs === "number"
                  ? processedConfig.delayMs
                  : Number(processedConfig.delayMs || 0);
              const delayMs = Number.isFinite(delayRaw)
                ? Math.max(0, delayRaw)
                : 0;
              // TODOS os próximos nós do Delay são raízes de retomada (resume multi-head):
              // o compile liga um Delay antes de uma Condition a TODOS os cond-heads
              // (cond_0..cond_none). Guardar só o primeiro perderia as demais branches.
              const delayNext = edgesBySource.get(node.id) || [];

              results[nodeId] = { success: true, data: { delayMs } };
              resolvedNodes.add(nodeId);
              outputs[nodeId.replace(/[^a-zA-Z0-9]/g, "_")] = {
                label: node.data.label || nodeId,
                data: { delayMs },
              };

              if (delayNext.length > 0) {
                // Premissa (builder v1): não há fan-out PARALELO real (só branches de
                // Condition, que são gates mutuamente exclusivos), então ao pausar o
                // readyQueue não tem frentes paralelas pendentes. Se um dia houver, avisar.
                const pending = readyQueue.filter((id) => !resolvedNodes.has(id));
                if (pending.length > 0) {
                  console.warn(
                    "[Workflow Executor] Delay pausou com nós paralelos pendentes no readyQueue (não suportado):",
                    pending
                  );
                }
                return {
                  success: true,
                  results,
                  outputs,
                  paused: true,
                  wait: {
                    kind: "delay" as const,
                    resumeNodeIds: delayNext,
                    resumeInMs: delayMs,
                  },
                  variables,
                  resolvedNodeIds: Array.from(resolvedNodes),
                };
              }
              // Delay terminal: nada a retomar; segue o loop (nó já resolvido).
              continue;
            }

            // Time Window (settings do workflow, estilo GHL): passos de COMUNICAÇÃO
            // fora da janela pausam até o próximo slot — mesma mecânica do Delay
            // durável, mas retomando NO PRÓPRIO nó (que não foi resolvido nem
            // executado, então reexecuta e envia dentro da janela). Ações internas
            // (tag, pipeline, condição) NÃO são afetadas, como no GHL.
            if (actionType.startsWith("whatsapp/")) {
              const windowDelayMs = timeWindowDelayMs(
                input.workflowSettings?.timeWindow
              );
              if (windowDelayMs > 0) {
                const pending = readyQueue.filter((id) => !resolvedNodes.has(id));
                if (pending.length > 1) {
                  console.warn(
                    "[Workflow Executor] Time window pausou com nós paralelos pendentes no readyQueue (não suportado):",
                    pending
                  );
                }
                return {
                  success: true,
                  results,
                  outputs,
                  paused: true,
                  wait: {
                    kind: "delay" as const,
                    resumeNodeIds: [nodeId],
                    resumeInMs: windowDelayMs,
                  },
                  variables,
                  resolvedNodeIds: Array.from(resolvedNodes),
                };
              }
            }

            const isAskQuestion = shouldTreatAsAskQuestion(
              actionType,
              processedConfig
            );
            const effectiveActionType = isAskQuestion
              ? "whatsapp/ask-question"
              : actionType;
            const stepContext: StepContext = {
              executionId,
              workflowId,
              nodeId: node.id,
              nodeName: getNodeName(node),
              nodeType: effectiveActionType,
            };

            const nextNodes = edgesBySource.get(node.id) || [];
            const actionInfo = findActionById(effectiveActionType);
            const shouldDebugAskQuestion =
              Boolean(processedConfig.variableKey) || isAskQuestion;
            const debugAskQuestion = shouldDebugAskQuestion
              ? {
                  nodeId: node.id,
                  nodeLabel: node.data.label ?? null,
                  actionType,
                  effectiveActionType,
                  actionId: actionInfo?.id ?? null,
                  actionSlug: actionInfo?.slug ?? null,
                  isAskQuestion,
                  forcedAskQuestion: isAskQuestion && !isAskQuestionAction(actionType),
                  variableKey: processedConfig.variableKey
                    ? String(processedConfig.variableKey)
                    : null,
                  messagePresent: Boolean(
                    typeof processedConfig.message === "string" &&
                      processedConfig.message.trim()
                  ),
                  toSource: processedConfig.toSource
                    ? String(processedConfig.toSource)
                    : null,
                  nextNodesCount: nextNodes.length,
                  triggerFrom: (triggerInput?.from as string | undefined) ?? null,
                  triggerTo: (triggerInput?.to as string | undefined) ?? null,
                  workflowId: workflowId ?? null,
                  executionId: executionId ?? null,
                  resumeNodeId: null as string | null,
                }
              : null;

            if (debugAskQuestion) {
              processedConfig._debugAskQuestion = debugAskQuestion;
              processedConfig._executionAudit = {
                actionType,
                effectiveActionType,
                isAskQuestion,
                forcedAskQuestion:
                  isAskQuestion && !isAskQuestionAction(actionType),
                hasVariableKey: Boolean(processedConfig.variableKey),
                hasMessage: Boolean(
                  typeof processedConfig.message === "string" &&
                    processedConfig.message.trim()
                ),
                toSource: processedConfig.toSource
                  ? String(processedConfig.toSource)
                  : null,
                nextNodesCount: nextNodes.length,
                resumeNodeId: debugAskQuestion.resumeNodeId,
              };
              console.info("[AskQuestion] Preflight:", debugAskQuestion);
            }

            let resumeNodeId: string | null = null;
            if (isAskQuestion) {
              if (nextNodes.length === 0) {
                if (debugAskQuestion) {
                  debugAskQuestion.resumeNodeId = null;
                  console.warn("[AskQuestion] No next node to resume:", {
                    ...debugAskQuestion,
                    reason: "missing_next_node",
                  });
                }
                result = {
                  success: false,
                  error: "Ask Question requires a following node to resume.",
                };
                results[nodeId] = result;
                resolvedNodes.add(nodeId);
                outputs[nodeId.replace(/[^a-zA-Z0-9]/g, "_")] = {
                  label: node.data.label || nodeId,
                  data: result.data,
                };
                continue;
              }
              if (nextNodes.length > 1) {
                if (debugAskQuestion) {
                  debugAskQuestion.resumeNodeId = null;
                  console.warn("[AskQuestion] Multiple next nodes:", {
                    ...debugAskQuestion,
                    reason: "multiple_next_nodes",
                  });
                }
                result = {
                  success: false,
                  error: "Ask Question supports only one outgoing path.",
                };
                results[nodeId] = result;
                resolvedNodes.add(nodeId);
                outputs[nodeId.replace(/[^a-zA-Z0-9]/g, "_")] = {
                  label: node.data.label || nodeId,
                  data: result.data,
                };
                continue;
              }
              resumeNodeId = nextNodes[0];
              processedConfig.resumeNodeId = resumeNodeId;
              if (debugAskQuestion) {
                debugAskQuestion.resumeNodeId = resumeNodeId;
                processedConfig._debugAskQuestion = debugAskQuestion;
              }
            }

            let stepResult = await executeActionStep({
              actionType: effectiveActionType,
              config: processedConfig,
              outputs,
              context: stepContext,
              triggerData: triggerInput ?? {},
              variables,
              executionDefaults,
            });
            if (stepResult && typeof stepResult === "object") {
              if (debugAskQuestion) {
                (stepResult as Record<string, unknown>)._debugAskQuestion =
                  debugAskQuestion;
              }
              (stepResult as Record<string, unknown>)._executionAudit =
                processedConfig._executionAudit ?? null;
            }

            const isErrorResult =
              stepResult &&
              typeof stepResult === "object" &&
              "success" in stepResult &&
              (stepResult as { success: boolean }).success === false;

            if (isErrorResult) {
              const errorResult = stepResult as {
                success: false;
                error?: string | { message: string };
              };
              const errorMessage =
                typeof errorResult.error === "string"
                  ? errorResult.error
                  : errorResult.error?.message ||
                    `Step "${actionType}" in node "${node.data.label || node.id}" failed without a specific error message.`;
              result = { success: false, error: errorMessage };
            } else {
              result = { success: true, data: stepResult };
            }

            if (isAskQuestion && result.success && resumeNodeId) {
              const variableKey = String(processedConfig.variableKey || "").trim();
              if (!variableKey) {
                if (debugAskQuestion) {
                  console.warn("[AskQuestion] Missing variable key:", {
                    ...debugAskQuestion,
                    reason: "missing_variable_key",
                  });
                }
                result = {
                  success: false,
                  error: "Ask Question requires a variable key.",
                };
              } else if (!workflowId || !executionId) {
                if (debugAskQuestion) {
                  console.warn("[AskQuestion] Missing workflow context:", {
                    ...debugAskQuestion,
                    reason: "missing_workflow_context",
                  });
                }
                result = {
                  success: false,
                  error: "Workflow context missing for Ask Question.",
                };
              } else {
                const supabase = getSupabaseAdmin();
                const phoneRaw = String(
                  (triggerInput?.from as string | undefined) ||
                    (triggerInput?.to as string | undefined) ||
                    ""
                );
                const normalizedPhone = normalizePhoneNumber(phoneRaw);
                if (!supabase) {
                  if (debugAskQuestion) {
                    console.warn("[AskQuestion] Supabase not configured:", {
                      ...debugAskQuestion,
                      reason: "supabase_not_configured",
                    });
                  }
                  result = {
                    success: false,
                    error: "Supabase not configured for conversation storage.",
                  };
                } else if (!normalizedPhone) {
                  if (debugAskQuestion) {
                    console.warn("[AskQuestion] Missing inbound phone:", {
                      ...debugAskQuestion,
                      reason: "missing_inbound_phone",
                      phoneRaw,
                    });
                  }
                  result = {
                    success: false,
                    error: "Missing inbound phone number for Ask Question.",
                  };
                } else {
                  const conversation = await createConversation({
                    supabase,
                    workflowId,
                    phone: normalizedPhone,
                    resumeNodeId,
                    variableKey,
                    variables,
                  });
                  if (!conversation) {
                    if (debugAskQuestion) {
                      console.warn("[AskQuestion] Failed to save conversation:", {
                        ...debugAskQuestion,
                        reason: "conversation_create_failed",
                        normalizedPhone,
                      });
                    }
                    result = {
                      success: false,
                      error: "Failed to save conversation.",
                    };
                  } else {
                    result = {
                      success: true,
                      data: {
                        send: stepResult,
                        conversationId: conversation.id,
                        resumeNodeId,
                        variableKey,
                      },
                    };
                    await supabase
                      .from("workflow_runs")
                      .update({
                        status: "waiting",
                        output: {
                          status: "waiting",
                          conversationId: conversation.id,
                          resumeNodeId,
                          variableKey,
                        },
                        finished_at: null,
                      })
                      .eq("id", executionId);
                    results[nodeId] = result;
                    resolvedNodes.add(nodeId);
                    outputs[nodeId.replace(/[^a-zA-Z0-9]/g, "_")] = {
                      label: node.data.label || nodeId,
                      data: result.data,
                    };
                    return {
                      success: true,
                      results,
                      outputs,
                      paused: true,
                      conversationId: conversation.id,
                      resumeNodeId,
                    };
                  }
                }
              }
            }
          }
        } else {
          result = {
            success: false,
            error: `Unknown node type "${node.data.type}" in node "${node.data.label || node.id}".`,
          };
        }
      } catch (error) {
        const errorMessage = await getErrorMessageAsync(error);
        result = { success: false, error: errorMessage };
      }

      results[nodeId] = result;
      resolvedNodes.add(nodeId);
      const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, "_");
      outputs[sanitizedNodeId] = {
        label: node.data.label || nodeId,
        data: result.data,
      };

      const nextNodes = edgesBySource.get(nodeId) || [];
      const isConditionNode =
        node.data.type === "action" &&
        node.data.config?.actionType === "Condition";
      let allowOutgoing = result.success;
      if (isConditionNode) {
        const conditionResult = (result.data as { condition?: boolean })
          ?.condition;
        allowOutgoing = conditionResult === true;
      }
      for (const next of nextNodes) {
        markEdgeResult(next, allowOutgoing ? "satisfied" : "blocked");
      }
    }

    const finalSuccess = Object.values(results).every((r) => r.success);
    const duration = Date.now() - workflowStartTime;

    console.log("[Workflow Executor] Workflow execution completed:", {
      success: finalSuccess,
      resultCount: Object.keys(results).length,
      duration,
    });

    // Update execution record if we have an executionId
    if (executionId) {
      try {
        await triggerStep({
          triggerData: {},
          _workflowComplete: {
            executionId,
            status: finalSuccess ? "success" : "error",
            output: Object.values(results).at(-1)?.data,
            error: Object.values(results).find((r) => !r.success)?.error,
            startTime: workflowStartTime,
          },
        });
        console.log("[Workflow Executor] Updated execution record");
      } catch (error) {
        console.error(
          "[Workflow Executor] Failed to update execution record:",
          error
        );
      }
    }

    return {
      success: finalSuccess,
      results,
      outputs,
    };
  } catch (error) {
    console.error(
      "[Workflow Executor] Fatal error during workflow execution:",
      error
    );

    const errorMessage = await getErrorMessageAsync(error);

    // Update execution record with error if we have an executionId
    if (executionId) {
      try {
        await triggerStep({
          triggerData: {},
          _workflowComplete: {
            executionId,
            status: "error",
            error: errorMessage,
            startTime: Date.now(),
          },
        });
      } catch (logError) {
        console.error("[Workflow Executor] Failed to log error:", logError);
      }
    }

    return {
      success: false,
      results,
      outputs,
      error: errorMessage,
    };
  }
}

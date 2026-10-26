import { z } from "zod";

export const WorkflowNodeTypeSchema = z.enum(["trigger", "action", "add"]);

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: WorkflowNodeTypeSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.object({
    label: z.string().default(""),
    description: z.string().optional(),
    type: WorkflowNodeTypeSchema,
    config: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["idle", "running", "success", "error"]).optional(),
    enabled: z.boolean().optional(),
  }),
  selected: z.boolean().optional(),
});

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().optional(),
});

export const WorkflowSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  visibility: z.enum(["private", "public"]).optional(),
});

export function validateWorkflowSchema(input: unknown) {
  let parsed:
    | { success: true; data: z.infer<typeof WorkflowSchema> }
    | { success: false; errors: ReturnType<z.ZodError<unknown>["flatten"]> };

  try {
    const result = WorkflowSchema.safeParse(input);
    if (!result.success) {
      return {
        success: false as const,
        errors: result.error.flatten(),
      };
    }
    parsed = { success: true, data: result.data };
  } catch {
    const fallback = basicWorkflowValidation(input);
    return fallback;
  }

  const nodes = parsed.data.nodes;
  const triggerCount = nodes.filter((n) => n.data.type === "trigger").length;
  if (triggerCount !== 1) {
    return {
      success: false as const,
      errors: {
        formErrors: [
          `O fluxo deve ter exatamente um node de gatilho (encontrado ${triggerCount}).`,
        ],
        fieldErrors: {},
      },
    };
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const invalidEdges = parsed.data.edges.filter(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
  );
  if (invalidEdges.length > 0) {
    return {
      success: false as const,
      errors: {
        formErrors: [
          `O fluxo tem ${invalidEdges.length} conexão(oes) com nodes ausentes.`,
        ],
        fieldErrors: {},
      },
    };
  }

  return { success: true as const, data: parsed.data };
}

function basicWorkflowValidation(input: unknown) {
  const payload = input as {
    nodes?: Array<{
      id?: string;
      data?: { type?: string };
    }>;
    edges?: Array<{ source?: string; target?: string }>;
  };

  if (!Array.isArray(payload?.nodes) || !Array.isArray(payload?.edges)) {
    return {
      success: false as const,
      errors: {
        formErrors: ["O payload do fluxo nao possui nodes ou conexões."],
        fieldErrors: {},
      },
    };
  }

  const nodes = payload.nodes;
  const triggerCount = nodes.filter((n) => n?.data?.type === "trigger").length;
  if (triggerCount !== 1) {
    return {
      success: false as const,
      errors: {
        formErrors: [
          `O fluxo deve ter exatamente um node de gatilho (encontrado ${triggerCount}).`,
        ],
        fieldErrors: {},
      },
    };
  }

  const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
  const invalidEdges = payload.edges.filter(
    (edge) => !nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)
  );
  if (invalidEdges.length > 0) {
    return {
      success: false as const,
      errors: {
        formErrors: [
          `O fluxo tem ${invalidEdges.length} conexão(oes) com nodes ausentes.`,
        ],
        fieldErrors: {},
      },
    };
  }

  return { success: true as const, data: payload };
}

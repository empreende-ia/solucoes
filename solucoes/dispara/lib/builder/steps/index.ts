/**
 * Step registry - maps action types to executable step functions
 * This allows the workflow executor to call step functions directly
 * without code generation or eval()
 */

import type { conditionStep } from "./condition";
import type { httpRequestStep } from "./http-request";

// Step function type
export type StepFunction = (input: Record<string, unknown>) => Promise<unknown>;

// Registry of all available steps
export const stepRegistry: Record<string, StepFunction> = {
  "HTTP Request": async (input) =>
    (await import("./http-request")).httpRequestStep(
      input as Parameters<typeof httpRequestStep>[0]
    ),
  Condition: async (input) =>
    (await import("./condition")).conditionStep(
      input as Parameters<typeof conditionStep>[0]
    ),
};

// Helper to check if a step exists
export function hasStep(actionType: string): boolean {
  return actionType in stepRegistry;
}

// Helper to get a step function
export function getStep(actionType: string): StepFunction | undefined {
  return stepRegistry[actionType];
}

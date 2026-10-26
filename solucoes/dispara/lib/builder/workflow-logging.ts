/**
 * Server-only workflow logging functions (Supabase-backed)
 * Uses workflow_runs / workflow_run_logs.
 */
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export type LogStepStartParams = {
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  input?: unknown;
};

export type LogStepStartResult = {
  logId: string;
  startTime: number;
};

export async function logStepStartDb(
  params: LogStepStartParams
): Promise<LogStepStartResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { logId: "", startTime: Date.now() };
  }

  const { data } = await supabase
    .from("workflow_run_logs")
    .insert({
      run_id: params.executionId,
      node_id: params.nodeId,
      node_name: params.nodeName,
      node_type: params.nodeType,
      status: "running",
      input: params.input ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  return {
    logId: data?.id ? String(data.id) : "",
    startTime: Date.now(),
  };
}

export type LogStepCompleteParams = {
  logId: string;
  startTime: number;
  status: "success" | "error";
  output?: unknown;
  error?: string;
};

export async function logStepCompleteDb(
  params: LogStepCompleteParams
): Promise<void> {
  if (!params.logId) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from("workflow_run_logs")
    .update({
      status: params.status,
      output: params.output ?? null,
      error: params.error ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.logId);
}

export type LogWorkflowCompleteParams = {
  executionId: string;
  status: "success" | "error";
  output?: unknown;
  error?: string;
  startTime: number;
};

export async function logWorkflowCompleteDb(
  params: LogWorkflowCompleteParams
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase
    .from("workflow_runs")
    .update({
      status: params.status,
      output: params.output ?? null,
      error: params.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", params.executionId);
}

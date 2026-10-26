import "server-only";

import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationState = {
  id: string;
  workflow_id: string;
  phone: string;
  status: "waiting" | "completed";
  resume_node_id?: string | null;
  variable_key?: string | null;
  variables?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export async function createConversation(params: {
  supabase: SupabaseClient;
  workflowId: string;
  phone: string;
  resumeNodeId?: string | null;
  variableKey?: string | null;
  variables?: Record<string, unknown> | null;
}): Promise<ConversationState | null> {
  const now = new Date().toISOString();
  const id = nanoid();
  const { data, error } = await params.supabase
    .from("workflow_conversations")
    .insert({
      id,
      workflow_id: params.workflowId,
      phone: params.phone,
      status: "waiting",
      resume_node_id: params.resumeNodeId ?? null,
      variable_key: params.variableKey ?? null,
      variables: params.variables ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    return null;
  }
  return data as ConversationState;
}

export async function getPendingConversation(
  supabase: SupabaseClient,
  phone: string
): Promise<ConversationState | null> {
  const { data } = await supabase
    .from("workflow_conversations")
    .select("*")
    .eq("phone", phone)
    .eq("status", "waiting")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return data as ConversationState;
}

export async function completeConversation(
  supabase: SupabaseClient,
  conversationId: string,
  variables: Record<string, unknown>
): Promise<void> {
  await supabase
    .from("workflow_conversations")
    .update({
      status: "completed",
      variables,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

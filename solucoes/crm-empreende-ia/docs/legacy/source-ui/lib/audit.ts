import { supabase } from "@/integrations/supabase/client";

export async function logAudit(params: {
  orgId: string;
  action: "create" | "update" | "delete" | "login" | "logout" | "export" | "import" | "invite";
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await (supabase as any).from("audit_logs").insert({
    org_id: params.orgId,
    user_id: user.id,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    old_values: params.oldValues || null,
    new_values: params.newValues || null,
    user_agent: navigator.userAgent,
  } as any);
}

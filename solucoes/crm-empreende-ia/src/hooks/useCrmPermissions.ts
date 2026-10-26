import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { crmDb } from "@/integrations/supabase/crm-client";

/** Presentation permissions mirror database policies; failures deny writes. */
export function useCrmPermissions() {
  const { user, loading: authLoading } = useAuth();
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["crm", orgId, "permissions", user?.id],
    enabled: Boolean(user?.id && orgId),
    queryFn: async () => {
      const { data, error } = await crmDb.from("user_roles").select("role")
        .eq("user_id", user!.id).eq("org_id", orgId!);
      if (error) throw error;
      return data.map((entry) => String(entry.role));
    },
    staleTime: 30_000,
  });
  const roles = query.data ?? [];
  const canManage = roles.some((role) => ["owner", "admin"].includes(role));
  return {
    canWrite: !query.isError && roles.some((role) => ["owner", "admin", "member"].includes(role)),
    canManage: !query.isError && canManage,
    loading: authLoading || (Boolean(user?.id && orgId) && query.isPending),
    error: query.error,
    roles,
  };
}

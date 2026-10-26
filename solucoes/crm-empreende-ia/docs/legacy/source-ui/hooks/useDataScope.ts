import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { supabase } from "@/integrations/supabase/client";
import { getVisibilityScope, type Scope } from "@/lib/roles";

interface DataScope {
  scope: Scope;
  userId: string | null;
  /** Whitelist de user_ids visíveis. `null` = sem restrição (org inteira). */
  allowedUserIds: string[] | null;
  loading: boolean;
}

/**
 * Determina o escopo de visibilidade de dados do usuário logado
 * de acordo com o papel (owner/admin/director/manager/member) e
 * retorna o conjunto de user_ids cujos registros podem ser exibidos.
 *
 * Funciona como complemento à RLS para esconder cards/contagens
 * no client com a mesma regra aplicada no banco.
 */
export function useDataScope(): DataScope {
  const { user, profile } = useAuth();
  const { orgId } = useOrg();

  // role vem de user_roles; aqui inferimos via profile metadata se existir;
  // caso contrário consultamos.
  const { data: role } = useQuery({
    queryKey: ["my-role", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return "member";
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      return ((data as any)?.role as string) || "member";
    },
    enabled: !!user?.id && !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const scope = getVisibilityScope(role);

  const { data: ids, isLoading } = useQuery({
    queryKey: ["data-scope-ids", user?.id, orgId, scope],
    queryFn: async (): Promise<string[] | null> => {
      if (!user?.id || !orgId) return [];
      if (scope === "org") return null;
      if (scope === "own") return [user.id];

      if (scope === "directorate") {
        const { data } = await (supabase as any).rpc("get_directorate_user_ids", {
          _user_id: user.id,
          _org_id: orgId,
        });
        const arr = ((data as unknown) as string[]) || [];
        // Diretor sempre vê os próprios dados também.
        return Array.from(new Set([...arr, user.id]));
      }

      if (scope === "team") {
        const { data } = await (supabase as any).rpc("get_team_user_ids", {
          _user_id: user.id,
          _org_id: orgId,
        });
        const arr = ((data as unknown) as string[]) || [];
        return Array.from(new Set([...arr, user.id]));
      }

      return [user.id];
    },
    enabled: !!user?.id && !!orgId && !!role,
    staleTime: 5 * 60 * 1000,
  });

  return {
    scope,
    userId: user?.id ?? null,
    allowedUserIds: ids === undefined ? null : ids,
    loading: isLoading,
  };
}

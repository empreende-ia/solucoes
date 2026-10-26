import { useAuth } from "@/contexts/AuthContext";

export function useOrg() {
  const { profile } = useAuth();
  return { orgId: profile?.org_id ?? null };
}

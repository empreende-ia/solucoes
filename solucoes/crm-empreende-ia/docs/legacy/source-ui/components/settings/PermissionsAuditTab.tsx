import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, Eye, AlertTriangle, Star } from "lucide-react";
import { Panel, PanelHeader, PanelBody } from "@/components/foundation/Panel";
import { StatStrip } from "@/components/foundation/StatStrip";
import { ROLE_LABELS } from "@/lib/roles";

interface AuditResult {
  user_id: string;
  role: string;
  scope: "org" | "directorate" | "team" | "own";
  directorate_ids: string[];
  team_ids: string[];
  allowed_user_ids: string[];
  counts: { deals: number; contacts: number; activities: number };
}

const SCOPE_LABELS: Record<string, string> = {
  org: "Toda a organização",
  directorate: "Sua diretoria",
  team: "Sua equipe",
  own: "Apenas próprios dados",
};

const SCOPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  org: "default",
  directorate: "secondary",
  team: "secondary",
  own: "outline",
};

export function PermissionsAuditTab() {
  const { user, profile } = useAuth();
  const { orgId } = useOrg();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Caller must be owner/admin (RPC also checks server-side)
  const { data: myRole } = useQuery({
    queryKey: ["my-role-audit", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return null;
      const { data } = await (supabase as any)
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("org_id", orgId).maybeSingle();
      return (data as any)?.role ?? null;
    },
    enabled: !!user?.id && !!orgId,
  });

  const isAdmin = myRole === "owner" || myRole === "admin";

  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ["org-profiles", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,name,email")
        .eq("org_id", orgId)
        .order("name");
      return data ?? [];
    },
    enabled: !!orgId && isAdmin,
  });

  const targetId = selectedUserId ?? user?.id ?? null;

  const { data: audit, isLoading: loadingAudit, error } = useQuery({
    queryKey: ["audit-visibility", targetId, orgId],
    queryFn: async (): Promise<AuditResult | null> => {
      if (!targetId || !orgId) return null;
      const { data, error } = await (supabase as any).rpc("audit_user_visibility", {
        _user_id: targetId,
        _org_id: orgId,
      });
      if (error) throw error;
      return data as unknown as AuditResult;
    },
    enabled: !!targetId && !!orgId && isAdmin,
  });

  const memberById = useMemo(() => {
    const map = new Map<string, { name: string | null; email: string | null }>();
    (members ?? []).forEach((m) => map.set(m.id, { name: m.name, email: m.email }));
    return map;
  }, [members]);

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Acesso restrito</AlertTitle>
        <AlertDescription>
          Apenas Donos e Administradores podem auditar permissões.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Diagnóstico de permissões"
          description="Selecione um usuário para ver exatamente o que ele enxerga na plataforma. Os resultados refletem a mesma lógica aplicada pelas políticas do banco (RLS)."
        />
        <PanelBody className="space-y-4">
          <div className="max-w-md">
            <Select
              value={targetId ?? undefined}
              onValueChange={(v) => setSelectedUserId(v)}
              disabled={loadingMembers}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um usuário" />
              </SelectTrigger>
              <SelectContent>
                {(members ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email || m.id}
                    {m.id === user?.id ? " (você)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingAudit && <Skeleton className="h-40 w-full" />}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro ao consultar auditoria</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          )}

          {audit && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Papel: {ROLE_LABELS[audit.role] ?? audit.role}</Badge>
                <Badge variant={SCOPE_VARIANTS[audit.scope]}>
                  Escopo: {SCOPE_LABELS[audit.scope]}
                </Badge>
                <Badge variant="outline">
                  {audit.directorate_ids.length} diretoria(s) · {audit.team_ids.length} equipe(s)
                </Badge>
              </div>

              <StatStrip
                stats={[
                  { label: "Deals visíveis", value: audit.counts.deals },
                  { label: "Contatos visíveis", value: audit.counts.contacts },
                  { label: "Atividades visíveis", value: audit.counts.activities },
                ]}
              />

              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Usuários cujos registros são visíveis
                  <span className="text-muted-foreground">({audit.allowed_user_ids.length})</span>
                </h4>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-auto rounded-lg border border-border p-2">
                  {audit.allowed_user_ids.length === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhum.</span>
                  )}
                  {audit.allowed_user_ids.map((uid) => {
                    const m = memberById.get(uid);
                    const label = m?.name || m?.email || uid.slice(0, 8);
                    return (
                      <Badge key={uid} variant="secondary" className="gap-1 font-normal">
                        {label}
                        {uid === audit.user_id && <Star aria-label="usuário auditado" className="h-3 w-3 fill-current text-warning" />}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <Alert>
                <Eye className="h-4 w-4" />
                <AlertTitle>Checklist manual rápido</AlertTitle>
                <AlertDescription>
                  Para validar na prática: crie um deal como um Corretor X, depois logue
                  como (a) gerente da mesma equipe — deve ver; (b) gerente de outra equipe
                  — não deve ver; (c) diretor da mesma diretoria — deve ver; (d) diretor de
                  outra diretoria — não deve ver.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

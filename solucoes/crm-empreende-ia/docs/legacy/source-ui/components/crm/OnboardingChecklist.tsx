import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ds/button";
import { Panel } from "@/components/foundation/Panel";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronDown, ChevronUp, X, Rocket, UserCircle, CalendarCheck2, Users, ClipboardList, UserPlus, MessageSquare, Database } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { generateDemoData } from "@/lib/demoData";

interface OnboardingData {
  profile_configured: boolean;
  pipeline_created: boolean;
  contact_created: boolean;
  deal_created: boolean;
  member_invited: boolean;
  email_connected: boolean;
  demo_loaded: boolean;
  completed: boolean;
  dismissed_at: string | null;
}

const steps = [
  { key: "profile_configured" as const, label: "Perfil configurado", icon: UserCircle, path: "/settings" },
  { key: "pipeline_created" as const, label: "Primeira consulta agendada", icon: CalendarCheck2, path: "/agenda" },
  { key: "contact_created" as const, label: "Primeiro paciente cadastrado", icon: Users, path: "/patients" },
  { key: "deal_created" as const, label: "Prontuário criado", icon: ClipboardList, path: "/records" },
  { key: "member_invited" as const, label: "Equipe convidada", icon: UserPlus, path: "/team" },
  { key: "email_connected" as const, label: "WhatsApp conectado", icon: MessageSquare, path: "/settings/integrations" },
];

export function OnboardingChecklist() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const fetchProgress = useCallback(async () => {
    if (!user?.id || !orgId) return;
    const { data: row } = await (supabase as any)
      .from("onboarding_progress")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row) {
      // Create initial row
      const { data: created } = await (supabase as any).from("onboarding_progress")
        .insert({ user_id: user.id, org_id: orgId } as any)
        .select()
        .single();
      setData(created as any);
    } else {
      setData(row as any);
    }
    setLoading(false);
  }, [user?.id, orgId]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  // Auto-check progress by querying actual data
  useEffect(() => {
    if (!orgId || !user?.id || !data) return;
    const check = async () => {
      const updates: Partial<OnboardingData> = {};

      // Check profile
      if (!data.profile_configured) {
        const { data: p } = await (supabase as any).from("profiles").select("name, title").eq("id", user.id).single();
        if (p?.name && p.name !== user.email?.split("@")[0]) updates.profile_configured = true;
      }
      // Check first appointment (replaces pipeline)
      if (!data.pipeline_created) {
        const { count } = await (supabase as any)
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .not("appointment_status", "is", null);
        if ((count ?? 0) > 0) updates.pipeline_created = true;
      }
      // Check first patient (replaces contact)
      if (!data.contact_created) {
        const { count } = await (supabase as any)
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.contact_created = true;
      }
      // Check first medical record (replaces deal)
      if (!data.deal_created) {
        const { count } = await (supabase as any)
          .from("medical_records")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.deal_created = true;
      }
      // Check member invited
      if (!data.member_invited) {
        const { count } = await (supabase as any).from("invitations").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.member_invited = true;
      }
      // Check WhatsApp integration (replaces email)
      if (!data.email_connected) {
        const { count } = await (supabase as any)
          .from("integration_configs")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("provider", "whatsapp")
          .eq("is_active", true);
        if ((count ?? 0) > 0) updates.email_connected = true;
      }

      if (Object.keys(updates).length > 0) {
        await (supabase as any).from("onboarding_progress").update(updates as any).eq("user_id", user.id);
        setData((prev) => prev ? { ...prev, ...updates } : prev);
      }
    };
    check();
  }, [orgId, user?.id, data?.completed]);

  const completedCount = data ? steps.filter((s) => data[s.key]).length : 0;
  const progress = (completedCount / steps.length) * 100;

  const handleDismiss = async () => {
    if (!user?.id) return;
    await (supabase as any).from("onboarding_progress").update({ dismissed_at: new Date().toISOString(), completed: true } as any).eq("user_id", user.id);
    setData((prev) => prev ? { ...prev, dismissed_at: new Date().toISOString(), completed: true } : prev);
  };

  const handleLoadDemo = async () => {
    if (!orgId || !user?.id) return;
    setLoadingDemo(true);
    try {
      const counts = await generateDemoData(orgId, user.id);
      await (supabase as any).from("onboarding_progress").update({
        demo_loaded: true, pipeline_created: true, contact_created: true,
      } as any).eq("user_id", user.id);
      setData((prev) => prev ? { ...prev, demo_loaded: true, pipeline_created: true, contact_created: true } : prev);
      toast({
        title: "Dados de demonstração carregados!",
        description: `${counts.patients} pacientes, ${counts.appointments} consultas e ${counts.payments} pagamentos criados.`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao carregar demo", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoadingDemo(false);
    }
  };

  if (loading || !data || data.completed || data.dismissed_at) return null;

  return (
    <Panel className="fixed bottom-20 right-4 z-40 w-80 shadow-sm md:bottom-24 md:right-6" role="complementary" aria-label="Onboarding">
      <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Primeiros Passos</span>
          <span className="text-xs text-muted-foreground">{completedCount}/{steps.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); handleDismiss(); }} className="p-1 rounded hover:bg-muted" aria-label="Fechar onboarding">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      <div className="px-3 pb-1">
        <Progress value={progress} className="h-1.5" />
      </div>

      {expanded && (
        <div className="p-3 pt-2 space-y-1">
          {steps.map((step) => {
            const done = data[step.key];
            return (
              <button
                key={step.key}
                onClick={() => !done && navigate(step.path)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${done ? "text-muted-foreground" : "hover:bg-muted text-foreground"}`}
                disabled={done}
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${done ? "border-primary bg-primary" : "border-border"}`}>
                  {done && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <step.icon className="h-3.5 w-3.5" />
                <span className={done ? "line-through" : ""}>{step.label}</span>
              </button>
            );
          })}

          {!data.demo_loaded && (
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleLoadDemo} disabled={loadingDemo}>
              <Database className="mr-2 h-3.5 w-3.5" />
              {loadingDemo ? "Carregando..." : "Carregar dados de demonstração"}
            </Button>
          )}

          {completedCount === steps.length && (
            <Button size="sm" className="w-full mt-2" onClick={handleDismiss}>
              <Check className="mr-2 h-4 w-4" />Setup completo!
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { Target, Plus } from "lucide-react";
import { PageScaffold } from "@/components/shell/PageScaffold";
import { Panel } from "@/components/foundation/Panel";
import { SidePanel } from "@/components/foundation/SidePanel";
import { StatusChip } from "@/components/foundation/StatusChip";
import { EmptyState } from "@/components/foundation/EmptyState";
import { LoadingState } from "@/components/foundation/LoadingState";

interface Goal {
  id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period_month: number;
  period_year: number;
  user_id: string | null;
}

const GOAL_TYPES: Record<string, string> = {
  appointments: "Consultas atendidas",
  revenue: "Receita",
  new_patients: "Novos pacientes",
  no_show_reduction: "Redução de no-show",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function HealthGoals() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [goalType, setGoalType] = useState("appointments");
  const [target, setTarget] = useState<string>("");
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const fetchGoals = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("health_goals")
        .select("id,goal_type,target_value,current_value,period_month,period_year,user_id")
        .eq("org_id", orgId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      setGoals((data ?? []) as Goal[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar metas", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => { void fetchGoals(); }, [fetchGoals]);

  const handleSave = async () => {
    if (!orgId) return;
    const t = Number(target.replace(",", "."));
    if (!Number.isFinite(t) || t <= 0) {
      toast({ title: "Meta inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("health_goals").insert({
        org_id: orgId,
        goal_type: goalType,
        target_value: t,
        current_value: 0,
        period_month: month,
        period_year: year,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Meta criada" });
      setOpen(false);
      setTarget("");
      void fetchGoals();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sorted = useMemo(() => goals, [goals]);

  return (
    <PageScaffold
      title="Metas"
      meta={
        !loading ? (
          <StatusChip tone="neutral" dot={false}>
            {sorted.length} meta{sorted.length === 1 ? "" : "s"}
          </StatusChip>
        ) : undefined
      }
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nova meta
        </Button>
      }
    >
      {loading ? (
        <LoadingState label="Carregando metas…" />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta definida"
          description="Defina metas mensais para consultas, receita ou novos pacientes."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Criar primeira meta
            </Button>
          }
        />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-border/60">
            {sorted.map((g) => {
              const pct = g.target_value > 0
                ? Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100))
                : 0;
              return (
                <li key={g.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {GOAL_TYPES[g.goal_type] ?? g.goal_type}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {MONTHS[g.period_month - 1]}/{g.period_year}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2 text-sm">
                      <span className="tabular-nums text-foreground">
                        {Number(g.current_value)} / {Number(g.target_value)}
                      </span>
                      <span className={pct >= 100 ? "text-xs font-medium text-success" : "text-xs text-muted-foreground"}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <Progress value={pct} className="mt-3 h-1.5" />
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <SidePanel
        open={open}
        onOpenChange={setOpen}
        kicker="Metas"
        title="Nova meta"
        description="Defina meta mensal para um indicador da clínica."
        width="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar meta"}</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={goalType} onValueChange={setGoalType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GOAL_TYPES).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (<SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Meta (valor numérico)</Label>
            <Input
              inputMode="decimal" value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="Ex: 120"
            />
          </div>
        </div>
      </SidePanel>
    </PageScaffold>
  );
}

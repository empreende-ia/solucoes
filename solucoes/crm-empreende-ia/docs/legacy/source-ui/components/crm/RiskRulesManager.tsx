import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusChip } from "@/components/foundation/StatusChip";
import { Panel } from "@/components/foundation/Panel";
import { SidePanel } from "@/components/foundation/SidePanel";
import { LoadingState } from "@/components/foundation/LoadingState";
import { EmptyState } from "@/components/foundation/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Plus, Pencil, Trash2, Settings2, Clock, CalendarClock, AlertTriangle, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface RiskRule {
  id: string;
  org_id: string;
  name: string;
  metric: string;
  threshold_days: number;
  risk_level: string;
  applies_to: string;
  is_active: boolean;
  created_at: string;
}

const METRICS = [
  { value: "inactivity", label: "Inatividade (dias sem atividade)", icon: Clock },
  { value: "follow_up_overdue", label: "Follow-up vencido", icon: CalendarClock },
  { value: "close_date_approaching", label: "Proximidade de fechamento", icon: AlertTriangle },
  { value: "no_activity_since_creation", label: "Sem atividade desde criação", icon: Activity },
];

const RISK_LEVELS = [
  { value: "medium", label: "Médio" },
  { value: "high", label: "Alto" },
];

const APPLIES_TO = [
  { value: "deals", label: "Negócios" },
  { value: "contacts", label: "Contatos" },
  { value: "both", label: "Ambos" },
];

interface RiskRulesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RiskRulesManager({ open, onOpenChange }: RiskRulesManagerProps) {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RiskRule | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("inactivity");
  const [thresholdDays, setThresholdDays] = useState(7);
  const [riskLevel, setRiskLevel] = useState("medium");
  const [appliesTo, setAppliesTo] = useState("deals");

  const fetchRules = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("risk_rules")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setRules(((data as unknown) as RiskRule[]) || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (open) fetchRules();
  }, [open, fetchRules]);

  const resetForm = () => {
    setName("");
    setMetric("inactivity");
    setThresholdDays(7);
    setRiskLevel("medium");
    setAppliesTo("deals");
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (rule: RiskRule) => {
    setEditing(rule);
    setName(rule.name);
    setMetric(rule.metric);
    setThresholdDays(rule.threshold_days);
    setRiskLevel(rule.risk_level);
    setAppliesTo(rule.applies_to);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!orgId || !name.trim()) return;
    const payload = {
      org_id: orgId,
      name: name.trim(),
      metric,
      threshold_days: thresholdDays,
      risk_level: riskLevel,
      applies_to: appliesTo,
    };

    if (editing) {
      await (supabase as any).from("risk_rules").update(payload).eq("id", editing.id);
      toast({ title: "Regra atualizada" });
    } else {
      await (supabase as any).from("risk_rules").insert(payload);
      toast({ title: "Regra criada" });
    }
    setFormOpen(false);
    resetForm();
    fetchRules();
  };

  const toggleActive = async (rule: RiskRule) => {
    await (supabase as any).from("risk_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    fetchRules();
  };

  const deleteRule = async (id: string) => {
    await (supabase as any).from("risk_rules").delete().eq("id", id);
    toast({ title: "Regra excluída" });
    fetchRules();
  };

  const metricLabel = (m: string) => METRICS.find((x) => x.value === m)?.label || m;
  const MetricIcon = (m: string) => METRICS.find((x) => x.value === m)?.icon || Clock;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[460px] sm:max-w-[460px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Regras de Risco
            </SheetTitle>
            <SheetDescription>
              Configure regras customizadas para identificar negócios e contatos em risco
            </SheetDescription>
          </SheetHeader>

          <div className="p-3 border-b border-border">
            <Button onClick={openCreate} size="sm" className="w-full">
              <Plus className="mr-2 h-4 w-4" />Nova regra
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {loading && <LoadingState className="py-8" />}
              {!loading && rules.length === 0 && (
                <EmptyState
                  icon={Settings2}
                  title="Nenhuma regra criada"
                  description="Crie sua primeira regra de risco."
                  className="py-10"
                />
              )}
              {rules.map((rule) => {
                const Icon = MetricIcon(rule.metric);
                return (
                  <Panel key={rule.id} className={`transition-opacity ${!rule.is_active ? "opacity-50" : ""}`}>
                    <div className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{rule.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Icon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{metricLabel(rule.metric)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={() => toggleActive(rule)}
                            aria-label="Ativar/desativar regra"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusChip tone="neutral" dot={false} className="text-xs">
                          {rule.threshold_days} dias
                        </StatusChip>
                        <StatusChip
                          tone={rule.risk_level === "high" ? "danger" : "warning"}
                          className="text-xs"
                        >
                          {rule.risk_level === "high" ? "Alto risco" : "Médio risco"}
                        </StatusChip>
                        <StatusChip tone="neutral" dot={false} className="text-xs">
                          {APPLIES_TO.find((x) => x.value === rule.applies_to)?.label}
                        </StatusChip>
                      </div>
                      <div className="flex gap-1 mt-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(rule)}>
                          <Pencil className="mr-1 h-3 w-3" />Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => deleteRule(rule.id)}>
                          <Trash2 className="mr-1 h-3 w-3" />Excluir
                        </Button>
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Create/Edit SidePanel */}
      <SidePanel
        open={formOpen}
        onOpenChange={setFormOpen}
        width="sm"
        kicker="Regras de risco"
        title={editing ? "Editar regra" : "Nova regra de risco"}
        description="Defina quando um negócio ou contato deve ser considerado em risco"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              {editing ? "Salvar" : "Criar regra"}
            </Button>
          </>
        }
      >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da regra</Label>
              <Input
                placeholder="Ex: Inatividade crítica"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Métrica</Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Threshold (dias)</Label>
              <Input
                type="number"
                min={1}
                value={thresholdDays}
                onChange={(e) => setThresholdDays(Number(e.target.value) || 1)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nível de risco</Label>
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Aplica-se a</Label>
                <Select value={appliesTo} onValueChange={setAppliesTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPLIES_TO.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
      </SidePanel>
    </>
  );
}

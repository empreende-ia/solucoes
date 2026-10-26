import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ds/button";
import { StatusChip } from "@/components/foundation/StatusChip";
import { Panel } from "@/components/foundation/Panel";
import { StatStrip } from "@/components/foundation/StatStrip";
import { LoadingState } from "@/components/foundation/LoadingState";
import { EmptyState } from "@/components/foundation/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ds/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { AlertTriangle, Clock, TrendingDown, Settings2, User, Briefcase, Activity, ShieldCheck } from "lucide-react";
import { RiskRulesManager, type RiskRule } from "./RiskRulesManager";
import type { Database } from "@/integrations/supabase/types";

type Deal = any;
type Contact = any;
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

function formatCurrency(v: number, c: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(v);
}

function daysBetween(d1: Date, d2: Date) {
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000);
}

interface AtRiskItem {
  id: string;
  type: "deal" | "contact";
  title: string;
  subtitle?: string;
  value?: number;
  currency?: string;
  riskLevel: "high" | "medium";
  violations: { ruleName: string; metric: string; days: number }[];
  stage?: Stage;
}

interface AtRiskPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Default fallback rules if none configured
const DEFAULT_RULES: Omit<RiskRule, "id" | "org_id" | "created_at">[] = [
  { name: "Inatividade média", metric: "inactivity", threshold_days: 14, risk_level: "medium", applies_to: "both", is_active: true },
  { name: "Inatividade alta", metric: "inactivity", threshold_days: 21, risk_level: "high", applies_to: "both", is_active: true },
  { name: "Fechamento próximo", metric: "close_date_approaching", threshold_days: 7, risk_level: "medium", applies_to: "deals", is_active: true },
  { name: "Fechamento atrasado", metric: "close_date_approaching", threshold_days: 0, risk_level: "high", applies_to: "deals", is_active: true },
];

export function AtRiskPanel({ open, onOpenChange }: AtRiskPanelProps) {
  const { orgId } = useOrg();
  const [items, setItems] = useState<AtRiskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const fetchAtRisk = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [dealsRes, contactsRes, activitiesRes, stagesRes, rulesRes] = await Promise.all([
        (supabase as any).from("deals").select("*").eq("org_id", orgId).eq("status", "open"),
        (supabase as any).from("contacts").select("*").eq("org_id", orgId),
        (supabase as any).from("activities").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        (supabase as any).from("pipeline_stages").select("*").eq("org_id", orgId),
        (supabase as any).from("risk_rules").select("*").eq("org_id", orgId).eq("is_active", true),
      ]);

      const deals = dealsRes.data || [];
      const contacts = contactsRes.data || [];
      const activities = activitiesRes.data || [];
      const stages = stagesRes.data || [];
      const dbRules = (rulesRes.data as RiskRule[]) || [];

      // Use DB rules or defaults
      const activeRules = dbRules.length > 0 ? dbRules : DEFAULT_RULES.map((r, i) => ({
        ...r, id: `default-${i}`, org_id: orgId, created_at: "",
      }));

      // Build last activity maps
      const lastActivityByDeal = new Map<string, Date>();
      const lastActivityByContact = new Map<string, Date>();
      activities.forEach((a) => {
        if (a.deal_id && a.created_at) {
          const d = new Date(a.created_at);
          const existing = lastActivityByDeal.get(a.deal_id);
          if (!existing || d > existing) lastActivityByDeal.set(a.deal_id, d);
        }
        if (a.contact_id && a.created_at) {
          const d = new Date(a.created_at);
          const existing = lastActivityByContact.get(a.contact_id);
          if (!existing || d > existing) lastActivityByContact.set(a.contact_id, d);
        }
      });

      // Build overdue follow-ups
      const overdueFollowUpByDeal = new Map<string, number>();
      const overdueFollowUpByContact = new Map<string, number>();
      const now = new Date();
      activities.forEach((a) => {
        if (a.due_date && !a.completed_at) {
          const due = new Date(a.due_date);
          const overdueDays = daysBetween(due, now);
          if (overdueDays > 0) {
            if (a.deal_id) {
              const existing = overdueFollowUpByDeal.get(a.deal_id) || 0;
              if (overdueDays > existing) overdueFollowUpByDeal.set(a.deal_id, overdueDays);
            }
            if (a.contact_id) {
              const existing = overdueFollowUpByContact.get(a.contact_id) || 0;
              if (overdueDays > existing) overdueFollowUpByContact.set(a.contact_id, overdueDays);
            }
          }
        }
      });

      const dealRules = activeRules.filter((r) => r.applies_to === "deals" || r.applies_to === "both");
      const contactRules = activeRules.filter((r) => r.applies_to === "contacts" || r.applies_to === "both");

      const result: AtRiskItem[] = [];

      // Evaluate deals
      deals.forEach((deal) => {
        const violations: AtRiskItem["violations"] = [];
        let worstRisk: "high" | "medium" | null = null;

        dealRules.forEach((rule) => {
          let days = 0;
          let triggered = false;

          switch (rule.metric) {
            case "inactivity": {
              const lastAct = lastActivityByDeal.get(deal.id);
              days = lastAct ? daysBetween(lastAct, now) : (deal.created_at ? daysBetween(new Date(deal.created_at), now) : 999);
              triggered = days >= rule.threshold_days;
              break;
            }
            case "follow_up_overdue": {
              days = overdueFollowUpByDeal.get(deal.id) || 0;
              triggered = days >= rule.threshold_days;
              break;
            }
            case "close_date_approaching": {
              if (deal.close_date) {
                const daysToClose = daysBetween(now, new Date(deal.close_date));
                if (rule.threshold_days === 0) {
                  triggered = daysToClose < 0;
                  days = Math.abs(daysToClose);
                } else {
                  triggered = daysToClose >= 0 && daysToClose <= rule.threshold_days;
                  days = daysToClose;
                }
              }
              break;
            }
            case "no_activity_since_creation": {
              const hasActivity = lastActivityByDeal.has(deal.id);
              if (!hasActivity && deal.created_at) {
                days = daysBetween(new Date(deal.created_at), now);
                triggered = days >= rule.threshold_days;
              }
              break;
            }
          }

          if (triggered) {
            violations.push({ ruleName: rule.name, metric: rule.metric, days });
            const level = rule.risk_level as "high" | "medium";
            if (!worstRisk || level === "high") worstRisk = level;
          }
        });

        if (violations.length > 0 && worstRisk) {
          result.push({
            id: deal.id,
            type: "deal",
            title: deal.title,
            value: Number(deal.value) || 0,
            currency: deal.currency || "BRL",
            riskLevel: worstRisk,
            violations,
            stage: stages.find((s) => s.id === deal.stage_id),
          });
        }
      });

      // Evaluate contacts
      contacts.forEach((contact) => {
        const violations: AtRiskItem["violations"] = [];
        let worstRisk: "high" | "medium" | null = null;

        contactRules.forEach((rule) => {
          let days = 0;
          let triggered = false;

          switch (rule.metric) {
            case "inactivity": {
              const lastAct = lastActivityByContact.get(contact.id);
              days = lastAct ? daysBetween(lastAct, now) : (contact.created_at ? daysBetween(new Date(contact.created_at), now) : 999);
              triggered = days >= rule.threshold_days;
              break;
            }
            case "follow_up_overdue": {
              days = overdueFollowUpByContact.get(contact.id) || 0;
              triggered = days >= rule.threshold_days;
              break;
            }
            case "no_activity_since_creation": {
              const hasActivity = lastActivityByContact.has(contact.id);
              if (!hasActivity && contact.created_at) {
                days = daysBetween(new Date(contact.created_at), now);
                triggered = days >= rule.threshold_days;
              }
              break;
            }
          }

          if (triggered) {
            violations.push({ ruleName: rule.name, metric: rule.metric, days });
            const level = rule.risk_level as "high" | "medium";
            if (!worstRisk || level === "high") worstRisk = level;
          }
        });

        if (violations.length > 0 && worstRisk) {
          result.push({
            id: contact.id,
            type: "contact",
            title: `${contact.first_name} ${contact.last_name || ""}`.trim(),
            subtitle: contact.email || undefined,
            riskLevel: worstRisk,
            violations,
          });
        }
      });

      // Sort: high risk first, then by worst violation days
      result.sort((a, b) => {
        if (a.riskLevel !== b.riskLevel) return a.riskLevel === "high" ? -1 : 1;
        const maxA = Math.max(...a.violations.map((v) => v.days));
        const maxB = Math.max(...b.violations.map((v) => v.days));
        return maxB - maxA;
      });

      setItems(result);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (open) fetchAtRisk();
  }, [open, fetchAtRisk]);

  const dealItems = items.filter((i) => i.type === "deal");
  const contactItems = items.filter((i) => i.type === "contact");
  const highRisk = items.filter((i) => i.riskLevel === "high");
  const totalDealValue = dealItems.reduce((s, d) => s + (d.value || 0), 0);

  const metricIcon = (metric: string) => {
    switch (metric) {
      case "inactivity": return <Clock className="h-2.5 w-2.5" />;
      case "follow_up_overdue": return <TrendingDown className="h-2.5 w-2.5" />;
      case "close_date_approaching": return <AlertTriangle className="h-2.5 w-2.5" />;
      case "no_activity_since_creation": return <Activity className="h-2.5 w-2.5" />;
      default: return <Clock className="h-2.5 w-2.5" />;
    }
  };

  const RiskCard = ({ item }: { item: AtRiskItem }) => (
    <Panel className={`border-l-4 ${item.riskLevel === "high" ? "border-l-destructive" : "border-l-warning"}`}>
      <div className="p-3">
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            {item.type === "deal" ? (
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <p className="text-sm font-medium leading-tight">{item.title}</p>
          </div>
          {item.value !== undefined && item.value > 0 && (
            <span className="text-sm font-semibold text-primary tabular-nums shrink-0 ml-2">
              {formatCurrency(item.value, item.currency)}
            </span>
          )}
        </div>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground mb-1">{item.subtitle}</p>
        )}
        {item.stage && (
          <StatusChip tone="neutral" dot={false} className="mb-1.5 text-xs">{item.stage.name}</StatusChip>
        )}
        <div className="space-y-0.5">
          {item.violations.map((v, i) => (
            <div key={i} className={`text-xs flex items-center gap-1 ${item.riskLevel === "high" ? "text-destructive" : "text-warning"}`}>
              {metricIcon(v.metric)}
              <span className="font-medium">{v.ruleName}:</span>
              <span>{v.days}d</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[420px] sm:max-w-[420px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Em Risco
              </SheetTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRulesOpen(true)}>
                <Settings2 className="mr-1 h-3.5 w-3.5" />Regras
              </Button>
            </div>
            <SheetDescription>
              {items.length} itens precisam de atenção
            </SheetDescription>
            <StatStrip
              className="mt-2"
              stats={[
                { label: "Alto risco", value: <span className="text-destructive">{highRisk.length}</span> },
                { label: "Médio risco", value: <span className="text-warning">{items.length - highRisk.length}</span> },
                { label: "Valor em risco", value: <span className="text-base tabular-nums">{formatCurrency(totalDealValue)}</span> },
              ]}
            />
          </SheetHeader>

          <Tabs defaultValue="deals" className="flex-1 flex flex-col">
            <TabsList className="mx-3 mt-2">
              <TabsTrigger value="deals" className="text-xs">
                <Briefcase className="mr-1 h-3 w-3" />Negócios ({dealItems.length})
              </TabsTrigger>
              <TabsTrigger value="contacts" className="text-xs">
                <User className="mr-1 h-3 w-3" />Contatos ({contactItems.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="deals" className="flex-1 mt-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="p-3 space-y-2">
                  {loading && <LoadingState className="py-8" />}
                  {!loading && dealItems.length === 0 && (
                    <EmptyState
                      icon={ShieldCheck}
                      title="Nenhum negócio em risco"
                      description="Todos os negócios estão dentro das regras configuradas."
                      className="py-10"
                    />
                  )}
                  {dealItems.map((item) => <RiskCard key={item.id} item={item} />)}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="contacts" className="flex-1 mt-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="p-3 space-y-2">
                  {loading && <LoadingState className="py-8" />}
                  {!loading && contactItems.length === 0 && (
                    <EmptyState
                      icon={ShieldCheck}
                      title="Nenhum contato em risco"
                      description="Todos os contatos estão dentro das regras configuradas."
                      className="py-10"
                    />
                  )}
                  {contactItems.map((item) => <RiskCard key={item.id} item={item} />)}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <RiskRulesManager open={rulesOpen} onOpenChange={(v) => { setRulesOpen(v); if (!v) fetchAtRisk(); }} />
    </>
  );
}

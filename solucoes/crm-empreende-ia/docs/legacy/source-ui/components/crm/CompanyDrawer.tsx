import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useIndustries } from "@/hooks/useIndustries";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ds/tabs";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { InitialsAvatar } from "@/components/foundation/InitialsAvatar";
import { StatusChip } from "@/components/foundation/StatusChip";
import { StatStrip } from "@/components/foundation/StatStrip";
import { Panel } from "@/components/foundation/Panel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { Edit2, X, Save, Globe, Users, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Company = any;
type Contact = any;
type Deal = any;
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

interface CompanyDrawerProps {
  company: Company | null;
  onClose: () => void;
  onUpdate: () => void;
  members: Profile[];
}

export function CompanyDrawer({ company, onClose, onUpdate, members }: CompanyDrawerProps) {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const { industries } = useIndustries();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const fetchRelated = useCallback(async () => {
    if (!company) return;
    const [cRes, dRes, sRes] = await Promise.all([
      (supabase as any).from("contacts").select("*").eq("company_id", company.id),
      (supabase as any).from("deals").select("*").eq("company_id", company.id),
      (supabase as any).from("pipeline_stages").select("*").eq("org_id", company.org_id).order("order"),
    ]);
    setContacts(cRes.data || []);
    setDeals(dRes.data || []);
    setStages(sRes.data || []);
  }, [company]);

  useEffect(() => {
    if (company) { setForm(company); setEditing(false); fetchRelated(); }
  }, [company, fetchRelated]);

  const handleSave = async () => {
    if (!company) return;
    const { error } = await (supabase as any).from("companies").update({
      name: form.name, domain: form.domain, industry: form.industry,
      size: form.size, revenue: form.revenue ? Number(form.revenue) : null,
      website: form.website, linkedin_url: form.linkedin_url,
    }).eq("id", company.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setEditing(false); onUpdate();
    toast({ title: "Empresa atualizada" });
  };

  if (!company) return null;

  const totalDeals = deals.length;
  const totalValue = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const wonDeals = deals.filter((d) => d.status === "won");
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <Sheet open={!!company} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto p-0">
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-start gap-4">
            {company.domain ? (
              <img src={`https://logo.clearbit.com/${company.domain}`} alt="" className="h-11 w-11 rounded-lg bg-muted object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <InitialsAvatar name={company.name || "?"} size="lg" />
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold tracking-tight">{company.name}</SheetTitle>
              {company.industry && <p className="text-sm text-muted-foreground">{company.industry}</p>}
              {company.domain && <p className="text-xs text-muted-foreground">{company.domain}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
            </Button>
          </div>

          {/* Metrics */}
          <StatStrip
            className="mt-4"
            stats={[
              { label: "Negócios", value: totalDeals },
              { label: "Valor total", value: <span className="text-lg tabular-nums">{formatCurrency(totalValue)}</span> },
              { label: "Ganhos", value: <span className="text-lg tabular-nums text-success">{formatCurrency(wonValue)}</span> },
            ]}
          />
        </div>

        <Tabs defaultValue="overview" className="p-4">
          <TabsList className="w-full">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="contacts">Contatos</TabsTrigger>
            <TabsTrigger value="deals">Negócios</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">Nome</Label>
                  <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Domínio</Label>
                  <Input value={form.domain || ""} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Indústria</Label>
                  <Select value={form.industry || ""} onValueChange={(v) => setForm({ ...form, industry: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar indústria" /></SelectTrigger>
                    <SelectContent>
                      {industries.map((ind) => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tamanho</Label>
                  <Select value={form.size || ""} onValueChange={(v) => setForm({ ...form, size: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10</SelectItem>
                      <SelectItem value="11-50">11-50</SelectItem>
                      <SelectItem value="51-200">51-200</SelectItem>
                      <SelectItem value="201-500">201-500</SelectItem>
                      <SelectItem value="500+">500+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Receita anual</Label>
                  <Input type="number" value={form.revenue ?? ""} onChange={(e) => setForm({ ...form, revenue: e.target.value ? Number(e.target.value) : null })} /></div>
                <div className="space-y-1"><Label className="text-xs">Website</Label>
                  <Input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">LinkedIn</Label>
                  <Input value={form.linkedin_url || ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
                <Button onClick={handleSave} className="w-full"><Save className="mr-2 h-4 w-4" />Salvar</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {company.website && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a>
                  </div>
                )}
                {company.size && (
                  <div className="flex items-center gap-3 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{company.size} funcionários</span>
                  </div>
                )}
                {company.revenue && (
                  <div className="flex items-center gap-3 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Receita: {formatCurrency(Number(company.revenue))}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span>{company.created_at ? new Date(company.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-4 space-y-2">
            {contacts.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhum contato vinculado</p>
            ) : (
              contacts.slice(0, 20).map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <InitialsAvatar name={`${c.first_name} ${c.last_name || ""}`.trim()} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                    {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                  </div>
                  {c.title && <span className="text-xs text-muted-foreground">{c.title}</span>}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="deals" className="mt-4 space-y-2">
            {deals.map((d) => {
              const stage = stages.find((s) => s.id === d.stage_id);
              return (
                <Panel key={d.id}>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{d.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {stage && <StatusChip tone="neutral" dot={false} className="text-xs">{stage.name}</StatusChip>}
                          <StatusChip
                            tone={d.status === "won" ? "success" : d.status === "lost" ? "danger" : "neutral"}
                            className="text-xs"
                          >
                            {d.status === "open" ? "Aberto" : d.status === "won" ? "Ganho" : "Perdido"}
                          </StatusChip>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-primary tabular-nums">{formatCurrency(Number(d.value) || 0, d.currency || "BRL")}</span>
                    </div>
                  </div>
                </Panel>
              );
            })}
            {deals.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum negócio</p>}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

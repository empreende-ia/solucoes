import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ds/tabs";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ds/textarea";
import { InitialsAvatar } from "@/components/foundation/InitialsAvatar";
import { StatusChip, type StatusTone } from "@/components/foundation/StatusChip";
import { Panel, SectionLabel } from "@/components/foundation/Panel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import {
  Edit2, X, Phone, Mail, FileText, CheckSquare, CalendarDays,
  Building2, Briefcase, Save, Sparkles, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Contact = any;
type Company = any;
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Deal = any;
type Activity = any;
type ContactStatus = string;
type ActivityType = string;
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

const statusTones: Record<ContactStatus, StatusTone> = {
  lead: "info", prospect: "warning",
  customer: "success", churned: "danger",
};
const statusLabels: Record<ContactStatus, string> = {
  lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned",
};
const activityIcons: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone, email: Mail, meeting: CalendarDays, note: FileText, task: CheckSquare, visit: CalendarDays, whatsapp: Mail,
};
const activityLabels: Record<ActivityType, string> = {
  call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa", visit: "Visita", whatsapp: "WhatsApp",
};

const TIPOLOGIA_INTERESSE = [
  { value: "moradia", label: "Moradia" },
  { value: "investimento", label: "Investimento" },
  { value: "lancamento", label: "Lançamento" },
  { value: "temporada", label: "Temporada" },
];
const QUARTOS_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4+" },
];
const TAGS_PERFIL = [
  "sacada", "garagem", "piscina", "pet friendly",
  "vista mar", "mobiliado", "academia", "churrasqueira",
];
const FONTE_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  manual: "Manual",
  portal: "Portal",
  indicacao: "Indicação",
};
const formatFonte = (f: string | null | undefined) =>
  f ? (FONTE_LABELS[f] || f) : "Manual";

type ImovelMatch = {
  imovel_id: string;
  score: number;
  motivo: string;
  imovel?: {
    id: string;
    titulo?: string;
    bairro?: string;
    valor?: number;
    quartos?: number;
    tipologia?: string;
  };
};

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

interface ContactDrawerProps {
  contact: Contact | null;
  onClose: () => void;
  onUpdate: () => void;
  companies: Company[];
  members: Profile[];
}

export function ContactDrawer({ contact, onClose, onUpdate, companies, members }: ContactDrawerProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, title: "", body: "" });
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<ImovelMatch[]>([]);

  const toggleTagPerfil = (tag: string) => {
    const current = ((form as any).tags_perfil || []) as string[];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    setForm({ ...form, tags_perfil: next } as any);
  };

  const handleMatching = async () => {
    if (!contact || !orgId) return;
    setMatching(true);
    setMatches([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-matching", {
        body: { contact_id: contact.id, org_id: orgId },
      });
      if (error) throw error;
      setMatches((data?.matches || []) as ImovelMatch[]);
      if (!data?.matches?.length) {
        toast({ title: "Nenhum imóvel compatível encontrado" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao buscar matches", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setMatching(false);
    }
  };

  const fetchRelated = useCallback(async () => {
    if (!contact) return;
    const [aRes, dRes, sRes] = await Promise.all([
      (supabase as any).from("activities").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false }),
      (supabase as any).from("deals").select("*").eq("contact_id", contact.id),
      (supabase as any).from("pipeline_stages").select("*").eq("org_id", contact.org_id).order("order"),
    ]);
    setActivities(aRes.data || []);
    setDeals(dRes.data || []);
    setStages(sRes.data || []);
  }, [contact]);

  useEffect(() => {
    if (contact) {
      setForm(contact);
      setEditing(false);
      setMatches([]);
      fetchRelated();
    }
  }, [contact, fetchRelated]);

  const handleSave = async () => {
    if (!contact) return;
    const f = form as any;
    const { error } = await (supabase as any).from("contacts").update({
      first_name: form.first_name, last_name: form.last_name, email: form.email,
      phone: form.phone, title: form.title, status: form.status as ContactStatus,
      linkedin_url: form.linkedin_url, company_id: (form as any).company_id || null,
      orcamento_min: f.orcamento_min != null && f.orcamento_min !== "" ? Number(f.orcamento_min) : null,
      orcamento_max: f.orcamento_max != null && f.orcamento_max !== "" ? Number(f.orcamento_max) : null,
      bairro_desejado: f.bairro_desejado || null,
      quartos_desejado: f.quartos_desejado != null && f.quartos_desejado !== "" ? Number(f.quartos_desejado) : null,
      tipologia_interesse: f.tipologia_interesse || null,
      tags_perfil: Array.isArray(f.tags_perfil) && f.tags_perfil.length ? f.tags_perfil : null,
    } as any).eq("id", contact.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setEditing(false);
    onUpdate();
    toast({ title: "Contato atualizado" });
  };

  const addActivity = async () => {
    if (!orgId || !contact || !activityForm.title) return;
    await (supabase as any).from("activities").insert({
      org_id: orgId, contact_id: contact.id, type: activityForm.type,
      title: activityForm.title, body: activityForm.body, user_id: user?.id,
    });
    setActivityForm({ type: "note", title: "", body: "" });
    fetchRelated();
    toast({ title: "Atividade adicionada" });
  };

  if (!contact) return null;

  return (
    <Sheet open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto p-0">
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-start gap-4">
            <InitialsAvatar
              name={`${contact.first_name} ${contact.last_name || ""}`.trim()}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold tracking-tight">
                {contact.first_name} {contact.last_name}
              </SheetTitle>
              {contact.title && <p className="text-sm text-muted-foreground">{contact.title}</p>}
              <div className="mt-1.5 flex items-center gap-2">
                <StatusChip tone={statusTones[contact.status || "lead"]}>
                  {statusLabels[contact.status || "lead"]}
                </StatusChip>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="p-4">
          <TabsList className="w-full">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="activities">Atividades</TabsTrigger>
            <TabsTrigger value="deals">Negócios</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Nome</Label>
                    <Input value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Sobrenome</Label>
                    <Input value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Telefone</Label>
                  <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Cargo</Label>
                  <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">LinkedIn</Label>
                  <Input value={form.linkedin_url || ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status || "lead"} onValueChange={(v) => setForm({ ...form, status: v as ContactStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="customer">Cliente</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Empresa</Label>
                  <Select value={(form as any).company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? null : v } as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Perfil de busca (edição) */}
                <div className="pt-2 border-t border-border space-y-3">
                  <SectionLabel className="pt-1">Perfil de busca</SectionLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">De R$</Label>
                      <Input
                        type="number" inputMode="numeric"
                        value={(form as any).orcamento_min ?? ""}
                        onChange={(e) => setForm({ ...form, orcamento_min: e.target.value } as any)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Até R$</Label>
                      <Input
                        type="number" inputMode="numeric"
                        value={(form as any).orcamento_max ?? ""}
                        onChange={(e) => setForm({ ...form, orcamento_max: e.target.value } as any)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bairro desejado</Label>
                    <Input
                      value={(form as any).bairro_desejado || ""}
                      onChange={(e) => setForm({ ...form, bairro_desejado: e.target.value } as any)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Quartos</Label>
                      <Select
                        value={String((form as any).quartos_desejado ?? "")}
                        onValueChange={(v) => setForm({ ...form, quartos_desejado: v } as any)}
                      >
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {QUARTOS_OPTIONS.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipologia de interesse</Label>
                      <Select
                        value={(form as any).tipologia_interesse || ""}
                        onValueChange={(v) => setForm({ ...form, tipologia_interesse: v } as any)}
                      >
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {TIPOLOGIA_INTERESSE.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tags de perfil</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {TAGS_PERFIL.map((tag) => {
                        const active = (((form as any).tags_perfil || []) as string[]).includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTagPerfil(tag)}
                            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:bg-secondary/60"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <Button onClick={handleSave} className="w-full"><Save className="mr-2 h-4 w-4" />Salvar</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.phone.replace(/@s\.whatsapp\.net$/i, "").replace(/@lid$/i, "").replace(/@c\.us$/i, "")}</span>
                  </div>
                )}
                {contact.title && (
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.title}</span>
                  </div>
                )}
                {contact.linkedin_url && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">LinkedIn</span>
                    <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{contact.linkedin_url}</a>
                  </div>
                )}
                {(() => {
                  const comp = companies.find((c) => c.id === (contact as any).company_id);
                  return comp ? (
                    <div className="flex items-center gap-3 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{comp.name}</span>
                    </div>
                  ) : null;
                })()}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span>{contact.created_at ? new Date(contact.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                </div>

                {/* Perfil de busca (visualização) */}
                {(() => {
                  const c = contact as any;
                  const orMin = c.orcamento_min;
                  const orMax = c.orcamento_max;
                  const bairro = c.bairro_desejado;
                  const quartos = c.quartos_desejado;
                  const tipologia = c.tipologia_interesse;
                  const tags: string[] = c.tags_perfil || [];
                  return (
                    <div className="pt-3 border-t border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <SectionLabel>Perfil de busca</SectionLabel>
                        <StatusChip tone="neutral" dot={false} className="text-xs">{formatFonte(c.fonte)}</StatusChip>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Orçamento</span>
                          <p>{orMin || orMax ? `${orMin ? formatCurrency(Number(orMin)) : "—"} – ${orMax ? formatCurrency(Number(orMax)) : "—"}` : "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Bairro</span>
                          <p>{bairro || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Quartos</span>
                          <p>{quartos != null ? (quartos >= 4 ? "4+" : String(quartos)) : "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Tipologia</span>
                          <p>{tipologia ? (TIPOLOGIA_INTERESSE.find((t) => t.value === tipologia)?.label || tipologia) : "—"}</p>
                        </div>
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>
                          ))}
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
                        onClick={handleMatching}
                        disabled={matching}
                      >
                        {matching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                        Buscar imóveis compatíveis
                      </Button>

                      {matches.length > 0 && (
                        <div className="space-y-2 mt-2">
                          {matches.map((m) => (
                            <Panel key={m.imovel_id}>
                              <div className="p-3 space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{m.imovel?.titulo || m.imovel_id}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {m.imovel?.bairro || "—"}
                                      {m.imovel?.valor != null ? ` · ${formatCurrency(Number(m.imovel.valor))}` : ""}
                                    </p>
                                  </div>
                                  <StatusChip tone="success" dot={false} className="shrink-0 text-xs">
                                    {m.score}%
                                  </StatusChip>
                                </div>
                                <p className="text-xs text-muted-foreground">{m.motivo}</p>
                              </div>
                            </Panel>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </TabsContent>

          {/* Activities */}
          <TabsContent value="activities" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={activityForm.type} onValueChange={(v) => setActivityForm({ ...activityForm, type: v as ActivityType })}>
                  <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Nota</SelectItem>
                    <SelectItem value="call">Ligação</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                    <SelectItem value="task">Tarefa</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-8 text-sm" placeholder="Título" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
              </div>
              <Textarea placeholder="Descrição..." value={activityForm.body} onChange={(e) => setActivityForm({ ...activityForm, body: e.target.value })} rows={2} className="text-sm" />
              <Button size="sm" onClick={addActivity} disabled={!activityForm.title}>Adicionar</Button>
            </div>
            <div className="space-y-2">
              {activities.map((a) => {
                const Icon = activityIcons[a.type];
                return (
                  <div key={a.id} className="flex gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase">{activityLabels[a.type]}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.body && <p className="mt-0.5 text-xs text-muted-foreground">{a.body}</p>}
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhuma atividade</p>}
            </div>
          </TabsContent>

          {/* Deals */}
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
                          {stage && (
                            <StatusChip tone="neutral" dot={false} className="text-xs">
                              {stage.name}
                            </StatusChip>
                          )}
                          <StatusChip
                            tone={d.status === "won" ? "success" : d.status === "lost" ? "danger" : "neutral"}
                            className="text-xs"
                          >
                            {d.status === "open" ? "Aberto" : d.status === "won" ? "Ganho" : "Perdido"}
                          </StatusChip>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-primary tabular-nums">
                        {formatCurrency(Number(d.value) || 0, d.currency || "BRL")}
                      </span>
                    </div>
                  </div>
                </Panel>
              );
            })}
            {deals.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum negócio vinculado</p>}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-4 space-y-2">
            {activities.filter((a) => a.type === "note").map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-sm font-medium">{a.title}</p>
                {a.body && <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>}
              </div>
            ))}
            {activities.filter((a) => a.type === "note").length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhuma nota</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

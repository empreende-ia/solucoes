import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { SidePanel } from "@/components/foundation/SidePanel";
import { SectionLabel } from "@/components/foundation/Panel";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { useToast } from "@/hooks/use-toast";
type Company = any;
type ContactStatus = string;

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

interface ContactCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  companies: Company[];
}

export function ContactCreateModal({ open, onOpenChange, onCreated, companies }: ContactCreateModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", title: "",
    status: "lead" as ContactStatus, linkedin_url: "", company_id: "",
    orcamento_min: "", orcamento_max: "", bairro_desejado: "",
    quartos_desejado: "", tipologia_interesse: "",
    tags_perfil: [] as string[],
  });

  const toggleTagPerfil = (tag: string) =>
    setForm((f) => ({
      ...f,
      tags_perfil: f.tags_perfil.includes(tag)
        ? f.tags_perfil.filter((t) => t !== tag)
        : [...f.tags_perfil, tag],
    }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = "Nome é obrigatório";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Email inválido";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!orgId || !validate()) return;
    const { error } = await (supabase as any).from("contacts").insert({
      org_id: orgId, first_name: form.first_name, last_name: form.last_name || null,
      email: form.email || null, phone: form.phone || null, title: form.title || null,
      status: form.status, linkedin_url: form.linkedin_url || null, owner_id: user?.id,
      company_id: form.company_id || null,
      orcamento_min: form.orcamento_min ? Number(form.orcamento_min) : null,
      orcamento_max: form.orcamento_max ? Number(form.orcamento_max) : null,
      bairro_desejado: form.bairro_desejado || null,
      quartos_desejado: form.quartos_desejado ? parseInt(form.quartos_desejado, 10) : null,
      tipologia_interesse: form.tipologia_interesse || null,
      tags_perfil: form.tags_perfil.length ? form.tags_perfil : null,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onOpenChange(false);
    setForm({
      first_name: "", last_name: "", email: "", phone: "", title: "",
      status: "lead", linkedin_url: "", company_id: "",
      orcamento_min: "", orcamento_max: "", bairro_desejado: "",
      quartos_desejado: "", tipologia_interesse: "", tags_perfil: [],
    });
    onCreated();
    toast({ title: "Contato criado" });
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      kicker="Contatos"
      title="Novo contato"
      description="Preencha os dados do novo contato"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate}>Criar contato</Button>
        </>
      }
    >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className={errors.first_name ? "border-destructive" : ""} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sobrenome</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={errors.email ? "border-destructive" : ""} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cargo</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">LinkedIn</Label>
            <Input value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ContactStatus })}>
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
            <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Perfil de busca */}
          <div className="pt-2 border-t border-border space-y-3">
            <SectionLabel className="pt-1">Perfil de busca</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">De R$</Label>
                <Input type="number" inputMode="numeric" value={form.orcamento_min} onChange={(e) => setForm({ ...form, orcamento_min: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até R$</Label>
                <Input type="number" inputMode="numeric" value={form.orcamento_max} onChange={(e) => setForm({ ...form, orcamento_max: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bairro desejado</Label>
              <Input value={form.bairro_desejado} onChange={(e) => setForm({ ...form, bairro_desejado: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Quartos</Label>
                <Select value={form.quartos_desejado} onValueChange={(v) => setForm({ ...form, quartos_desejado: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {QUARTOS_OPTIONS.map((q) => <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipologia de interesse</Label>
                <Select value={form.tipologia_interesse} onValueChange={(v) => setForm({ ...form, tipologia_interesse: v })}>
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
                  const active = form.tags_perfil.includes(tag);
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
        </div>
    </SidePanel>
  );
}

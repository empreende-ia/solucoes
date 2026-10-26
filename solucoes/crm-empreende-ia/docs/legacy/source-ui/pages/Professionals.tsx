import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Stethoscope, ChevronLeft, ChevronRight } from "lucide-react";
import { PageScaffold } from "@/components/shell/PageScaffold";
import { Panel } from "@/components/foundation/Panel";
import { SidePanel } from "@/components/foundation/SidePanel";
import { StatusChip } from "@/components/foundation/StatusChip";
import { InitialsAvatar } from "@/components/foundation/InitialsAvatar";
import { EmptyState } from "@/components/foundation/EmptyState";
import { TableSkeleton } from "@/components/crm/TableSkeleton";
import { ProfessionalDrawer } from "@/components/health/ProfessionalDrawer";

const PAGE_SIZE = 25;

interface ProfessionalRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  council: string | null;
  registration: string | null;
  avatar_url: string | null;
  is_active: boolean;
  patients_count?: number;
}

const emptyForm = {
  name: "", email: "", phone: "", specialty: "", council: "", registration: "", is_active: true,
};

export default function Professionals() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [rows, setRows] = useState<ProfessionalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("professionals")
        .select("id,name,email,phone,specialty,council,registration,avatar_url,is_active", { count: "exact" })
        .eq("org_id", orgId)
        .order("name");

      if (statusFilter === "active") q = q.eq("is_active", true);
      if (statusFilter === "inactive") q = q.eq("is_active", false);
      if (specialtyFilter !== "all") q = q.eq("specialty", specialtyFilter);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`name.ilike.${term},specialty.ilike.${term},registration.ilike.${term},email.ilike.${term}`);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;

      const items = (data ?? []) as ProfessionalRow[];
      setRows(items);
      setTotal(count ?? 0);

      // Specialties for filter
      const { data: allSpec } = await (supabase as any)
        .from("professionals")
        .select("specialty")
        .eq("org_id", orgId)
        .not("specialty", "is", null);
      const uniq = Array.from(new Set(((allSpec ?? []) as any[]).map((r) => r.specialty).filter(Boolean))) as string[];
      setSpecialties(uniq.sort());

      // Enrich with patient counts
      const ids = items.map((p) => p.id);
      if (ids.length) {
        const { data: pData } = await (supabase as any)
          .from("patients")
          .select("assigned_professional_id")
          .eq("org_id", orgId)
          .in("assigned_professional_id", ids);
        const map: Record<string, number> = {};
        for (const r of (pData ?? []) as { assigned_professional_id: string }[]) {
          if (r.assigned_professional_id) map[r.assigned_professional_id] = (map[r.assigned_professional_id] ?? 0) + 1;
        }
        setRows((curr) => curr.map((p) => ({ ...p, patients_count: map[p.id] ?? 0 })));
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar médicos", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, specialtyFilter, search, page, toast]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const handleCreate = async () => {
    if (!orgId || !form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    const { data, error } = await (supabase as any)
      .from("professionals")
      .insert({
        org_id: orgId,
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        specialty: form.specialty || null,
        council: form.council || null,
        registration: form.registration || null,
        is_active: form.is_active,
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Médico cadastrado" });
    setCreateOpen(false);
    setForm(emptyForm);
    void fetchAll();
    if (data?.id) setDrawerId(data.id);
  };

  return (
    <PageScaffold
      title="Médicos"
      meta={
        !loading ? (
          <StatusChip tone="neutral" dot={false}>
            {total} médico{total === 1 ? "" : "s"}
          </StatusChip>
        ) : undefined
      }
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" /> Novo médico
        </Button>
      }
      toolbar={
        <>
          <div className="relative w-72 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar por nome, especialidade, registro ou email…"
              className="h-9 rounded-lg pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[160px] shrink-0 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={specialtyFilter} onValueChange={(v) => { setSpecialtyFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-[200px] shrink-0 rounded-lg"><SelectValue placeholder="Especialidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas especialidades</SelectItem>
              {specialties.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    >
      <Panel className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            className="border-0 bg-transparent"
            title="Nenhum médico cadastrado"
            description="Cadastre o primeiro médico para vincular a pacientes e consultas."
            action={
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Cadastrar primeiro médico
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Médico</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Pacientes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => setDrawerId(p.id)}
                    className="cursor-pointer transition-colors hover:bg-secondary/60"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <InitialsAvatar size="sm" name={p.name} src={p.avatar_url} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{p.specialty ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.council && p.registration ? `${p.council} ${p.registration}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{p.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums">{p.patients_count ?? 0}</TableCell>
                    <TableCell>
                      <StatusChip tone={p.is_active ? "success" : "neutral"}>
                        {p.is_active ? "Ativo" : "Inativo"}
                      </StatusChip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border/60 p-3 text-sm">
              <span className="text-muted-foreground">
                {total} médico{total === 1 ? "" : "s"} · página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <SidePanel
        open={createOpen}
        onOpenChange={setCreateOpen}
        kicker="Médicos"
        title="Novo médico"
        width="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleCreate}>Salvar</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Nome completo *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dra. Sabrina Oliveira" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Especialidade</Label>
              <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Nutrologia" />
            </div>
            <div className="space-y-1.5">
              <Label>Conselho</Label>
              <Input value={form.council} onChange={(e) => setForm({ ...form, council: e.target.value })} placeholder="CRM-SP" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nº registro</Label>
            <Input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} placeholder="123456" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium">Ativo</p>
              <p className="text-xs text-muted-foreground">Médicos inativos não aparecem ao agendar.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
        </div>
      </SidePanel>

      <ProfessionalDrawer
        professionalId={drawerId}
        open={drawerId !== null}
        onOpenChange={(o) => { if (!o) setDrawerId(null); }}
        onUpdated={() => void fetchAll()}
      />
    </PageScaffold>
  );
}
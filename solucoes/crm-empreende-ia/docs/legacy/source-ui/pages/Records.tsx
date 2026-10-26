import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { ClipboardList, Plus, Search } from "lucide-react";
import { PageScaffold } from "@/components/shell/PageScaffold";
import { Panel } from "@/components/foundation/Panel";
import { StatusChip } from "@/components/foundation/StatusChip";
import { EmptyState } from "@/components/foundation/EmptyState";
import { LoadingState } from "@/components/foundation/LoadingState";
import { MedicalRecordEditor } from "@/components/health/MedicalRecordEditor";

interface RecordRow {
  id: string;
  patient_id: string;
  professional_id: string | null;
  chief_complaint: string | null;
  is_draft: boolean;
  created_at: string;
  activity_id: string | null;
  follow_up_date: string | null;
  patient_name?: string;
  professional_name?: string;
  activity_type?: string | null;
}

export default function Records() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [profFilter, setProfFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [professionals, setProfessionals] = useState<{ id: string; name: string }[]>([]);

  const editingId = params.get("id");
  const newForPatient = params.get("patient");
  const creatingNew = params.get("new") === "1";
  const showEditor = editingId !== null || newForPatient !== null || creatingNew;

  const fetchProfessionals = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any)
      .from("professionals")
      .select("id,name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name");
    setProfessionals((data ?? []) as { id: string; name: string }[]);
  }, [orgId]);

  const fetchRecords = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("medical_records")
        .select("id,patient_id,professional_id,chief_complaint,is_draft,created_at,activity_id,follow_up_date")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (profFilter !== "all") q = q.eq("professional_id", profFilter);
      if (statusFilter === "draft") q = q.eq("is_draft", true);
      if (statusFilter === "finalized") q = q.eq("is_draft", false);
      if (periodFilter !== "all") {
        const now = new Date();
        const start = new Date(now);
        if (periodFilter === "today") start.setHours(0, 0, 0, 0);
        else if (periodFilter === "week") start.setDate(now.getDate() - 7);
        else if (periodFilter === "month") start.setMonth(now.getMonth() - 1);
        q = q.gte("created_at", start.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      const records = (data ?? []) as RecordRow[];

      const patientIds = Array.from(new Set(records.map((r) => r.patient_id)));
      const profIds = Array.from(new Set(records.map((r) => r.professional_id).filter(Boolean) as string[]));
      const activityIds = Array.from(new Set(records.map((r) => r.activity_id).filter(Boolean) as string[]));
      const [{ data: patientsData }, { data: profsData }, { data: actsData }] = await Promise.all([
        patientIds.length
          ? (supabase as any).from("patients").select("id,first_name,last_name").in("id", patientIds)
          : Promise.resolve({ data: [] }),
        profIds.length
          ? (supabase as any).from("professionals").select("id,name").in("id", profIds)
          : Promise.resolve({ data: [] }),
        activityIds.length
          ? (supabase as any).from("activities").select("id,appointment_type").in("id", activityIds)
          : Promise.resolve({ data: [] }),
      ]);
      const pMap = new Map<string, string>((patientsData ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name ?? ""}`.trim()]));
      const profMap = new Map<string, string>((profsData ?? []).map((p: any) => [p.id, p.name]));
      const actMap = new Map<string, string | null>((actsData ?? []).map((a: any) => [a.id, a.appointment_type ?? null]));

      let enriched = records.map((r) => ({
        ...r,
        patient_name: pMap.get(r.patient_id) ?? "Paciente",
        professional_name: r.professional_id ? profMap.get(r.professional_id) : undefined,
        activity_type: r.activity_id ? actMap.get(r.activity_id) ?? null : null,
      }));
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        enriched = enriched.filter(
          (r) =>
            (r.patient_name ?? "").toLowerCase().includes(term) ||
            (r.chief_complaint ?? "").toLowerCase().includes(term),
        );
      }
      setRows(enriched);
    } catch (err: any) {
      toast({ title: "Erro ao carregar prontuários", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, profFilter, statusFilter, periodFilter, search, toast]);

  useEffect(() => { void fetchProfessionals(); }, [fetchProfessionals]);
  useEffect(() => { if (!showEditor) void fetchRecords(); }, [showEditor, fetchRecords]);

  const openEditor = (id: string | "new", patientId?: string) => {
    const next = new URLSearchParams(params);
    if (id === "new") {
      next.delete("id");
      if (patientId) {
        next.set("patient", patientId);
        next.delete("new");
      } else {
        next.set("new", "1");
        next.delete("patient");
      }
    } else {
      next.set("id", id);
      next.delete("patient");
      next.delete("new");
    }
    setParams(next, { replace: false });
  };

  const closeEditor = () => {
    const next = new URLSearchParams(params);
    next.delete("id");
    next.delete("patient");
    next.delete("new");
    setParams(next, { replace: false });
  };

  if (showEditor) {
    return (
      <MedicalRecordEditor
        recordId={editingId ?? "new"}
        initialPatientId={newForPatient}
        onBack={closeEditor}
        onSaved={fetchRecords}
      />
    );
  }

  return (
    <PageScaffold
      title="Prontuários"
      meta={
        !loading ? (
          <StatusChip tone="neutral" dot={false}>
            {rows.length} registro{rows.length === 1 ? "" : "s"}
          </StatusChip>
        ) : undefined
      }
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => openEditor("new")}>
          <Plus className="h-4 w-4" /> Novo prontuário
        </Button>
      }
      toolbar={
        <>
          <div className="relative w-64 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por paciente ou queixa…"
              className="h-9 rounded-lg pl-8"
            />
          </div>
          <Select value={profFilter} onValueChange={setProfFilter}>
            <SelectTrigger className="h-9 w-[200px] shrink-0 rounded-lg"><SelectValue placeholder="Médico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os médicos</SelectItem>
              {professionals.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[160px] shrink-0 rounded-lg"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Rascunhos</SelectItem>
              <SelectItem value="finalized">Finalizados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="h-9 w-[160px] shrink-0 rounded-lg"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sempre</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Última semana</SelectItem>
              <SelectItem value="month">Último mês</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      {loading ? (
        <LoadingState label="Carregando prontuários…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum prontuário ainda"
          description="Crie o primeiro prontuário diretamente ou a partir de uma consulta da agenda."
          action={
            <Button size="sm" className="gap-1.5" onClick={() => openEditor("new")}>
              <Plus className="h-4 w-4" /> Criar primeiro prontuário
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Panel
              key={r.id}
              onClick={() => openEditor(r.id)}
              className="cursor-pointer p-4 transition-colors hover:bg-secondary/60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.patient_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    {r.activity_type && ` · ${r.activity_type}`}
                    {r.professional_name && ` · ${r.professional_name}`}
                  </p>
                </div>
                <StatusChip tone={r.is_draft ? "neutral" : "success"}>
                  {r.is_draft ? "Rascunho" : "Finalizado"}
                </StatusChip>
              </div>
              {r.chief_complaint && (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{r.chief_complaint}</p>
              )}
              {r.follow_up_date && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Retorno em {new Date(r.follow_up_date).toLocaleDateString("pt-BR")}
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </PageScaffold>
  );
}

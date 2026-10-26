import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ds/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ds/tabs";
import { CalendarPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusChip, type StatusTone } from "@/components/foundation/StatusChip";
import { InitialsAvatar } from "@/components/foundation/InitialsAvatar";
import { LoadingState } from "@/components/foundation/LoadingState";
import { StatStrip } from "@/components/foundation/StatStrip";
import {
  BRL, APPOINTMENT_STATUS_LABELS, AppointmentStatus,
  PAYMENT_STATUS_LABELS,
} from "./types";

/** Tons semânticos por status — chaves idênticas às strings do banco (não renomear). */
const APPOINTMENT_STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  scheduled: "info",
  confirmed: "success",
  attended: "neutral",
  no_show: "warning",
  cancelled: "danger",
};

const PAYMENT_STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  paid: "success",
  overdue: "danger",
  refunded: "neutral",
};

interface Professional {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  council: string | null;
  registration: string | null;
  bio: string | null;
  avatar_url: string | null;
  color: string | null;
  is_active: boolean;
}

interface ProfessionalDrawerProps {
  professionalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function ProfessionalDrawer({ professionalId, open, onOpenChange, onUpdated }: ProfessionalDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [otherActivities, setOtherActivities] = useState<any[]>([]);
  const [patientsCount, setPatientsCount] = useState(0);

  useEffect(() => {
    if (!open || !professionalId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [{ data: prof }, apps, recs, otherActs, patients] = await Promise.all([
          (supabase as any).from("professionals").select("*").eq("id", professionalId).maybeSingle(),
          (supabase as any)
            .from("activities")
            .select("id,title,due_date,appointment_status,appointment_type,duration_minutes,contact_id")
            .eq("professional_id", professionalId)
            .not("appointment_status", "is", null)
            .order("due_date", { ascending: false })
            .limit(100),
          (supabase as any)
            .from("medical_records")
            .select("id,created_at,is_draft,chief_complaint,follow_up_date,patient_id")
            .eq("professional_id", professionalId)
            .order("created_at", { ascending: false })
            .limit(100),
          (supabase as any)
            .from("activities")
            .select("id,title,due_date,type,completed_at")
            .eq("professional_id", professionalId)
            .is("appointment_status", null)
            .order("due_date", { ascending: false })
            .limit(100),
          (supabase as any)
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("assigned_professional_id", professionalId),
        ]);
        if (cancelled) return;
        setProfessional((prof ?? null) as Professional | null);
        const appsRows = (apps.data ?? []) as any[];
        setAppointments(appsRows);
        setRecords(recs.data ?? []);
        setOtherActivities(otherActs.data ?? []);
        setPatientsCount(patients.count ?? 0);

        // Pagamentos: via activity_id das consultas do médico
        const activityIds = appsRows.map((a) => a.id);
        if (activityIds.length) {
          const { data: pays } = await (supabase as any)
            .from("payments")
            .select("id,procedure_name,amount,payment_method,status,paid_at,created_at,patient_id")
            .in("activity_id", activityIds)
            .order("created_at", { ascending: false })
            .limit(100);
          if (!cancelled) setPayments(pays ?? []);
        } else {
          setPayments([]);
        }

        // Carregar nomes dos pacientes referenciados
        const patientIds = Array.from(new Set([
          ...appsRows.map((a) => a.contact_id),
          ...(recs.data ?? []).map((r: any) => r.patient_id),
        ].filter(Boolean)));
        if (patientIds.length) {
          const { data: pNames } = await (supabase as any)
            .from("patients")
            .select("id,first_name,last_name")
            .in("id", patientIds);
          const map = new Map<string, string>();
          for (const p of (pNames ?? []) as any[]) {
            map.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" "));
          }
          if (!cancelled) {
            setAppointments((curr) => curr.map((a) => ({ ...a, patient_name: map.get(a.contact_id) ?? "" })));
            setRecords((curr) => curr.map((r) => ({ ...r, patient_name: map.get(r.patient_id) ?? "" })));
          }
        }
      } catch (err: any) {
        toast({ title: "Erro ao carregar médico", description: err?.message ?? String(err), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, professionalId, toast]);

  const updateField = <K extends keyof Professional>(key: K, value: Professional[K]) => {
    setProfessional((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("professionals")
        .update({
          name: professional.name,
          email: professional.email,
          phone: professional.phone,
          specialty: professional.specialty,
          council: professional.council,
          registration: professional.registration,
          bio: professional.bio,
          is_active: professional.is_active,
        })
        .eq("id", professional.id);
      if (error) throw error;
      toast({ title: "Médico atualizado" });
      onUpdated?.();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const totalReceived = payments.filter((p) => p.status === "paid").reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const totalPending = payments.filter((p) => p.status !== "paid").reduce((acc, p) => acc + Number(p.amount || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <InitialsAvatar size="lg" name={professional?.name ?? "?"} src={professional?.avatar_url} />
              <div className="min-w-0">
                <SheetTitle className="truncate">{professional?.name ?? "Carregando…"}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 flex-wrap">
                  {professional && (
                    <StatusChip tone={professional.is_active ? "success" : "neutral"}>
                      {professional.is_active ? "Ativo" : "Inativo"}
                    </StatusChip>
                  )}
                  {professional?.specialty && <span className="text-xs">{professional.specialty}</span>}
                  {professional?.council && professional?.registration && (
                    <span className="text-xs">· {professional.council} {professional.registration}</span>
                  )}
                </SheetDescription>
              </div>
            </div>
            <Button asChild size="sm" variant="default">
              <Link to={`/agenda?professional=${professionalId ?? ""}`}>
                <CalendarPlus className="mr-2 h-4 w-4" /> Agendar
              </Link>
            </Button>
          </div>
        </SheetHeader>

        {loading ? (
          <LoadingState label="Carregando médico…" />
        ) : !professional ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Médico não encontrado.</div>
        ) : (
          <Tabs defaultValue="dados" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="consultas">Consultas</TabsTrigger>
              <TabsTrigger value="prontuarios">Prontuários</TabsTrigger>
              <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
              <TabsTrigger value="atividades">Atividades</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Nome completo *</Label>
                  <Input value={professional.name} onChange={(e) => updateField("name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Especialidade</Label>
                  <Input value={professional.specialty ?? ""} onChange={(e) => updateField("specialty", e.target.value || null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Conselho</Label>
                  <Input value={professional.council ?? ""} onChange={(e) => updateField("council", e.target.value || null)} placeholder="CRM-SP" />
                </div>
                <div className="space-y-1.5">
                  <Label>Nº registro</Label>
                  <Input value={professional.registration ?? ""} onChange={(e) => updateField("registration", e.target.value || null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={professional.email ?? ""} onChange={(e) => updateField("email", e.target.value || null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={professional.phone ?? ""} onChange={(e) => updateField("phone", e.target.value || null)} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Biografia</Label>
                  <Textarea rows={3} value={professional.bio ?? ""} onChange={(e) => updateField("bio", e.target.value || null)} />
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium">Ativo</p>
                    <p className="text-xs text-muted-foreground">Médicos inativos não aparecem ao agendar.</p>
                  </div>
                  <Switch checked={professional.is_active} onCheckedChange={(v) => updateField("is_active", v)} />
                </div>
                <StatStrip
                  className="col-span-2"
                  stats={[
                    { label: "Pacientes", value: patientsCount },
                    { label: "Consultas", value: appointments.length },
                    { label: "Prontuários", value: records.length },
                  ]}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
              </div>
            </TabsContent>

            <TabsContent value="consultas" className="space-y-2 pt-4">
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>
              ) : (
                appointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.patient_name || a.title || "Consulta"}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.due_date ? new Date(a.due_date).toLocaleString("pt-BR") : "—"} · {a.duration_minutes ?? 30} min
                      </p>
                    </div>
                    <StatusChip tone={APPOINTMENT_STATUS_TONE[a.appointment_status as AppointmentStatus] ?? "neutral"}>
                      {APPOINTMENT_STATUS_LABELS[a.appointment_status as AppointmentStatus] ?? a.appointment_status}
                    </StatusChip>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="prontuarios" className="space-y-2 pt-4">
              {records.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum prontuário registrado.</p>
              ) : (
                records.map((r) => (
                  <Link key={r.id} to={`/records?id=${r.id}`} className="block rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-secondary/60">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{r.patient_name || "Paciente"}</p>
                      <StatusChip tone={r.is_draft ? "neutral" : "success"}>{r.is_draft ? "Rascunho" : "Finalizado"}</StatusChip>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {r.chief_complaint || "Sem queixa registrada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                      {r.follow_up_date && <> · retorno {new Date(r.follow_up_date).toLocaleDateString("pt-BR")}</>}
                    </p>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="pagamentos" className="space-y-2 pt-4">
              <StatStrip
                stats={[
                  { label: "Total recebido", value: BRL.format(totalReceived) },
                  { label: "Pendente", value: BRL.format(totalPending) },
                ]}
              />
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pagamento vinculado às consultas deste médico.</p>
              ) : (
                payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                    <div>
                      <p className="font-medium">{p.procedure_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.paid_at ? new Date(p.paid_at).toLocaleDateString("pt-BR") : new Date(p.created_at).toLocaleDateString("pt-BR")}
                        {" · "}{p.payment_method}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="font-semibold tabular-nums">{BRL.format(Number(p.amount))}</p>
                      <StatusChip tone={PAYMENT_STATUS_TONE[p.status] ?? "neutral"}>
                        {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                      </StatusChip>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="atividades" className="space-y-2 pt-4">
              {otherActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
              ) : (
                otherActivities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3 text-sm">
                    <div>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.type ?? "Atividade"} · {a.due_date ? new Date(a.due_date).toLocaleString("pt-BR") : "Sem data"}
                      </p>
                    </div>
                    <StatusChip tone={a.completed_at ? "success" : "neutral"}>
                      {a.completed_at ? "Concluída" : "Pendente"}
                    </StatusChip>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
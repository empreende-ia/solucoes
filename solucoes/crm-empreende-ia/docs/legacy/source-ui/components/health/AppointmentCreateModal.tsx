import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ds/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SidePanel } from "@/components/foundation/SidePanel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { APPOINTMENT_TYPE_LABELS, AppointmentType, fullName } from "./types";

interface PatientOption { id: string; first_name: string; last_name: string | null; phone: string }
interface ProfOption { id: string; name: string }

interface AppointmentCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPatientId?: string;
  onCreated?: (activityId: string) => void;
}

export function AppointmentCreateModal({ open, onOpenChange, defaultPatientId, onCreated }: AppointmentCreateModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [patientId, setPatientId] = useState<string>(defaultPatientId ?? "");
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [professionals, setProfessionals] = useState<ProfOption[]>([]);
  const [professionalId, setProfessionalId] = useState<string>(user?.id ?? "");
  const [type, setType] = useState<AppointmentType>("consulta");
  const [duration, setDuration] = useState<number>(30);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [sendReminder, setSendReminder] = useState(true);

  useEffect(() => { if (defaultPatientId) setPatientId(defaultPatientId); }, [defaultPatientId]);

  const fetchPatients = useCallback(async () => {
    if (!orgId) return;
    let q = (supabase as any)
      .from("patients")
      .select("id,first_name,last_name,phone")
      .eq("org_id", orgId)
      .order("first_name");
    if (patientSearch.trim()) {
      const term = `%${patientSearch.trim()}%`;
      q = q.or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`);
    }
    const { data } = await q.limit(50);
    setPatients((data ?? []) as PatientOption[]);
  }, [orgId, patientSearch]);

  const fetchProfessionals = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id,name")
      .eq("org_id", orgId)
      .order("name");
    setProfessionals((data ?? []) as ProfOption[]);
  }, [orgId]);

  useEffect(() => { if (open) { void fetchPatients(); void fetchProfessionals(); } }, [open, fetchPatients, fetchProfessionals]);

  const reset = () => {
    setPatientId(defaultPatientId ?? ""); setPatientSearch(""); setType("consulta");
    setDuration(30); setDate(""); setTime(""); setNotes(""); setSendReminder(true);
  };

  const handleSave = async () => {
    if (!orgId) {
      toast({ title: "Erro", description: "Organização não identificada", variant: "destructive" });
      return;
    }
    if (!patientId || !date || !time) {
      toast({ title: "Campos obrigatórios", description: "Paciente, data e hora são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const dueAt = new Date(`${date}T${time}:00`).toISOString();
      const patient = patients.find((p) => p.id === patientId);
      const { data, error } = await (supabase as any)
        .from("activities")
        .insert({
          org_id: orgId,
          title: `${APPOINTMENT_TYPE_LABELS[type]}${patient ? ` — ${fullName(patient)}` : ""}`,
          body: notes.trim() || null,
          due_date: dueAt,
          contact_id: patientId,
          type: "appointment",
          appointment_status: "scheduled",
          appointment_type: type,
          duration_minutes: duration,
          professional_id: professionalId || null,
          whatsapp_reminder_sent: false,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Consulta agendada", description: patient ? fullName(patient) : "" });
      if (sendReminder) {
        // Best-effort: leaves flag for downstream automation/cron to pick up
      }
      reset();
      onOpenChange(false);
      if (data?.id && onCreated) onCreated(data.id);
    } catch (err: any) {
      toast({ title: "Erro ao agendar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      kicker="Agenda"
      title="Nova consulta"
      description="Agendar consulta para um paciente."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Agendar"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label>Paciente *</Label>
          <Input
            placeholder="Buscar paciente…"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
          />
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.id} value={p.id}>{fullName(p)} · {p.phone}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AppointmentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(APPOINTMENT_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Duração (min)</Label>
            <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 30)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Data *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hora *</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Médico</Label>
          <Select value={professionalId} onValueChange={setProfessionalId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {professionals.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sendReminder} onCheckedChange={(v) => setSendReminder(v === true)} />
          Enviar lembrete por WhatsApp
        </label>
      </div>
    </SidePanel>
  );
}

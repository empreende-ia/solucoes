import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ds/textarea";
import { SidePanel } from "@/components/foundation/SidePanel";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, fullName } from "./types";

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface PatientOpt { id: string; first_name: string; last_name: string | null }
interface ActivityOpt { id: string; title: string | null; due_date: string | null; contact_id: string | null }

export function PaymentModal({ open, onOpenChange, onCreated }: PaymentModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [activities, setActivities] = useState<ActivityOpt[]>([]);
  const [patientId, setPatientId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("pix");
  const [status, setStatus] = useState<string>("paid");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const fetchPatients = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any)
      .from("patients")
      .select("id,first_name,last_name")
      .eq("org_id", orgId)
      .order("first_name")
      .limit(500);
    setPatients((data ?? []) as PatientOpt[]);
  }, [orgId]);

  const fetchActivitiesForPatient = useCallback(async (pid: string) => {
    if (!pid) { setActivities([]); return; }
    const { data } = await (supabase as any)
      .from("activities")
      .select("id,title,due_date,contact_id")
      .eq("contact_id", pid)
      .not("appointment_status", "is", null)
      .order("due_date", { ascending: false })
      .limit(20);
    setActivities((data ?? []) as ActivityOpt[]);
  }, []);

  useEffect(() => { if (open) void fetchPatients(); }, [open, fetchPatients]);
  useEffect(() => { void fetchActivitiesForPatient(patientId); setActivityId(""); }, [patientId, fetchActivitiesForPatient]);

  const reset = () => {
    setPatientId(""); setActivityId(""); setProcedure(""); setAmount("");
    setMethod("pix"); setStatus("paid"); setPaymentDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  };

  const handleSave = async () => {
    if (!orgId) return;
    if (!patientId || !procedure.trim() || !amount) {
      toast({ title: "Campos obrigatórios", description: "Paciente, procedimento e valor são obrigatórios.", variant: "destructive" });
      return;
    }
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        org_id: orgId,
        patient_id: patientId,
        activity_id: activityId || null,
        procedure_name: procedure.trim(),
        amount: numericAmount,
        payment_method: method,
        status,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
      };
      if (status === "paid") {
        payload.paid_at = new Date(`${paymentDate}T12:00:00`).toISOString();
      }
      const { error } = await (supabase as any).from("payments").insert(payload);
      if (error) throw error;
      toast({ title: "Pagamento registrado" });
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      kicker="Financeiro"
      title="Registrar pagamento"
      description="Vincule um pagamento a um paciente e (opcionalmente) a uma consulta."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Registrar"}</Button>
        </>
      }
    >
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Paciente *</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => (<SelectItem key={p.id} value={p.id}>{fullName(p)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {activities.length > 0 && (
            <div className="space-y-1.5">
              <Label>Consulta vinculada</Label>
              <Select value={activityId} onValueChange={setActivityId}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {activities.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title ?? "Consulta"} · {a.due_date ? new Date(a.due_date).toLocaleDateString("pt-BR") : "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Procedimento *</Label>
            <Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="Consulta clínica, ECG…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="250,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} disabled={status !== "paid"} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
    </SidePanel>
  );
}

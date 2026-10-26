import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ds/button";
import { Input } from "@/components/ds/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ds/textarea";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ds/select";
import { Sparkles, Plus, Trash2, ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import { PageScaffold } from "@/components/shell/PageScaffold";
import { Panel, PanelBody, PanelHeader } from "@/components/foundation/Panel";
import { StatusChip } from "@/components/foundation/StatusChip";
import { LoadingState } from "@/components/foundation/LoadingState";
import { ConfirmDialog } from "@/components/foundation/ConfirmDialog";
import { fullName } from "./types";

interface Prescription {
  medication: string;
  posology: string;
  duration: string;
  route: string;
}

interface PatientLite { id: string; first_name: string; last_name: string | null; allergies: string | null }

interface MedicalRecordEditorProps {
  recordId: string | "new";
  initialPatientId?: string | null;
  initialActivityId?: string | null;
  onBack: () => void;
  onSaved?: () => void;
}

export function MedicalRecordEditor({ recordId, initialPatientId, initialActivityId, onBack, onSaved }: MedicalRecordEditorProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const [patientId, setPatientId] = useState<string>("");
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [patientOptions, setPatientOptions] = useState<PatientLite[]>([]);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalSummary, setClinicalSummary] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [isDraft, setIsDraft] = useState<boolean>(true);
  const [aiSuggestion, setAiSuggestion] = useState<string>("");
  const [previousRecords, setPreviousRecords] = useState<any[]>([]);

  const isNew = recordId === "new";

  const loadPatient = useCallback(async (pid: string) => {
    const { data } = await (supabase as any)
      .from("patients")
      .select("id,first_name,last_name,allergies")
      .eq("id", pid)
      .maybeSingle();
    if (data) setPatient(data as PatientLite);
  }, []);

  const loadPreviousRecords = useCallback(async (pid: string, excludeId?: string) => {
    let q = (supabase as any)
      .from("medical_records")
      .select("id,created_at,chief_complaint,clinical_summary,diagnosis,is_draft")
      .eq("patient_id", pid)
      .order("created_at", { ascending: false })
      .limit(10);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    setPreviousRecords(data ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!isNew) {
          const { data, error } = await (supabase as any)
            .from("medical_records")
            .select("*")
            .eq("id", recordId)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("Prontuário não encontrado");
          if (cancelled) return;
          setPatientId(data.patient_id);
          setActivityId(data.activity_id ?? null);
          setChiefComplaint(data.chief_complaint ?? "");
          setClinicalSummary(data.clinical_summary ?? "");
          setDiagnosis(data.diagnosis ?? "");
          setFollowUpDate(data.follow_up_date ?? "");
          setPrescriptions((data.prescriptions ?? []) as Prescription[]);
          setIsDraft(Boolean(data.is_draft));
          setAiSuggestion(data.ai_generated_summary ?? "");
          await Promise.all([loadPatient(data.patient_id), loadPreviousRecords(data.patient_id, data.id)]);
        } else {
          if (initialPatientId) {
            setPatientId(initialPatientId);
            await Promise.all([loadPatient(initialPatientId), loadPreviousRecords(initialPatientId)]);
          }
          if (initialActivityId) setActivityId(initialActivityId);
          if (orgId) {
            const { data } = await (supabase as any)
              .from("patients")
              .select("id,first_name,last_name,allergies")
              .eq("org_id", orgId)
              .order("first_name")
              .limit(200);
            if (!cancelled) setPatientOptions((data ?? []) as PatientLite[]);
          }
        }
      } catch (err: any) {
        toast({ title: "Erro ao carregar prontuário", description: err?.message ?? String(err), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [recordId, isNew, initialPatientId, initialActivityId, orgId, loadPatient, loadPreviousRecords, toast]);

  const handleSelectPatient = async (pid: string) => {
    setPatientId(pid);
    await Promise.all([loadPatient(pid), loadPreviousRecords(pid)]);
  };

  const addPrescription = () => setPrescriptions((p) => [...p, { medication: "", posology: "", duration: "", route: "" }]);
  const updatePrescription = (i: number, key: keyof Prescription, value: string) =>
    setPrescriptions((p) => p.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  const removePrescription = (i: number) => setPrescriptions((p) => p.filter((_, idx) => idx !== i));

  const generateWithAI = async () => {
    if (!chiefComplaint.trim()) {
      toast({ title: "Queixa principal obrigatória", description: "Preencha a queixa antes de gerar o resumo." });
      return;
    }
    setGenerating(true);
    try {
      const previousText = previousRecords.slice(0, 5).map((r) =>
        `${new Date(r.created_at).toLocaleDateString("pt-BR")} — ${r.chief_complaint ?? ""}${r.diagnosis ? ` (${r.diagnosis})` : ""}`
      ).join("\n");
      const { data, error } = await supabase.functions.invoke("ai-clinical-summary", {
        body: {
          chief_complaint: chiefComplaint,
          patient_history: patient?.allergies ? `Alergias: ${patient.allergies}` : "",
          allergies: patient?.allergies ?? "",
          previous_records: previousText || "Primeira consulta",
        },
      });
      if (error) throw error;
      const summary = (data as any)?.summary ?? "";
      if (!summary) throw new Error("Resposta vazia da IA");
      setAiSuggestion(summary);
    } catch (err: any) {
      toast({
        title: "Não foi possível gerar o resumo",
        description: err?.message ?? "Verifique se a chave Anthropic está configurada.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const saveRecord = async (finalize = false) => {
    if (!orgId) return;
    if (!patientId) {
      toast({ title: "Paciente obrigatório", variant: "destructive" });
      return;
    }
    if (!chiefComplaint.trim()) {
      toast({ title: "Queixa principal obrigatória", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        patient_id: patientId,
        activity_id: activityId,
        professional_id: user?.id ?? null,
        chief_complaint: chiefComplaint.trim(),
        clinical_summary: clinicalSummary.trim() || null,
        ai_generated_summary: aiSuggestion.trim() || null,
        diagnosis: diagnosis.trim() || null,
        prescriptions,
        follow_up_date: followUpDate || null,
        is_draft: finalize ? false : isDraft,
      };
      if (isNew) {
        const { data, error } = await (supabase as any)
          .from("medical_records")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        toast({ title: finalize ? "Prontuário finalizado" : "Rascunho salvo" });
        onSaved?.();
        // Navigate to the new record? Caller decides via onSaved; back to list for now.
        onBack();
        return;
      }
      const { error } = await (supabase as any)
        .from("medical_records")
        .update(payload)
        .eq("id", recordId);
      if (error) throw error;
      setIsDraft(finalize ? false : isDraft);
      toast({ title: finalize ? "Prontuário finalizado" : "Rascunho salvo" });
      onSaved?.();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !isDraft && !isNew;

  const scaffoldTitle = (
    <span className="flex min-w-0 items-center gap-2">
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack} aria-label="Voltar">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="truncate">
        {isNew ? "Novo prontuário" : patient ? `Prontuário · ${fullName(patient)}` : "Prontuário"}
      </span>
    </span>
  );

  if (loading) {
    return (
      <PageScaffold title={scaffoldTitle}>
        <LoadingState label="Carregando prontuário…" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      title={scaffoldTitle}
      meta={
        readOnly ? (
          <StatusChip tone="neutral" dot={false}>
            <Lock className="h-3 w-3" /> Finalizado
          </StatusChip>
        ) : undefined
      }
      actions={
        !readOnly ? (
          <>
            <Button variant="outline" size="sm" onClick={() => saveRecord(false)} disabled={saving}>
              {saving ? "Salvando…" : "Salvar rascunho"}
            </Button>
            <Button size="sm" onClick={() => setFinalizeOpen(true)} disabled={saving}>
              Finalizar prontuário
            </Button>
          </>
        ) : undefined
      }
    >
      {readOnly && (
        <StatusChip tone="neutral" dot={false} className="mb-4 sm:hidden">
          <Lock className="h-3 w-3" /> Finalizado
        </StatusChip>
      )}
      {patient?.allergies && (
        <StatusChip tone="warning" dot={false} className="mb-4 whitespace-normal py-1">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> Alergias: {patient.allergies}
        </StatusChip>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel className="space-y-4 p-5">
          {isNew && !initialPatientId && (
            <div className="space-y-1.5">
              <Label>Paciente *</Label>
              <Select value={patientId} onValueChange={handleSelectPatient}>
                <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                <SelectContent>
                  {patientOptions.map((p) => (<SelectItem key={p.id} value={p.id}>{fullName(p)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Queixa principal *</Label>
            <Textarea
              rows={3} disabled={readOnly} value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              placeholder="O paciente relata…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Resumo clínico</Label>
            <Textarea
              rows={6} disabled={readOnly} value={clinicalSummary}
              onChange={(e) => setClinicalSummary(e.target.value)}
              placeholder="Anamnese, exame físico, evolução…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Diagnóstico</Label>
            <Textarea
              rows={2} disabled={readOnly} value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Prescrições</Label>
              {!readOnly && (
                <Button size="sm" variant="outline" onClick={addPrescription}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar
                </Button>
              )}
            </div>
            {prescriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma prescrição.</p>
            ) : (
              prescriptions.map((rx, i) => (
                <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2 items-end">
                  <Input
                    placeholder="Medicamento" disabled={readOnly}
                    value={rx.medication} onChange={(e) => updatePrescription(i, "medication", e.target.value)}
                  />
                  <Input
                    placeholder="Posologia" disabled={readOnly}
                    value={rx.posology} onChange={(e) => updatePrescription(i, "posology", e.target.value)}
                  />
                  <Input
                    placeholder="Duração" disabled={readOnly}
                    value={rx.duration} onChange={(e) => updatePrescription(i, "duration", e.target.value)}
                  />
                  <Input
                    placeholder="Via" disabled={readOnly}
                    value={rx.route} onChange={(e) => updatePrescription(i, "route", e.target.value)}
                  />
                  {!readOnly && (
                    <Button size="icon" variant="ghost" onClick={() => removePrescription(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label>Retorno em</Label>
            <Input type="date" disabled={readOnly} value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>

        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Resumo com IA
                </span>
              }
              actions={
                !readOnly ? (
                  <Button size="sm" onClick={generateWithAI} disabled={generating || !chiefComplaint.trim()}>
                    {generating ? "Analisando…" : "Gerar"}
                  </Button>
                ) : undefined
              }
            />
            <PanelBody className="space-y-3">
            {generating ? (
              <p className="text-sm text-muted-foreground">Analisando consulta…</p>
            ) : aiSuggestion ? (
              <>
                <Label className="text-xs">Sugestão da IA (SOAP)</Label>
                <Textarea
                  rows={10} value={aiSuggestion} disabled={readOnly}
                  onChange={(e) => setAiSuggestion(e.target.value)}
                />
                {!readOnly && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setClinicalSummary(aiSuggestion)}>
                    Usar este resumo
                  </Button>
                )}
              </>
            ) : readOnly ? (
              <p className="text-sm text-muted-foreground">
                Este prontuário está finalizado e não teve resumo de IA gerado. O resumo com IA só pode ser criado enquanto o prontuário está em rascunho.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Clique em "Gerar" para criar um resumo SOAP a partir da queixa principal e do histórico do paciente.
              </p>
            )}
            </PanelBody>
          </Panel>

          {previousRecords.length > 0 && (
            <Panel className="px-4">
              <Accordion type="single" collapsible>
                <AccordionItem value="history" className="border-b-0">
                  <AccordionTrigger className="text-sm">
                    Prontuários anteriores ({previousRecords.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 text-sm">
                      {previousRecords.map((r) => (
                        <li key={r.id} className="border-l-2 border-border/60 pl-3">
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString("pt-BR")}
                            {r.is_draft && <StatusChip tone="neutral" className="px-1.5 text-xs">Rascunho</StatusChip>}
                          </p>
                          {r.chief_complaint && <p className="font-medium">{r.chief_complaint}</p>}
                          {r.diagnosis && <p className="text-xs text-muted-foreground">Dx: {r.diagnosis}</p>}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Finalizar prontuário?"
        description="Um prontuário finalizado não pode mais ser editado. Confirme se todas as informações estão corretas."
        confirmLabel="Finalizar"
        tone="default"
        loading={saving}
        onConfirm={() => { setFinalizeOpen(false); void saveRecord(true); }}
      />
    </PageScaffold>
  );
}

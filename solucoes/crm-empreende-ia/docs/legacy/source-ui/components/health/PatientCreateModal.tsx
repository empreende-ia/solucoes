import { useState } from "react";
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
import { BLOOD_TYPES } from "./types";

interface PatientCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (patientId: string) => void;
}

export function PatientCreateModal({ open, onOpenChange, onCreated }: PatientCreateModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bloodType, setBloodType] = useState<string>("");
  const [allergies, setAllergies] = useState("");
  const [healthPlan, setHealthPlan] = useState("");
  const [healthPlanNumber, setHealthPlanNumber] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setFirstName(""); setLastName(""); setPhone(""); setCpf(""); setEmail("");
    setDateOfBirth(""); setBloodType(""); setAllergies(""); setHealthPlan("");
    setHealthPlanNumber(""); setEmergencyName(""); setEmergencyPhone("");
    setAddress(""); setNotes("");
  };

  const handleSave = async () => {
    if (!orgId) {
      toast({ title: "Erro", description: "Organização não identificada", variant: "destructive" });
      return;
    }
    if (!firstName.trim() || !phone.trim()) {
      toast({ title: "Campos obrigatórios", description: "Informe nome e telefone", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any)
        .from("patients")
        .insert({
          org_id: orgId,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: phone.trim(),
          cpf: cpf.trim() || null,
          email: email.trim() || null,
          date_of_birth: dateOfBirth || null,
          blood_type: bloodType || null,
          allergies: allergies.trim() || null,
          health_plan: healthPlan.trim() || null,
          health_plan_number: healthPlanNumber.trim() || null,
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          owner_id: user?.id ?? null,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Paciente cadastrado", description: `${firstName} ${lastName}`.trim() });
      reset();
      onOpenChange(false);
      if (data?.id && onCreated) onCreated(data.id);
    } catch (err: any) {
      toast({
        title: "Não foi possível salvar",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      kicker="Pacientes"
      title="Novo paciente"
      description="Cadastre as informações básicas do paciente."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Cadastrar paciente"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Primeiro nome *</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Sobrenome</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone *</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(48) 99999-9999" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dob">Data de nascimento</Label>
            <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo sanguíneo</Label>
            <Select value={bloodType} onValueChange={setBloodType}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {BLOOD_TYPES.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="healthPlan">Convênio</Label>
            <Input id="healthPlan" value={healthPlan} onChange={(e) => setHealthPlan(e.target.value)} placeholder="Unimed / Particular" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="healthPlanNumber">Número do convênio</Label>
            <Input id="healthPlanNumber" value={healthPlanNumber} onChange={(e) => setHealthPlanNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="allergies">Alergias</Label>
          <Textarea id="allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} rows={2} placeholder="Dipirona, penicilina, látex…" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="emergencyName">Contato de emergência (nome)</Label>
            <Input id="emergencyName" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergencyPhone">Contato de emergência (telefone)</Label>
            <Input id="emergencyPhone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
    </SidePanel>
  );
}

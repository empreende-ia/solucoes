export type PatientStatus = "active" | "inactive";

export interface Patient {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string;
  cpf: string | null;
  date_of_birth: string | null;
  blood_type: string | null;
  allergies: string | null;
  health_plan: string | null;
  health_plan_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  notes: string | null;
  avatar_url: string | null;
  owner_id: string | null;
  status: PatientStatus;
  no_show_count: number;
  created_at: string;
  updated_at: string;
}

export type PatientInsert = Omit<Patient, "id" | "created_at" | "updated_at" | "no_show_count"> & {
  no_show_count?: number;
};

export type PatientUpdate = Partial<Omit<Patient, "id" | "org_id" | "created_at" | "updated_at">>;

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Não sei"] as const;

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "attended"
  | "no_show"
  | "cancelled";

export type AppointmentType =
  | "consulta"
  | "retorno"
  | "procedimento"
  | "avaliacao"
  | "urgencia";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  attended: "Atendida",
  no_show: "Não compareceu",
  cancelled: "Cancelada",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  consulta: "Consulta",
  retorno: "Retorno",
  procedimento: "Procedimento",
  avaliacao: "Avaliação",
  urgencia: "Urgência",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  insurance: "Convênio",
  cash: "Dinheiro",
  transfer: "Transferência",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  refunded: "Reembolsado",
};

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export function fullName(p: Pick<Patient, "first_name" | "last_name">): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Sem nome";
}

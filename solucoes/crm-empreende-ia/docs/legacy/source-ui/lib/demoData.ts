import { supabase } from "@/integrations/supabase/client";

const TAG = "[DEMO]";
const sb = supabase as any;

// ---------- Catálogos ----------

const PROFESSIONALS = [
  { name: "Dra. Marina Lopes",   specialty: "Clínica Geral",   council: "CRM-SC", registration: "12345", color: "#0ea5e9", bio: "Atendimento adulto e geriátrico." },
  { name: "Dr. Rafael Tavares",  specialty: "Cardiologia",     council: "CRM-SC", registration: "23456", color: "#ef4444", bio: "Cardiologia preventiva e clínica." },
  { name: "Dra. Helena Castro",  specialty: "Dermatologia",    council: "CRM-SC", registration: "34567", color: "#a855f7", bio: "Dermatologia clínica e estética." },
  { name: "Dr. Lucas Andrade",   specialty: "Pediatria",       council: "CRM-SC", registration: "45678", color: "#22c55e", bio: "Pediatria geral e puericultura." },
];

const PATIENTS = [
  { first_name: "Ana",      last_name: "Silva",     phone: "48 99812-3456", cpf: "12345678901", blood: "O+",  allergies: "Dipirona",  plan: "Unimed",          plan_n: "U12345" },
  { first_name: "Bruno",    last_name: "Souza",     phone: "48 99123-4567", cpf: "23456789012", blood: "A+",  allergies: "Nenhuma",   plan: "Bradesco Saúde",  plan_n: "BS98765" },
  { first_name: "Carla",    last_name: "Oliveira",  phone: "48 99234-5678", cpf: "34567890123", blood: "B+",  allergies: "Penicilina",plan: "SulAmérica",      plan_n: "SA54321" },
  { first_name: "Diego",    last_name: "Santos",    phone: "48 99345-6789", cpf: "45678901234", blood: "AB+", allergies: "Látex",     plan: "Particular",      plan_n: null     },
  { first_name: "Eduarda",  last_name: "Pereira",   phone: "48 99456-7890", cpf: "56789012345", blood: "O-",  allergies: "Nenhuma",   plan: "Unimed",          plan_n: "U23456" },
  { first_name: "Felipe",   last_name: "Costa",     phone: "48 99567-8901", cpf: "67890123456", blood: "A-",  allergies: "AAS",       plan: "Particular",      plan_n: null     },
  { first_name: "Gabriela", last_name: "Almeida",   phone: "48 99678-9012", cpf: "78901234567", blood: "O+",  allergies: "Nenhuma",   plan: "Bradesco Saúde",  plan_n: "BS12321" },
  { first_name: "Henrique", last_name: "Ferreira",  phone: "48 99789-0123", cpf: "89012345678", blood: "B-",  allergies: "Sulfa",     plan: "SulAmérica",      plan_n: "SA67890" },
  { first_name: "Isabela",  last_name: "Rodrigues", phone: "48 99890-1234", cpf: "90123456789", blood: "A+",  allergies: "Nenhuma",   plan: "Unimed",          plan_n: "U34567" },
  { first_name: "João",     last_name: "Martins",   phone: "48 99901-2345", cpf: "01234567890", blood: "AB-", allergies: "Camarão",   plan: "Particular",      plan_n: null     },
];

type ApptStatus = "scheduled" | "confirmed" | "attended" | "no_show";
type ApptType = "consulta" | "retorno" | "procedimento";

const APPOINTMENT_PLAN: { offsetDays: number; status: ApptStatus; type: ApptType; duration: number; hour: number }[] = [
  { offsetDays: -42, status: "attended",  type: "consulta",     duration: 30, hour: 9 },
  { offsetDays: -38, status: "attended",  type: "consulta",     duration: 30, hour: 10 },
  { offsetDays: -33, status: "no_show",   type: "consulta",     duration: 30, hour: 14 },
  { offsetDays: -28, status: "attended",  type: "consulta",     duration: 30, hour: 11 },
  { offsetDays: -25, status: "attended",  type: "retorno",      duration: 20, hour: 15 },
  { offsetDays: -22, status: "attended",  type: "consulta",     duration: 30, hour: 9 },
  { offsetDays: -17, status: "attended",  type: "retorno",      duration: 20, hour: 16 },
  { offsetDays: -14, status: "attended",  type: "procedimento", duration: 60, hour: 13 },
  { offsetDays: -12, status: "no_show",   type: "consulta",     duration: 30, hour: 10 },
  { offsetDays: -8,  status: "attended",  type: "procedimento", duration: 60, hour: 14 },
  { offsetDays: -6,  status: "attended",  type: "consulta",     duration: 30, hour: 9 },
  { offsetDays: -5,  status: "attended",  type: "consulta",     duration: 30, hour: 11 },
  { offsetDays: -3,  status: "no_show",   type: "retorno",      duration: 20, hour: 16 },
  { offsetDays: -1,  status: "attended",  type: "retorno",      duration: 20, hour: 10 },
  { offsetDays: 0,   status: "confirmed", type: "consulta",     duration: 30, hour: 9 },
  { offsetDays: 0,   status: "confirmed", type: "retorno",      duration: 20, hour: 11 },
  { offsetDays: 0,   status: "scheduled", type: "consulta",     duration: 30, hour: 15 },
  { offsetDays: 1,   status: "confirmed", type: "consulta",     duration: 30, hour: 9 },
  { offsetDays: 2,   status: "scheduled", type: "consulta",     duration: 30, hour: 10 },
  { offsetDays: 3,   status: "confirmed", type: "retorno",      duration: 20, hour: 14 },
  { offsetDays: 4,   status: "scheduled", type: "procedimento", duration: 60, hour: 9 },
  { offsetDays: 5,   status: "scheduled", type: "consulta",     duration: 30, hour: 16 },
  { offsetDays: 7,   status: "confirmed", type: "consulta",     duration: 30, hour: 11 },
  { offsetDays: 10,  status: "scheduled", type: "retorno",      duration: 20, hour: 15 },
];

const PAYMENT_METHODS = ["pix", "pix", "pix", "credit_card", "credit_card", "insurance", "insurance", "cash"];
const PROCEDURE_NAMES = ["Consulta clínica", "Retorno", "ECG", "Avaliação inicial", "Procedimento ambulatorial"];

const RECORD_TEMPLATES = [
  { chief: "Cefaleia recorrente há 2 semanas",  summary: "Paciente refere cefaleia frontal de moderada intensidade, sem sinais focais.", diagnosis: "Cefaleia tensional",          prescriptions: [{ medication: "Dipirona 500mg", posology: "1 cp de 6/6h se dor", days: 5 }] },
  { chief: "Pressão alta detectada em check-up", summary: "PA 150x95. Sem sintomas. Orientado MEV e iniciado tratamento.",                 diagnosis: "Hipertensão arterial estágio 1", prescriptions: [{ medication: "Losartana 50mg", posology: "1 cp pela manhã", days: 30 }] },
  { chief: "Manchas avermelhadas no antebraço",  summary: "Lesões eritematosas pruriginosas.",                                              diagnosis: "Dermatite de contato",         prescriptions: [{ medication: "Hidrocortisona creme 1%", posology: "Aplicar 2x/dia", days: 7 }] },
  { chief: "Tosse seca há 10 dias",              summary: "Sem febre, ausculta limpa. Quadro viral em resolução.",                          diagnosis: "IVAS",                          prescriptions: [{ medication: "Loratadina 10mg", posology: "1 cp ao dia", days: 7 }] },
  { chief: "Retorno para avaliação de exames",   summary: "Exames laboratoriais dentro da normalidade. Mantém conduta.",                    diagnosis: "Acompanhamento de rotina",      prescriptions: [] },
];

const CRM_COMPANIES = [
  { name: "Convênio SaúdeMais",  industry: "Plano de saúde", website: "https://saudemais.exemplo.com" },
  { name: "Clínica Parceira ABC", industry: "Clínica",        website: "https://clinicaabc.exemplo.com" },
];

const CRM_CONTACTS = [
  { first: "Patrícia", last: "Mendes",  email: "patricia@exemplo.com", phone: "48 98800-1100", status: "lead",      score: 65 },
  { first: "Ricardo",  last: "Borges",  email: "ricardo@exemplo.com",  phone: "48 98800-2200", status: "qualified", score: 78 },
  { first: "Sofia",    last: "Lima",    email: "sofia@exemplo.com",    phone: "48 98800-3300", status: "customer",  score: 90 },
  { first: "Tiago",    last: "Nunes",   email: "tiago@exemplo.com",    phone: "48 98800-4400", status: "lead",      score: 45 },
  { first: "Vanessa",  last: "Ramos",   email: "vanessa@exemplo.com",  phone: "48 98800-5500", status: "qualified", score: 70 },
];

const CRM_STAGES = [
  { name: "Lead",        position: 1, probability: 10 },
  { name: "Qualificado", position: 2, probability: 35 },
  { name: "Proposta",    position: 3, probability: 60 },
  { name: "Fechado",     position: 4, probability: 100 },
];

const CRM_DEALS = [
  { title: "Convênio empresarial",  value: 4500, stageIdx: 1, prob: 35 },
  { title: "Pacote check-up anual", value: 1800, stageIdx: 2, prob: 60 },
  { title: "Plano família",         value: 2400, stageIdx: 0, prob: 10 },
  { title: "Procedimento estético", value: 3200, stageIdx: 2, prob: 60 },
  { title: "Consulta + exames",     value: 850,  stageIdx: 3, prob: 100 },
  { title: "Avaliação cardiológica", value: 1200, stageIdx: 1, prob: 35 },
];

const TAGS = [
  { name: "VIP",        color: "#a855f7" },
  { name: "Retorno",    color: "#0ea5e9" },
  { name: "Convênio",   color: "#22c55e" },
  { name: "Particular", color: "#f59e0b" },
];

function daysFromNow(days: number, hour = 9, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function tagged(name: string): string { return `${TAG} ${name}`; }

export async function countDemoData(orgId: string) {
  const results = await Promise.all([
    sb.from("patients").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("first_name", `${TAG}%`),
    sb.from("activities").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("title", `${TAG}%`),
    sb.from("payments").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("procedure_name", `${TAG}%`),
    sb.from("medical_records").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("chief_complaint", `${TAG}%`),
    sb.from("professionals").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("name", `${TAG}%`),
    sb.from("health_goals").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("title", `${TAG}%`),
    sb.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("first_name", `${TAG}%`),
    sb.from("companies").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("name", `${TAG}%`),
    sb.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("title", `${TAG}%`),
    sb.from("pipelines").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("name", `${TAG}%`),
    sb.from("tags").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("name", `${TAG}%`),
  ]);
  const [pat, act, pay, rec, prof, goals, cts, cos, dls, pips, tgs] = results.map((r: any) => r.count ?? 0);
  return {
    patients: pat,
    activities: act,
    payments: pay,
    medical_records: rec,
    professionals: prof,
    health_goals: goals,
    contacts: cts,
    companies: cos,
    deals: dls,
    pipelines: pips,
    tags: tgs,
  };
}

export async function generateDemoData(orgId: string, userId: string) {
  // 1) Profissionais
  const profPayload = PROFESSIONALS.map((p) => ({
    org_id: orgId,
    name: tagged(p.name),
    email: `${p.name.toLowerCase().replace(/\s+/g, ".").replace(/dra?\./, "")}@clinica.exemplo.com`,
    specialty: p.specialty,
    council: p.council,
    registration: p.registration,
    color: p.color,
    bio: p.bio,
    is_active: true,
  }));
  const { data: profs, error: profErr } = await sb.from("professionals").insert(profPayload).select("id");
  if (profErr) throw profErr;
  const profIds: string[] = (profs ?? []).map((p: any) => p.id);

  // 2) Pacientes
  const patientsPayload = PATIENTS.map((p, i) => ({
    org_id: orgId,
    owner_id: userId,
    first_name: tagged(p.first_name),
    last_name: p.last_name,
    phone: p.phone,
    cpf: p.cpf,
    email: `${p.first_name.toLowerCase()}.${p.last_name.toLowerCase()}@exemplo.com`,
    date_of_birth: `19${70 + (i % 25)}-0${(i % 9) + 1}-${String(((i * 3) % 28) + 1).padStart(2, "0")}`,
    blood_type: p.blood,
    allergies: p.allergies,
    health_plan: p.plan,
    health_plan_number: p.plan_n,
    address: "Rua das Flores, 123 — Florianópolis/SC",
    status: "active",
    assigned_professional_id: profIds[i % profIds.length],
  }));
  const { data: insertedPatients, error: pErr } = await sb.from("patients").insert(patientsPayload).select("id");
  if (pErr) throw pErr;
  const patientIds: string[] = (insertedPatients ?? []).map((p: any) => p.id);

  // 2b) patient_professionals
  const ppPayload = patientIds.map((pid, i) => ({
    org_id: orgId,
    patient_id: pid,
    professional_id: profIds[i % profIds.length],
    is_primary: true,
  }));
  await sb.from("patient_professionals").insert(ppPayload);

  // 3) Consultas
  const appointmentsPayload = APPOINTMENT_PLAN.map((appt, i) => {
    const patientId = patientIds[i % patientIds.length];
    const label = appt.type === "consulta" ? "Consulta" : appt.type === "retorno" ? "Retorno" : "Procedimento";
    return {
      org_id: orgId,
      created_by: userId,
      title: tagged(`${label} — ${PATIENTS[i % PATIENTS.length].first_name}`),
      body: null,
      due_date: daysFromNow(appt.offsetDays, appt.hour),
      type: "appointment",
      contact_id: patientId,
      appointment_status: appt.status,
      appointment_type: appt.type,
      duration_minutes: appt.duration,
      professional_id: userId,
      whatsapp_reminder_sent: appt.offsetDays < 0,
      metadata: { demo_professional_id: profIds[i % profIds.length] },
    };
  });
  const { data: insertedAppts, error: aErr } = await sb
    .from("activities")
    .insert(appointmentsPayload)
    .select("id,contact_id,appointment_status,appointment_type,due_date");
  if (aErr) throw aErr;
  const attendedAppts = (insertedAppts ?? []).filter((a: any) => a.appointment_status === "attended");

  // 4) Prontuários
  const recordsPayload = attendedAppts.map((a: any, i: number) => {
    const t = RECORD_TEMPLATES[i % RECORD_TEMPLATES.length];
    return {
      org_id: orgId,
      patient_id: a.contact_id,
      activity_id: a.id,
      professional_id: userId,
      chief_complaint: tagged(t.chief),
      clinical_summary: t.summary,
      diagnosis: t.diagnosis,
      prescriptions: t.prescriptions,
      is_draft: false,
      finalized_at: a.due_date,
      created_by: userId,
    };
  });
  if (recordsPayload.length > 0) {
    const { error: rErr } = await sb.from("medical_records").insert(recordsPayload);
    if (rErr) throw rErr;
  }

  // 5) Pagamentos
  const paidPayload = attendedAppts.map((a: any, i: number) => ({
    org_id: orgId,
    patient_id: a.contact_id,
    activity_id: a.id,
    procedure_name: tagged(PROCEDURE_NAMES[i % PROCEDURE_NAMES.length]),
    amount: 150 + ((i * 73) % 350),
    payment_method: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
    status: "paid",
    paid_at: a.due_date,
    created_by: userId,
  }));
  const pendingPayload = Array.from({ length: 3 }).map((_, i) => ({
    org_id: orgId,
    patient_id: patientIds[i % patientIds.length],
    activity_id: null,
    procedure_name: tagged(`A receber — ${PROCEDURE_NAMES[i % PROCEDURE_NAMES.length]}`),
    amount: 200 + i * 120,
    payment_method: "pix",
    status: "pending",
    paid_at: null,
    created_by: userId,
  }));
  const paymentsPayload = [...paidPayload, ...pendingPayload];
  if (paymentsPayload.length > 0) {
    const { error: payErr } = await sb.from("payments").insert(paymentsPayload);
    if (payErr) throw payErr;
  }

  // 6) Tarefas
  const taskTitles = ["Confirmar consulta", "Ligar para paciente", "Atualizar prontuário", "Enviar resultado de exame", "Solicitar retorno"];
  const tasksPayload = taskTitles.map((t, i) => ({
    org_id: orgId,
    created_by: userId,
    title: tagged(t),
    type: "task",
    contact_id: patientIds[i % patientIds.length],
    professional_id: i % 2 === 0 ? userId : null,
    due_date: daysFromNow(i - 1),
    body: "Tarefa de demonstração.",
  }));
  await sb.from("activities").insert(tasksPayload);

  // 7) Metas
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const goalsPayload = [
    { title: tagged("Consultas atendidas no mês"), metric: "appointments", target: 120,   current: 84,    unit: "consultas" },
    { title: tagged("Receita mensal"),             metric: "revenue",      target: 35000, current: 22400, unit: "BRL" },
    { title: tagged("Novos pacientes no mês"),     metric: "new_patients", target: 25,    current: 17,    unit: "pacientes" },
    { title: tagged("Redução de no-show"),         metric: "no_show_rate", target: 10,    current: 7,     unit: "%" },
  ].map((g) => ({
    org_id: orgId,
    title: g.title,
    description: "Meta de demonstração para o mês corrente.",
    metric: g.metric,
    target_value: g.target,
    current_value: g.current,
    unit: g.unit,
    due_date: monthEnd,
    status: "in_progress",
    created_by: userId,
  }));
  await sb.from("health_goals").insert(goalsPayload);

  // 8) Tags
  const tagsPayload = TAGS.map((t) => ({ org_id: orgId, name: tagged(t.name), color: t.color }));
  await sb.from("tags").insert(tagsPayload);

  // 9) CRM
  const companiesPayload = CRM_COMPANIES.map((c) => ({
    org_id: orgId, owner_id: userId, name: tagged(c.name), industry: c.industry, website: c.website,
  }));
  const { data: insCos } = await sb.from("companies").insert(companiesPayload).select("id");
  const companyIds: string[] = (insCos ?? []).map((x: any) => x.id);

  const contactsPayload = CRM_CONTACTS.map((c, i) => ({
    org_id: orgId,
    owner_id: userId,
    first_name: tagged(c.first),
    last_name: c.last,
    email: c.email,
    phone: c.phone,
    status: c.status,
    lead_score: c.score,
    company_id: companyIds[i % Math.max(1, companyIds.length)] ?? null,
    fonte: "Demonstração",
  }));
  const { data: insCts } = await sb.from("contacts").insert(contactsPayload).select("id");
  const contactIds: string[] = (insCts ?? []).map((x: any) => x.id);

  const { data: insPipe } = await sb.from("pipelines").insert({
    org_id: orgId, name: tagged("Vendas Clínica"), is_default: false, currency: "BRL",
  }).select("id").single();
  const pipelineId: string | undefined = insPipe?.id;

  if (pipelineId) {
    const stagesPayload = CRM_STAGES.map((s) => ({
      pipeline_id: pipelineId, name: s.name, position: s.position, probability: s.probability,
    }));
    const { data: insStages } = await sb.from("pipeline_stages").insert(stagesPayload).select("id,position");
    const stageIds = (insStages ?? []).sort((a: any, b: any) => a.position - b.position).map((s: any) => s.id);

    const dealsPayload = CRM_DEALS.map((d, i) => ({
      org_id: orgId,
      owner_id: userId,
      title: tagged(d.title),
      value: d.value,
      currency: "BRL",
      probability: d.prob,
      status: d.stageIdx === 3 ? "won" : "open",
      pipeline_id: pipelineId,
      stage_id: stageIds[d.stageIdx] ?? null,
      contact_id: contactIds[i % Math.max(1, contactIds.length)] ?? null,
      company_id: companyIds[i % Math.max(1, companyIds.length)] ?? null,
      expected_close_date: daysFromNow(7 + i * 5).slice(0, 10),
    }));
    await sb.from("deals").insert(dealsPayload);
  }

  return {
    professionals: profPayload.length,
    patients: patientsPayload.length,
    appointments: appointmentsPayload.length,
    medical_records: recordsPayload.length,
    payments: paymentsPayload.length,
    tasks: tasksPayload.length,
    health_goals: goalsPayload.length,
    tags: tagsPayload.length,
    contacts: contactsPayload.length,
    companies: companiesPayload.length,
    deals: CRM_DEALS.length,
  };
}

export async function removeDemoData(orgId: string) {
  await sb.from("payments").delete().eq("org_id", orgId).ilike("procedure_name", `${TAG}%`);
  await sb.from("medical_records").delete().eq("org_id", orgId).ilike("chief_complaint", `${TAG}%`);
  await sb.from("activities").delete().eq("org_id", orgId).ilike("title", `${TAG}%`);
  await sb.from("deals").delete().eq("org_id", orgId).ilike("title", `${TAG}%`);

  const { data: demoPipes } = await sb.from("pipelines").select("id").eq("org_id", orgId).ilike("name", `${TAG}%`);
  const pipeIds = (demoPipes ?? []).map((p: any) => p.id);
  if (pipeIds.length) {
    await sb.from("pipeline_stages").delete().in("pipeline_id", pipeIds);
    await sb.from("pipelines").delete().in("id", pipeIds);
  }

  await sb.from("contacts").delete().eq("org_id", orgId).ilike("first_name", `${TAG}%`);
  await sb.from("companies").delete().eq("org_id", orgId).ilike("name", `${TAG}%`);
  await sb.from("health_goals").delete().eq("org_id", orgId).ilike("title", `${TAG}%`);
  await sb.from("tags").delete().eq("org_id", orgId).ilike("name", `${TAG}%`);

  const { data: demoPats } = await sb.from("patients").select("id").eq("org_id", orgId).ilike("first_name", `${TAG}%`);
  const patIds = (demoPats ?? []).map((p: any) => p.id);
  if (patIds.length) {
    await sb.from("patient_professionals").delete().in("patient_id", patIds);
  }

  await sb.from("patients").delete().eq("org_id", orgId).ilike("first_name", `${TAG}%`);
  await sb.from("professionals").delete().eq("org_id", orgId).ilike("name", `${TAG}%`);
}

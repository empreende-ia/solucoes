import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APPT_STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  attended: "Atendida",
  no_show: "Não compareceu",
  cancelled: "Cancelada",
};

async function buildPlatformData(authHeader: string | null) {
  if (!authHeader) return "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [todayAppts, pendingTasks, monthPayments, patientsCount, monthAppts] = await Promise.all([
    sb.from("activities")
      .select("id,title,due_date,appointment_status,appointment_type,duration_minutes,contact_id,patients:contact_id(first_name,last_name,phone)")
      .not("appointment_status", "is", null)
      .gte("due_date", todayStart.toISOString())
      .lte("due_date", todayEnd.toISOString())
      .order("due_date", { ascending: true }),
    sb.from("activities")
      .select("id,title,type,due_date,patients:contact_id(first_name,last_name)")
      .is("appointment_status", null)
      .is("completed_at", null)
      .lte("due_date", todayEnd.toISOString())
      .order("due_date", { ascending: true })
      .limit(20),
    sb.from("payments")
      .select("id,amount,status,paid_at,created_at")
      .gte("created_at", monthStart.toISOString())
      .lte("created_at", monthEnd.toISOString()),
    sb.from("patients").select("id", { count: "exact", head: true }).eq("status", "active"),
    sb.from("activities")
      .select("id,appointment_status")
      .not("appointment_status", "is", null)
      .gte("due_date", monthStart.toISOString())
      .lte("due_date", monthEnd.toISOString()),
  ]);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const fmtTime = (d: string | null) => d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

  const apptLines = (todayAppts.data ?? []).map((a: any) => {
    const p = a.patients;
    const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "Paciente sem nome";
    return `- ${fmtTime(a.due_date)} · ${name} · ${APPT_STATUS_LABEL[a.appointment_status] ?? a.appointment_status} · ${a.appointment_type ?? "consulta"} (${a.duration_minutes ?? 30}min)${p?.phone ? ` · tel ${p.phone}` : ""}`;
  }).join("\n") || "  (nenhuma)";

  const taskLines = (pendingTasks.data ?? []).slice(0, 10).map((t: any) => {
    const p = t.patients;
    const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
    return `- ${t.title}${name ? ` (paciente: ${name})` : ""} · vence ${fmt(t.due_date)}`;
  }).join("\n") || "  (nenhuma)";

  const totalReceived = (monthPayments.data ?? []).filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const totalPending = (monthPayments.data ?? []).filter((p: any) => p.status !== "paid").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  const apptByStatus: Record<string, number> = {};
  for (const a of (monthAppts.data ?? [])) {
    apptByStatus[a.appointment_status] = (apptByStatus[a.appointment_status] ?? 0) + 1;
  }
  const statusLine = Object.entries(apptByStatus).map(([k, v]) => `${APPT_STATUS_LABEL[k] ?? k}: ${v}`).join(" · ") || "sem dados";

  return `DADOS REAIS DA PLATAFORMA (use estes dados ao responder, inclusive os marcados como [DEMO]):

## Consultas de hoje (${(todayAppts.data ?? []).length})
${apptLines}

## Atividades/tarefas pendentes (top 10)
${taskLines}

## Financeiro do mês
- Recebido: R$ ${totalReceived.toFixed(2)}
- A receber: R$ ${totalPending.toFixed(2)}

## Consultas do mês por status
${statusLine}

## Pacientes ativos
Total: ${patientsCount.count ?? 0}
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let platformData = "";
    try {
      platformData = await buildPlatformData(req.headers.get("Authorization"));
    } catch (e) {
      console.error("buildPlatformData error:", e);
    }

    const systemPrompt = `Você é o AI Copilot do CRM Saúde, um assistente clínico e administrativo para clínicas e consultórios.

REGRAS:
- Responda sempre em português brasileiro
- Seja conciso, direto e focado em ações práticas para a operação da clínica
- Use markdown para formatação (negrito, listas, headers)
- SEMPRE responda com base nos DADOS REAIS DA PLATAFORMA fornecidos abaixo (incluindo registros marcados como [DEMO])
- Cite números, nomes e horários específicos dos dados reais — nunca invente
- Sugira próximos passos concretos (confirmar consulta, ligar para paciente, registrar prontuário etc.)
- Use linguagem clínica/administrativa (paciente, consulta, prontuário, agenda), nunca termos imobiliários

CAPACIDADES:
- Listar e resumir consultas do dia, pacientes agendados, status de confirmação
- Sugerir confirmações, follow-ups e ações para pacientes
- Resumir financeiro do mês (recebido, a receber, inadimplência)
- Analisar taxa de no-show e ocupação da agenda
- Rascunhar mensagens de WhatsApp/e-mail para pacientes
- Estruturar resumos SOAP a partir de notas

${platformData}

${context ? `CONTEXTO ATUAL DO USUÁRIO:\n${context}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

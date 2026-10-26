import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { org_id } = await req.json();
    if (!org_id) throw new Error("org_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch org data for insights
    const [dealsRes, activitiesRes, contactsRes, stagesRes] = await Promise.all([
      sb.from("deals").select("id,title,value,status,stage_id,owner_id,updated_at,probability,close_date").eq("org_id", org_id),
      sb.from("activities").select("id,type,deal_id,contact_id,user_id,created_at,completed_at").eq("org_id", org_id).order("created_at", { ascending: false }).limit(200),
      sb.from("contacts").select("id,first_name,last_name,lead_score,status").eq("org_id", org_id),
      sb.from("pipeline_stages").select("id,name,order").eq("org_id", org_id).order("order"),
    ]);

    const deals = dealsRes.data || [];
    const activities = activitiesRes.data || [];
    const contacts = contactsRes.data || [];
    const stages = stagesRes.data || [];

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 86400000);

    // Build data summary for AI
    const openDeals = deals.filter((d: any) => d.status === "open");
    const staleDeals = openDeals.filter((d: any) => d.updated_at && new Date(d.updated_at) < twentyOneDaysAgo);
    const highScoreNoDeals = contacts.filter((c: any) => (c.lead_score || 0) >= 80);
    const wonDeals = deals.filter((d: any) => d.status === "won");
    const lostDeals = deals.filter((d: any) => d.status === "lost");

    const dataSummary = `
DADOS DO CRM (org ${org_id}):
- ${openDeals.length} negócios abertos, ${wonDeals.length} ganhos, ${lostDeals.length} perdidos
- ${staleDeals.length} negócios sem atividade há mais de 21 dias: ${staleDeals.map((d: any) => `"${d.title}" (R$${d.value || 0})`).join(", ")}
- ${contacts.length} contatos totais
- ${highScoreNoDeals.length} contatos com score >= 80
- Estágios do pipeline: ${stages.map((s: any) => {
      const count = openDeals.filter((d: any) => d.stage_id === s.id).length;
      return `${s.name}: ${count} negócios`;
    }).join(", ")}
- Negócios com close_date nos próximos 7 dias e prob < 50%: ${openDeals.filter((d: any) => {
      if (!d.close_date) return false;
      const cd = new Date(d.close_date);
      return cd <= new Date(now.getTime() + 7 * 86400000) && (d.probability || 0) < 50;
    }).map((d: any) => `"${d.title}"`).join(", ") || "nenhum"}
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é o motor de insights do CRM Imobiliário. Analise os dados e gere exatamente 4-6 insights acionáveis em português brasileiro.`,
          },
          {
            role: "user",
            content: `${dataSummary}

Gere insights no seguinte formato JSON (array):
[
  {
    "title": "Título curto do insight",
    "description": "Descrição em 1-2 frases",
    "type": "warning" | "success" | "info" | "danger",
    "action_label": "Texto do botão de ação",
    "action_route": "/rota-no-crm"
  }
]

Responda APENAS com o JSON, sem markdown ou texto adicional.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_insights",
              description: "Return CRM insights as structured data",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        type: { type: "string", enum: ["warning", "success", "info", "danger"] },
                        action_label: { type: "string" },
                        action_route: { type: "string" },
                      },
                      required: ["title", "description", "type", "action_label", "action_route"],
                    },
                  },
                },
                required: ["insights"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI insights error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar insights", insights: [] }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Extract from tool call
    let insights: any[] = [];
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const parsed = JSON.parse(toolCall.function.arguments);
        insights = parsed.insights || [];
      } else {
        // Fallback: try parsing content directly
        const content = data.choices?.[0]?.message?.content || "";
        const match = content.match(/\[[\s\S]*\]/);
        if (match) insights = JSON.parse(match[0]);
      }
    } catch (e) {
      console.error("Failed to parse insights:", e);
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", insights: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { chief_complaint, patient_history, allergies, previous_records } = await req.json();

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY não configurada");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: `Você é um assistente médico especializado em documentação clínica.
Receba a queixa principal e o contexto do paciente e gere um resumo clínico estruturado no formato SOAP:
- S (Subjetivo): O que o paciente relata
- O (Objetivo): Dados observáveis e relevantes do histórico
- A (Avaliação): Impressão clínica / hipótese diagnóstica
- P (Plano): Condutas, exames, orientações

Seja preciso e objetivo. Use terminologia médica adequada mas acessível. Nunca invente informações — apenas organize e estruture o que foi fornecido. Responda sempre em português brasileiro.`,
        messages: [
          {
            role: "user",
            content: `Queixa principal: ${chief_complaint}

Histórico do paciente:
- Alergias: ${allergies || "Não informadas"}
- Histórico relevante: ${patient_history || "Sem histórico anterior"}
- Consultas anteriores: ${previous_records || "Primeira consulta"}

Gere o resumo SOAP desta consulta.`,
          },
        ],
      }),
    });

    const data = await response.json();
    const summary = data.content?.[0]?.text || "";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

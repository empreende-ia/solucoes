import { supabase } from "@/integrations/supabase/client";

/**
 * Etapas padrão de pipeline para o contexto de clínicas/saúde.
 * Use em setup/onboarding ao criar a primeira org.
 */
export const PIPELINE_STAGES_SAUDE = [
  { name: "Agendada",       position: 1 },
  { name: "Confirmada",     position: 2 },
  { name: "Atendida",       position: 3 },
  { name: "Não compareceu", position: 4 },
  { name: "Cancelada",      position: 5 },
];

const STAGE_COLORS = ["#6366f1", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444"];
const STAGE_PROBABILITIES = [25, 60, 100, 0, 0];

/**
 * Cria o pipeline de saúde padrão para a org, se ainda não existir.
 * Idempotente: se já houver pipeline na org, não faz nada e retorna o id existente.
 *
 * Retorna { pipelineId, created }: `created=false` quando o pipeline já existia.
 */
export async function seedPipelineSaude(orgId: string, pipelineName = "Pipeline de Atendimento") {
  const { data: existing } = await supabase
    .from("pipelines")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { pipelineId: existing.id, created: false as const };
  }

  const { data: pipeline, error: pipelineErr } = await supabase
    .from("pipelines")
    .insert({ name: pipelineName, org_id: orgId, is_default: true, currency: "BRL" })
    .select("id")
    .single();
  if (pipelineErr || !pipeline) throw pipelineErr || new Error("Falha ao criar pipeline");

  const stageRows = PIPELINE_STAGES_SAUDE.map((s, i) => ({
    name: s.name,
    pipeline_id: pipeline.id,
    position: s.position,
    probability: STAGE_PROBABILITIES[Math.min(i, STAGE_PROBABILITIES.length - 1)],
  }));

  const { error: stagesErr } = await supabase.from("pipeline_stages").insert(stageRows);
  if (stagesErr) throw stagesErr;

  return { pipelineId: pipeline.id, created: true as const };
}

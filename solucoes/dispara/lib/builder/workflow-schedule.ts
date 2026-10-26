import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

type ScheduleConfig = {
  workflowId: string;
  cron: string;
  timezone?: string | null;
  secret?: string | null;
};

/**
 * Agendamento recorrente de workflow (trigger "Schedule").
 *
 * Migração QStash→pg_cron (Fase C): removido o QStash. As funções apenas persistem a
 * configuração de agendamento nas colunas schedule_* de `workflows` (Postgres).
 *
 * ESCOPO: o trigger "Schedule" NÃO está exposto no builder v1 (que só oferece trigger
 * por keywords) — este caminho é legado. Por isso a EXECUÇÃO periódica (um drain no
 * cron tick que avalia a cron-expression com timezone e dispara o workflow no horário)
 * fica pendente, a ser adicionada junto de um parser de cron quando o trigger Schedule
 * for habilitado na UI. Aqui garantimos que publish/rollback não dependam mais do
 * QStash e que o estado do agendamento fique persistido.
 */
export async function syncWorkflowSchedule(config: ScheduleConfig) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase not configured");
  }

  await supabase
    .from("workflows")
    .update({
      schedule_cron: config.cron,
      schedule_timezone: config.timezone ?? null,
      schedule_active: true,
      schedule_updated_at: new Date().toISOString(),
    })
    .eq("id", config.workflowId);
}

export async function clearWorkflowSchedule(workflowId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  await supabase
    .from("workflows")
    .update({
      schedule_cron: null,
      schedule_timezone: null,
      schedule_active: false,
      schedule_updated_at: new Date().toISOString(),
    })
    .eq("id", workflowId);
}

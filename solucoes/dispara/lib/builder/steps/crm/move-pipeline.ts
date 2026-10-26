import "server-only";

import { withStepLogging, type StepInput } from "../step-handler";
import {
  findOrCreateContactByPhone,
  phoneLookupVariants,
  requireSupabase,
  resolveContactPhone,
} from "../contacts/shared";

type MovePipelineResult =
  | {
      success: true;
      data: {
        opportunityId: string;
        created: boolean;
        pipelineId: string;
        stageId: string;
        status: string;
      };
    }
  | { success: false; error: string };

export type MovePipelineInput = StepInput & {
  pipelineId?: string;
  stageId?: string;
  oppStatus?: string;
  oppName?: string;
  triggerData?: Record<string, unknown>;
};

const VALID_STATUSES = new Set(["open", "won", "lost", "abandoned"]);

/**
 * Semântica "Create/Update Opportunity" do GHL: se o contato já tem uma
 * oportunidade ABERTA neste pipeline, move a etapa (e o status, se pedido);
 * senão cria uma nova na etapa configurada.
 */
export async function movePipelineStep(
  input: MovePipelineInput
): Promise<MovePipelineResult> {
  "use step";

  return withStepLogging(input, async () => {
    const supabase = requireSupabase();
    if (!supabase) {
      return { success: false as const, error: "Supabase not configured" };
    }
    const pipelineId = String(input.pipelineId ?? "").trim();
    const stageId = String(input.stageId ?? "").trim();
    if (!pipelineId || !stageId) {
      return {
        success: false as const,
        error: "Pipeline/stage not configured",
      };
    }
    const status = VALID_STATUSES.has(String(input.oppStatus))
      ? String(input.oppStatus)
      : "open";

    // Etapa precisa pertencer ao pipeline (protege contra config obsoleta
    // depois de alguém reorganizar o CRM).
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id, pipeline_id")
      .eq("id", stageId)
      .maybeSingle();
    if (!stage || (stage as { pipeline_id: string }).pipeline_id !== pipelineId) {
      return {
        success: false as const,
        error: "Stage does not belong to the configured pipeline",
      };
    }

    const phone = resolveContactPhone(input.triggerData);
    if (!phone) {
      return { success: false as const, error: "Contact phone not resolved" };
    }
    const contact = await findOrCreateContactByPhone(supabase, phone);
    if (!contact) {
      return { success: false as const, error: "Contact not found/created" };
    }

    const now = new Date().toISOString();
    const variants = phoneLookupVariants(phone);

    const { data: existingRows } = await supabase
      .from("opportunities")
      .select("id, stage_id")
      .eq("pipeline_id", pipelineId)
      .eq("status", "open")
      .or(
        [
          `contact_id.eq.${contact.id}`,
          ...variants.map((v) => `phone.eq.${v}`),
        ].join(",")
      )
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const existing = existingRows?.[0] as
      | { id: string; stage_id: string }
      | undefined;

    if (existing) {
      const { error } = await supabase
        .from("opportunities")
        .update({
          stage_id: stageId,
          status,
          contact_id: contact.id,
          stage_changed_at:
            existing.stage_id === stageId ? undefined : now,
          updated_at: now,
        })
        .eq("id", existing.id);
      if (error) {
        return {
          success: false as const,
          error: `Move opportunity failed: ${error.message}`,
        };
      }
      return {
        success: true as const,
        data: {
          opportunityId: existing.id,
          created: false,
          pipelineId,
          stageId,
          status,
        },
      };
    }

    const oppName =
      String(input.oppName ?? "").trim() || contact.name || phone;
    const { data: created, error } = await supabase
      .from("opportunities")
      .insert({
        pipeline_id: pipelineId,
        stage_id: stageId,
        contact_id: contact.id,
        phone,
        name: oppName,
        status,
        source: "workflow",
        stage_changed_at: now,
      })
      .select("id")
      .single();
    if (error || !created) {
      return {
        success: false as const,
        error: `Create opportunity failed: ${error?.message ?? "unknown"}`,
      };
    }
    return {
      success: true as const,
      data: {
        opportunityId: (created as { id: string }).id,
        created: true,
        pipelineId,
        stageId,
        status,
      },
    };
  });
}
movePipelineStep.maxRetries = 0;

export const _integrationType = "crm";

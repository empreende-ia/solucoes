import "server-only";

import { withStepLogging, type StepInput } from "../step-handler";
import {
  findOrCreateContactByPhone,
  requireSupabase,
  resolveContactPhone,
} from "./shared";

type TagStepResult =
  | { success: true; data: { contactId: string; tags: string[] } }
  | { success: false; error: string };

export type RemoveTagInput = StepInput & {
  tags?: unknown;
  triggerData?: Record<string, unknown>;
};

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.map((t) => String(t).trim()).filter(Boolean))
  );
}

export async function removeTagStep(
  input: RemoveTagInput
): Promise<TagStepResult> {
  "use step";

  return withStepLogging(input, async () => {
    const supabase = requireSupabase();
    if (!supabase) {
      return { success: false as const, error: "Supabase not configured" };
    }
    const tags = normalizeTags(input.tags);
    if (tags.length === 0) {
      return { success: false as const, error: "No tags configured" };
    }
    const phone = resolveContactPhone(input.triggerData);
    if (!phone) {
      return { success: false as const, error: "Contact phone not resolved" };
    }
    const contact = await findOrCreateContactByPhone(supabase, phone);
    if (!contact) {
      return { success: false as const, error: "Contact not found/created" };
    }
    const { error } = await supabase.rpc("bulk_update_contact_tags", {
      p_ids: [contact.id],
      p_tags_to_add: [],
      p_tags_to_remove: tags,
    });
    if (error) {
      return {
        success: false as const,
        error: `Remove tag failed: ${error.message}`,
      };
    }
    return { success: true as const, data: { contactId: contact.id, tags } };
  });
}
removeTagStep.maxRetries = 0;

export const _integrationType = "contacts";

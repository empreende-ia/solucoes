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

export type AddTagInput = StepInput & {
  tags?: unknown;
  triggerData?: Record<string, unknown>;
};

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.map((t) => String(t).trim()).filter(Boolean))
  );
}

export async function addTagStep(input: AddTagInput): Promise<TagStepResult> {
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
    // RPC com sanitização anti-nesting (mesma usada pelo bulk da UI de contatos)
    const { error } = await supabase.rpc("bulk_update_contact_tags", {
      p_ids: [contact.id],
      p_tags_to_add: tags,
      p_tags_to_remove: [],
    });
    if (error) {
      return { success: false as const, error: `Add tag failed: ${error.message}` };
    }
    return { success: true as const, data: { contactId: contact.id, tags } };
  });
}
addTagStep.maxRetries = 0;

export const _integrationType = "contacts";

import "server-only";

import { buildTextMessage } from "@/lib/whatsapp/text";
import { WhatsAppSendTextRequestSchema } from "@/lib/shared/whatsapp-schema";
import { withStepLogging, type StepInput } from "../step-handler";
import {
  getCredentials,
  resolveRecipient,
  sendWhatsAppPayload,
} from "./shared";

type AskQuestionResult =
  | { success: true; data: unknown }
  | { success: false; error: string; details?: unknown };

export type AskQuestionInput = StepInput & {
  to?: string;
  toSource?: string;
  message?: string;
  previewUrl?: boolean | string;
  triggerData?: Record<string, unknown>;
  _debugAskQuestion?: Record<string, unknown> | null;
};

export async function askQuestionStep(
  input: AskQuestionInput
): Promise<AskQuestionResult> {
  "use step";

  return withStepLogging(input, async () => {
    const credentials = await getCredentials();
    if (!credentials) {
      return { success: false, error: "WhatsApp not configured" };
    }

    const recipient = resolveRecipient(input);
    if (!recipient.ok) {
      return { success: false, error: recipient.error };
    }

    const message = String(input.message || "").trim();
    if (!message) {
      return { success: false, error: "Message is required" };
    }

    const previewUrl =
      typeof input.previewUrl === "boolean"
        ? input.previewUrl
        : input.previewUrl === "true";

    const payload = buildTextMessage({
      to: recipient.to,
      text: message,
      previewUrl,
    });

    const parsed = WhatsAppSendTextRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success: false,
        error: "Invalid WhatsApp payload",
        details: parsed.error.flatten(),
      };
    }

    const result = await sendWhatsAppPayload(credentials, parsed.data);
    if (!result.ok) {
      return { success: false, error: result.error, details: result.data };
    }

    const debugPayload = input._debugAskQuestion;
    const responseData: Record<string, unknown> =
      result.data && typeof result.data === "object"
        ? { ...(result.data as Record<string, unknown>) }
        : { value: result.data };
    if (debugPayload) {
      responseData._debugAskQuestion = debugPayload;
    }

    return { success: true, data: responseData };
  });
}
askQuestionStep.maxRetries = 0;

export const _integrationType = "whatsapp";

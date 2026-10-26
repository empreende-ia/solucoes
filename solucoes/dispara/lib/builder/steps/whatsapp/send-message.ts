import "server-only";

import { buildTextMessage } from "@/lib/whatsapp/text";
import { WhatsAppSendTextRequestSchema } from "@/lib/shared/whatsapp-schema";
import { withStepLogging, type StepInput } from "../step-handler";
import {
  getCredentials,
  resolveRecipient,
  sendWhatsAppPayload,
} from "./shared";

type SendMessageResult =
  | { success: true; data: unknown }
  | { success: false; error: string; details?: unknown };

export type SendMessageInput = StepInput & {
  to?: string;
  toSource?: string;
  message?: string;
  previewUrl?: boolean | string;
  triggerData?: Record<string, unknown>;
};

export async function sendMessageStep(
  input: SendMessageInput
): Promise<SendMessageResult> {
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

    return { success: true, data: result.data };
  });
}
sendMessageStep.maxRetries = 0;

export const _integrationType = "whatsapp";

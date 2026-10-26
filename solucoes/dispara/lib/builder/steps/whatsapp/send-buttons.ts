import "server-only";

import { buildReplyButtons, type ButtonOption } from "@/lib/whatsapp/interactive";
import { withStepLogging, type StepInput } from "../step-handler";
import {
  getCredentials,
  parseJsonArray,
  resolveRecipient,
  sendWhatsAppPayload,
} from "./shared";

type SendButtonsResult =
  | { success: true; data: unknown }
  | { success: false; error: string; details?: unknown };

export type SendButtonsInput = StepInput & {
  to?: string;
  toSource?: string;
  body?: string;
  headerText?: string;
  footer?: string;
  buttons?: string;
  triggerData?: Record<string, unknown>;
};

export async function sendButtonsStep(
  input: SendButtonsInput
): Promise<SendButtonsResult> {
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

    const body = String(input.body || "").trim();
    if (!body) {
      return { success: false, error: "Body is required" };
    }

    const buttons = parseJsonArray<ButtonOption>(input.buttons);
    if (!buttons.length) {
      return { success: false, error: "Buttons JSON is required" };
    }

    const payload = buildReplyButtons({
      to: recipient.to,
      body,
      buttons,
      header: input.headerText
        ? { type: "text", text: String(input.headerText) }
        : undefined,
      footer: input.footer ? String(input.footer) : undefined,
    });

    const result = await sendWhatsAppPayload(credentials, payload);
    if (!result.ok) {
      return { success: false, error: result.error, details: result.data };
    }

    return { success: true, data: result.data };
  });
}
sendButtonsStep.maxRetries = 0;

export const _integrationType = "whatsapp";
